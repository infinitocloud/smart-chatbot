// server.js

///////////////////////////////////////////////////////////////
// Importaciones
///////////////////////////////////////////////////////////////
//const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

// AWS Bedrock (para /admin/list-agents, etc.)
const {
  BedrockAgentClient,
  ListAgentsCommand,
  ListAgentAliasesCommand
} = require('@aws-sdk/client-bedrock-agent');

// Routers o archivos locales
const knowledgeBaseManager = require('./knowledgeBaseManager');
const fileUploadManager = require('./fileUploadManager');
const smartChatbotManager = require('./smartChatbotManager');
const monitorRouter = require('./monitorRouter');
const userManagementRouter = require('./userManagementRouter');
const settingsRouter = require('./settingsRouter'); // Maneja /admin/settings + /admin/quick-chat-buttons

///////////////////////////////////////////////////////////////
// Configuración básica de Express
///////////////////////////////////////////////////////////////
const app = express();
app.use(cors());
app.use(express.json());

///////////////////////////////////////////////////////////////
// Conexión a la Base de Datos (users.db)
///////////////////////////////////////////////////////////////
const db = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error('Error opening users.db:', err);
  } else {
    console.log('Opened users.db successfully.');
  }
});

// ============================================================
// CREACIÓN DE TABLAS (sin DROP TABLE)
// ============================================================

// 1) Tabla 'users'
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'user'
  )
`, async (err) => {
  if (err) {
    console.error('Error creating users table:', err);
  } else {
    console.log('Ensured "users" table exists.');

    // Creamos usuario admin si no existe
    db.get(`SELECT id FROM users WHERE email = ?`, ['admin'], async (err2, row) => {
      if (err2) {
        console.error('Error checking admin user:', err2);
      } else if (!row) {
        console.log('No admin found, creating default admin...');
        const defaultAdminPasswordHash = await bcrypt.hash('passw0rdIC', 10);
        db.run(
          `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
          ['Admin User', 'admin', defaultAdminPasswordHash, 'admin'],
          (err3) => {
            if (err3) console.error('Error creating admin:', err3);
            else console.log('Default admin user created: admin / passw0rdIC');
          }
        );
      } else {
        console.log('Admin user already exists.');
      }
    });
  }
});

// 2) Tabla 'settings'
db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT,
    model TEXT,
    awsAccessKeyId TEXT,
    awsSecretAccessKey TEXT,
    awsS3Bucket TEXT,
    agentRealId TEXT,
    agentAliasId TEXT,
    quickChatButtons TEXT
  )
`, (err) => {
  if (err) {
    console.error('Error creating settings table:', err);
  } else {
    console.log('Ensured "settings" table exists.');
  }
});

// 3) Tabla 'usageLogs'
db.run(`
  CREATE TABLE IF NOT EXISTS usageLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    username TEXT,
    prompt TEXT,
    inputTokens INTEGER,
    outputTokens INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    latencyMs INTEGER
  )
`, (err) => {
  if (err) {
    console.error('Error creating usageLogs table:', err);
  } else {
    console.log('Ensured "usageLogs" table exists.');
  }
});

///////////////////////////////////////////////////////////////
// JWT SECRET
///////////////////////////////////////////////////////////////
const JWT_SECRET = 'supersecretkey'; // para DEMO

///////////////////////////////////////////////////////////////
// Middleware 1: authenticateToken
///////////////////////////////////////////////////////////////
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    console.log('No Authorization header in request.');
    return res.sendStatus(401);
  }
  const token = authHeader.split(' ')[1];

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('JWT verification error:', err);
      return res.status(403).json({ error: 'Authentication failed', details: err.message });
    }
    req.user = user; // p.ej. { userId, role, iat, exp }
    next();
  });
}

///////////////////////////////////////////////////////////////
// Helper para leer la tabla 'settings' en cada request
///////////////////////////////////////////////////////////////
function loadSettingsFromDB() {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT awsAccessKeyId, awsSecretAccessKey, awsS3Bucket, agentRealId, agentAliasId
       FROM settings
       LIMIT 1`,
      (err, row) => {
        if (err) return reject(err);
        resolve(row || {});
      }
    );
  });
}

///////////////////////////////////////////////////////////////
// Middleware 2: loadBedrockSettings (SIN CACHE)
///////////////////////////////////////////////////////////////
async function loadBedrockSettings(req, res, next) {
  try {
    // Leemos SIEMPRE la DB de settings
    const row = await loadSettingsFromDB();

    // Insertamos en req.user
    req.user.awsAccessKeyId = row.awsAccessKeyId || '';
    req.user.awsSecretAccessKey = row.awsSecretAccessKey || '';
    req.user.awsS3Bucket = row.awsS3Bucket || '';
    req.user.agentRealId = row.agentRealId || '';
    req.user.agentAliasId = row.agentAliasId || '';

    next();
  } catch (error) {
    console.error('Error loading bedrock settings:', error);
    return res.status(500).json({ error: 'Error loading settings' });
  }
}

///////////////////////////////////////////////////////////////
// Rutas de USUARIO (REGISTER, LOGIN)
///////////////////////////////////////////////////////////////
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  console.log('POST /register:', req.body);

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields (name, email, password) are required.' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const role = (email === 'admin') ? 'admin' : 'user';

    db.run(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      [name, email, password_hash, role],
      (err2) => {
        if (err2) {
          console.error('Error in INSERT user:', err2);
          if (err2.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'User already exists' });
          }
          return res.status(500).json({ error: 'Database error' });
        }
        console.log('New user registered:', email);
        res.json({ message: 'User registered successfully' });
      }
    );
  } catch (error) {
    console.error('Error hashing password:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  console.log('POST /login with:', email);

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get(
    `SELECT id, name, email, password_hash, role
     FROM users
     WHERE email = ?`,
    [email],
    async (err, user) => {
      if (err) {
        console.error('Database error on login:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!user) {
        console.log('User not found for:', email);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        console.log('Password mismatch for:', email);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Create JWT
      const token = jwt.sign(
        { userId: user.id, role: user.role },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      console.log('Login success for:', email);
      res.json({
        token,
        role: user.role,
        name: user.name
      });
    }
  );
});

///////////////////////////////////////////////////////////////
// /admin/list-agents => requiere bedrock settings
///////////////////////////////////////////////////////////////
app.get('/admin/list-agents', authenticateToken, loadBedrockSettings, async (req, res) => {
  console.log('GET /admin/list-agents (with aliases included)');
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { awsAccessKeyId, awsSecretAccessKey } = req.user || {};
    if (!awsAccessKeyId || !awsSecretAccessKey) {
      return res.status(400).json({ error: 'AWS credentials missing in settings' });
    }

    const bedrockAgentClient = new BedrockAgentClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey
      }
    });

    console.log('Calling ListAgentsCommand...');
    const agentsResp = await bedrockAgentClient.send(new ListAgentsCommand({}));
    console.log('ListAgents response:', agentsResp);

    const agentsRaw = agentsResp.agentSummaries || [];
    const agentsWithAliases = [];

    for (const ag of agentsRaw) {
      const agentId = ag.agentId;
      const agentName = ag.agentName || '(no name)';
      let aliases = [];

      try {
        const aliasResp = await bedrockAgentClient.send(
          new ListAgentAliasesCommand({ agentId })
        );
        console.log(`Alias resp for agentId=${agentId}:`, aliasResp);

        const rawAliases = aliasResp.agentAliasSummaries || [];
        aliases = rawAliases.map(alias => ({
          aliasId: alias.agentAliasId,
          aliasName: alias.agentAliasName,
          associatedVersion: alias.routingConfiguration?.[0]?.agentVersion || ''
        }));
      } catch (aliasErr) {
        console.error(`Error listing aliases for agentId=${agentId}:`, aliasErr);
      }

      agentsWithAliases.push({
        agentId,
        name: agentName,
        aliases
      });
    }

    res.json({ agents: agentsWithAliases });
  } catch (error) {
    console.error('Error listing agents + aliases:', error);
    res.status(500).json({
      error: 'Failed to list agents + aliases',
      details: error.message
    });
  }
});

///////////////////////////////////////////////////////////////
// Montamos las rutas ADMIN
///////////////////////////////////////////////////////////////
app.use('/admin', authenticateToken, settingsRouter(db));
app.use('/admin/monitor', authenticateToken, monitorRouter);
app.use('/admin/knowledge-base-manager', authenticateToken, loadBedrockSettings, knowledgeBaseManager);
app.use('/file-upload-manager', authenticateToken, loadBedrockSettings, fileUploadManager);
app.use('/api/smart-chatbot', authenticateToken, loadBedrockSettings, smartChatbotManager);
app.use('/admin/user-management', authenticateToken, userManagementRouter);

///////////////////////////////////////////////////////////////
// Start server
///////////////////////////////////////////////////////////////
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});


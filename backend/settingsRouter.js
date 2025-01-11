// settingsRouter.js

const express = require('express');
const router = express.Router();

/**
 * Exportamos una función que recibe `db` (la conexión a SQLite)
 * y retorna un router con las rutas de /admin/settings y /admin/quick-chat-buttons.
 */
module.exports = (db) => {
  // ===========================
  // GET /settings
  // ===========================
  router.get('/settings', (req, res) => {
    console.log('GET /admin/settings');
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    db.get(`
      SELECT provider, model, awsAccessKeyId, awsSecretAccessKey,
             awsS3Bucket, agentRealId, agentAliasId, quickChatButtons
      FROM settings
      LIMIT 1
    `, (err, row) => {
      if (err) {
        console.error('Error reading settings:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!row) {
        console.log('No settings found, returning defaults');
        return res.json({
          provider: 'aws-bedrock',
          model: 'AWS Bedrock',
          awsAccessKeyId: '',
          awsSecretAccessKey: '',
          awsS3Bucket: '',
          agentRealId: '',
          agentAliasId: '',
          quickChatButtons: []
        });
      }

      // Parsear quickChatButtons
      let parsedButtons = [];
      try {
        if (row.quickChatButtons) {
          parsedButtons = JSON.parse(row.quickChatButtons);
        }
      } catch (parseErr) {
        console.error('Error parsing quickChatButtons JSON:', parseErr);
      }

      const responseData = {
        provider: row.provider,
        model: row.model,
        awsAccessKeyId: row.awsAccessKeyId || '',
        awsSecretAccessKey: row.awsSecretAccessKey || '',
        awsS3Bucket: row.awsS3Bucket || '',
        agentRealId: row.agentRealId || '',
        agentAliasId: row.agentAliasId || '',
        quickChatButtons: parsedButtons
      };

      console.log('Returning settings row:', responseData);
      res.json(responseData);
    });
  });

  // ===========================
  // POST /settings
  // ===========================
  router.post('/settings', (req, res) => {
    console.log('POST /admin/settings with body:', req.body);
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const {
      provider,
      model,
      awsAccessKeyId,
      awsSecretAccessKey,
      awsS3Bucket,
      agentRealId,
      agentAliasId,
      // Array con { buttonName: "..."}
      quickChatButtons
    } = req.body;

    if (!model) {
      return res.status(400).json({ error: 'model is required' });
    }

    // Convertir quickChatButtons a JSON
    let quickChatButtonsStr = '';
    try {
      if (Array.isArray(quickChatButtons)) {
        quickChatButtonsStr = JSON.stringify(quickChatButtons);
      } else {
        quickChatButtonsStr = '[]';
      }
    } catch (stringifyErr) {
      console.error('Error stringifying quickChatButtons:', stringifyErr);
      quickChatButtonsStr = '[]';
    }

    db.get(`SELECT id FROM settings LIMIT 1`, (err, existing) => {
      if (err) {
        console.error('Error reading settings table:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (existing) {
        console.log('Updating existing settings, id=', existing.id);
        db.run(`
          UPDATE settings
          SET provider = ?, model = ?, awsAccessKeyId = ?,
              awsSecretAccessKey = ?, awsS3Bucket = ?,
              agentRealId = ?, agentAliasId = ?,
              quickChatButtons = ?
          WHERE id = ?
        `,
        [
          provider,
          model,
          awsAccessKeyId,
          awsSecretAccessKey,
          awsS3Bucket,
          agentRealId || '',
          agentAliasId || '',
          quickChatButtonsStr,
          existing.id
        ],
        function (err2) {
          if (err2) {
            console.error('Error updating settings:', err2);
            return res.status(500).json({ error: 'Database error' });
          }
          console.log('Settings updated successfully');
          res.json({ message: 'Settings saved successfully' });
        });
      } else {
        console.log('Inserting new settings');
        db.run(`
          INSERT INTO settings (provider, model, awsAccessKeyId,
                                awsSecretAccessKey, awsS3Bucket,
                                agentRealId, agentAliasId,
                                quickChatButtons)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          provider,
          model,
          awsAccessKeyId,
          awsSecretAccessKey,
          awsS3Bucket,
          agentRealId || '',
          agentAliasId || '',
          quickChatButtonsStr
        ],
        function (err3) {
          if (err3) {
            console.error('Error inserting settings:', err3);
            return res.status(500).json({ error: 'Database error' });
          }
          console.log('Settings inserted successfully');
          res.json({ message: 'Settings saved successfully' });
        });
      }
    });
  });

  // ===========================
  // GET /admin/quick-chat-buttons
  // ===========================
  router.get('/quick-chat-buttons', (req, res) => {
    // if (req.user.role !== 'admin') {
    //   return res.status(403).json({ error: 'Forbidden' });
    // }
    // (Descomenta arriba si solo admin debe verlos)

    db.get('SELECT quickChatButtons FROM settings LIMIT 1', (err, row) => {
      if (err) {
        console.error('Error reading quickChatButtons:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!row || !row.quickChatButtons) {
        return res.json([]);
      }
      try {
        const parsed = JSON.parse(row.quickChatButtons);
        // Retornamos el array => [ { buttonName: "..."} ]
        res.json(parsed);
      } catch (parseErr) {
        console.error('Error parsing quickChatButtons:', parseErr);
        res.status(500).json({ error: 'Parsing error' });
      }
    });
  });

  return router;
};


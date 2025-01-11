// userManagementRouter.js

const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

// Abrimos la DB local (o reusamos la misma 'db' si lo deseas)
const db = new sqlite3.Database('./users.db');

// ============================================================
// GET /admin/user-management
// - Devuelve la lista de usuarios
// ============================================================
router.get('/', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  console.log('GET /admin/user-management => listing users');

  db.all(
    `
      SELECT
        id,
        name,
        email,
        role
      FROM users
      ORDER BY id ASC
    `,
    (err, rows) => {
      if (err) {
        console.error('Error fetching users:', err);
        return res
          .status(500)
          .json({ error: 'Database error', details: err.message });
      }
      // Retornamos la lista de usuarios
      return res.json({ users: rows });
    }
  );
});

// ============================================================
// POST /admin/user-management
// - Crea un nuevo usuario.
//   Recibe { name, email, password, role? } en req.body
// ============================================================
router.post('/', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  const { name, email, password, role } = req.body || {};
  console.log('POST /admin/user-management =>', req.body);

  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: 'name, email, and password are required' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);
    // role por defecto => 'user'
    const finalRole = role || 'user';

    db.run(
      `
        INSERT INTO users (name, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `,
      [name, email, password_hash, finalRole],
      function (err2) {
        if (err2) {
          console.error('Error in INSERT user:', err2);
          if (err2.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'User already exists' });
          }
          return res
            .status(500)
            .json({ error: 'Database error', details: err2.message });
        }
        console.log('New user created in userManagement:', email);
        // Retornamos el ID del usuario creado
        return res.json({
          message: 'User created successfully',
          newUserId: this.lastID
        });
      }
    );
  } catch (error) {
    console.error('Error creating user:', error);
    return res
      .status(500)
      .json({ error: 'Server error', details: error.message });
  }
});

// ============================================================
// PUT /admin/user-management/:id
// - Edita campos de un usuario según su id (req.params.id).
// - Recibe { name?, email?, role?, newPassword? } en req.body
// ============================================================
router.put('/:id', async (req, res) => {
  // 1) Verificamos rol admin
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID (NaN)' });
  }

  // 2) Desestructuramos campos que podrían venir
  const { name, email, role, newPassword } = req.body || {};
  console.log(`PUT /admin/user-management/${userId} =>`, req.body);

  // Arrays para construir el UPDATE dinámico
  const updateFields = [];
  const params = [];

  // Campo "name"
  if (typeof name === 'string' && name.trim() !== '') {
    updateFields.push('name = ?');
    params.push(name.trim());
  }

  // Campo "email"
  if (typeof email === 'string' && email.trim() !== '') {
    updateFields.push('email = ?');
    params.push(email.trim());
  }

  // Campo "role"
  if (typeof role === 'string' && (role === 'admin' || role === 'user')) {
    updateFields.push('role = ?');
    params.push(role);
  }

  // Campo "newPassword" => hashear
  if (typeof newPassword === 'string' && newPassword.trim() !== '') {
    try {
      const passwordHash = await bcrypt.hash(newPassword.trim(), 10);
      updateFields.push('password_hash = ?');
      params.push(passwordHash);
    } catch (errHash) {
      console.error('Error hashing new password:', errHash);
      return res.status(500).json({
        error: 'Failed to hash the new password',
        details: errHash.message,
      });
    }
  }

  // Si no hay campos, devolvemos error
  if (updateFields.length === 0) {
    return res
      .status(400)
      .json({ error: 'No valid fields to update' });
  }

  // 3) Construimos el SQL final
  // UPDATE users SET name=?, email=?, role=?, password_hash=? WHERE id=?
  const sql = `
    UPDATE users
    SET ${updateFields.join(', ')}
    WHERE id = ?
  `;
  params.push(userId);

  // 4) Ejecutar en DB
  db.run(sql, params, function (err2) {
    if (err2) {
      console.error('Error updating user:', err2);
      // Si el error indica email duplicado
      if (err2.message.includes('UNIQUE constraint failed: users.email')) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      return res
        .status(500)
        .json({ error: 'Database error', details: err2.message });
    }
    if (this.changes === 0) {
      // No se encontró el usuario con ese id, o no hubo cambios
      return res
        .status(404)
        .json({ error: 'User not found or no changes made' });
    }
    console.log('User updated =>', userId);
    return res.json({
      message: 'User updated successfully',
      updatedUserId: userId
    });
  });
});

// ============================================================
// DELETE /admin/user-management/:id
// - Elimina un usuario según su id (req.params.id).
//   * Si id === 1 => no se permite eliminar
// ============================================================
router.delete('/:id', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  const userId = parseInt(req.params.id, 10);
  console.log('DELETE /admin/user-management => userId=', userId);

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID (NaN)' });
  }
  if (userId === 1) {
    return res
      .status(400)
      .json({ error: 'Cannot remove the primary admin (id=1).' });
  }

  // De lo contrario => DELETE
  db.run('DELETE FROM users WHERE id = ?', [userId], function (err2) {
    if (err2) {
      console.error('Error deleting user:', err2);
      return res
        .status(500)
        .json({ error: 'Database error', details: err2.message });
    }
    if (this.changes === 0) {
      // No se encontró el usuario
      return res.status(404).json({
        error: 'User not found or already deleted'
      });
    }
    console.log('User deleted =>', userId);
    return res.json({
      message: 'User deleted successfully',
      deletedUserId: userId
    });
  });
});

module.exports = router;


const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Kein Token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Ungültiger Token' });
  }
}

// Google Login — erwartet einen echten ID Token (JWT), nicht Access Token
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken fehlt' });

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: uid, email, name, picture } = payload;

    await pool.query(
      'INSERT INTO users (uid, email, display_name, photo_url) VALUES ($1, $2, $3, $4) ON CONFLICT (uid) DO UPDATE SET email=$2, display_name=$3, photo_url=$4',
      [uid, email, name, picture || '']
    );

    const jwtToken = jwt.sign({ uid, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token: jwtToken, uid, email, displayName: name, photoURL: picture || '' });
  } catch (err) {
    console.error('Google Login Fehler:', err.message);
    res.status(401).json({ error: 'Ungültiger Google Token' });
  }
});

// Registrierung
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) return res.status(400).json({ error: 'Fehlende Felder' });

    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 10);
    const uid = require('crypto').randomUUID();

    await pool.query(
      'INSERT INTO users (uid, email, password_hash, display_name, photo_url) VALUES ($1, $2, $3, $4, $5)',
      [uid, email.toLowerCase(), hash, displayName, '']
    );

    const token = jwt.sign({ uid, email: email.toLowerCase() }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, uid, email, displayName });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'E-Mail bereits registriert' });
    console.error(err);
    res.status(500).json({ error: 'Registrierung fehlgeschlagen' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Fehlende Felder' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user || !user.password_hash) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });

    const bcrypt = require('bcryptjs');
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });

    const token = jwt.sign({ uid: user.uid, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, uid: user.uid, email: user.email, displayName: user.display_name, photoURL: user.photo_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login fehlgeschlagen' });
  }
});

// Auth-Check
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT uid, email, display_name, photo_url FROM users WHERE uid = $1',
      [req.user.uid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User nicht gefunden' });
    const user = result.rows[0];
    res.json({ userId: user.uid, email: user.email, displayName: user.display_name, photoURL: user.photo_url ?? '' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Passwort ändern
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await pool.query('SELECT password_hash FROM users WHERE uid = $1', [req.user.uid]);
    const user = result.rows[0];
    if (!user || !user.password_hash) return res.status(400).json({ error: 'Kein Passwort gesetzt' });

    const bcrypt = require('bcryptjs');
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Aktuelles Passwort falsch' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE uid = $2', [hash, req.user.uid]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Passwort ändern' });
  }
});

// Konto löschen
router.delete('/account', authenticateToken, async (req, res) => {
  try {
    const { password } = req.body;
    if (password) {
      const result = await pool.query('SELECT password_hash FROM users WHERE uid = $1', [req.user.uid]);
      const user = result.rows[0];
      if (!user || !user.password_hash) return res.status(400).json({ error: 'Kein Passwort gesetzt' });
      const bcrypt = require('bcryptjs');
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Passwort falsch' });
    }
    await pool.query('DELETE FROM users WHERE uid = $1', [req.user.uid]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Konto konnte nicht gelöscht werden' });
  }
});

module.exports = router;

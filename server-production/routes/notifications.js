const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware');
const { broadcast } = require('../ws');
const { WRITE_ROLES, getSpaceAccess, hasRole, forbidden } = require('../authorization');

function mapNotif(row) {
  return {
    id: row.id,
    targetUserId: row.target_user_id,
    type: row.type,
    message: row.message,
    bookingUserName: row.booking_user_name,
    groupId: row.group_id,
    groupName: row.group_name,
    createdAt: row.created_at,
    read: row.read,
  };
}

// GET /notifications?unreadOnly=true
router.get('/', auth, async (req, res) => {
  const unreadOnly = req.query.unreadOnly === 'true';
  try {
    const query = unreadOnly
      ? 'SELECT * FROM notifications WHERE target_user_id=$1 AND read=false ORDER BY created_at DESC LIMIT 50'
      : 'SELECT * FROM notifications WHERE target_user_id=$1 ORDER BY created_at DESC LIMIT 50';
    const { rows } = await pool.query(query, [req.user.uid]);
    res.json(rows.map(mapNotif));
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Laden' });
  }
});

// PUT /notifications/read-all
router.put('/read-all', auth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read=true WHERE target_user_id=$1', [req.user.uid]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Fehler' });
  }
});

// PUT /notifications/:id/read
router.put('/:id/read', auth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET read=true WHERE id=$1 AND target_user_id=$2',
      [req.params.id, req.user.uid]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Fehler' });
  }
});

// POST /notifications
router.post('/', auth, async (req, res) => {
  const { id, targetUserId, bookingUserName, groupId, groupName, message, type } = req.body;
  const notifId = id || (await pool.query('SELECT gen_random_uuid()::text AS id')).rows[0].id;
  try {
    if (!targetUserId || !groupId || !message || message.length > 500) {
      return res.status(400).json({ error: 'Ungültige Benachrichtigung' });
    }
    const access = await getSpaceAccess(req.user.uid, groupId);
    if (!hasRole(access, WRITE_ROLES)) return forbidden(res);
    const target = await pool.query(
      'SELECT 1 FROM space_members WHERE space_id=$1 AND user_id=$2',
      [groupId, targetUserId]
    );
    if (!target.rows.length) return res.status(400).json({ error: 'Zielnutzer gehört nicht zur Gruppe' });
    await pool.query(
      'INSERT INTO notifications (id, target_user_id, booking_user_name, group_id, group_name, message, type) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [notifId, targetUserId, bookingUserName || '', groupId, groupName || '', message, type || 'booking']
    );
    res.json({ success: true });
    broadcast('notifications', { targetUserId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Erstellen' });
  }
});

// POST /notifications/subscribe — save push subscription
router.post('/subscribe', auth, async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Ungültige Subscription' });
  }
  try {
    await pool.query(
      'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4) ON CONFLICT (endpoint) DO UPDATE SET user_id=$1, p256dh=$3, auth=$4',
      [req.user.uid, endpoint, keys.p256dh, keys.auth]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Speichern' });
  }
});

// DELETE /notifications/subscribe — remove push subscription
router.delete('/subscribe', auth, async (req, res) => {
  const { endpoint } = req.body;
  try {
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2', [endpoint, req.user.uid]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Fehler' });
  }
});

// GET /notifications/vapid-key — public key for frontend
router.get('/vapid-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const mqtt = require('mqtt');
const authenticateToken = require('../middleware');
const { WRITE_ROLES, getSpaceAccess, hasRole, forbidden } = require('../authorization');

async function requireNukiAccess(req, res, next) {
  try {
    const spaceId = process.env.NUKI_SPACE_ID;
    if (!spaceId) return res.status(503).json({ error: 'Schlosszugriff ist nicht konfiguriert' });
    const access = await getSpaceAccess(req.user.uid, spaceId);
    if (!hasRole(access, WRITE_ROLES)) return forbidden(res);
    next();
  } catch (err) {
    next(err);
  }
}

function publishToNuki(topic) {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(process.env.MQTT_URL, {
      username:        process.env.MQTT_USER,
      password:        process.env.MQTT_PASS,
      connectTimeout:  8000,
      reconnectPeriod: 0,
      clean:           true,
    });

    const timer = setTimeout(() => {
      client.end(true);
      reject(new Error('MQTT Verbindungs-Timeout'));
    }, 10000);

    client.on('connect', () => {
      client.publish(topic, '1', { qos: 1 }, (err) => {
        clearTimeout(timer);
        client.end();
        if (err) reject(err);
        else resolve();
      });
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      client.end(true);
      reject(err);
    });
  });
}

router.post('/unlock', authenticateToken, requireNukiAccess, async (req, res) => {
  try {
    await publishToNuki('kistle/nuki/unlock');
    res.json({ ok: true });
  } catch (err) {
    console.error('Nuki unlock error:', err.message);
    res.status(502).json({ error: 'Schloss konnte nicht geöffnet werden' });
  }
});

router.post('/lock', authenticateToken, requireNukiAccess, async (req, res) => {
  try {
    await publishToNuki('kistle/nuki/lock');
    res.json({ ok: true });
  } catch (err) {
    console.error('Nuki lock error:', err.message);
    res.status(502).json({ error: 'Schloss konnte nicht gesperrt werden' });
  }
});

module.exports = router;

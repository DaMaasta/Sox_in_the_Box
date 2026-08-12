const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
require('dotenv').config();
const { init: initWS } = require('./ws');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json({ limit: '10mb' }));

// Hochgeladene Produktfotos (siehe routes/products.js POST /:id/image) -
// unter /api/ gemountet, damit nginx' bestehender /api/-Proxy sie erreicht.
app.use('/api/images', express.static(path.join(process.env.DATA_PATH, 'images'), { maxAge: '30d', immutable: true }));

// Routes
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/spaces',        require('./routes/spaces'));
app.use('/api/products',      require('./routes/products'));
app.use('/api/bookings',      require('./routes/bookings'));
app.use('/api/documents',     require('./routes/documents'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/nuki',          require('./routes/nuki'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
initWS(server);
server.listen(PORT, () => console.log('Server läuft auf Port ' + PORT));

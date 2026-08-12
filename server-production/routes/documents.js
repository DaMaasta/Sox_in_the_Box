const express = require('express');
const fs = require('fs');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.DATA_PATH + '/documents'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

function removeUploadedFile(file) {
  if (file?.path) fs.unlink(file.path, () => {});
}

// Helper: check if user has access to a folder (owns it or it's in a space-linked tree)
async function userCanAccessFolder(uid, folderId) {
  const { rows } = await pool.query(
    `WITH RECURSIVE anc AS (
       SELECT id, parent_id, owner_id FROM folders WHERE id = $2
       UNION ALL
       SELECT f.id, f.parent_id, f.owner_id FROM folders f JOIN anc ON f.id = anc.parent_id
     )
     SELECT 1 FROM anc a
     WHERE a.parent_id IS NULL
     AND (
       a.owner_id = $1
       OR EXISTS (
         SELECT 1 FROM spaces s
         JOIN space_members sm ON sm.space_id = s.id AND sm.user_id = $1
         WHERE s.folder_id = a.id
       )
     )
     LIMIT 1`,
    [uid, folderId]
  );
  return rows.length > 0;
}

// GET /documents/space-folders — Ordner, die über Ort-Mitgliedschaft zugänglich sind
router.get('/space-folders', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT f.*, s.name AS space_name
       FROM folders f
       JOIN spaces s ON s.folder_id = f.id
       JOIN space_members sm ON sm.space_id = s.id AND sm.user_id = $1
       ORDER BY s.name ASC`,
      [req.user.uid]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler' });
  }
});

router.get('/folders', auth, async (req, res) => {
  const { parentId } = req.query;
  try {
    if (!parentId) {
      // Root: nur eigene Ordner
      const { rows } = await pool.query(
        `SELECT * FROM folders WHERE owner_id=$1 AND parent_id IS NULL ORDER BY name ASC`,
        [req.user.uid]
      );
      res.json(rows);
    } else {
      // Subfolder: eigene ODER zugänglich über Space-Mitgliedschaft
      const hasAccess = await userCanAccessFolder(req.user.uid, parentId);
      if (!hasAccess) return res.json([]);
      const { rows } = await pool.query(
        `SELECT * FROM folders WHERE parent_id = $1 ORDER BY name ASC`,
        [parentId]
      );
      res.json(rows);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden' });
  }
});

router.post('/folders', auth, async (req, res) => {
  const { id, name, parentId } = req.body;
  try {
    if (!id || !name?.trim()) return res.status(400).json({ error: 'Fehlende Felder' });
    if (parentId) {
      const parent = await pool.query('SELECT owner_id FROM folders WHERE id=$1', [parentId]);
      if (!parent.rows.length || parent.rows[0].owner_id !== req.user.uid) {
        return res.status(403).json({ error: 'Geteilte Ordner sind schreibgeschützt' });
      }
    }
    await pool.query(
      `INSERT INTO folders (id, name, owner_id, parent_id) VALUES ($1,$2,$3,$4)`,
      [id, name, req.user.uid, parentId || null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Erstellen' });
  }
});

router.put('/folders/:id', auth, async (req, res) => {
  const { name } = req.body;
  try {
    await pool.query(`UPDATE folders SET name=$1 WHERE id=$2 AND owner_id=$3`, [name, req.params.id, req.user.uid]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Umbenennen' });
  }
});

router.delete('/folders/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM folders WHERE id=$1 AND owner_id=$2`, [req.params.id, req.user.uid]);
    if (result.rowCount === 0) {
      return res.status(403).json({ error: 'Nicht berechtigt oder nicht gefunden' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Löschen' });
  }
});

router.get('/', auth, async (req, res) => {
  const { folderId } = req.query;
  try {
    if (!folderId) {
      // Root-Dateien: nur eigene
      const { rows } = await pool.query(
        `SELECT * FROM documents WHERE owner_id=$1 AND folder_id IS NULL ORDER BY name ASC`,
        [req.user.uid]
      );
      res.json(rows);
    } else {
      // Dateien in Ordner: zugänglich wenn eigener oder Space-verknüpft
      const hasAccess = await userCanAccessFolder(req.user.uid, folderId);
      if (!hasAccess) return res.json([]);
      const { rows } = await pool.query(
        `SELECT * FROM documents WHERE folder_id = $1 ORDER BY name ASC`,
        [folderId]
      );
      res.json(rows);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden' });
  }
});

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  const { id, name, folderId } = req.body;
  try {
    if (!req.file || !id || !name) {
      removeUploadedFile(req.file);
      return res.status(400).json({ error: 'Fehlende Datei oder Metadaten' });
    }
    if (folderId) {
      const folder = await pool.query('SELECT owner_id FROM folders WHERE id=$1', [folderId]);
      if (!folder.rows.length || folder.rows[0].owner_id !== req.user.uid) {
        removeUploadedFile(req.file);
        return res.status(403).json({ error: 'Geteilte Ordner sind schreibgeschützt' });
      }
    }
    const filePath = '/data/documents/' + req.file.filename;
    const size = req.file.size || 0;
    const mimeType = req.file.mimetype || '';
    await pool.query(
      `INSERT INTO documents (id, name, type, owner_id, folder_id, file_path, size, mime_type) VALUES ($1,$2,'file',$3,$4,$5,$6,$7)`,
      [id, name, req.user.uid, folderId || null, filePath, size, mimeType]
    );
    res.json({ success: true, filePath });
  } catch (err) {
    removeUploadedFile(req.file);
    res.status(500).json({ error: 'Fehler beim Upload' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM documents WHERE id=$1 AND owner_id=$2 RETURNING file_path`,
      [req.params.id, req.user.uid]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Nicht gefunden' });
    const filename = path.basename(result.rows[0].file_path || '');
    if (filename) fs.unlink(path.join(process.env.DATA_PATH, 'documents', filename), () => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Löschen' });
  }
});

router.get('/serve/:filename', auth, async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const { rows } = await pool.query(
      `SELECT id, owner_id, folder_id, file_path FROM documents
       WHERE file_path = $1 LIMIT 1`,
      ['/data/documents/' + filename]
    );
    if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
    const document = rows[0];
    const hasAccess = document.owner_id === req.user.uid || (
      document.folder_id && await userCanAccessFolder(req.user.uid, document.folder_id)
    );
    if (!hasAccess) return res.status(403).json({ error: 'Nicht berechtigt' });
    const filePath = path.join(process.env.DATA_PATH, 'documents', filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Nicht gefunden' });
    res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden' });
  }
});

module.exports = router;

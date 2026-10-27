import express from 'express';
import { decodeAssetWorkbook } from './asset-import.js';
import { previewAssetImport, commitAssetImport, updateImportMapping, getFullDatabase } from './db.js';

export function createAssetImportRouter(authenticate, services = {}) {
  const preview = services.preview || previewAssetImport;
  const commit = services.commit || commitAssetImport;
  const update = services.update || updateImportMapping;
  const load = services.load || getFullDatabase;
  const router = express.Router();
  router.use(authenticate);
  router.get('/import-mappings', async (req, res) => {
    try { res.json({ mappings: (await load(req.user.id)).assetImportMappings }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.put('/import-mappings', async (req, res) => {
    try {
      if (typeof req.body?.key !== 'string' || typeof req.body?.excluded !== 'boolean') throw new Error('연결 설정을 확인하세요.');
      res.json({ mappings: await update(req.user.id, req.body.key, req.body.excluded) });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });
  for (const mode of ['preview', 'commit']) router.post(`/import/${mode}`, async (req, res) => {
    try {
      const input = req.body || {};
      const parsed = decodeAssetWorkbook(input.file, input.month);
      const data = mode === 'preview' ? await preview(req.user.id, input.month, input.memberId, parsed) : await commit(req.user.id, input, parsed);
      res.json({ success: true, ...data });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });
  return router;
}

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import express from 'express';

export function createSessionAuth({ secret, loadUser }) {
  return async (req, res, next) => {
    const token = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '')?.[1];
    if (!token) return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
    let claims;
    try {
      claims = jwt.verify(token, secret, { algorithms: ['HS256'] });
      if (!claims || typeof claims.id !== 'string') throw new Error('Invalid session');
    } catch {
      return res.status(403).json({ error: '유효하지 않거나 만료된 토큰입니다.' });
    }
    try {
      const user = await loadUser(claims.id);
      // Legacy tokens remain valid until this account changes its password.
      if (!user || (claims.sv || '') !== (user.session_version || '')) {
        return res.status(401).json({ error: '로그인이 만료되었습니다. 다시 로그인해 주세요.' });
      }
      req.user = { id: user.id, username: user.username };
      next();
    } catch {
      return res.status(503).json({ error: '로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  };
}

export function passwordValidationError(password) {
  if (typeof password !== 'string' || password.length < 12) return '새 비밀번호는 12자 이상 입력해 주세요.';
  if (Buffer.byteLength(password, 'utf8') > 72) return '새 비밀번호는 UTF-8 기준 72바이트 이내로 입력해 주세요.';
  if (!password.trim()) return '공백만으로 된 비밀번호는 사용할 수 없습니다.';
  return '';
}

export function createPasswordRouter({ authenticate, loadUser, updatePassword }) {
  const router = express.Router();
  router.post('/change-password', authenticate, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !currentPassword || Buffer.byteLength(currentPassword, 'utf8') > 1024) {
      return res.status(400).json({ error: '현재 비밀번호를 입력해 주세요.' });
    }
    const invalid = passwordValidationError(newPassword);
    if (invalid) return res.status(400).json({ error: invalid });
    try {
      const user = await loadUser(req.user.id);
      if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
        return res.status(400).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
      }
      if (await bcrypt.compare(newPassword, user.password_hash)) {
        return res.status(400).json({ error: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.' });
      }
      const hash = await bcrypt.hash(newPassword, 12);
      const changed = await updatePassword(user.id, user.password_hash, hash);
      if (!changed) return res.status(409).json({ error: '계정 정보가 변경되었습니다. 다시 로그인한 뒤 시도해 주세요.' });
      res.set('Cache-Control', 'no-store');
      return res.json({ success: true, message: '비밀번호를 변경했습니다. 이 계정으로 로그인한 모든 기기에서 다시 로그인해 주세요.' });
    } catch {
      return res.status(500).json({ error: '비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  });
  return router;
}

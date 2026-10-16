import { createHash, timingSafeEqual } from 'node:crypto';

export function requireWorkerSecret(value) {
  if(typeof value!=='string'||value.length<32||/\s/.test(value))throw new Error('AI_WORKER_SECRET에 공백 없는 32자 이상의 무작위 비밀값을 설정하세요.');
  return value;
}
export function workerSecretMatches(provided,expected) {
  requireWorkerSecret(expected);
  const digest=value=>createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(typeof provided==='string'?provided:''),digest(expected));
}

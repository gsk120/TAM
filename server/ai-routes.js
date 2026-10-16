import express from 'express';
import { aiWithUser, aiWithWorker, aiUserAccess, getFullDatabase } from './db.js';
import { AiService } from './ai-core.js';

export function createAiRouter(authenticateToken, options = {}) {
  const router = express.Router();
  const enabled = options.enabled || (() => process.env.AI_ENABLED === 'true');
  const allowed=options.allowed||(async userId=>enabled()&&(await aiUserAccess(userId)).paid);
  const service=options.service||new AiService({withUser:aiWithUser,withWorker:aiWithWorker,snapshot:getFullDatabase,allowed,workerSecret:options.workerSecret});
  router.get('/capabilities',authenticateToken,async(req,res,next)=>{
    try {res.json({enabled:await allowed(req.user.id)});}catch(e){next(e);}
  });
  router.use((req,res,next)=> enabled()?next():res.status(404).json({error:'AI 기능이 활성화되지 않았습니다.'}));
  const pcActions = new Set(['claim','heartbeat','context','complete','fail','session']);
  router.post('/pc/:action',async(req,res,next)=>{
    try {
      if(!pcActions.has(req.params.action))return res.sendStatus(404);
      const token=/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'')?.[1];
      res.json(await service.device(token,req.params.action,req.body));
    }catch(e){next(e);}
  });
  router.use(authenticateToken);
  router.get('/overview',async(req,res,next)=>{try{res.json(await service.web(req.user.id,'overview'));}catch(e){next(e);}});
  router.get('/conversations/:id',async(req,res,next)=>{try{res.json(await service.web(req.user.id,'detail',{conversationId:req.params.id}));}catch(e){next(e);}});
  router.post('/:action',async(req,res,next)=>{
    try {
      if(!['create','send','retry'].includes(req.params.action))return res.sendStatus(404);
      res.json(await service.web(req.user.id,req.params.action,req.body));
    }catch(e){next(e);}
  });
  router.use((error,req,res,_next)=>{
    if(!error.status)console.error('[ai]',error.message);
    res.status(error.status||500).json({error:error.status?error.message:'AI 요청을 처리하지 못했습니다. 다시 시도하세요.'});
  });
  return router;
}

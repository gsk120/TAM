import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { initializeAiSchema } from '../server/db.js';
import { prepareCodexScope } from '../pc-agent/session-scope.mjs';

test('paid-only migration seeds once and preserves later flag changes',async()=>{
  let migrated=false,seeds=0,releases=0;const queries=[];
  const pool={connect:async()=>({
    query:async(sql,args)=>{
      queries.push({sql,args});
      if(sql.startsWith('INSERT INTO ai_migrations')){
        const rows=migrated?[]:[{id:'paid-admin-v1'}];migrated=true;return {rows};
      }
      if(sql.startsWith('UPDATE users')){seeds++;assert.deepEqual(args,['togom']);}
      return {rows:[]};
    },
    release:()=>releases++,
  })};
  await initializeAiSchema(pool);await initializeAiSchema(pool);
  assert.equal(seeds,1);assert.equal(releases,2);
  assert.ok(queries.some(({sql})=>sql.includes('ai_paid BOOLEAN NOT NULL DEFAULT FALSE')));
  assert.equal(queries.some(({sql})=>sql.includes('is_admin')),false);
  assert.equal(queries.filter(({sql})=>sql==='COMMIT').length,2);
  assert.equal(queries.some(({sql})=>/DELETE FROM|DROP TABLE|TRUNCATE/i.test(sql)),false);
});

test('failed schema migration rolls back and releases its connection',async()=>{
  const commands=[];let released=false;
  await assert.rejects(initializeAiSchema({connect:async()=>({
    query:async sql=>{commands.push(sql);if(sql.includes('CREATE TABLE'))throw new Error('DDL failed');return {rows:[]};},
    release:()=>{released=true;},
  })}),/DDL failed/);
  assert.equal(commands.at(-1),'ROLLBACK');assert.equal(released,true);
});

test('Codex stores each account and conversation separately and preserves refreshed encrypted login',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'ai-scope-test-'));
  const home=path.join(root,'worker'),authHome=path.join(root,'login');await mkdir(home);await mkdir(authHome);
  // Synthetic credentials only; no access to the administrator login.
  await writeFile(path.join(authHome,'auth.json'),'fake-initial-auth');
  const credential=async(action,value)=>action==='protect'?Buffer.from(value).toString('base64'):Buffer.from(value,'base64').toString();
  const prepare=scope=>prepareCodexScope({home,scope,authHome,credential});
  try{
    const scope={userId:'a/../b',conversationId:'conversation-one'};
    const a=await prepare(scope);
    assert.ok(a.cwd.startsWith(home+path.sep));assert.equal(a.cwd.includes('a/../b'),false);
    await writeFile(path.join(a.env.CODEX_HOME,'auth.json'),'fake-refreshed-auth');
    await writeFile(path.join(a.env.CODEX_HOME,'session-marker'),'first conversation');
    await a.finish();
    await assert.rejects(access(path.join(a.env.CODEX_HOME,'auth.json')));
    const b=await prepare({...scope,userId:'other'});
    assert.notEqual(b.cwd,a.cwd);assert.notEqual(b.env.CODEX_HOME,a.env.CODEX_HOME);
    assert.equal(await readFile(path.join(b.env.CODEX_HOME,'auth.json'),'utf8'),'fake-refreshed-auth');
    await assert.rejects(access(path.join(b.env.CODEX_HOME,'session-marker')));
    await b.finish();
    const c=await prepare({...scope,conversationId:'conversation-two'});
    assert.notEqual(c.env.CODEX_HOME,a.env.CODEX_HOME);await c.finish();
    const resumed=await prepare(scope);
    assert.equal(resumed.env.CODEX_HOME,a.env.CODEX_HOME);
    assert.equal(await readFile(path.join(resumed.env.CODEX_HOME,'session-marker'),'utf8'),'first conversation');
    await resumed.finish();
    await writeFile(path.join(authHome,'auth.json'),'fake-new-login');
    const relogged=await prepare(scope);
    assert.equal(await readFile(path.join(relogged.env.CODEX_HOME,'auth.json'),'utf8'),'fake-new-login');
    await relogged.finish();
    await assert.rejects(prepare({userId:'a'}),/식별자/);
  }finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(root,{recursive:true,force:true});}
});
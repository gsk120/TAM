import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveOperationController } from '../src/utils/saveOperation.js';

test('marks an operation as pending until its save task completes', async () => {
  const states = [];
  const controller = createSaveOperationController((state) => states.push(state));
  let completeSave;
  const savePromise = new Promise((resolve) => { completeSave = resolve; });

  const running = controller.run('categories', () => savePromise);

  assert.equal(controller.isPending('categories'), true);
  assert.deepEqual(states.at(-1).activeOperations, ['categories']);

  completeSave({ success: true });
  await running;

  assert.equal(controller.isPending('categories'), false);
  assert.deepEqual(states.at(-1).activeOperations, []);
});

test('rejects duplicate saves for the same operation while one is pending', async () => {
  const controller = createSaveOperationController();
  let completeSave;
  const first = controller.run('categories', () => new Promise((resolve) => { completeSave = resolve; }));

  await assert.rejects(
    controller.run('categories', async () => ({ success: true })),
    /이미 저장 중입니다/,
  );

  completeSave({ success: true });
  await first;
});

test('keeps a save error after failure and clears it before the next attempt', async () => {
  const controller = createSaveOperationController();

  await assert.rejects(
    controller.run('categories', async () => { throw new Error('network unavailable'); }),
    /network unavailable/,
  );
  assert.equal(controller.isPending('categories'), false);
  assert.equal(controller.getError('categories'), 'network unavailable');

  await controller.run('categories', async () => ({ success: true }));
  assert.equal(controller.getError('categories'), '');
});

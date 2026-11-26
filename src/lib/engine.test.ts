import { afterEach, expect, it, vi } from 'vitest';
class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  messages: string[] = [];
  terminated = false;
  constructor() { super(); FakeWorker.instances.push(this); }
  postMessage(message: string) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(data: string) { this.dispatchEvent(new MessageEvent('message', { data })); }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('discards a timed-out worker before the next queued position, and cleans up errors', async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.stubGlobal('Worker', FakeWorker); FakeWorker.instances = [];
  const { evaluate } = await import('./engine');
  const first = evaluate('first').catch(e => e.message);
  const second = evaluate('second');
  await vi.advanceTimersByTimeAsync(0);
  const old = FakeWorker.instances[0];
  await vi.advanceTimersByTimeAsync(15001);
  expect(await first).toBe('engine timeout'); expect(old.terminated).toBe(true);
  const current = FakeWorker.instances[1];
  expect(current.messages).toContain('position fen second');
  old.emit('info depth 10 score cp 900'); old.emit('bestmove a1a8');
  current.emit('info depth 16 score cp 35'); current.emit('bestmove e2e4');
  expect(await second).toEqual({ score: { cp: 35 }, best: 'e2e4' });
  const third = evaluate('third').catch(e => e.message); await vi.advanceTimersByTimeAsync(0);
  current.dispatchEvent(new Event('error')); expect(await third).toBe('engine failed to load'); expect(current.terminated).toBe(true);
  const fourth = evaluate('fourth'); await vi.advanceTimersByTimeAsync(0);
  const fresh = FakeWorker.instances[2]; fresh.emit('info depth 12 score mate 2'); fresh.emit('bestmove b7b8n');
  expect(await fourth).toEqual({ score: { mate: 2 }, best: 'b7b8n' });
});
it('does not fabricate a zero evaluation when the worker returns no usable score', async () => {
  vi.resetModules(); vi.stubGlobal('Worker', FakeWorker); FakeWorker.instances = [];
  const { evaluate } = await import('./engine');
  const result = evaluate('position').catch(e => e.message); await Promise.resolve();
  FakeWorker.instances[0].emit('bestmove e2e4');
  expect(await result).toBe('engine returned no usable evaluation');
});

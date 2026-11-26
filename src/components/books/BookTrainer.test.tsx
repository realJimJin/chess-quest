// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseSolutionText } from '@/lib/puzzle';
import { evaluate } from '@/lib/engine';
import type { BookDiagram } from '@/lib/private-books';
import BookTrainer from './BookTrainer';
vi.mock('@/lib/engine', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/engine')>()), evaluate: vi.fn() }));
vi.mock('./BookExcerpt', () => ({ default: ({ label }: { label: string }) => <p data-testid="source-answer">{label}</p> }));
const start = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
const diagram: BookDiagram = { id: 'exercise', label: 'Fixture exercise', page: 2, x: .1, y: .2, width: .3, height: .3, confidence: 1, needsReview: false, side: 'w', fen: start, training: { chapterId: 'first', answer: [{ page: 3, x: .1, y: .1, width: .4, height: .4 }], solution: parseSolutionText(start, 'Qf8#') } };
const renderTrainer = (d = diagram, onRecord = vi.fn().mockResolvedValue(undefined)) => ({ onRecord, ...render(<BookTrainer diagram={d} onRecord={onRecord} onCorrection={vi.fn()} onRead={vi.fn()} />) });
const play = async (san: string) => { await userEvent.type(screen.getByTestId('move-notation'), san); await userEvent.click(screen.getByRole('button', { name: 'Play move' })); };
const fen = () => screen.getByTestId('board').getAttribute('data-fen');
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); window.matchMedia = vi.fn().mockReturnValue({ matches: true }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('hides the answer, checks a book move, and replays it with keyboard arrows', async () => {
  const { onRecord } = renderTrainer();
  expect(screen.queryByTestId('source-answer')).toBeNull();
  await play('Qf8#');
  await waitFor(() => expect(onRecord).toHaveBeenCalledWith('solved'));
  expect(screen.getByRole('status').textContent).toContain('verified book line');
  expect(evaluate).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'ArrowLeft' }); expect(fen()).toBe(start);
  fireEvent.keyDown(window, { key: 'ArrowRight' }); expect(fen()).toContain('5Q1k');
  await userEvent.click(screen.getByRole('button', { name: 'Show book solution' }));
  expect(screen.getByTestId('source-answer').textContent).toContain('book solution');
  await userEvent.click(screen.getByRole('button', { name: 'Replay book line' })); expect(fen()).toBe(start);
  fireEvent.keyDown(window, { key: 'ArrowRight' }); expect(fen()).toContain('5Q1k');
});
it('plays the book reply and waits for the next user move', async () => {
  const initial = '8/7k/8/8/8/8/8/R5K1 w - - 0 1';
  renderTrainer({ ...diagram, fen: initial, training: { ...diagram.training!, solution: parseSolutionText(initial, 'Ra7+ Kg6 Kf2') } });
  await play('Ra7+'); expect(fen()).toContain('8/R7/6k1'); expect(screen.getByRole('status').textContent).toContain('Kg6');
  await play('Kf2'); expect(screen.getByRole('status').textContent).toContain('completed');
});
it('rejects an inferior move, keeps the position, and lets the user retry', async () => {
  vi.mocked(evaluate).mockResolvedValueOnce({ score: { mate: 1 }, best: 'f7f8' }).mockResolvedValueOnce({ score: { cp: 0 }, best: 'f7f6' });
  const { onRecord } = renderTrainer(); await play('Qf6+');
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Try another move'));
  expect(fen()).toBe(start); expect(onRecord).not.toHaveBeenCalledWith('solved');
  await play('Qf8#'); expect(onRecord).toHaveBeenCalledWith('solved');
});
it('labels engine-only success and never counts it as a solved book line', async () => {
  const d = { ...diagram, training: { ...diagram.training!, solution: undefined } };
  vi.mocked(evaluate).mockResolvedValueOnce({ score: { cp: 850 }, best: 'f7f6' });
  const { onRecord } = renderTrainer(d); await play('Qf6+');
  await waitFor(() => expect(onRecord).toHaveBeenCalledWith('engine-checked'));
  expect(screen.getByRole('status').textContent).toContain('not the complete book exercise');
  expect(onRecord).not.toHaveBeenCalledWith('solved');
});
it('does not mark revealed or hinted answers solved', async () => {
  const { onRecord } = renderTrainer();
  await userEvent.click(screen.getByRole('button', { name: 'Hint' })); await play('Qf8#');
  expect(onRecord).toHaveBeenCalledWith('revealed'); expect(onRecord).not.toHaveBeenCalledWith('solved');
  await userEvent.click(screen.getByRole('button', { name: 'Show book solution' }));
  expect(onRecord).not.toHaveBeenCalledWith('solved');
});
it('does not turn an engine failure into a wrong move or a pass', async () => {
  vi.mocked(evaluate).mockRejectedValue(new Error('timeout'));
  const { onRecord } = renderTrainer(); await play('Qf6+');
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('has not been graded'));
  expect(fen()).toBe(start); expect(onRecord).not.toHaveBeenCalledWith('solved'); expect(onRecord).not.toHaveBeenCalledWith('engine-checked');
  expect((screen.getByTestId('move-notation') as HTMLInputElement).disabled).toBe(false);
});
it('ignores a late engine result after reset or reveal', async () => {
  let finish!: (value: Awaited<ReturnType<typeof evaluate>>) => void;
  vi.mocked(evaluate).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { onRecord } = renderTrainer(); await play('Qf6+');
  await userEvent.click(screen.getByRole('button', { name: 'Show book solution' }));
  finish({ score: { cp: 0 }, best: 'f7f6' });
  await waitFor(() => expect(screen.getByTestId('source-answer')).toBeTruthy());
  expect(fen()).toBe(start); expect(onRecord).not.toHaveBeenCalledWith('engine-checked');
});
it('records underpromotion and reports failed persistence without claiming it saved', async () => {
  const initial = '8/1P4k1/8/8/8/8/8/K7 w - - 0 1';
  const onRecord = vi.fn().mockRejectedValue(new Error('Disk full'));
  renderTrainer({ ...diagram, fen: initial, training: { ...diagram.training!, solution: parseSolutionText(initial, 'b8=N') } }, onRecord);
  await play('b8=N'); expect(fen()).toContain('1N6');
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be saved'));
});
it('can continue a checked position against the engine and checks the next player move', async () => {
  const initial = '8/7k/8/8/8/8/8/R5K1 w - - 0 1';
  vi.mocked(evaluate).mockResolvedValueOnce({ score: { cp: 550 }, best: 'a1a7' }).mockResolvedValueOnce({ score: { cp: -550 }, best: 'h7g6' }).mockResolvedValueOnce({ score: { cp: 550 }, best: 'g1f2' });
  const { onRecord } = renderTrainer({ ...diagram, fen: initial, training: { ...diagram.training!, solution: undefined } });
  await play('Ra7+'); await screen.findByRole('button', { name: 'Continue against engine' });
  await userEvent.click(screen.getByRole('button', { name: 'Continue against engine' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Engine replies Kg6'));
  await play('Kf2'); await waitFor(() => expect(onRecord.mock.calls.filter(([e]) => e === 'engine-checked')).toHaveLength(2));
  expect(onRecord).not.toHaveBeenCalledWith('solved');
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import BookBoard from './BookBoard';
import type { BookDiagram } from '@/lib/private-books';
const diagram: BookDiagram = { id: 'position', label: 'Test position', page: 3, x: .1, y: .2, width: .3, height: .3, confidence: 1, needsReview: false, side: 'w', fen: '7k/P7/8/8/8/8/8/K7 w - - 0 1' };
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const fen = () => screen.getByTestId('board').getAttribute('data-fen');
it('allows analysis and underpromotion, keyboard navigation and branching', async () => {
  render(<BookBoard diagram={diagram} completed={false} onComplete={vi.fn()} onCorrection={vi.fn()} onSource={vi.fn()} />);
  const initial = fen();
  await userEvent.type(screen.getByTestId('move-notation'), 'a8=N');
  await userEvent.click(screen.getByRole('button', { name: 'Play move' }));
  expect(fen()).toContain('N6k');
  fireEvent.keyDown(window, { key: 'ArrowLeft' }); expect(fen()).toBe(initial);
  fireEvent.keyDown(window, { key: 'ArrowRight' }); expect(fen()).toContain('N6k');
  await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
  await userEvent.clear(screen.getByTestId('move-notation'));
  await userEvent.type(screen.getByTestId('move-notation'), 'a8=R+');
  await userEvent.click(screen.getByRole('button', { name: 'Play move' }));
  expect(fen()).toContain('R6k');
  expect(screen.queryByRole('button', { name: 'a8=N' })).toBeNull();
});
it('preserves keyboard editing and exposes save failures instead of falsely marking completion', async () => {
  const save = vi.fn().mockRejectedValue(new Error('Disk full'));
  render(<BookBoard diagram={diagram} completed={false} onComplete={save} onCorrection={vi.fn()} onSource={vi.fn()} />);
  await userEvent.type(screen.getByTestId('move-notation'), 'Ka2');
  await userEvent.click(screen.getByRole('button', { name: 'Play move' }));
  const played = fen(); fireEvent.keyDown(screen.getByTestId('move-notation'), { key: 'ArrowLeft' }); expect(fen()).toBe(played);
  await userEvent.click(screen.getByRole('button', { name: 'Mark this position studied' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be saved'));
  expect(screen.getByRole('button', { name: 'Mark this position studied' }).getAttribute('aria-pressed')).toBe('false');
});
it('allows source-confirmed castling without requiring a FEN edit', async () => {
  render(<BookBoard diagram={{ ...diagram, fen: 'k7/8/8/8/8/8/8/4K2R w - - 0 1' }} completed={false} onComplete={vi.fn()} onCorrection={vi.fn()} onSource={vi.fn()} />);
  await userEvent.click(screen.getByText('Castling permissions'));
  await userEvent.click(screen.getByLabelText('White kingside'));
  await userEvent.type(screen.getByTestId('move-notation'), 'O-O');
  await userEvent.click(screen.getByRole('button', { name: 'Play move' }));
  expect(fen()).toMatch(/5RK1 b - -/);
});

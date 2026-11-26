// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import YusupovStudy from './YusupovStudy';
import { YUSUPOV_BOOKS } from '@/lib/studies/yusupov';

const mocks = vi.hoisted(() => ({ importBook: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/store', () => ({ useApp: () => ({ ready: true, importBook: mocks.importBook }) }));
beforeEach(() => {
  mocks.importBook.mockReset().mockResolvedValue(undefined); mocks.push.mockReset();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const fen = () => screen.getByTestId('board').getAttribute('data-fen');

it('renders the real board, replays in both directions, and resets between books and variations', async () => {
  const { container } = render(<YusupovStudy />);
  await waitFor(() => expect(container.querySelectorAll('cg-board piece').length).toBe(11));
  const initial = fen();
  await userEvent.click(screen.getByRole('button', { name: 'Next move' }));
  expect(fen()).not.toBe(initial);
  fireEvent.keyDown(window, { key: 'ArrowLeft' });
  expect(fen()).toBe(initial);
  fireEvent.keyDown(window, { key: 'End' });
  expect(fen()).toContain('2N5');
  await userEvent.selectOptions(screen.getByLabelText('Replay variation'), '1');
  expect(fen()).toBe(initial);
  await userEvent.click(within(screen.getByRole('navigation', { name: 'Yusupov books' })).getByRole('button', { name: /Boost Your Chess 1/ }));
  expect(fen()).toBe(YUSUPOV_BOOKS[1].positions[0].fen);
  await userEvent.click(within(screen.getByRole('navigation', { name: 'Yusupov books' })).getByRole('button', { name: /Chess Evolution 1/ }));
  expect(fen()).toBe(YUSUPOV_BOOKS[2].positions[0].fen);
  expect(mocks.importBook).not.toHaveBeenCalled();
});

it('saves the selected book before opening practice and passes an exact position ID', async () => {
  let complete!: () => void;
  mocks.importBook.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
  render(<YusupovStudy />);
  await userEvent.click(screen.getByRole('button', { name: 'Practice this position' }));
  expect(mocks.push).not.toHaveBeenCalled();
  complete();
  await waitFor(() => expect(mocks.push).toHaveBeenCalledOnce());
  const url = new URL(mocks.push.mock.calls[0][0], 'http://localhost');
  expect(url.searchParams.get('id')).toBe(YUSUPOV_BOOKS[0].positions[0].exercise.id);
  expect(mocks.importBook).toHaveBeenCalledWith(YUSUPOV_BOOKS[0].pack.book, YUSUPOV_BOOKS[0].pack.exercises);
});

it('keeps replay usable on storage failure and actually retries persistence', async () => {
  mocks.importBook.mockRejectedValueOnce(new Error('Disk full'));
  render(<YusupovStudy />);
  await userEvent.click(screen.getByRole('button', { name: 'Practice all 3' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(mocks.push).not.toHaveBeenCalled();
  const initial = fen();
  await userEvent.click(screen.getByRole('button', { name: 'Next move' }));
  expect(fen()).not.toBe(initial);
  await userEvent.click(screen.getByRole('button', { name: 'Practice all 3' }));
  expect(mocks.importBook).toHaveBeenCalledTimes(2);
  expect(mocks.push).toHaveBeenCalledWith('/train?book=yusupov-build1-samples&mode=flow');
});

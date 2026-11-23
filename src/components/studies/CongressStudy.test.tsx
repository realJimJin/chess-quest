// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CongressStudy from './CongressStudy';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addListener: vi.fn(), removeListener: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const store = () => ({ load: vi.fn(() => [] as string[]), save: vi.fn() });
const boardFen = () => screen.getByTestId('board').getAttribute('data-fen');

it('renders the real board and navigates both ways with buttons and arrow keys', async () => {
  const { container } = render(<CongressStudy progressStore={store()} />);
  expect(container.querySelectorAll('cg-board piece').length).toBe(32);
  const initial = boardFen();
  await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
  expect(boardFen()).not.toBe(initial);
  fireEvent.keyDown(window, { key: 'ArrowLeft' });
  expect(boardFen()).toBe(initial);
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(boardFen()).not.toBe(initial);
  await userEvent.click(screen.getByRole('button', { name: '← Back' }));
  expect(boardFen()).toBe(initial);
  await userEvent.click(screen.getByRole('button', { name: 'Flip board' }));
  expect(container.querySelector('.orientation-black')).toBeTruthy();
});

it('records only unaided source moves, supplies the opponent reply, and prevents review from answering', async () => {
  const storage = store(); render(<CongressStudy progressStore={storage} />);
  await userEvent.click(screen.getByRole('button', { name: 'Practice Yunker’s moves' }));
  await userEvent.type(screen.getByTestId('move-notation'), 'd2d4');
  fireEvent.keyDown(screen.getByTestId('move-notation'), { key: 'ArrowRight' });
  await userEvent.click(screen.getByRole('button', { name: 'Play move' }));
  expect(storage.save).toHaveBeenLastCalledWith(['lockett-benko:0']);
  await userEvent.click(screen.getByRole('button', { name: 'Play opponent reply →' }));
  expect(boardFen()?.split(' ')[1]).toBe('w');
  fireEvent.keyDown(window, { key: 'ArrowLeft' });
  expect(screen.getByTestId('move-notation').hasAttribute('disabled')).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Return to practice position' }));
  await userEvent.type(screen.getByTestId('move-notation'), 'Nf3');
  await userEvent.click(screen.getByRole('button', { name: 'Play move' }));
  expect(screen.getByRole('status').textContent).toContain('different choice');
  await userEvent.type(screen.getByTestId('move-notation'), 'c4');
  await userEvent.click(screen.getByRole('button', { name: 'Play move' }));
  expect(storage.save).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status').textContent).toContain('Assisted');
});

it('selects Black practice, shows hints, and excludes revealed moves from saved recall', async () => {
  const storage = store(); render(<CongressStudy progressStore={storage} />);
  await userEvent.selectOptions(screen.getByLabelText('Choose repertoire or opponent'), 'caro');
  await userEvent.click(screen.getByRole('button', { name: 'Practice Yunker’s moves' }));
  expect(boardFen()?.split(' ')[1]).toBe('b');
  await userEvent.click(screen.getByRole('button', { name: 'Hint arrow' }));
  await waitFor(() => expect(document.querySelector('svg.cg-shapes line')).toBeTruthy());
  await userEvent.click(screen.getByRole('button', { name: 'Reveal move' }));
  expect(screen.getByRole('status').textContent).toContain('c6');
  expect(storage.save).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Play opponent reply →' }));
  await userEvent.type(screen.getByTestId('move-notation'), 'd5{Enter}');
  expect(storage.save).toHaveBeenCalledWith(['lockett-panov:3']);
});

it('keeps opponent evidence out of Yunker training and switches chapters through the mobile selector', async () => {
  render(<CongressStudy progressStore={store()} />);
  await userEvent.selectOptions(screen.getByLabelText('Choose repertoire or opponent'), 'opponents');
  expect(screen.queryByRole('button', { name: 'Practice Yunker’s moves' })).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText('Chapter'), 'observed-narayana-fragment');
  expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Narayana');
  expect(screen.getByText(/Scouting reference only\. These moves are not attributed to Yunker\./)).toBeTruthy();
  expect(window.location.hash).toBe('#observed-narayana-fragment');
});

it('does not overwrite unreadable progress and retries a failed save', async () => {
  const storage = { load: vi.fn(() => { throw Error('blocked'); }), save: vi.fn() };
  const view = render(<CongressStudy progressStore={storage} />);
  expect(screen.getByRole('alert').textContent).toContain('will not be overwritten');
  await userEvent.click(screen.getByRole('button', { name: 'Practice Yunker’s moves' }));
  await userEvent.type(screen.getByTestId('move-notation'), 'd4{Enter}');
  expect(storage.save).not.toHaveBeenCalled();
  view.unmount();
  const retryStore = store(); retryStore.save.mockImplementationOnce(() => { throw Error('full'); });
  render(<CongressStudy progressStore={retryStore} />);
  await userEvent.click(screen.getByRole('button', { name: 'Practice Yunker’s moves' }));
  await userEvent.type(screen.getByTestId('move-notation'), 'd4{Enter}');
  expect(screen.getByRole('alert').textContent).toContain('could not be saved');
  await userEvent.click(screen.getByRole('button', { name: 'Retry saving' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(retryStore.save).toHaveBeenLastCalledWith(['lockett-benko:0']);
});

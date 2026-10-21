import { describe, expect, test } from 'bun:test';

import type { HistoryView } from '@/lib/reels/exit';

import { shellLeave, type ShellLeaveHost } from './shell-leave';

/**
 * LA COQUE QUITTE UN LIEN SUIVI SANS RESTER SUR SON ÉCRAN D'ATTENTE (#8322).
 *
 * Sous Android, `location.replace` vers un hôte externe est ANNULÉ par
 * `Bridge.launchIntent`, qui ouvre le navigateur : la WebView reste sur
 * « Ouverture du lien… ». Au RETOUR au premier plan, l'app recule vers
 * l'entrée Meeshy d'où l'on vient, ou, sans elle, rejoint la liste.
 */

type Listener = () => void;

function stage(history: HistoryView) {
  const listeners = new Set<Listener>();
  const opened: string[] = [];
  const retreats: Array<'back' | 'home'> = [];
  const went: string[] = [];
  const page = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_: 'visibilitychange', listener: Listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_: 'visibilitychange', listener: Listener) => {
      listeners.delete(listener);
    },
  };
  const host: ShellLeaveHost = {
    open: (target) => {
      opened.push(target);
    },
    document: page,
    history: () => history,
    back: () => {
      retreats.push('back');
    },
    home: () => {
      retreats.push('home');
    },
    inside: (target) => (target.startsWith('https://meeshy.me/') ? target.slice('https://meeshy.me'.length) : null),
    go: (path) => {
      went.push(path);
    },
  };
  const become = (state: DocumentVisibilityState) => {
    page.visibilityState = state;
    [...listeners].forEach((listener) => listener());
  };
  return { host, opened, retreats, went, become, listeners };
}

const FROM_A_THREAD: HistoryView = { canGoBack: true, historyLength: 3, onLandingEntry: false };
const COLD_START: HistoryView = { canGoBack: false, historyLength: 1, onLandingEntry: true };

describe('shellLeave — la cible part au navigateur, l’app ne reste pas sur l’attente', () => {
  test('la cible est remise tout de suite, et rien ne recule tant que l’app n’est pas revenue', () => {
    const { host, opened, retreats, become } = stage(FROM_A_THREAD);
    shellLeave(host)('https://example.com/a');
    expect(opened).toEqual(['https://example.com/a']);
    expect(retreats).toEqual([]);
    become('hidden');
    expect(retreats).toEqual([]);
  });

  test('au retour au premier plan, une entrée Meeshy derrière soi ⇒ l’app recule', () => {
    const { host, retreats, become } = stage(FROM_A_THREAD);
    shellLeave(host)('https://example.com/a');
    become('hidden');
    become('visible');
    expect(retreats).toEqual(['back']);
  });

  test('ouverte par un App Link, rien de Meeshy derrière ⇒ la liste des conversations', () => {
    const { host, retreats, become } = stage(COLD_START);
    shellLeave(host)('https://example.com/a');
    become('hidden');
    become('visible');
    expect(retreats).toEqual(['home']);
  });

  test('un seul recul : l’écoute se retire après le retour', () => {
    const { host, retreats, become, listeners } = stage(FROM_A_THREAD);
    shellLeave(host)('https://example.com/a');
    become('hidden');
    become('visible');
    become('hidden');
    become('visible');
    expect(retreats).toEqual(['back']);
    expect(listeners.size).toBe(0);
  });
});

describe('shellLeave — une cible qui est un écran de Meeshy reste dans l’app (#10329)', () => {
  test('la cible meeshy.me servie par le routeur navigue dans l’app, sans passer par le navigateur', () => {
    const { host, opened, went } = stage(FROM_A_THREAD);
    shellLeave(host)('https://meeshy.me/u/alice?x=1');
    expect(went).toEqual(['/u/alice?x=1']);
    expect(opened).toEqual([]);
  });

  test('aucune écoute de retour n’est laissée : revenir au premier plan ne recule pas', () => {
    const { host, retreats, become, listeners } = stage(FROM_A_THREAD);
    shellLeave(host)('https://meeshy.me/feeds');
    expect(listeners.size).toBe(0);
    become('hidden');
    become('visible');
    expect(retreats).toEqual([]);
  });

  test('une cible externe part toujours au navigateur', () => {
    const { host, opened, went } = stage(FROM_A_THREAD);
    shellLeave(host)('https://example.com/a');
    expect(opened).toEqual(['https://example.com/a']);
    expect(went).toEqual([]);
  });
});

import { describe, expect, test } from 'bun:test';

import type { SocketClient } from '@/lib/net/socket';

import { createLiveSocketWatchers } from './live-socket-watchers';

const fakeSocket = (name: string): SocketClient & { readonly name: string } => ({
  name,
  connected: true,
  connect: () => undefined,
  disconnect: () => undefined,
  on: () => undefined,
  off: () => undefined,
  emit: () => undefined,
});

/** Un observateur de témoin : il note à quelle socket il s'accroche et de laquelle il se détache. */
const recordingWatcher = (log: string[], label: string) => (socket: SocketClient) => {
  const name = (socket as { name?: string }).name ?? '?';
  log.push(`${label}+${name}`);
  return () => void log.push(`${label}-${name}`);
};

describe('createLiveSocketWatchers — s’accrocher à la socket vivante, quelle que soit la connexion (#9899)', () => {
  test('sans connexion, l’observateur attend ; la connexion le trouve prêt', () => {
    const log: string[] = [];
    const watchers = createLiveSocketWatchers();
    watchers.watch(recordingWatcher(log, 'a'));
    expect(log).toEqual([]);

    watchers.connect(fakeSocket('s1'));
    expect(log).toEqual(['a+s1']);
  });

  test('avec une connexion déjà là, l’observateur s’y accroche aussitôt', () => {
    const log: string[] = [];
    const watchers = createLiveSocketWatchers();
    watchers.connect(fakeSocket('s1'));
    watchers.watch(recordingWatcher(log, 'a'));
    expect(log).toEqual(['a+s1']);
  });

  test('une connexion remplacée : l’observateur quitte l’ancienne socket et s’accroche à la nouvelle', () => {
    const log: string[] = [];
    const watchers = createLiveSocketWatchers();
    watchers.connect(fakeSocket('s1'));
    watchers.watch(recordingWatcher(log, 'a'));
    watchers.connect(fakeSocket('s2'));
    expect(log).toEqual(['a+s1', 'a-s1', 'a+s2']);
  });

  test('une connexion fermée détache l’observateur ; la suivante le raccroche', () => {
    const log: string[] = [];
    const watchers = createLiveSocketWatchers();
    watchers.connect(fakeSocket('s1'));
    watchers.watch(recordingWatcher(log, 'a'));
    watchers.connect(null);
    watchers.connect(fakeSocket('s2'));
    expect(log).toEqual(['a+s1', 'a-s1', 'a+s2']);
  });

  test('cesser d’observer détache de la socket courante, et plus rien ne s’accroche ensuite', () => {
    const log: string[] = [];
    const watchers = createLiveSocketWatchers();
    watchers.connect(fakeSocket('s1'));
    const stop = watchers.watch(recordingWatcher(log, 'a'));
    stop();
    watchers.connect(fakeSocket('s2'));
    expect(log).toEqual(['a+s1', 'a-s1']);
  });

  test('cesser deux fois ne détache qu’une fois', () => {
    const log: string[] = [];
    const watchers = createLiveSocketWatchers();
    watchers.connect(fakeSocket('s1'));
    const stop = watchers.watch(recordingWatcher(log, 'a'));
    stop();
    stop();
    expect(log).toEqual(['a+s1', 'a-s1']);
  });

  test('plusieurs observateurs sont indépendants ; le même observateur inscrit deux fois compte deux fois', () => {
    const log: string[] = [];
    const watchers = createLiveSocketWatchers();
    watchers.connect(fakeSocket('s1'));
    const shared = recordingWatcher(log, 'a');
    const stopFirst = watchers.watch(shared);
    watchers.watch(shared);
    watchers.watch(recordingWatcher(log, 'b'));
    stopFirst();
    expect(log).toEqual(['a+s1', 'a+s1', 'b+s1', 'a-s1']);
    watchers.connect(fakeSocket('s2'));
    expect(log.slice(4)).toEqual(['a-s1', 'b-s1', 'a+s2', 'b+s2']);
  });

  test('un observateur qui lève à l’accroche n’empêche ni les autres ni les connexions suivantes', () => {
    const log: string[] = [];
    const watchers = createLiveSocketWatchers();
    watchers.watch(() => {
      throw new Error('panne');
    });
    watchers.watch(recordingWatcher(log, 'b'));
    watchers.connect(fakeSocket('s1'));
    watchers.connect(fakeSocket('s2'));
    expect(log).toEqual(['b+s1', 'b-s1', 'b+s2']);
  });
});

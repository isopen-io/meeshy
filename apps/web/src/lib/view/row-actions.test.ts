import { describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { rowMenuItems } from './row-actions';

describe('rowMenuItems — les libellés BASCULENT avec l’état (#5559 T13)', () => {
  test('épinglée ⇒ "Désépingler" ; non épinglée ⇒ "Épingler"', () => {
    const pinned = rowMenuItems({ flags: { isPinned: true, isMuted: false, isArchived: false }, unread: false, language: 'fr' });
    expect(pinned.find((i) => i.id === 'pin')?.label).toBe('Désépingler');

    const unpinned = rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: false }, unread: false, language: 'fr' });
    expect(unpinned.find((i) => i.id === 'pin')?.label).toBe('Épingler');
  });

  test('non lue ⇒ "Marquer comme lu" ; lue ⇒ "Marquer comme non lu" (couples iOS)', () => {
    const unread = rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: false }, unread: true, language: 'fr' });
    expect(unread.find((i) => i.id === 'read')?.label).toBe('Lu');

    const read = rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: false }, unread: false, language: 'fr' });
    expect(read.find((i) => i.id === 'read')?.label).toBe('Non lu');
  });

  test('sourdine ⇒ "Son" ; audible ⇒ "Silence"', () => {
    const muted = rowMenuItems({ flags: { isPinned: false, isMuted: true, isArchived: false }, unread: false, language: 'fr' });
    expect(muted.find((i) => i.id === 'mute')?.label).toBe('Son');

    const unmuted = rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: false }, unread: false, language: 'fr' });
    expect(unmuted.find((i) => i.id === 'mute')?.label).toBe('Silence');
  });

  test('archivée ⇒ "Désarchiver" ; non archivée ⇒ "Archiver"', () => {
    const archived = rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: true }, unread: false, language: 'fr' });
    expect(archived.find((i) => i.id === 'archive')?.label).toBe('Désarchiver');

    const notArchived = rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: false }, unread: false, language: 'fr' });
    expect(notArchived.find((i) => i.id === 'archive')?.label).toBe('Archiver');
  });

  test('chaque item porte son id — le menu ne peut pas mentir sur l’état', () => {
    const items = rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: false }, unread: false, language: 'fr' });
    expect(items.map((i) => i.id)).toEqual(['pin', 'mute', 'read', 'archive']);
  });
});

describe('rowMenuItems — appeler depuis la ligne (#8109)', () => {
  const flags = { isPinned: false, isMuted: false, isArchived: false };

  test('quand l’appel est permis, « Appel vocal » et « Appel vidéo » ouvrent le menu', () => {
    const items = rowMenuItems({ flags, unread: false, language: 'fr', canCall: true });
    expect(items.map((i) => i.id)).toEqual(['callAudio', 'callVideo', 'pin', 'mute', 'read', 'archive']);
    expect(items.slice(0, 2).map((i) => i.label)).toEqual(['Appel vocal', 'Appel vidéo']);
  });

  test('sans droit d’appeler, aucune entrée d’appel', () => {
    expect(rowMenuItems({ flags, unread: false, language: 'fr' }).some((i) => i.id === 'callAudio' || i.id === 'callVideo')).toBe(false);
  });
});

describe('rowMenuItems — le menu parle la langue d’interface du lecteur (#8150)', () => {
  test('en anglais, chaque ligne est anglaise, avec les mots d’iOS (swipe.*)', async () => {
    await loadInterfaceCatalog('en');
    const flags = { isPinned: false, isMuted: false, isArchived: false };
    expect(rowMenuItems({ flags, unread: true, language: 'en', canCall: true }).map((i) => i.label)).toEqual([
      'Voice call',
      'Video call',
      'Pin',
      'Mute',
      'Read',
      'Archive',
    ]);
    expect(
      rowMenuItems({ flags: { isPinned: true, isMuted: true, isArchived: true }, unread: false, language: 'en' }).map((i) => i.label),
    ).toEqual(['Unpin', 'Sound', 'Unread', 'Unarchive']);
  });
});

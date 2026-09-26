import { describe, expect, test } from 'bun:test';

import { rowMenuItems } from './row-actions';

describe('rowMenuItems — les libellés BASCULENT avec l’état (#5559 T13)', () => {
  test('épinglée ⇒ "Désépingler" ; non épinglée ⇒ "Épingler"', () => {
    const pinned = rowMenuItems({ flags: { isPinned: true, isMuted: false, isArchived: false }, unread: false });
    expect(pinned.find((i) => i.id === 'pin')?.label).toBe('Désépingler');

    const unpinned = rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: false }, unread: false });
    expect(unpinned.find((i) => i.id === 'pin')?.label).toBe('Épingler');
  });

  test('non lue ⇒ "Marquer comme lu" ; lue ⇒ "Marquer comme non lu" (couples iOS)', () => {
    const unread = rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: false }, unread: true });
    expect(unread.find((i) => i.id === 'read')?.label).toBe('Lu');

    const read = rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: false }, unread: false });
    expect(read.find((i) => i.id === 'read')?.label).toBe('Non lu');
  });

  test('sourdine ⇒ "Son" ; audible ⇒ "Silence"', () => {
    const muted = rowMenuItems({ flags: { isPinned: false, isMuted: true, isArchived: false }, unread: false });
    expect(muted.find((i) => i.id === 'mute')?.label).toBe('Son');

    const unmuted = rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: false }, unread: false });
    expect(unmuted.find((i) => i.id === 'mute')?.label).toBe('Silence');
  });

  test('archivée ⇒ "Désarchiver" ; non archivée ⇒ "Archiver"', () => {
    const archived = rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: true }, unread: false });
    expect(archived.find((i) => i.id === 'archive')?.label).toBe('Désarchiver');

    const notArchived = rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: false }, unread: false });
    expect(notArchived.find((i) => i.id === 'archive')?.label).toBe('Archiver');
  });

  test('chaque item porte son id — le menu ne peut pas mentir sur l’état', () => {
    const items = rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: false }, unread: false });
    expect(items.map((i) => i.id)).toEqual(['pin', 'mute', 'read', 'archive']);
  });
});

describe('rowMenuItems — appeler depuis la ligne (#8109)', () => {
  const flags = { isPinned: false, isMuted: false, isArchived: false };

  test('quand l’appel est permis, « Appel vocal » et « Appel vidéo » ouvrent le menu', () => {
    const items = rowMenuItems({ flags, unread: false, call: { language: 'fr' } });
    expect(items.map((i) => i.id)).toEqual(['callAudio', 'callVideo', 'pin', 'mute', 'read', 'archive']);
    expect(items.slice(0, 2).map((i) => i.label)).toEqual(['Appel vocal', 'Appel vidéo']);
  });

  test('sans droit d’appeler, aucune entrée d’appel', () => {
    expect(rowMenuItems({ flags, unread: false }).some((i) => i.id === 'callAudio' || i.id === 'callVideo')).toBe(false);
  });
});

import { describe, expect, test } from 'bun:test';

import type { ConversationFlags } from '@/lib/api/preferences';

import {
  ROW_SWIPE_CELL,
  ROW_SWIPE_EDGES,
  ROW_SWIPE_MAX_ACTIONS,
  conversationRowSwipeSides,
  rowSwipeEngages,
  rowSwipeOffset,
  rowSwipeSettle,
  rowSwipeWidths,
} from './conversation-row-swipe';
import { rowMenuItems } from './row-actions';

/**
 * **LA LOI DU BALAYAGE D'UNE LIGNE DE CONVERSATION** (#10580) — les côtés et
 * leurs actions selon l'état de la ligne, puis la géométrie du geste, alignée
 * sur `SwipeableRow.swift`.
 */
const flags = (partial: Partial<ConversationFlags> = {}): ConversationFlags => ({
  isPinned: false,
  isMuted: false,
  isArchived: false,
  ...partial,
});

const idsOf = (items: readonly { readonly id: string }[]) => items.map((item) => item.id);

const EVERY_STATE = [true, false].flatMap((isPinned) =>
  [true, false].flatMap((isMuted) =>
    [true, false].flatMap((isArchived) =>
      [true, false].flatMap((archiveLocked) =>
        [true, false].flatMap((unread) =>
          [true, false].map((canDelete) => ({ flags: flags({ isPinned, isMuted, isArchived, archiveLocked }), unread, canDelete, language: 'fr' as const })),
        ),
      ),
    ),
  ),
);

describe('conversationRowSwipeSides — les côtés et leurs actions', () => {
  test('bord de début : épingler puis sourdine ; bord de fin : archiver, lu, supprimer', () => {
    const sides = conversationRowSwipeSides({ flags: flags(), unread: true, canDelete: true, language: 'fr' });
    expect(idsOf(sides.leading)).toEqual(['pin', 'mute']);
    expect(idsOf(sides.trailing)).toEqual(['archive', 'read', 'delete']);
  });

  test('aucun côté ne porte plus de 3 actions, dans AUCUN état — ni la table qui les déclare', () => {
    expect(ROW_SWIPE_MAX_ACTIONS).toBe(3);
    expect(ROW_SWIPE_EDGES.leading.length).toBeLessThanOrEqual(ROW_SWIPE_MAX_ACTIONS);
    expect(ROW_SWIPE_EDGES.trailing.length).toBeLessThanOrEqual(ROW_SWIPE_MAX_ACTIONS);
    for (const state of EVERY_STATE) {
      const sides = conversationRowSwipeSides(state);
      expect(sides.leading.length).toBeLessThanOrEqual(ROW_SWIPE_MAX_ACTIONS);
      expect(sides.trailing.length).toBeLessThanOrEqual(ROW_SWIPE_MAX_ACTIONS);
    }
  });

  test('les libellés et les glyphes sont CEUX du menu de la ligne, état pour état', () => {
    for (const state of EVERY_STATE) {
      const menu = rowMenuItems(state);
      const sides = conversationRowSwipeSides(state);
      for (const item of [...sides.leading, ...sides.trailing]) {
        expect(menu.find((entry) => entry.id === item.id)).toEqual(item);
      }
    }
    const sides = conversationRowSwipeSides({ flags: flags({ isPinned: true, isMuted: true, isArchived: true }), unread: false, canDelete: true, language: 'fr' });
    expect([...sides.leading, ...sides.trailing].map((item) => item.label)).toEqual(['Désépingler', 'Son', 'Désarchiver', 'Non lu', 'Supprimer']);
  });

  test('toute action du menu qui n’est pas un appel se balaie, sur UN seul côté', () => {
    for (const state of EVERY_STATE) {
      const expected = idsOf(rowMenuItems(state)).sort();
      const sides = conversationRowSwipeSides(state);
      expect([...idsOf(sides.leading), ...idsOf(sides.trailing)].sort()).toEqual(expected);
    }
  });

  test('archive imposée ⇒ « Archiver » quitte le bord de fin, comme le menu', () => {
    const sides = conversationRowSwipeSides({ flags: flags({ isArchived: true, archiveLocked: true }), unread: false, canDelete: true, language: 'fr' });
    expect(idsOf(sides.trailing)).toEqual(['read', 'delete']);
  });

  test('sans compte, « Supprimer » ne se balaie pas', () => {
    const sides = conversationRowSwipeSides({ flags: flags(), unread: false, canDelete: false, language: 'fr' });
    expect(idsOf(sides.trailing)).toEqual(['archive', 'read']);
  });

  test('un appel ne se balaie jamais, même permis', () => {
    const sides = conversationRowSwipeSides({ flags: flags(), unread: false, canDelete: true, language: 'fr' });
    expect([...idsOf(sides.leading), ...idsOf(sides.trailing)]).not.toContain('callAudio');
  });

  test('la zone d’un côté mesure 76 px par action', () => {
    const sides = conversationRowSwipeSides({ flags: flags(), unread: false, canDelete: true, language: 'fr' });
    expect(ROW_SWIPE_CELL).toBe(76);
    expect(rowSwipeWidths(sides)).toEqual({ leading: 152, trailing: 228 });
  });
});

const WIDTHS = { leading: 152, trailing: 228 };

describe('rowSwipeEngages — la dominante horizontale', () => {
  test('un glissé horizontal franc engage, dans les deux sens', () => {
    expect(rowSwipeEngages(40, 4)).toBe(true);
    expect(rowSwipeEngages(-40, -4)).toBe(true);
  });

  test('un geste vertical, ou trop court, appartient au défilement', () => {
    expect(rowSwipeEngages(10, 80)).toBe(false);
    expect(rowSwipeEngages(40, 40)).toBe(false);
    expect(rowSwipeEngages(12, 0)).toBe(false);
  });
});

describe('rowSwipeOffset — la ligne suit le doigt, puis l’élastique', () => {
  test('1:1 dans la zone d’actions, des deux côtés', () => {
    expect(rowSwipeOffset({ base: 0, dx: 60, widths: WIDTHS })).toBe(60);
    expect(rowSwipeOffset({ base: 0, dx: -200, widths: WIDTHS })).toBe(-200);
  });

  test('au-delà de la zone, l’élastique freine à 18 %', () => {
    expect(rowSwipeOffset({ base: 0, dx: 252, widths: WIDTHS })).toBeCloseTo(152 + 100 * 0.18);
    expect(rowSwipeOffset({ base: 0, dx: -328, widths: WIDTHS })).toBeCloseTo(-(228 + 100 * 0.18));
  });

  test('un côté sans action ne s’ouvre pas : il résiste dès le premier pixel', () => {
    expect(rowSwipeOffset({ base: 0, dx: 100, widths: { leading: 0, trailing: 228 } })).toBeCloseTo(18);
    expect(rowSwipeOffset({ base: 0, dx: -100, widths: { leading: 152, trailing: 0 } })).toBeCloseTo(-18);
  });

  test('depuis une ligne ouverte, le geste part de sa position', () => {
    expect(rowSwipeOffset({ base: -228, dx: 100, widths: WIDTHS })).toBe(-128);
    expect(rowSwipeOffset({ base: 152, dx: -152, widths: WIDTHS })).toBe(0);
  });
});

describe('rowSwipeSettle — où la ligne se pose au relâcher', () => {
  const settle = (base: number, dx: number, velocity = 0) => rowSwipeSettle({ base, dx, velocity, widths: WIDTHS });

  test('fermée : elle s’ouvre au-delà de 35 % de la zone, du côté balayé', () => {
    expect(settle(0, 54)).toBe(152);
    expect(settle(0, 53)).toBe(0);
    expect(settle(0, -80)).toBe(-228);
    expect(settle(0, -79)).toBe(0);
  });

  test('fermée : un coup sec l’ouvre avant le seuil, pas un effleurement', () => {
    expect(settle(0, 30, 600)).toBe(152);
    expect(settle(0, -30, -600)).toBe(-228);
    expect(settle(0, 15, 600)).toBe(0);
    expect(settle(0, 30, 300)).toBe(0);
  });

  test('un côté sans action ne s’ouvre jamais', () => {
    expect(rowSwipeSettle({ base: 0, dx: 300, velocity: 900, widths: { leading: 0, trailing: 228 } })).toBe(0);
  });

  test('ouverte : le geste inverse la referme au-delà de 35 %, ou d’un coup sec', () => {
    expect(settle(152, -54)).toBe(0);
    expect(settle(152, -40)).toBe(152);
    expect(settle(152, -12, -600)).toBe(0);
    expect(settle(-228, 80)).toBe(0);
    expect(settle(-228, 60)).toBe(-228);
    expect(settle(-228, 12, 600)).toBe(0);
  });

  test('ouverte : continuer dans le même sens la laisse ouverte', () => {
    expect(settle(152, 80)).toBe(152);
    expect(settle(-228, -80)).toBe(-228);
  });
});

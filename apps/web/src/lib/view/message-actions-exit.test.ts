import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { translation } from '@/lib/api/fixtures-base';

import { forwardMenuItems, imageableOf, messageMenuContextOf, messageMenuItems } from './message-actions';

/**
 * LE MENU ET LA FEUILLE « PLUS… » SOUS LA LOI DE SORTIE (#9573) — par nature,
 * depuis un VRAI message : ce que le menu rapide liste, ce que le sous-menu
 * de « Transférer » propose, ce que « Plus… » peut créer (Composer, Imager).
 */

const NOW = 1_700_000_000_000;
const { EPHEMERAL, EPHEMERAL_AFTER_READ } = MESSAGE_EFFECT_FLAGS;

const photo = { mimeType: 'image/jpeg', isBlurred: false, isViewOnce: false };

const base = {
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  content: 'Bonjour',
  translations: [translation('m1', 'en', 'Hello')],
  attachments: [photo],
};

const NATURES = {
  ordinary: base,
  'timed-flame': { ...base, effectFlags: EPHEMERAL, ephemeralDuration: 300 },
  'after-read-flame': { ...base, effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ },
  'view-once': { ...base, isViewOnce: true },
};

const surfaces = (message: (typeof NATURES)[keyof typeof NATURES]) => {
  const ctx = messageMenuContextOf(message, { now: NOW });
  return {
    menu: messageMenuItems(ctx).map((item) => item.id),
    forwardSubmenu: forwardMenuItems(ctx).map((item) => item.id),
    plusImager: imageableOf(ctx),
    plusComposer: ctx.composableIndex ?? null,
  };
};

describe('menu du message, sous-menu de Transférer et « Plus… » — nature × action', () => {
  test('ORDINAIRE : tout est offert', () => {
    expect(surfaces(NATURES.ordinary)).toEqual({
      menu: ['select', 'translate', 'copy', 'forward', 'reply', 'export', 'more'],
      forwardSubmenu: ['forward', 'exportDiscussion'],
      plusImager: true,
      plusComposer: 0,
    });
  });

  test('FLAMME À DURÉE : Transférer seul — ni Copier, ni Imager, ni Imager la discussion, ni Composer', () => {
    expect(surfaces(NATURES['timed-flame'])).toEqual({
      menu: ['select', 'translate', 'forward', 'reply', 'more'],
      forwardSubmenu: ['forward'],
      plusImager: false,
      plusComposer: null,
    });
  });

  test('FLAMME APRÈS LECTURE : aucune sortie — Transférer n’est pas rendu', () => {
    const offered = surfaces(NATURES['after-read-flame']);
    expect(offered.menu).toEqual(['select', 'translate', 'reply', 'more']);
    expect(offered.plusImager).toBe(false);
    expect(offered.plusComposer).toBeNull();
  });

  test('VUE UNIQUE : le menu se réduit à « Plus… », qui ne crée rien', () => {
    const offered = surfaces(NATURES['view-once']);
    expect(offered.menu).toEqual(['more']);
    expect(offered.plusImager).toBe(false);
    expect(offered.plusComposer).toBeNull();
  });

  test('une flamme à durée garde « Export rapide » hors du menu, même avec un format par défaut', () => {
    const ctx = { ...messageMenuContextOf(NATURES['timed-flame'], { now: NOW }), hasDefaultExportFormat: true };
    expect(messageMenuItems(ctx).map((item) => item.id)).not.toContain('exportQuick');
  });

  test('la PIÈCE à vue unique d’un message ordinaire ferme les sorties du message entier', () => {
    const offered = surfaces({ ...base, attachments: [{ ...photo, isViewOnce: true }] });
    expect(offered.menu).toEqual(['select', 'translate', 'reply', 'more']);
    expect(offered.plusImager).toBe(false);
  });

  test('une pièce CHIFFRÉE ne s’image ni ne se compose', () => {
    const ctx = messageMenuContextOf({ ...base, content: '', attachments: [{ ...photo, isEncrypted: true }] }, { now: NOW });
    expect(ctx.hasImageableMedia).toBe(false);
    expect(ctx.composableIndex).toBeNull();
  });
});

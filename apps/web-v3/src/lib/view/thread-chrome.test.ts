import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';

import {
  DAY_SEPARATOR_HEIGHT_PX,
  chromeHiding,
  dayOpenerIndexOf,
  isNearBottom,
  lastMessageLine,
  scrollToBottomLabel,
  stickyDayOf,
  topVisibleIndex,
  unreadHeadline,
} from './thread-chrome';

const placedOf = (opensDay: string | null): PlacedMessage => ({
  message: { id: 'x', senderId: 's', createdAt: '2026-09-10T00:00:00.000Z' } as unknown as Message,
  head: true,
  tail: true,
  opensDay,
});

describe('chromeHiding — la loi iOS (ConversationView.swift:2074-2141) (T3)', () => {
  test('focal, geste tenu -> en-tete entier + composeur cache', () => {
    expect(
      chromeHiding({ mode: 'focal', gesture: true, searchOpen: false, composerEngaged: false }),
    ).toEqual({ header: 'entire', composer: true });
  });

  test('script, geste tenu -> meme verdict que focal', () => {
    expect(
      chromeHiding({ mode: 'script', gesture: true, searchOpen: false, composerEngaged: false }),
    ).toEqual({ header: 'entire', composer: true });
  });

  test('bubbles, geste tenu -> seule la grappe d actions se cache', () => {
    expect(
      chromeHiding({ mode: 'bubbles', gesture: true, searchOpen: false, composerEngaged: false }),
    ).toEqual({ header: 'actions', composer: false });
  });

  test('summary -> jamais rien de cache, meme geste tenu', () => {
    expect(
      chromeHiding({ mode: 'summary', gesture: true, searchOpen: false, composerEngaged: false }),
    ).toEqual({ header: 'none', composer: false });
  });

  test('recherche ouverte -> rien ne bouge, quel que soit le mode', () => {
    expect(
      chromeHiding({ mode: 'focal', gesture: true, searchOpen: true, composerEngaged: false }),
    ).toEqual({ header: 'none', composer: false });
    expect(
      chromeHiding({ mode: 'bubbles', gesture: true, searchOpen: true, composerEngaged: false }),
    ).toEqual({ header: 'none', composer: false });
  });

  test('composeur engage en focal -> l en-tete part, le composeur reste (l outil en main)', () => {
    expect(
      chromeHiding({ mode: 'focal', gesture: true, searchOpen: false, composerEngaged: true }),
    ).toEqual({ header: 'entire', composer: false });
  });

  test('aucun geste -> rien ne bouge, partout', () => {
    for (const mode of ['focal', 'script', 'bubbles', 'summary'] as const) {
      expect(chromeHiding({ mode, gesture: false, searchOpen: false, composerEngaged: false })).toEqual({
        header: 'none',
        composer: false,
      });
    }
  });
});

describe('isNearBottom — seuil 200 (MessageListViewController.swift:452) (T4)', () => {
  test('distance 156 < 200 -> pres du bas', () => {
    expect(isNearBottom({ totalSize: 3000, scrollOffset: 2000, viewportHeight: 844 })).toBe(true);
  });

  test('distance exactement 200 -> PAS pres du bas (borne exclue)', () => {
    expect(isNearBottom({ totalSize: 3044, scrollOffset: 2000, viewportHeight: 844 })).toBe(false);
  });

  test('scrollOffset null (virtualiseur pas encore mesure) -> pres du bas', () => {
    expect(isNearBottom({ totalSize: 0, scrollOffset: null, viewportHeight: 844 })).toBe(true);
  });
});

describe('stickyDayOf — la regle updateStickyDayLabel (:896-957) (T5)', () => {
  const items = [
    { index: 3, start: 200, end: 290 },
    { index: 4, start: 290, end: 380 },
  ];

  test('tete visible = index dont l intervalle couvre le scrollOffset', () => {
    expect(topVisibleIndex(items, 250)).toBe(3);
  });

  test("message qui n ouvre pas de jour -> libelle de l ouvreur du jour (dayOpenerIndexOf)", () => {
    const placed = [placedOf('Hier'), placedOf(null), placedOf(null), placedOf(null), placedOf(null)];
    expect(dayOpenerIndexOf(placed, 3)).toBe(0);
    expect(
      stickyDayOf({ placed, items, scrollOffset: 250 }),
    ).toBe('Hier');
  });

  test("message qui OUVRE un jour et dont le separateur en flux est encore visible (avant SON bord haut) -> null", () => {
    const placed = [placedOf('Hier'), placedOf(null), placedOf(null), placedOf('Aujourd’hui'), placedOf(null)];
    // item[3].start = 200 + 40 (DAY_SEPARATOR_HEIGHT_PX) = 240 > scrollOffset 190 -> son
    // separateur EN FLUX est visible (le bord haut n a meme pas encore atteint le sommet).
    expect(stickyDayOf({ placed, items, scrollOffset: 190 })).toBeNull();
  });

  /**
   * RÉGRESSION revue #5774, défaut majeur 5 — le SÉPARATEUR occupe
   * `DAY_SEPARATOR_HEIGHT_PX` (40) pixels au sommet de la rangée, jamais un
   * seul point : entre le bord HAUT de la rangée (`item.start`, 200) et son
   * bord BAS (`item.start + DAY_SEPARATOR_HEIGHT_PX`, 240), l'ancienne loi
   * (`item.start >= scrollOffset`) démasquait déjà la sticky dès que le
   * scrollOffset dépassait 200 — le séparateur EN FLUX restait pourtant
   * visible jusqu'à 240. Les deux capsules portaient alors le MÊME libellé,
   * simultanément à l'écran (mesuré au navigateur : fenêtre de ~40px de
   * défilement, `.cache/web-v3-workflow/recette/thread/DEF-doublon-pilule-jour.light.png`).
   */
  test('DANS la fenetre du doublon (200 <= scrollOffset < 240) -> la sticky reste masquee', () => {
    const placed = [placedOf('Hier'), placedOf(null), placedOf(null), placedOf('Aujourd’hui'), placedOf(null)];
    expect(stickyDayOf({ placed, items, scrollOffset: 220 })).toBeNull();
    // Juste AVANT le bord bas du separateur (200 + 40 = 240, borne exclue) : encore visible en flux.
    expect(stickyDayOf({ placed, items, scrollOffset: 200 + DAY_SEPARATOR_HEIGHT_PX - 1 })).toBeNull();
    // Exactement au bord bas : le separateur a fini de defiler, la sticky peut reprendre.
    expect(stickyDayOf({ placed, items, scrollOffset: 200 + DAY_SEPARATOR_HEIGHT_PX })).toBe('Aujourd’hui');
  });

  test("message qui OUVRE un jour et dont le separateur en flux est ENTIEREMENT passe -> le libelle", () => {
    const placed = [placedOf('Hier'), placedOf(null), placedOf(null), placedOf('Aujourd’hui'), placedOf(null)];
    // item[3].start + 40 = 240 < scrollOffset 250 -> le separateur a INTEGRALEMENT defile hors ecran.
    expect(stickyDayOf({ placed, items, scrollOffset: 250 })).toBe('Aujourd’hui');
  });

  test('liste vide -> null', () => {
    expect(stickyDayOf({ placed: [], items: [], scrollOffset: 0 })).toBeNull();
  });
});

describe('scrollToBottomLabel / unreadHeadline / lastMessageLine (T6)', () => {
  test('libelle sans non-lus', () => {
    expect(scrollToBottomLabel(0)).toBe('Défiler vers le bas');
  });

  test('libelle au singulier', () => {
    expect(scrollToBottomLabel(1)).toBe('1 message non lu, Défiler vers le bas');
  });

  test('libelle au pluriel', () => {
    expect(scrollToBottomLabel(3)).toBe('3 messages non lus, Défiler vers le bas');
  });

  test('en-tete "N messages" seulement au-dela de 5', () => {
    expect(unreadHeadline(5)).toBe(false);
    expect(unreadHeadline(6)).toBe(true);
  });

  test('aperçu prefixe par le nom en groupe', () => {
    expect(lastMessageLine({ senderName: 'Bruno', text: 'Salut' })).toBe('Bruno : Salut');
  });

  test('aperçu seul sans nom (DM)', () => {
    expect(lastMessageLine({ text: 'Salut' })).toBe('Salut');
  });

  test('aucun aperçu sans contenu', () => {
    expect(lastMessageLine({ senderName: 'Bruno', text: '' })).toBeNull();
    expect(lastMessageLine({})).toBeNull();
  });
});

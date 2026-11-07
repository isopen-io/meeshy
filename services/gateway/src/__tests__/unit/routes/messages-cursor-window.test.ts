/**
 * #16684 — LA LOI DE FENÊTRAGE, sur ses branches que la route n'exerce pas.
 *
 * Les témoins de COMPORTEMENT vivent dans
 * `messages-list-total-order-cursor.test.ts`, qui pagine pour de vrai. Ceux-ci
 * gardent les branches FAIL-CLOSED — celles où la loi refuse de fabriquer une
 * fenêtre — et la composition, qu'un appelant pourrait casser en silence.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  messageKeysetWindow,
  messageOrderKeyOf,
  nextPageSide,
  totalMessageOrderBy,
  withKeysetWindow,
} from '../../../routes/conversations/messages-cursor-window';

const AT = new Date('2026-11-04T10:00:00.000Z');
const ID = '507f1f77bcf86cd799439102';

describe('#16684 · la clé de tri se LIT dans la vue', () => {
  it('rend le champ et le sens de la première clé', () => {
    expect(messageOrderKeyOf({ pinnedAt: 'desc' })).toEqual({ field: 'pinnedAt', direction: 'desc' });
    expect(messageOrderKeyOf({ createdAt: 'asc' })).toEqual({ field: 'createdAt', direction: 'asc' });
  });

  it('ne DEVINE pas la clé d’un orderBy vide ou absent — `createdAt` serait faux pour `view=pinned`', () => {
    expect(messageOrderKeyOf({})).toBeNull();
    expect(messageOrderKeyOf(undefined)).toBeNull();
  });
});

describe('#16684 · l’ordre total ajoute `id` DANS LE MÊME SENS', () => {
  it('suit un tri descendant', () => {
    expect(totalMessageOrderBy({ createdAt: 'desc' })).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('suit un tri ascendant — une rupture à contre-sens décrirait un ordre que la fenêtre ne borne pas', () => {
    expect(totalMessageOrderBy({ createdAt: 'asc' })).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('ne pose pas `id` deux fois', () => {
    expect(totalMessageOrderBy({ createdAt: 'desc', id: 'asc' })).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
  });

  it('laisse un orderBy vide vide — la route sert alors sans fenêtre', () => {
    expect(totalMessageOrderBy({})).toEqual([]);
  });
});

describe('#16684 · la page suivante est du côté où le tri AVANCE', () => {
  it('descendant ⇒ valeurs plus petites ; ascendant ⇒ plus grandes', () => {
    expect(nextPageSide('desc')).toBe('lower');
    expect(nextPageSide('asc')).toBe('higher');
  });
});

/* La FORME vient de la loi partagée (`utils/keyset-cursor.ts`) ; ces témoins
 * gardent ce que ce module y APPORTE — la colonne de la vue et le côté — et le
 * refus de fabriquer une fenêtre sans valeur. */
describe('#16684 · la fenêtre exprime l’ordre total, et refuse de l’inventer', () => {
  it('borne par la clé OU (égalité de clé ET rupture par identifiant)', () => {
    expect(messageKeysetWindow({ field: 'createdAt', side: 'lower', value: AT, id: ID })).toEqual({
      OR: [{ createdAt: { lt: AT } }, { createdAt: AT, id: { lt: ID } }],
    });
  });

  it('inverse les DEUX comparaisons du côté haut — jamais une seule', () => {
    expect(messageKeysetWindow({ field: 'pinnedAt', side: 'higher', value: AT, id: ID })).toEqual({
      OR: [{ pinnedAt: { gt: AT } }, { pinnedAt: AT, id: { gt: ID } }],
    });
  });

  it('ne rend AUCUNE fenêtre pour un curseur sans valeur sur la clé de la vue', () => {
    // Cas réel : un `before` qui désigne un message NON ÉPINGLÉ sous
    // `view=pinned` n'a pas de `pinnedAt`. Paginer sur `null` bornerait la
    // collection sur une valeur qu'elle ne porte pas ; la route resert alors sa
    // page récente, son comportement déjà documenté pour un curseur inconnu.
    expect(messageKeysetWindow({ field: 'pinnedAt', side: 'lower', value: null, id: ID })).toBeNull();
  });
});

describe('#16684 · la composition PRÉSERVE ce que la clause portait déjà', () => {
  const FLOOR = { createdAt: { gte: AT } } as const;
  const WINDOW = messageKeysetWindow({ field: 'createdAt', side: 'lower', value: AT, id: ID });

  it('n’écrase pas un filtre de champ — le plancher d’historique vit sur `createdAt`', () => {
    const merged = withKeysetWindow({ conversationId: 'c', ...FLOOR }, WINDOW);
    expect(merged.createdAt).toEqual(FLOOR.createdAt);
    expect(merged.AND).toEqual([WINDOW]);
  });

  it('n’écrase pas un `AND` préexistant, qu’il soit liste ou clause seule', () => {
    const prior = { deletedAt: null };
    expect(withKeysetWindow({ AND: [prior] }, WINDOW).AND).toEqual([prior, WINDOW]);
    expect(withKeysetWindow({ AND: prior }, WINDOW).AND).toEqual([prior, WINDOW]);
  });

  it('rend la clause INTACTE quand il n’y a pas de fenêtre', () => {
    const where = { conversationId: 'c', ...FLOOR };
    expect(withKeysetWindow(where, null)).toBe(where);
  });
});

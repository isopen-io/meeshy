/**
 * Cliquet : aucun site de production ne dérive le repli de livraison à la main.
 *
 * L'inventaire doit rester VIDE. Quand il tombe, la réparation est
 * `resolveCursorDeliveredAt`, jamais une ligne d'inventaire : il n'y a pas de
 * dérivation inline légitime à porter — la borne de la bascule n'y serait pas,
 * et c'est exactement le défaut #18701.
 *
 * @jest-environment node
 */

import { join } from 'path';
import {
  detectInlineDeliveryFallback,
  sweepInlineDeliveryFallbacks,
} from './delivery-cursor-fallback-sweep';

/** La forme EXACTE d'avant le correctif, pour prouver que le balayage voit. */
const FORME_D_AVANT = `
        const cursorDelivered =
          cursor?.lastDeliveredAt && cursor.lastDeliveredAt >= message.createdAt
            ? cursor.lastDeliveredAt
            : null;
`;

/** Ce que le balayage doit laisser passer : écriture, borne de gel, select. */
const FORMES_LEGITIMES = `
        select: { lastDeliveredAt: true, lastReadAt: true },
        prevDeliveredAt = prevCursor?.lastDeliveredAt ?? null;
        atField: "lastDeliveredAt",
          cursorLastDeliveredAt: cursor?.lastDeliveredAt ?? null,
          messageCreatedAt: message.createdAt,
`;

describe('Balayage des dérivations inline du repli de livraison (#18701)', () => {
  it('voit la forme d\'avant le correctif — une garde négative qui ne balaie rien reste verte', () => {
    const found = detectInlineDeliveryFallback(FORME_D_AVANT);

    expect(found).toHaveLength(1);
    expect(found[0].text).toContain('lastDeliveredAt >= message.createdAt');
  });

  it('laisse passer l\'écriture du curseur, la borne de gel et les `select`', () => {
    expect(detectInlineDeliveryFallback(FORMES_LEGITIMES)).toEqual([]);
  });

  it('inventaire VIDE sur la production du gateway', () => {
    const found = sweepInlineDeliveryFallbacks(join(__dirname, '..', '..', '..'));

    expect(found.map(f => `${f.file}:${f.line} ${f.text}`)).toEqual([]);
  });
});

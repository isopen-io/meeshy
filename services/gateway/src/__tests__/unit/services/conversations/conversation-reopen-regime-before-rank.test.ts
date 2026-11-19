/**
 * LE RÉGIME SE RÉSOUT AVANT LE RANG, ET UNE SEULE FOIS (#12966, #12949, #19835).
 *
 * Une paire a au plus UN tête-à-tête `e2ee` et au plus UN que le serveur lit, et
 * sans précision c'est le CHIFFRÉ qui se rouvre — « jamais une bascule
 * silencieuse vers le clair » (`services/conversations/directPair.ts`, décision
 * porteur du 2026-10-25). Le rang (#19835) ne départage qu'À régime égal.
 *
 * Lire le rang par DEUX flux (`highestRankedConversation`) met cette garantie en
 * jeu, et c'est l'audit adversarial du lot qui l'a relevé : si le rang est
 * DEHORS, chaque flux résout la préférence de régime pour son compte, et les deux
 * lectures ne partagent aucun instantané. Il suffit qu'un tête-à-tête `e2ee`
 * apparaisse entre elles pour que l'un retombe sur « n'importe lequel » — donc
 * sur le lisible — pendant que l'autre trouve le chiffré ; le rang, qui compare
 * les deux têtes, sert alors LE CLAIR, plus actif.
 *
 * Le témoin exerce les deux imbrications sur le MÊME double, pour que la raison
 * du sens retenu soit lisible et pas seulement affirmée.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { highestRankedConversation } from '../../../../services/conversations/highestRanked';
import { directLookupWheres, firstFound } from '../../../../services/conversations/directPair';

const ME = '507f1f77bcf86cd799439001';
const PEER = '507f1f77bcf86cd799439002';
const SEALED = '507f1f77bcf86cd7994390e1';
const READABLE = '507f1f77bcf86cd7994390b2';

const SEALED_ROW = { id: SEALED, lastMessageAt: new Date('2026-11-01T10:00:00Z'), lastActivityAt: null };
const READABLE_ROW = { id: READABLE, lastMessageAt: new Date('2026-11-18T10:00:00Z'), lastActivityAt: null };

/** Le `where` du régime AVEUGLE se reconnaît à son `notIn` sur `encryptionMode` (`SERVER_BLIND_REGIME_FILTER`). */
const asksForSealed = (where: unknown): boolean => JSON.stringify(where).includes('notIn');

/**
 * Le tête-à-tête chiffré APPARAÎT entre les deux lectures : la première
 * interrogation du régime aveugle ne le voit pas, la seconde si. C'est la
 * fenêtre la plus étroite qui soit — et la seule chose qu'elle doit décider,
 * c'est qu'on ne serve PAS le clair.
 */
const racingReads = () => {
  let sealedReads = 0;
  return (where: unknown) => {
    if (!asksForSealed(where)) return Promise.resolve(READABLE_ROW);
    sealedReads += 1;
    return Promise.resolve(sealedReads === 1 ? null : SEALED_ROW);
  };
};

const lookups = () => directLookupWheres({ userId: ME, peerId: PEER }, { plaintext: false });

describe('un tête-à-tête `e2ee` qui apparaît entre les deux flux du rang ne fait jamais servir le clair', () => {
  it('le régime DEHORS, le rang DEDANS — l’imbrication de production : le chiffré', async () => {
    const read = racingReads();
    const chosen = await firstFound(lookups(), (where) =>
      highestRankedConversation(() => read(where) as never),
    );
    expect(chosen?.id).toBe(SEALED);
  });

  it('le rang DEHORS, le régime DEDANS — ce que le lot ne fait PAS : le clair, et c’est le défaut', async () => {
    const read = racingReads();
    const chosen = await highestRankedConversation(() => firstFound(lookups(), (where) => read(where)) as never);
    expect(chosen?.id).toBe(READABLE);
  });

  it('sans course, le chiffré gagne quel que soit le rang du lisible', async () => {
    const chosen = await firstFound(lookups(), (where) =>
      highestRankedConversation(() => Promise.resolve(asksForSealed(where) ? SEALED_ROW : READABLE_ROW) as never),
    );
    expect(chosen?.id).toBe(SEALED);
  });

  it('sans chiffré, le lisible se rouvre — le régime ne bloque rien', async () => {
    const chosen = await firstFound(lookups(), (where) =>
      highestRankedConversation(() => Promise.resolve(asksForSealed(where) ? null : READABLE_ROW) as never),
    );
    expect(chosen?.id).toBe(READABLE);
  });
});

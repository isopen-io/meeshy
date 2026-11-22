/**
 * #20292 — **le `select` de la collection de synchronisation PROJETTE la
 * surcharge de droits**, sans quoi la fabrique sert l'instantané du join.
 *
 * Ce témoin existe parce que le témoin de VALEUR ne peut pas le voir : un double
 * Prisma rend ce qu'on lui dit, quel que soit le `select`. Une lecture résolue se
 * garde donc par DEUX témoins — un de PROJECTION sur la requête, un de VALEUR sur
 * la réponse — et aucun ne subsume l'autre (§ `services/gateway/CLAUDE.md`,
 * « Language Resolution », troisième piège).
 *
 * La collection de synchronisation est le plus coûteux des cinq sites de
 * `serializeConversationParticipant` : c'est elle qui HYDRATE le cache hors-ligne
 * des clients, donc une valeur fausse y survit à la fermeture de l'app.
 *
 * **Et la projection est ÉTROITE, par décision.** Charger `anonymousSession`
 * entier rehydraterait `sessionTokenHash` et l'identité de l'invité pour chaque
 * participant de chaque page — ce qu'iter 35 (F8) avait retiré exprès.
 * `{ select: { rights: true } }` ne ramène que huit booléens d'un document DÉJÀ
 * lu : une projection, pas une requête, pas une jointure.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';

import { syncParticipantSelect } from '../../../routes/sync/participants';

describe('#20292 — la projection de la surcharge dans le `select` de synchronisation', () => {
  it('projette `anonymousSession.rights` — la source que la loi des droits exige', () => {
    const projected = (syncParticipantSelect as { anonymousSession?: { select?: Record<string, unknown> } })
      .anonymousSession;
    expect(projected).toBeDefined();
    expect(projected?.select?.rights).toBe(true);
  });

  it('ne projette RIEN d’autre de la session anonyme — ni jeton, ni profil', () => {
    const selected = (syncParticipantSelect as { anonymousSession?: { select?: Record<string, unknown> } })
      .anonymousSession?.select;
    expect(Object.keys(selected ?? {})).toEqual(['rights']);
  });

  it('garde l’instantané du join À CÔTÉ de la surcharge — la loi a besoin des deux', () => {
    // `permissions` est l'instantané, `anonymousSession.rights` le delta : un
    // droit que la surcharge ne nomme pas RETOMBE sur l'instantané, donc le
    // retirer du `select` ferait servir `true` à tout le monde.
    expect((syncParticipantSelect as { permissions?: unknown }).permissions).toBe(true);
  });
});

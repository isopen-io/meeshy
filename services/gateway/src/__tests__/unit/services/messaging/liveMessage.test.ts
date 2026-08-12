/**
 * `LIVE_MESSAGE_MARK` — le marqueur d'écriture du soft-delete des messages.
 *
 * Ce témoin existe parce que la sonde de fidélité du cycle qui a extrait la
 * constante a montré que l'invariant n'était couvert NULLE PART : vider le
 * marqueur ne faisait tomber que les deux témoins des messages d'appel, et
 * aucun des cinq autres créateurs (`MessageProcessor`, la traduction, les deux
 * chemins de lien de partage, l'activation du chiffrement) — qui portaient
 * pourtant le littéral depuis toujours. C'est très exactement ainsi que les
 * deux créateurs de `CallService` ont pu le perdre sans qu'aucune suite ne
 * s'en aperçoive.
 *
 * Les sept créateurs étalant désormais LA MÊME constante, un seul témoin sur
 * la source suffit à les tenir tous ; les témoins de `CallService` prouvent,
 * eux, que l'étalement a bien lieu.
 */

import { describe, it, expect } from '@jest/globals';

import { LIVE_MESSAGE_MARK } from '../../../../services/messaging/liveMessage';

describe('LIVE_MESSAGE_MARK', () => {
  /**
   * Présent-ET-null, pas simplement « pas de date ». Le prédicat des ~119
   * lectures de messages vivants est `deletedAt: null` ; sur le connecteur
   * MongoDB il n'apparie pas une colonne ABSENTE (cf. `NOT_DELETED`,
   * `services/posts/softDelete.ts`). Un marqueur vide — ou dont la clé aurait
   * été renommée — rendrait invisibles de l'aperçu de conversation, du compte
   * de non-lus et du delta `/sync` tous les messages qui l'étalent.
   */
  it('carries the deletedAt column set to null, not an absent column', () => {
    expect(Object.prototype.hasOwnProperty.call(LIVE_MESSAGE_MARK, 'deletedAt')).toBe(true);
    expect(LIVE_MESSAGE_MARK.deletedAt).toBeNull();
  });

  /**
   * Rien d'autre : la constante est étalée dans le `data` de sept `create`
   * distincts, dont les colonnes propres (contenu, expéditeur, métadonnées)
   * n'ont aucune raison d'être décidées ici. Un champ ajouté par mégarde
   * s'écrirait silencieusement sur les sept chemins.
   */
  it('marks nothing else — the seven creators own their own columns', () => {
    expect(Object.keys(LIVE_MESSAGE_MARK)).toEqual(['deletedAt']);
  });
});

/**
 * Itération 288 — les langues cibles d'une diffusion admin sont CANONIQUES.
 *
 * `POST /admin/broadcasts/:id/translate` calcule ses langues cibles depuis un
 * `prisma.user.groupBy(['systemLanguage'])` : la valeur groupée est le
 * `systemLanguage` PERSISTÉ VERBATIM (`'fr-FR'`, `'FR'`, `'en-US'`, `'iw'`),
 * jamais normalisé à l'écriture. Ces variantes partaient telles quelles au
 * translator, qui STOCKE la traduction sous la clé reçue (`translated['fr-FR']`).
 *
 * Or la livraison (`localizedBroadcastText` → `recipientLanguages` →
 * `resolveUserLanguagesOrdered`) résout le prisme du lecteur en codes CANONIQUES
 * (`'fr'`). Une traduction rangée sous `'fr-FR'` n'est donc jamais retrouvée : un
 * francophone déclaré `'fr-FR'` reçoit la diffusion dans la langue SOURCE alors
 * qu'une traduction française a bel et bien été calculée et stockée — violation
 * directe du Prisme (règle #1) ET gaspillage du poste ML le plus cher.
 *
 * `broadcastTargetLanguages` canonicalise chaque code via la SSOT
 * `normalizeLanguageForDedup` AVANT la déduplication et l'exclusion de la source,
 * exactement comme `PostService.audienceLanguages` (itération 287).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { broadcastTargetLanguages } from '../../../jobs/broadcast-recipients';

describe('broadcastTargetLanguages', () => {
  it('effondre les variantes régionales d\'une même langue en UNE cible canonique', () => {
    expect(broadcastTargetLanguages(['fr', 'fr-FR', 'FR', 'fr_FR'], 'en')).toEqual(['fr']);
  });

  it('émet la forme canonique, jamais la variante région-taguée/casse-mixte', () => {
    expect(broadcastTargetLanguages(['pt-BR', 'EN', 'de-AT'], 'ja')).toEqual(['pt', 'en', 'de']);
  });

  it('exclut la langue source même quand la source ou la cible est région-taguée', () => {
    // 'en-US' canonicalise en 'en' == source → retiré ; 'fr' conservé.
    expect(broadcastTargetLanguages(['en-US', 'fr'], 'en')).toEqual(['fr']);
    // Source région-taguée : 'EN' cible == source canonique 'en' → retiré.
    expect(broadcastTargetLanguages(['EN', 'es'], 'en-US')).toEqual(['es']);
  });

  it('ignore les valeurs vides ou nulles du groupBy sans les compter', () => {
    expect(broadcastTargetLanguages([null, undefined, '', 'de'], 'en')).toEqual(['de']);
  });

  it('normalise les codes ISO 639-1 dépréciés émis par Android (iw → he)', () => {
    expect(broadcastTargetLanguages(['iw', 'in'], 'en')).toEqual(['he', 'id']);
  });

  it('préserve l\'ordre de première apparition après canonicalisation', () => {
    expect(broadcastTargetLanguages(['es', 'fr-FR', 'es-MX', 'de', 'fr'], 'en'))
      .toEqual(['es', 'fr', 'de']);
  });
});

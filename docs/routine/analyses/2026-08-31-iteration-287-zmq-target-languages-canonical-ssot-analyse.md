# Itération 287 — `ZmqRequestSender` canonicalise ses langues cibles via la SSOT, et perd sa jumelle divergente

Suite directe de l'itération 286 (`PostService.audienceLanguages` canonicalisé) et
de la campagne « une source de vérité par règle de langue » (cycles 118→286,
Prisme + `recipient-language.ts` + `normalizeLanguageForDedup`). Le résolveur
examiné cette fois est la **frontière d'émission vers le translator** —
`ZmqRequestSender.sendTranslationRequest` — qui prépare le jeu de langues cibles
envoyé au service ML.

## État actuel (avant ce lot)

```ts
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';

// Jumelle LOCALE de la SSOT — re-codée à la main
const canonicalLanguage = (language: string): string =>
  normalizeLanguageCode(language) ?? language.toLowerCase();

// ... dans sendTranslationRequest :
const uniqueTargetLanguages = [...new Set(request.targetLanguages.map(l => l.toLowerCase()))];
// ...
pendingLanguages: new Set(uniqueTargetLanguages.map(canonicalLanguage))
// ... dans settleTranslationLanguage :
entry.pendingLanguages.delete(canonicalLanguage(targetLanguage));
```

## Problème identifié

Deux défauts distincts, empilés sur le même chemin :

1. **Une jumelle divergente de la SSOT.** `canonicalLanguage` réimplémente
   `normalizeLanguageForDedup` (`packages/shared/utils/language-normalize.ts`) —
   même appel `normalizeLanguageCode(x) ?? …` — mais son repli diverge : la SSOT
   strippe le tag de région/script des codes irréductibles (`'yue-HK'` → `'yue'`),
   la jumelle le conserve (`'yue-HK'` → `'yue-hk'`). Deux formes canoniques pour
   un même code inconnu région-tagué. C'est exactement l'anti-patron « aucune
   jumelle divergente » (dimension 11 Maintainability, `CLAUDE.md` racine).

2. **Le jeu ENVOYÉ au translator n'était pas canonicalisé du tout.** Les cibles
   partaient par `l.toLowerCase()` BRUT — pas même par la jumelle — donc :
   - **Codes NLLB invalides.** `'pt-BR'` → `'pt-br'`, `'fr-FR'` → `'fr-fr'` : le
     translator recevait des cibles que NLLB ne reconnaît pas.
   - **Variantes régionales comptées comme langues DISTINCTES.** `'fr'`,
     `'fr-FR'`, `'FR'` produisaient **trois** cibles là où il y en a une —
     travaux de traduction dupliqués, CPU/GPU gaspillés.
   - **Incohérence ENVOI ↔ SUIVI.** Le jeu envoyé (raw lowercase, région
     conservée) et le jeu de suivi `pendingLanguages` (canonicalisé par la
     jumelle, région strippée pour les codes connus) divergeaient : sur `'fr-FR'`
     le translator recevait `'fr-fr'` mais le suivi attendait `'fr'`.

## Cause racine

Le résolveur n'appelait pas la SSOT `normalizeLanguageForDedup`, dont le
doc-comment nomme exactement ce cas (« agrégés en une liste ou dédupliqués — un
`.toLowerCase()` brut compterait `'en'` et `'en-US'` comme deux langues
distinctes »). La jumelle locale, écrite avant que la SSOT ne couvre la réduction
région-aveugle des codes inconnus, avait été laissée en place et divergeait en
silence.

## Impact

- **Technique / Performance (dim 2)** : requêtes ZMQ vers cibles NLLB invalides
  (`'pt-br'`) et dupliquées (`'fr'` + `'fr-fr'`) ; CPU et mémoire GPU translator
  gaspillés sur des travaux redondants ou voués à l'échec.
- **Produit (Prisme, dim 13 Complétude)** : une langue réelle d'audience
  région-taguée pouvait ne PAS obtenir sa traduction (cible mal formée), donc un
  lecteur rétrogradé sur l'original — violation indirecte du Prisme.
- **Maintenabilité (dim 11)** : une jumelle divergente de plus dans le dépôt,
  supprimée ici.
- **Sécurité** : nulle (aucune fuite ; le jeu sortant est resserré, jamais élargi).

## Risque

Faible. La canonicalisation ne fait que RESSERRER l'ensemble sortant (moins de
cibles, jamais plus) et préserve l'ordre de première apparition. Le jeu de suivi
`pendingLanguages` partage désormais EXACTEMENT la forme du jeu envoyé (les deux
via la même SSOT), et la réconciliation de `settleTranslationLanguage` — qui
passait déjà par la jumelle — passe par la SSOT : sur les codes connus les deux
rendaient le même verdict, donc zéro régression sur le chemin nominal (mesuré :
207 tests zmq-translation + 44 tests unit verts).

## Amélioration livrée

- Remplacement de l'import `normalizeLanguageCode` (seul consommateur : la
  jumelle) par `normalizeLanguageForDedup`, et **suppression de la jumelle
  `canonicalLanguage`**.
- Canonicalisation des cibles via la SSOT AVANT dédup, avec filtre des codes
  vides :

```ts
const uniqueTargetLanguages = [...new Set(
  request.targetLanguages.map(normalizeLanguageForDedup).filter((l) => l !== '')
)];
```

- `pendingLanguages` construit directement depuis ce jeu déjà canonique
  (`new Set(uniqueTargetLanguages)`, plus de re-map).
- `settleTranslationLanguage` réconcilie via `normalizeLanguageForDedup`.

## Bénéfices attendus

- Le translator ne reçoit plus que des codes NLLB canoniques (2-lettres
  lowercase), dédupliqués par LANGUE réelle.
- Le jeu ENVOYÉ et le jeu de SUIVI sont désormais identiques par construction —
  plus aucune fenêtre de divergence.
- UNE source de vérité de canonicalisation de plus rejoint la SSOT partagée ;
  une jumelle divergente de moins.

## Complexité d'implémentation

Triviale — un import remplacé, une fonction locale supprimée, deux sites
repointés, un `.filter` ajouté. 3 nouveaux pins de comportement.

## Critères de validation

- `ZmqRequestSender.test.ts` : 3 nouveaux cas prouvés RED sur l'ancien code
  (canonicalisation région-taguée, dédup de variantes, rejet des codes vides),
  verts après le fix ; les pins existants (`['FR','fr','EN'] → ['fr','en']`,
  rejet du tableau vide) inchangés.
- 6 suites `zmq-translation` (207 tests) + `__tests__/unit/services/ZmqRequestSender.test.ts`
  (44 tests) vertes.
- `tsc --noEmit` gateway : 0 erreur.
- `normalizeLanguageForDedup` présent dans le dist shared (`.js` + `.d.ts`).

## Suivi

Autres agrégateurs verbatim `new Set(... .toLowerCase())` restant à balayer et
router vers la SSOT si applicable (à instruire un par un, jamais en masse) :
`socketio/utils/message-payload-filter.ts`, `routes/conversations/messages-list-query.ts`,
`utils/translation-transformer.ts`, `services/message-translation/MessageTranslationService.ts:834`.
Chacun sert un rôle différent (filtre de payload, filtre de requête, transformation)
et doit être vérifié contre son producteur avant tout changement.

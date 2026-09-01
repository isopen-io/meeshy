# Itération 287 — `resolveParticipantLanguage` et l'extraction de langues de conversation strippent la région des codes UNCATALOGUÉS

Suite directe de l'itération 286 (`PostService.audienceLanguages` canonicalise
avant dedup) et de la campagne « une source de vérité par règle de langue »
(cycles 118→286, Prisme + `normalizeLanguageForDedup`). En balayant les
résolveurs de langue serveur qui répliquent à la main le couple
« normalisation + repli lowercase » au lieu d'appeler la SSOT
`normalizeLanguageForDedup`, deux sites du chemin **PRINCIPAL** (messages, pas
seulement stories) divergaient du contrat pour les codes région-taggés
**hors catalogue Meeshy**.

## État actuel (avant ce lot)

Deux sites portaient l'inline `normalizeLanguageCode(x) ?? x.toLowerCase()` :

1. **`resolveParticipantLanguage`** (`packages/shared/utils/conversation-helpers.ts:427`),
   le repli terminal de la résolution de langue d'un participant :
   ```ts
   const fallback =
     normalizeLanguageCode(participant.language) ?? participant.language.toLowerCase()
   ```
   Son doc-comment ANNONÇAIT pourtant « parité stricte avec le contrat
   `normalizeLanguageForDedup` » — une affirmation FAUSSE (voir cause racine).

2. **`MessageTranslationService._extractConversationLanguages`**, branche
   participant anonyme/bot
   (`services/gateway/src/services/message-translation/MessageTranslationService.ts:909`) :
   ```ts
   languages.add(
     normalizeLanguageCode(participant.language) ?? participant.language.toLowerCase()
   );
   ```
   Cette branche alimente le **Set de langues cibles NLLB** de la conversation,
   partagé avec la branche registered (qui, elle, passe par
   `resolveUserLanguagesOrdered` → `normalizeInAppLanguage`, laquelle strippe la
   région même pour un code hors catalogue).

## Problème identifié

`normalizeLanguageCode` ne réduit un code région-taggé que s'il sait le
canoniser (langue CATALOGUÉE : `'en-US'` → `'en'`, `'pt-BR'` → `'pt'`). Pour un
code **hors catalogue** — cantonais `'yue-HK'`, `'yue-Hant-HK'` — il rend
`undefined`, et le repli `?? x.toLowerCase()` conserve alors le tag de région :
`'yue-HK'` → `'yue-hk'`. Mesuré :

| entrée | inline `?? .toLowerCase()` | `normalizeLanguageForDedup` |
|---|---|---|
| `en-US` | `en` | `en` |
| `pt-BR` | `pt` | `pt` |
| `yue-HK` | **`yue-hk`** | `yue` |
| `yue-Hant-HK` | **`yue-hant-hk`** | `yue` |

Conséquences, toutes mesurées :

1. **Divergence entre branches sur le MÊME Set.** Un participant registered
   `systemLanguage='yue-HK'` contribue `'yue'` ; un participant anonyme
   `'yue-Hant-HK'` contribue `'yue-hant-hk'`. Le Set de langues cibles porte
   **deux entrées pour une seule langue** (trace de production observée :
   `[yue, yue-hant-hk] | Total: 2 langue(s) unique(s)`).

2. **Cible NLLB région-taggée invalide.** Le translator reçoit `'yue-hant-hk'`,
   que le mapping NLLB ne reconnaît pas — travail dupliqué, jamais servi.

3. **Violation indirecte du Prisme (règle #1).** Le texte n'existe jamais indexé
   sous `'yue-hant-hk'` dans `MessageTranslation` (clés minuscules 2/3-lettres) ;
   le lecteur retombe sur l'original alors qu'une traduction `'yue'` aurait dû
   être produite.

4. **`resolveParticipantLanguage` rend `'yue-hk'`** là où le chemin registered
   (`resolveUserLanguagesOrdered`) rend `'yue'` — divergence sur le repli
   terminal, consommé par `offlineParticipantQueue.ts` (qui attend, par son
   propre commentaire, « des codes réduits et minusculés »).

## Cause racine

Les deux sites répliquaient à la main le couple normalisation-avec-repli au lieu
d'appeler la SSOT `normalizeLanguageForDedup`
(`packages/shared/utils/language-normalize.ts:175`), dont le contrat EST
exactement `normalizeLanguageCode(code) ?? <sous-tag primaire lowercased>` — le
repli strippe la région pour TOUT code, catalogué ou non. Le doc-comment de
`resolveParticipantLanguage` prétendait déjà cette parité (« parité stricte avec
le contrat `normalizeLanguageForDedup` ») ; l'inline ne l'atteignait pas. C'est
la « affirmation portée par un commentaire » du cycle 94 : un commentaire qui
énonce une contrainte est une AFFIRMATION, et celle-ci était fausse pour la
classe exacte que son propre exemple (`'pt-BR' → 'pt-br'`) désignait comme le
défaut à éviter.

## Impact

- **Technique** : requêtes ZMQ de traduction invalides et dupliquées
  (`'yue-hant-hk'`) envoyées au translator ; CPU/mémoire GPU gaspillés ; Set de
  langues cibles gonflé de variantes.
- **Produit (Prisme, dimensions Complétude + Performance + Cohérence)** : un
  participant hors catalogue région-taggé peut ne PAS être servi dans sa langue,
  et les deux branches d'un même Set divergent.
- **Maintenabilité** : deux sites de plus rejoignent la SSOT ; un doc-comment
  faux devient vrai.
- **Sécurité** : nulle (pas de fuite ; codes déjà en aval, ici resserrés).

## Risque

Faible. `normalizeLanguageForDedup` ne fait que RESSERRER : pour un code
catalogué ou déjà canonique il est idempotent (zéro régression, vérifié sur les
27 pins existants de `resolveParticipantLanguage` + 6 de la suite destinations) ;
il ne rend jamais `undefined` (garde « ne jamais perdre la donnée »), donc le
repli terminal de `resolveParticipantLanguage` reste garanti non-undefined. Seul
un code région-taggé HORS catalogue change de sortie — dans le sens correct
(strip de région).

## Amélioration livrée

- `resolveParticipantLanguage` : `const fallback = normalizeLanguageForDedup(participant.language)`.
- `MessageTranslationService._extractConversationLanguages` (branche anonyme) :
  `languages.add(normalizeLanguageForDedup(participant.language))`, import élargi
  (`normalizeLanguageForDedup` ajouté à côté de `normalizeLanguageCode`, qui
  reste utilisé par cinq autres sites du service).

## Bénéfices attendus

- Le translator ne reçoit plus de cible région-taggée hors catalogue.
- Les branches registered et anonyme d'un même Set de langues cibles
  convergent, quelle que soit la forme d'écriture.
- Le doc-comment de `resolveParticipantLanguage` dit désormais vrai.
- Deux résolveurs de plus rejoignent la SSOT de canonicalisation.

## Complexité d'implémentation

Triviale — 2 lignes de production changées, un import élargi, 6 nouveaux pins de
comportement (3 shared + 1 gateway couvrant la parité registered/anonyme, +
mise à jour de commentaire).

## Critères de validation

- `resolve-participant-language.test.ts` : 3 cas RED sur l'ancien code (anonyme
  `'yue-HK'`, user sans prefs `'yue-HK'`, parité anonyme↔registered
  `'yue-Hant-HK'`), verts après le fix ; 27 pins existants inchangés → 30 verts.
- `message-translation-destinations.test.ts` : 1 cas RED (Set
  registered `'yue-HK'` + anonyme `'yue-Hant-HK'` ⇒ `['yue']`), vert après →
  7 verts.
- `MessageTranslationService*` + `PostService.audienceLanguages` : 285 tests
  verts (7 suites).
- `tsc --noEmit` gateway ET shared : 0 erreur.
- Aucun consommateur de `resolveParticipantLanguage` régressé
  (`offlineParticipantQueue.ts`, qui bénéficie du strip).

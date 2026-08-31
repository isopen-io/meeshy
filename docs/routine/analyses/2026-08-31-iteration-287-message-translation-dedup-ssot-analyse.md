# Itération 287 — `MessageTranslationService` : les cinq résolveurs d'agrégation/dedup passent par la SSOT `normalizeLanguageForDedup`

Suite directe de l'itération 286 (`PostService.audienceLanguages` canonicalisé
avant filtre/dedup) et de la campagne « une source de vérité par règle de langue »
(cycles 118→286). En balayant les résolveurs de langue serveur qui réimplémentent
la canonicalisation **inline** au lieu d'appeler la SSOT, le cœur de traduction
`MessageTranslationService` en portait **six** occurrences de l'idiome
`normalizeLanguageCode(x) ?? x.toLowerCase()`.

## État actuel (avant ce lot)

Six sites, tous écrits à la main :

| ligne | méthode | rôle | classe |
|---|---|---|---|
| 466 | `_resolveTargetLanguages` (source) | comparaison source↔cible pour filtrer l'auto-traduction | comparaison |
| 471 | `_resolveTargetLanguages` (boucle cibles) | codes cibles envoyés au translator | agrégation |
| 502 | `_normalizeSourceLanguage` | langue SOURCE envoyée au translator | canonicalisation |
| 759 | `_retranslationTaskKey` | clé de dédup des tâches de retraduction | dedup |
| 909 | `_extractConversationLanguages` (branche anonyme) | dédup des langues cibles dans un `Set` | dedup |
| 3157 | `getTranslation` (lecture) | clé de LECTURE du store `Message.translations` | store-key **(hors périmètre)** |

## Problème identifié

`normalizeLanguageCode(x) ?? x.toLowerCase()` et la SSOT
`normalizeLanguageForDedup(x)` (`packages/shared/utils/language-normalize.ts:175`)
sont identiques SAUF sur leur branche de repli :

- inline : `x.toLowerCase()` — conserve la chaîne ENTIÈRE (région comprise) ;
- SSOT : `<sous-tag primaire lowercased>` — **aveugle à la région pour TOUT code**,
  pas seulement ceux que `normalizeLanguageCode` sait réduire.

La divergence est **mesurée et réelle** sur des locales d'appareil plausibles —
`Locale.current` iOS/Android renvoie la forme région-taguée :

```
fil-PH   | normalizeLanguageCode=undefined | inline=fil-ph  | dedup=fil   <-- DIVERGE
ceb-PH   | normalizeLanguageCode=undefined | inline=ceb-ph  | dedup=ceb   <-- DIVERGE
yue-HK   | normalizeLanguageCode=undefined | inline=yue-hk  | dedup=yue   <-- DIVERGE
en-US / pt-BR / fr-FR / ES-ES                                → identiques (catalogue NLLB)
```

**Filipino (`fil`), Cebuano (`ceb`), Cantonais (`yue`)** ne sont pas dans le
catalogue `normalizeLanguageCode` : leur forme région-taguée échappe donc à la
canonicalisation inline, exactement comme `PostService.audienceLanguages` avant
l'itération 286.

Conséquence la plus concrète — une **incohérence INTRA-fonction** dans
`_extractConversationLanguages` : sa branche REGISTERED passe déjà par
`resolveUserLanguagesOrdered` → `normalizeInAppLanguage`, qui EST aveugle à la
région (`fil-PH` → `fil`) ; sa branche ANONYME (inline) conserve `fil-ph`. Le
**même code d'entrée produit deux clés de dédup différentes selon le type de
participant** : un membre inscrit `fil-PH` et un invité `fil-PH` comptent pour
DEUX cibles dans le même `Set`, dont l'une (`fil-ph`) n'est pas une cible NLLB
valide (le translator retombe `LANGUAGE_MAPPINGS.get('fil-ph', 'eng_Latn')` →
traduit comme de l'anglais). Le plafond de cibles se remplit de variantes, et une
requête ZMQ dupliquée/invalide part au translator.

Les comparaisons de `_resolveTargetLanguages` (466/471) et la clé de dédup de
`_retranslationTaskKey` (759) portent la même divergence : `fil-PH` (source) vs
`fil` (cible) n'était pas reconnu comme auto-traduction ; deux clés de tâche
distinctes pour la même langue.

## Cause racine

Aucun de ces sites n'appelait la SSOT `normalizeLanguageForDedup`, dont le
doc-comment nomme exactement ce cas d'usage (« employé partout où des codes
verbatim … sont agrégés en une liste ou dédupliqués … `'yue'` et `'yue-HK'`
compteraient pour deux langues »). `conversation-helpers.ts` importe et applique
déjà cette SSOT ; `MessageTranslationService` en divergeait en silence, réécrivant
une variante région-AVEUGLE-seulement-si-catalogue.

## Impact

- **Technique** : requêtes ZMQ dupliquées/invalides (`fil-ph`, `ceb-ph`) ; clés de
  tâche de retraduction dédoublées ; auto-traduction non filtrée sur codes
  hors-catalogue.
- **Produit (Prisme — Complétude + Performance)** : une langue réelle
  hors-catalogue peut occuper deux slots et évincer une autre langue ; le
  translator gaspille GPU/CPU sur une cible que NLLB ne reconnaît pas.
- **Maintenabilité (Single Source of Truth)** : cinq réimplémentations d'une SSOT
  documentée — si la SSOT évolue (nouveau cas de bord), ces sites ne suivent pas.
- **Sécurité** : nulle (aucune fuite ; codes déjà en aval, ici resserrés/dédupés).

## Risque

Faible. Sur les codes du catalogue NLLB (`en-US`, `pt-BR`, `fr-FR`, `ES-ES`, …)
les deux fonctions rendent le MÊME résultat — les 18 tests existants des deux
suites concernées restent verts. La divergence ne se manifeste que sur les codes
région-tagués hors-catalogue, où la SSOT RESSERRE (dédup correcte). `'auto'` et
les valeurs vides sont gardés AVANT l'appel dans les deux fonctions qui les
manipulent — jamais passés à la normalisation.

## Périmètre — pourquoi 3157 est EXCLU

`getTranslation` (ligne 3157) est une clé de LECTURE du store
`Message.translations`, couplée au schéma d'ÉCRITURE des clés. Elle porte un
lookup double délibéré (`translations[verbatim] ?? translations[normalized]`) et
une raison legacy écrite (« un document legacy portant réellement une clé
régionale reste servi tel quel »). La toucher exige un audit du chemin d'ÉCRITURE
des clés du store — un lot en soi. **Suivi ouvert** : aligner la clé de lecture de
`getTranslation` sur la même SSOT une fois le schéma d'écriture des clés du store
audité (le chemin registered région-strippe déjà à l'écriture via
`normalizeInAppLanguage`, donc la lecture inline rate potentiellement une
traduction `fil` pour un lecteur `fil-PH` — à confirmer contre les producteurs de
clés avant tout changement).

## Amélioration livrée

Importer `normalizeLanguageForDedup` et remplacer les cinq occurrences inline
(466, 471, 502, 759, 909) par l'appel SSOT. Les doc-comments qui citaient « SSOT
`normalizeLanguageCode` » sont corrigés pour nommer la vraie SSOT de
canonicalisation-avec-repli.

## Bénéfices attendus

- Une clé de dédup unique par LANGUE réelle, cohérente entre branches registered
  et anonyme de `_extractConversationLanguages`.
- Le translator ne reçoit plus `fil-ph`/`ceb-ph` mais `fil`/`ceb`.
- L'auto-traduction est filtrée quelle que soit la forme d'écriture de la source.
- Cinq réimplémentations de moins ; une SSOT de canonicalisation de plus rejointe.

## Complexité d'implémentation

Triviale — un import élargi, cinq remplacements d'une ligne, trois doc-comments
alignés, nouveaux pins de comportement dans les suites existantes.

## Critères de validation

- Nouveaux cas RED (région-taguée hors-catalogue) dans
  `message-translation-destinations.test.ts` (branche anonyme `fil-PH` dédupe avec
  un registered `fil`) et `message-translation-source-language.test.ts` /
  `message-translation-destinations` (self-translation `fil-PH`↔`fil`) — rouges
  sur l'inline, verts après le fix.
- Les 18 tests existants des deux suites restent verts.
- `MessageTranslationService.retranslation-scope.test.ts` vert.
- `tsc --noEmit` gateway : 0 erreur.
- `normalizeLanguageForDedup` présent dans le dist shared.

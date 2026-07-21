# Iteration 187 — Sûreté Unicode des dérivations de chaînes (web) : les diacritiques latins supprimés au lieu d'être repliés dans les slugs de communauté (`Café`→`caf`) + troncature qui coupe une paire de substitution UTF-16 → glyphe cassé `�` sur les noms à emoji

## Protocole (démarrage)
`main` @ `8792cb9` (derniers merges : #2225 android/auth magic-link, #2223
web/i18n `deepCleanTranslationOutput` apostrophe/newline — itération **186**,
#2215 gateway/auth Unicode name normalization — itération 185). Branche
`claude/brave-archimedes-sy4tpm` réinitialisée sur `origin/main`. Ce cycle prend
**187**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Dépendances via `bun install` ; Prisma client
régénéré (`packages/shared --generator client`, avec `NODE_EXTRA_CA_CERTS` pour
le proxy) ; `dist` shared rebuild. Harnais validé ce cycle : `apps/web` jest
(`community-identifier`, `truncate` + les 38 suites `__tests__/utils`, 1017/1017).

Sélection : revue Priorité 1/3 « correctness Unicode sur les chaînes exposées à
l'utilisateur », dans la continuité directe de la doctrine établie aux itérations
**185** (`name-similarity.normalizeName` : NFD + strip `\p{M}` pour replier les
accents) et **186** (`deepCleanTranslationOutput` : ne pas corrompre l'apostrophe
française). Une revue exhaustive de la surface web (subagent Explore + lecture
directe) a confirmé que `initials.ts`, `format-number.ts`, `presence-format.ts`,
`date-format.ts`, `truncateFilename`… portent chacun les cicatrices des cycles
précédents. Les deux défauts reproductibles restants vivent dans des utils
**live** (importés) qui n'avaient pas encore reçu ce durcissement.

## Current state

### A. `apps/web/utils/community-identifier.ts`
`generateCommunityIdentifier` (auto-génère le slug d'une communauté depuis son
titre, appelé dans `groups-layout.tsx:105` et `groups-layout-responsive.tsx:327`)
et `sanitizeCommunityIdentifier` (nettoie le champ identifiant tapé à la main,
`:304` / `:633`) normalisent ainsi :

```ts
title.toLowerCase().replace(/[^a-z0-9\s]/g, '')   // ← supprime TOUT non-ASCII
```

`é`, `ç`, `ê`… n'étant pas dans `[a-z0-9\s]`, ils sont **supprimés** (pas repliés).

### B. `apps/web/utils/truncate.ts`
`truncateText` (l.60) et `truncateFilename` (helper `head`, l.24/30 + slice nom
l.38) tronquent par **unités UTF-16** (`.slice`/`.substring`). Consommateurs :
`MediaAudioCard`, `MediaVideoCard`, `PDFViewerWrapper`, `MarkdownViewer`,
`ConversationDropdown` — tous des titres de conversation / médias / noms de
fichier, qui contiennent couramment des emoji sur un produit de chat.

## Problems identified
1. **Diacritiques latins supprimés au lieu d'être repliés (produit à français primaire).**
   - `generateCommunityIdentifier('Café des Amis')` → **`caf-des-amis-…`** (attendu `cafe-…`)
   - `generateCommunityIdentifier('François Truffaut')` → **`franois-truffaut-…`** (attendu `francois-…`)
   - `generateCommunityIdentifier('Groupe Renée')` → **`groupe-rene-…`** (attendu `groupe-renee-…`)
   - `sanitizeCommunityIdentifier('Café')` → **`caf`** (attendu `cafe`)
   Slugs mutilés, moins reconnaissables — exactement le défaut corrigé côté gateway
   aux itérations 185/186. Un test existant (`'should handle Unicode characters
   by removing them'`) figeait même cette intention **erronée**, mais avec une
   entrée ASCII (`'Communaute'`) qui n'exerçait jamais le cas accentué.
2. **Troncature qui coupe une paire de substitution → glyphe cassé `�`.**
   `🎉` = paire UTF-16 (2 unités). Un `.slice()` tombant entre les deux unités
   produit une **demi-paire haute isolée** (`\uD83C`), rendue `�` :
   - `truncateText('🎉🎉🎉🎉🎉', 3)` → `'\uD83C…'` (au lieu de `'🎉🎉🎉...'`).
   - `truncateFilename('aaaaaaaaaa🎉bbbbbbbbbb.pdf', 18)` coupe le 🎉 en deux.
   Défaut de la classe **exactement** corrigée dans le sibling `initials.ts`
   (itération dédiée : découpe par point de code `[...word]`, jamais `word[0]`).

## Root causes
1. Classe `[^a-z0-9…]` appliquée sans pliage NFD préalable → l'accent (qui est un
   caractère à part entière ou une marque combinante) est effacé au lieu de laisser
   sa lettre de base.
2. `String.prototype.slice`/`substring` opèrent sur les unités UTF-16, pas sur les
   points de code — la coupe peut atterrir au milieu d'une paire de substitution.

## Business impact
Meeshy est multilingue avec le **français comme langue primaire/fallback** et est
un produit **social/chat** où les noms d'affichage contiennent régulièrement
accents et emoji. Un slug `franois` ou un avatar/titre affichant `�` sont des
défauts visibles sur les chemins les plus fréquents (création de groupe, cartes
média, dropdown de conversation).

## Technical impact
Deux défauts de correctness dans des utils **live** (importeurs vérifiés par
grep). Aucun changement de signature, aucun impact réseau/état. Le pliage NFD et
le découpage par point de code sont des patterns déjà **mergés et acceptés** dans
ce codebase (`name-similarity.ts`, `initials.ts`) — cette itération les propage
aux deux derniers sites qui les manquaient.

## Risk assessment
Très faible. Deux fichiers utils purs et déterministes. Le comportement ASCII est
**bit-pour-bit préservé** (toutes les 38 suites `__tests__/utils`, 1017 tests,
restent vertes ; les entrées ASCII existantes traversent NFD/points-de-code à
l'identique). L'invariant strict « `truncateFilename` ne dépasse jamais
`maxLength` » est préservé via `sliceCodePoints` qui borne la longueur UTF-16 tout
en écartant un caractère astral débordant en entier.

## Proposed improvements
1. **community-identifier** : nouveau helper interne `foldDiacritics(value) =
   value.normalize('NFD').replace(/\p{M}/gu, '')` appliqué avant le strip ASCII
   dans `generateCommunityIdentifier` ET `sanitizeCommunityIdentifier`. Mirroir
   exact des deux premières étapes de `name-similarity.normalizeName` (gateway).
   Les scripts non-latins (cyrillique/CJK) restent sans décomposition ASCII → base
   vide → préfixe neutre `community-…` (comportement inchangé, aligné doctrine #2220).
2. **truncate** : nouveau helper interne `sliceCodePoints(value, max)` qui prend au
   plus `max` unités UTF-16 sans jamais couper une paire (accumulation par point de
   code, arrêt avant débordement). Appliqué aux 3 points de coupe de
   `truncateFilename` ; `truncateText` bascule sur `[...text]` (budget de contenu
   en **caractères**, emoji = 1).

## Expected benefits
- `Café des Amis` → `cafe-des-amis-…`, `François` → `francois-…`, `Renée` → `renee-…`.
- `truncateText('🎉🎉🎉🎉🎉', 3)` → `'🎉🎉🎉...'` ; plus aucune demi-paire isolée.
- Test trompeur remplacé par de vrais cas accentués + cas non-latins verrouillés.
- Cohérence Unicode homogène entre `initials.ts`, `name-similarity.ts` et ces deux utils.

## Implementation complexity
Faible : 2 helpers internes (2-8 lignes) + 4 points d'application + docstrings +
extensions de 2 fichiers de test existants.

## Validation criteria
- `apps/web` jest : RED prouvé (2 cas `community-identifier` : `caf-des-amis` /
  `caf` ; 2 cas `truncate` : demi-paire isolée) AVANT fix ; 52/52 GREEN après.
- Non-régression : 38 suites `__tests__/utils`, **1017/1017** vertes.
- `tsc --noEmit` : aucune erreur sur les 2 fichiers touchés.

## Statut : COMPLETED

## Future improvements (hors périmètre, corroborations)
- **`apps/web/utils/link-name-generator.ts` (l.50, l.59)** : *même* coupe UTF-16
  (`substring`) sur le titre de conversation → même risque de demi-paire. Fix
  identique (`sliceCodePoints`). Différé pour garder cette PR à 2 fichiers utils
  reviewables ; candidat itération **188**. Note annexe : `MAX_LINK_NAME_LENGTH`
  (l.22) est déclaré-mais-inutilisé et le docstring annonce 32 alors que le code
  plafonne à 60 (incohérence doc, pas un mauvais output).
- **`messaging-utils.ts:29-42`** (`validateMessageContent`) : le check de vacuité
  trim mais le check de longueur non → un message à espaces de fin ≤ limite après
  trim peut être faussement rejeté ; `.length` compte aussi les emoji en double.
  Certitude « défaut vs intention » plus faible → à confirmer comme cycle futur.
- **`language-utils.ts:166-172`** (`getLanguageInfo`) : renvoie `code` verbatim
  alors que `name`/`flag` sont normalisés (`.toLowerCase()`) → `getLanguageInfo('EN')`
  = `{ code:'EN', name:'English', … }`. Impact faible, possiblement intentionnel.
- **Dead code déjà tracké** (ne pas retraiter) : `sanitizeFileName`
  (`xss-protection.ts:381`, 0 appelant), `translation-adapter.ts` (0 importeur),
  `VoiceModelSchemas.create.language` / `AnonymousParticipantSchemas.join.language`
  (`validation.ts:1869/2201`, non référencés), `translation-cleaner.ts` (fixé 186, non câblé).

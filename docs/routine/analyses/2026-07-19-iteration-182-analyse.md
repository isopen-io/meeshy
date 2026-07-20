# Iteration 182 — `generateConversationIdentifier` réimplémenté localement (×2) avec normalisation dérivée : perte d'accents/caractères allemands + timestamp non-UTC (SSOT non branchée)

## Protocole (démarrage)
`main` @ `b158a9b` (derniers merges : #2055 android/status composer, #2052
StatusBarView, #2050 StatusesViewModel, #2044 web/i18n language codes…).
Branche `claude/brave-archimedes-1kt3r3` réinitialisée sur `origin/main`. Ce
cycle prend **182** (l'itération **181** est déjà consignée par la PR ouverte
#2057 — gateway `deviceLocale` debounce-cache borné — surface disjointe).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared). Sélection : revue de la règle SSOT gateway
(« ALWAYS use `resolveUserLanguage()` … NEVER reimplement locally ») appliquée à
la génération d'identifiants de conversation — trois copies co-existantes du même
helper, deux ayant silencieusement dérivé.

## Current state
`generateConversationIdentifier(title)` produit l'`identifier` (slug URL public)
d'une conversation : `mshy_<titre_slugifié>-YYYYMMDDHHMMSS`. Il existait **quatre**
sites portant ce nom, dont **la SSOT** :

- **SSOT** — `packages/shared/utils/conversation-helpers.ts:126` : translittère les
  caractères allemands (`ö→oe`, `ü→ue`, `ä→ae`, `ß→ss`), décompose puis retire les
  diacritiques (`NFD` + strip `̀-ͯ` → `é→e`), et bâtit le timestamp avec
  les méthodes **UTC** (`getUTCFullYear`…) « for consistent identifiers across
  timezones ».
- **Délégation correcte (patron cible)** —
  `routes/conversations/utils/identifier-generator.ts:32` : wrapper `@deprecated`
  qui appelle simplement la SSOT. Chemin utilisé par `routes/conversations/core.ts:907`.
- **Copie dérivée #1** — `routes/links/utils/link-helpers.ts:80` :
  `.toLowerCase().replace(/[^a-z0-9\s-]/g, '')` **sans** map allemand, **sans**
  `NFD` → les caractères accentués sont **supprimés** ; timestamp bâti en heure
  **locale** (`getFullYear`…).
- **Copie dérivée #2** — `services/message-translation/MessageTranslationService.ts:345`
  (`_generateConversationIdentifier`) : dérive à l'identique.

## Problems identified
1. **Perte de caractères au lieu de translittération (copie #1, chemin share-link
   réel).** Pour un titre non-ASCII :
   - `"Café"` → SSOT `mshy_cafe-…` **vs** link-helpers `mshy_caf-…` (le `é` est
     effacé, le `e` de base est perdu).
   - `"Münchner Größe"` → SSOT `mshy_muenchner-groesse-…` **vs** link-helpers
     `mshy_mnchner-gre-…` (`ü`, `ö`, `ß` tous supprimés).
   Impact direct : toute conversation créée via le flux **lien de partage**
   (`routes/links/creation.ts:196` et `:224`) reçoit un slug objectivement dégradé
   — sur un produit explicitement franco/germanophone.
2. **Identifiant incohérent selon le chemin de création.** Une même conversation
   intitulée « Café » obtient `mshy_cafe-…` si créée via le flux conversation
   (SSOT), mais `mshy_caf-…` via le flux lien de partage — deux slugs pour la même
   intention produit.
3. **Timestamp dépendant du fuseau (copies #1 & #2).** `getFullYear`/`getHours`
   locaux au lieu d'UTC : la portion timestamp diverge du chemin conversation et
   des autres identifiants, contredisant le commentaire explicite de la SSOT.
4. **Dette / dérive (SSOT non respectée).** La décision produit « comment
   slugifier un titre de conversation » est réécrite à la main sur 2 sites, en
   violation de la règle gateway « NEVER reimplement locally » — exactement le
   patron que `identifier-generator.ts` avait déjà corrigé par délégation.

## Root cause
Lors de l'extraction de la SSOT (`conversation-helpers.generateConversationIdentifier`)
et du rebranchement de `identifier-generator.ts` en wrapper `@deprecated`, les deux
autres copies (`link-helpers.ts`, `MessageTranslationService`) n'ont jamais été
migrées ; elles ont conservé une version antérieure, plus pauvre (avant l'ajout du
map allemand + `NFD` + UTC), et ont donc dérivé silencieusement.

## Business / Technical impact
- **UX / partage** : slugs de conversation dégradés (caractères perdus) pour tout
  titre accentué/allemand créé via lien de partage — le chemin de création le plus
  public.
- **Cohérence** : identifiant désormais identique quel que soit le chemin de
  création ; timestamp UTC homogène.
- **Dette** : 2 réimplémentations d'une décision produit remplacées par un appel
  unique à la SSOT (net −30 lignes de production).

## Risk assessment
Très faible. Signature inchangée (`(title?: string) => string`). Pour tout titre
ASCII (cas dominant, ex. `"Conversation <objectId>"` du chemin
`MessageTranslationService`), la sortie est identique — les 26 tests link-helpers
existants restent verts sans modification. Le seul changement observable est
strictement une amélioration (accents translittérés, timestamp UTC). Aucune
requête Prisma modifiée. Miroir exact d'un patron déjà en production
(`identifier-generator.ts:32`).

## Proposed improvements / Correctif (TDD)
- **RED** : +3 tests (`link-helpers.test.ts`, module partagé réel — non mocké)
  démontrant `"Café"` → contient `cafe` (≠ `caf`), `"Münchner Größe"` →
  `muenchner-groesse`, et parité timestamp UTC. Les 2 premiers échouent sur la
  copie dérivée.
- **GREEN** :
  1. `routes/links/utils/link-helpers.ts` — `generateConversationIdentifier`
     délègue à `sharedGenerateConversationIdentifier` (mirroir de
     `identifier-generator.ts:32`).
  2. `services/message-translation/MessageTranslationService.ts` — suppression du
     privé `_generateConversationIdentifier` ; le seul appelant utilise l'import
     partagé `generateConversationIdentifier`.
  3. Tests : `MessageTranslationService.branches.test.ts` — retrait des 3 tests
     orphelins du privé supprimé (contrat couvert par la SSOT + tests de
     délégation) ; les mocks de `conversation-helpers` (branches + audio)
     exposent désormais `generateConversationIdentifier` pour le chemin de
     sauvegarde public.

## Expected benefits
- Parité stricte du slug quel que soit le chemin de création de conversation.
- Translittération accents/allemand + timestamp UTC restaurés sur le flux
  share-link.
- Une seule source de vérité pour la règle « slugifier un titre de conversation ».

## Implementation complexity
Faible — 2 délégations mécaniques vers un helper testé + toilettage de 2 fichiers
de test.

## Validation criteria
- `services/gateway` : suites `link-helpers` + `identifier-generator` +
  `links/{creation,creation-extended,retrieval}` + `MessageTranslationService.*`
  + `message-translation*` = **7+5 suites / 478 tests verts** (dont 3 nouveaux).
- `tsc --noEmit` gateway : **334 → 334** (aucune nouvelle erreur ; baseline
  environnementale `@meeshy/shared/prisma/client` inchangée, dist non construit
  dans le conteneur).

## Backlog (candidats consignés pour une itération future)
- **`validatePagination` (`services/gateway/src/utils/pagination.ts:26`)** :
  `parseInt('0',10) || defaultLimit` coerce un `limit=0` explicite en `20`.
  Décider la sémantique voulue (floor 0 vs 1) avant de corriger — analyse dédiée.
- `looksLikePhoneNumber` (`utils/normalize.ts:21`) : classe tout username
  purement numérique (≥6 chiffres) comme téléphone — dépend du câblage
  login-by-identifier, impact à vérifier.
- F70 (`deepCleanTranslationOutput`, `substring(0,30)` surrogate split),
  F75 (`generateCommunityIdentifier`) : déjà catalogués, 0 appelant / proba
  négligeable.
- `MeeshySocketIOManager.ts:752`, F69 (`sanitizeFileName`, 0 appelant) : inchangés.

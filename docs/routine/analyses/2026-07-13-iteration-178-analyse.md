# Iteration 178 — Read-receipt *detail* sheets : avatar résolu avec une sémantique divergente de la source unique (`resolveParticipantAvatar`)

## Protocole (démarrage)
`main` @ `64e2c56` (dernier merge : PR #1905 — gateway getTranslationFromJSON
case-insensible ; PR #1925 — resolveParticipantAvatar chaîne-vide). Branche
`claude/brave-archimedes-0t3ses` réinitialisée sur `origin/main` (le cycle
précédent, itér. 177, a été mergé). Ce cycle prend **178**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared/web). Recherche menée par sous-agent Explore sur les
chemins récemment modifiés (avatar/displayName, read-status, résolution de
langue) à la recherche de fuites `??`/chaîne-vide et de divergences de sémantique
entre fonctions lisant la même structure.

## Current state
Le fichier `services/gateway/src/services/MessageReadStatusService.ts` expose
DEUX familles de résolution d'avatar de participant :

- **Voie résumé** (`getMessageReadStatus`, lignes ~863-1058) : sélectionne
  `user: { select: { avatar: true } }` et résout via **`resolveParticipantAvatar(participant)`**
  (source unique #1925) → avatar local → avatar du compte → `null`, avec les
  chaînes vides/blanches traitées comme absentes.
- **Voie détail** (`getMessageStatusDetails` @1274/1322 et
  `getAttachmentStatusDetails` @1421/1439) : NE sélectionnait PAS `user.avatar`
  et retournait le champ brut — `avatar: participant.avatar` (message) /
  `avatar: participant.avatar ?? null` (attachment).

Ces deux fonctions détail alimentent les **feuilles de détail** « qui a
reçu / lu / vu / téléchargé » (route `messages.ts:791` →
`use-message-status-details.ts`), l'exact pendant paginé du résumé.

## Problems identified
1. **Fallback compte court-circuité.** Un participant avec `Participant.avatar =
   null`/`''` mais un `User.avatar` valide affichait son avatar de compte dans le
   **résumé** et **aucun avatar** dans la **feuille de détail** — deux surfaces
   UI de la même donnée, deux résultats.
2. **Fuite chaîne-vide → `<img src="">`.** `participant.avatar` (ou
   `?? null`, qui ne bascule que sur null/undefined) laissait passer `''`, que le
   navigateur résout en rechargeant l'URL de la page courante (requête parasite +
   image cassée) — précisément le défaut éliminé partout ailleurs par #1925/#1903.
3. **Divergence de sémantique (SSOT non respectée).** Deux fonctions du même
   fichier lisent `Participant.avatar`/`User.avatar` avec deux règles
   différentes. La règle produit unifiée (« absent = null/undefined OU blanc,
   local puis compte ») n'était appliquée que sur une des deux voies.

## Root cause
Les deux fonctions détail ont été écrites avant l'extraction de la source unique
`resolveParticipantAvatar` (#1925) et n'ont jamais été rebranchées dessus : elles
ne fetchaient même pas `user.avatar` dans leur `select`, rendant tout fallback
compte structurellement impossible. La coalescence brute (`??`) encode « absent =
null/undefined » là où la règle métier d'une URL d'avatar est « absent =
null/undefined OU chaîne blanche ».

## Business / Technical impact
- **UX** : perte d'avatar (ou avatar cassé) pour tout lecteur/vue disposant d'une
  photo de compte mais sans avatar local, dans les deux feuilles de détail de
  read-receipt — incohérence directement visible à côté du résumé correct.
- **Réseau** : `<img src="">` déclenche une requête parasite par avatar concerné.
- **Dette** : deux derniers points de résolution d'avatar non branchés sur la
  source unique, désormais alignés.

## Risk assessment
Très faible. Le type de retour (`string | null` pour message,
`string | null` pour attachment) est **inchangé** ; aucun consommateur impacté.
Le seul changement de comportement (`''`/blanc → fallback compte puis `null`, et
fetch de `user.avatar`) est strictement une amélioration et ne peut produire un
avatar là où il n'y en avait pas légitimement. Une requête Prisma gagne une
relation `user { avatar }` déjà chargée par la voie résumé sœur (coût négligeable,
même pattern).

## Correctif (TDD)
- **RED** : +2 tests (`__tests__/unit/services/MessageReadStatusService.test.ts`)
  — un par fonction détail : avatar local `''` + `user.avatar` valide → avatar
  compte ; deux valeurs blanches → `null`. Échouaient sur le code d'origine
  (`Received: ''`).
- **GREEN** :
  1. `getMessageStatusDetails` — `select` ajoute `user: { select: { avatar: true } }` ;
     retour `avatar: resolveParticipantAvatar(participant)`.
  2. `getAttachmentStatusDetails` — idem `select` ; retour
     `avatar: resolveParticipantAvatar(participant)` (remplace `?? null`).
  Le helper `resolveParticipantAvatar` était **déjà importé** (ligne 17) et
  utilisé par la voie résumé — zéro nouvelle dépendance, réutilisation stricte.

## Validation criteria
- Suite `MessageReadStatusService` : **165/165** verts (dont 2 nouveaux).
- Suites routes `messages*` + `message-read-status` : **16 suites / 581 tests** verts.
- `tsc --noEmit` gateway : **42 erreurs** (préexistantes, résolution locale
  `@meeshy/shared/prisma/client` — artefact d'environnement, CI génère le client
  correctement) contre **44** sur la base → **aucune nouvelle erreur** (−2, car
  deux accès `.avatar` sur `unknown` remplacés par un appel helper).

## Backlog (candidats consignés pour une itération future)
- **Finding 2 (Explore)** : `routes/conversations/messages.ts:1178/1214` —
  `displayName: sender.displayName ?? sender.user?.displayName ?? null` laisse
  fuir `''` alors que l'`avatar` de la même ligne (1179) est déjà durci via
  `resolveParticipantAvatar`. À traiter via un resolver blank-aware partagé
  (miroir de `resolveParticipantAvatar`), APRÈS vérification que le client ne
  re-résout pas déjà via `getUserDisplayName(sender)` (impact potentiellement nul).
- **Finding 3 (Explore)** : `apps/web/utils/user-language-preferences.ts:42-75` —
  `getUserLanguageChoices` émet des codes lowercasés mais NON normalisés
  (`'pt-br'`) comme cibles de traduction sélectionnables, divergeant de
  `resolveUserPreferredLanguage` (qui renvoie `'pt'`). Passer chaque pref par
  `normalizeLanguageCode` avant d'émettre `code`.
- F69 (`sanitizeFileName` overlong sans extension) : toujours latent, 0 appelant.

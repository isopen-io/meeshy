# Iteration 159 — Analyse d'optimisation (2026-07-09)

## Protocole (démarrage)
`main` @ `0921b9d` (dernier merge : PR #1776 iter 158 — fan `conversation:updated` sur
edit/delete). Branche `claude/brave-archimedes-ps9wy0` recréée sur `origin/main` (0/0). Ce
cycle prend **159**.

PRs ouvertes au démarrage (autres sessions, hors périmètre) : #1779 (Android audio bubble),
#1778 (translator FIFO queue), #1777/#1771/#1767/#1764 (calls), #1775/#1772 (web mentions).
Périmètre choisi pour **éviter tout conflit** : gateway `routes/conversations` +
`ConversationMessageStatsService` — aucune de ces PRs n'y touche.

Fan-out : un agent Explore sur gateway services / socketio / shared utils / web hooks, hors
zones couvertes (calls, mentions, translator queue, stats-online). Consigne : **un** défaut
de logique quasi-pure, haute confiance, en production, non couvert par les tests.

---

## Cible retenue : F125 — le breakdown par participant de `ConversationMessageStats` diverge sur les chemins edit/delete (mauvaise clé passée à `onMessageEdited` / `onMessageDeleted`)

### Current state
`ConversationMessageStatsService` maintient une map `participantStats` **keyée par identité
d'expéditeur** :
- **enregistré** → `User.id`
- **anonyme** → `Participant.id`

Les deux chemins qui **peuplent** cette map s'accordent sur ce contrat :
- `onNewMessage` (appelé depuis `socketio/handlers/MessageHandler.ts:328,532`) reçoit
  `userId || participantId` → enregistré `User.id`, anonyme `Participant.id`.
- `recompute` (`ConversationMessageStatsService.ts:394`) keye par
  `msg.sender?.userId || msg.senderId` → même résultat.

Mais les deux chemins qui **ajustent** la map (route REST
`services/gateway/src/routes/conversations/messages-advanced.ts`) passent une **mauvaise
clé** :

1. **DELETE** (`:627`) : `existingMessage.sender?.userId ?? ''`.
   Pour un message **anonyme**, `sender.userId === null` → la clé devient la chaîne vide
   `''` au lieu du `Participant.id`.
2. **PUT/edit** (`:453`) : `userId` — l'identité de **l'éditeur**, pas de l'expéditeur du
   message. Or un MODERATOR/ADMIN peut éditer le message d'autrui (permission lignes
   149-175). La clé pointe alors sur l'éditeur, jamais sur l'auteur.

### Problems identified
Dans `onMessageDeleted`/`onMessageEdited`, `entry = participantStats[senderId]` :
- **DELETE anonyme** : `participantStats['']` est `undefined` → le bloc `if (entry)` est
  sauté. Les compteurs **globaux** (`totalMessages`/`totalWords`/`totalCharacters`,
  type-counters) sont **bien** décrémentés, mais le **breakdown du participant** ne l'est
  pas → il reste figé.
- **PUT par un modérateur** : le delta mot/caractère atterrit sur
  `participantStats[editorId]` (souvent absent → sauté, ou pire l'entrée d'un autre
  participant), jamais sur l'auteur réel.

### Root cause
Duplication du **contrat de clé d'identité** entre le site d'écriture (create/recompute,
qui utilise `sender?.userId || senderId`) et les sites d'ajustement REST (qui ont dérivé
vers `?? ''` et `userId`). Aucun test route n'assertait l'argument transmis.

### Business impact
`GET …/stats` renvoie un breakdown incohérent : un participant crédité de messages/mots que
le total ne reflète plus (delete anonyme), ou un délta d'édition attribué au mauvais
participant (edit modérateur). Il n'existe **aucun `recompute()` programmé** — il ne tourne
qu'à froid (ligne stats absente) — donc l'incohérence est **permanente** jusqu'au prochain
cold-compute.

### Technical impact
Divergence silencieuse write/adjust ; aucune erreur levée (les `.catch` avalent, et l'entrée
absente est traitée comme un no-op volontaire par le service).

### Risk assessment
Correctif **minimal** (2 lignes de prod), aligné sur le contrat déjà appliqué par
create/recompute. Aucun changement d'API, de schéma, d'état persistant. Risque de régression
quasi-nul : la nouvelle clé est un **sur-ensemble correct** de l'ancienne pour l'auteur
enregistré (`sender?.userId` reste `User.id`).

### Proposed improvements
Les deux sites REST keyent par l'identité de l'**expéditeur du message**, exactement comme
create/recompute :
```ts
existingMessage.sender?.userId ?? existingMessage.senderId
```
(`senderId` scalaire est présent : la row est chargée avec `include`, donc tous les scalaires
sont retournés.)

### Expected benefits
- Breakdown par participant **cohérent** avec les totaux sur edit ET delete.
- Convergence des 4 chemins (create, recompute, edit, delete) vers un **unique contrat de
  clé** → plus de dérive possible de cette classe.

### Implementation complexity
Triviale — 2 lignes de prod.

### Validation criteria
- **RED d'abord** :
  - DELETE anonyme (moderator delete, `sender.userId=null`, `senderId=Participant.id`) →
    `onMessageDeleted` doit être appelé avec `Participant.id` (échoue avant : `''`).
  - PUT modérateur (`sender.userId=OTHER_USER_ID`, éditeur `USER_ID` ADMIN) →
    `onMessageEdited` doit être appelé avec `OTHER_USER_ID` (échoue avant : `USER_ID`).
- Le test pré-existant « handles null sender.userId using ?? empty string » (2022)
  **encodait le bug** (`''`) → réécrit pour asserter le fallback `senderId`.
- Suite `conversation-messages-advanced.test.ts` verte (99/99).

### Tests — absence de couverture confirmée
- `ConversationMessageStatsService.test.ts` appelle `onMessageDeleted`/`onMessageEdited`
  directement avec une clé qui **matche déjà** une entrée → la divergence n'est jamais
  exercée. Il possède même un test « does not touch participant entry when senderId not
  found » qui asserte le skip comme correct.
- Aucun test route n'assertait l'**argument** transmis (seuls les codes HTTP l'étaient).

---

## Suivis (backlog, non traités ce cycle)
- **Deletes socket-initiés ne décrémentent aucune stat** :
  `MessageHandler.handleMessageDelete` n'appelle ni `onMessageDeleted` ni `onMessageEdited`.
  Le chemin WS (client normal) laisse tous les compteurs figés. « Missing call » plus qu'un
  défaut pur — blast radius plus large, à traiter dans un cycle dédié (contrat d'accès au
  service depuis la couche socket à définir).
- **`use-conversation-messages.ts:82` tri lexicographique sur `String(a.createdAt)`** : mort
  (non importé ; le chemin vif est `use-conversation-messages-rq.ts`). Documenté pour ne pas
  le confondre avec le trieur vif.

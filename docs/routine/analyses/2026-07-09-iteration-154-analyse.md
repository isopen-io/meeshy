# Iteration 154 — Analyse d'optimisation (2026-07-09)

## Protocole (démarrage)
`main` @ `9b4102b2` (dernier merge : PR #1757 iter 153 — frontière e-mail gauche dans
`resolveMentionedUsers`). Branche `claude/brave-archimedes-2segvz` recréée sur `origin/main`
(0/0). Ce cycle prend **154**.

PRs ouvertes au démarrage (autres sessions, hors périmètre autonome) : #1759 (Android
conversations-purge), #1758 (iOS camera/composer media). Aucune ne touche
gateway/web/shared prod → pas de conflit.

Fan-out : deux agents Explore parallèles — (a) `services/gateway/src`, (b) `apps/web` +
`packages/shared`. Consigne : **un** défaut de logique quasi-pure, haute confiance,
**actuellement en production**, non couvert par les tests. Priorité 1 = features récemment
développées.

### Candidat web écarté (retenu comme runner-up)
`apps/web/hooks/composer/useMentions.ts:56` — `MENTION_REGEX = /@([\w-]{0,30})$/` omet la
frontière gauche `NAME_BOUNDARY_LEFT` que la SSOT `mention-parser.ts` impose à **tous** les
chemins de mention (et que l'iter 153 vient d'appliquer au gateway). L'autocomplete pop donc
sur `contact@ali`, et la sélection réécrit l'e-mail. **Réel mais moins net** : la SSOT
n'énumère pas ce hook composer dans son docstring, donc on peut argumenter d'une tolérance
volontaire côté frappe. Reporté comme suivi (voir « Suivis »).

---

## Cible retenue : F120 — `computeStats` passe l'ObjectId résolu à `computeOnlineUsers`, qui re-dérive le flag global par `=== "meeshy"` → la conversation globale a toujours **0 utilisateur en ligne** sur tout recompute complet

### Current state
`services/gateway/src/services/ConversationStatsService.ts`. Deux méthodes sœurs calculent
le snapshot des utilisateurs en ligne d'une conversation, mais **divergent sur l'argument**
qu'elles passent à `computeOnlineUsers` :

- **`updateOnNewMessage`** (ligne 110) passe l'identifiant **brut** :
  ```ts
  stats.onlineUsers = await this.computeOnlineUsers(prisma, conversationId, getConnectedUserIds());
  ```
- **`computeStats`** (ligne 243) passe l'ObjectId **déjà résolu** :
  ```ts
  const onlineUsers = await this.computeOnlineUsers(prisma, realConversationId, getConnectedUserIds());
  ```

Or `computeOnlineUsers` **re-dérive lui-même** le flag global en comparant son argument au
littéral `"meeshy"` (ligne 267) :
```ts
if (conversationId === "meeshy") {
  // branche globale : allowedIds = connectedUserIds (aucun filtre participant)
} else {
  // branche normale : filtre par prisma.participant.findMany({ conversationId, userId in ... })
}
```

`computeStats` a déjà transformé `"meeshy"` en `realConversationId` (l'ObjectId) et le
passe. Donc dans `computeOnlineUsers` :
1. `conversationId === "meeshy"` est **faux** (c'est un ObjectId),
2. `isGlobalConversation` reste `false`,
3. il entre dans la branche non-globale (lignes 289-296) et filtre `connectedUserIds` via
   `prisma.participant.findMany({ conversationId: realConversationId, ... })`,
4. **la conversation globale n'a AUCUN `Participant`** — `computeStats` le sait déjà : sa
   propre branche globale (lignes 214-222) compte l'appartenance via
   `prisma.user.findMany({ isActive: true })`, **jamais** via `participant`,
5. donc `members = []` → `allowedIds.length === 0` → `return []` (ligne 295).

### Problems identified
- **Panneau « en ligne » de la conversation globale vide** sur tout recompute complet
  (`getOrCompute` cold/expired, `recompute`). Momentanément correct juste après un nouveau
  message (chemin incrémental `updateOnNewMessage`, ligne 110) → **flip-flop** visible sur
  LA conversation centrale de Meeshy.

### Root cause
Duplication de la résolution du flag global entre deux méthodes. `computeStats` résout puis
transmet le résultat résolu ; `computeOnlineUsers` re-résout à partir du littéral brut. Les
deux ne peuvent s'accorder que si l'appelant passe le **brut**, comme le fait la sœur
`updateOnNewMessage`.

### Business impact
La conversation globale « meeshy » est la place publique par défaut de l'app. Un compteur de
présence qui oscille entre « N en ligne » (après message) et « 0 en ligne » (au recompute)
dégrade la confiance dans le signal de présence temps-réel.

### Technical impact
Une seule ligne : mauvais argument transmis. Aucune donnée persistée n'est corrompue (le
snapshot est éphémère, TTL-caché).

### Risk assessment
Très faible. Le correctif aligne `computeStats` sur le contrat que `computeOnlineUsers`
attend déjà (et que la sœur `updateOnNewMessage` respecte). Pour une conversation normale,
`realConversationId === conversationId` (seul `"meeshy"` est spécial-casé) → comportement
identique. Seule la conversation globale change (vers le comportement correct).

### Proposed improvement
Passer l'identifiant **brut** `conversationId` à `computeOnlineUsers` en ligne 243, à
l'identique de la sœur `updateOnNewMessage:110`.

```ts
const onlineUsers = await this.computeOnlineUsers(prisma, conversationId, getConnectedUserIds());
```

### Expected benefits
- Conversation globale : `computeOnlineUsers` prend la branche globale →
  `allowedIds = connectedUserIds` → le snapshot en ligne est **stable et correct** sur les
  deux chemins (recompute ET incrémental).
- Convergence des deux méthodes sœurs vers un unique contrat d'argument.

### Implementation complexity
Triviale (1 ligne de prod). Le test existant qui **encodait le bug** est corrigé.

### Validation criteria
- Test RED d'abord : conversation globale, utilisateurs connectés, **0 `Participant`**
  (réalité prod) → `onlineUsers` doit contenir les connectés. Échoue avant le fix (`[]`),
  passe après.
- Le test existant « member intersection » (ligne 769) reste vert (branche globale →
  `allowedIds = connectés`, `user.findMany` renvoie les 2 → longueur 2), commentaires
  corrigés car sa justification (« member check path ») devient fausse.
- Suite `ConversationStatsService.test.ts` intégralement verte.

### Tests — absence de couverture confirmée
`services/gateway/src/__tests__/unit/services/ConversationStatsService.test.ts` :
- Le seul test global atteignant `computeStats` avec présence (« should use all active
  users… », ligne 602) utilise `getConnectedUserIds = () => []` → `computeOnlineUsers`
  court-circuite dès la ligne 259 (`if (connectedUserIds.length === 0) return []`) **avant**
  toute résolution → la branche buggée n'est jamais exercée ; il n'assert jamais
  `onlineUsers` pour une globale peuplée.
- Le test « member intersection » (ligne 769) **masque** le bug : il mocke
  `participant.findMany` pour renvoyer des lignes participant qui, en prod, **n'existent
  pas** pour la globale — c'est précisément l'hypothèse fausse qui rend le bug invisible.

---

## Suivis (backlog, non traités ce cycle)
- **Composer mention left-boundary** (`apps/web/hooks/composer/useMentions.ts:56`) : aligner
  `MENTION_REGEX` sur `NAME_BOUNDARY_LEFT` (frontière gauche Unicode). Runner-up de ce cycle.
- **`PostService.recordView` clobber du `duration`** (`PostService.ts:1022-1028`) : `Math.max`
  probablement voulu vs. « keep latest » (choix produit défendable — à trancher).
- **Reaction self-echo compare Participant ID vs User ID** (`use-message-reactions.ts:363/389`) :
  confiance plus basse (auto-guérison via `refreshReactions()`).

# Iteration 114 — Analyse d'optimisation (2026-07-06)

## Protocole (démarrage)
`main` @ `3bfd41d5` (post-merge #1529/#1533/#1534), working tree propre. Branche `claude/brave-archimedes-howg57`
recréée depuis `origin/main`. Itération 112 (F83 affiliate stats) mergée dans `main` via PR #1529.

**PR ouvertes au démarrage** : quasi exclusivement des bumps dependabot (#1532-#1554) + 2 PR iOS (#1555, #1527).
La cible retenue (`apps/web/utils/v2/transform-conversation.ts`) est **strictement disjointe** de toutes.

### Revue d'ingénierie
Balayage très approfondi (agent d'exploration, 104 tool-uses) des helpers purs/quasi-purs de
`services/gateway/src/services`, `services/gateway/src/utils`, `packages/shared/utils`, `apps/web/utils`,
`apps/web/lib`, `apps/web/hooks`, hors zones déjà traitées (itérations 100-113). Vérifiés corrects et
écartés : `resolvePresenceVisibility`, `reelAffinity`, `formatCompactNumber`, `truncateFilename`,
`getInitials`, `calendarDayDiff`, `mention-parser`, `groupNotificationsByDate` (Sunday-start intentionnel).
Un défaut solide remonte : violation d'un SSOT documenté par une réimplémentation inline → **F84**.

## Cible : F84 — `transformToConversationItem` viole l'ordre canonique du nom (username avant le vrai nom)

### Current state
`apps/web/utils/v2/transform-conversation.ts` → `transformToConversationItem` (branche conversation
**directe**, lignes ~106-116). Le nom affiché de l'autre participant était résolu par une chaîne inline :
```ts
name =
  otherUser?.displayName ||
  otherUser?.username ||    // ← username préféré au vrai nom
  otherUser?.firstName ||   // ← firstName seulement après username ; lastName jamais utilisé
  otherMember?.displayName || (otherMember as any)?.nickname || conversation.title || 'Utilisateur';
```

### Problems identified
- **[LIVE] Nom d'utilisateur cryptique affiché à la place du vrai nom.** Le SSOT documenté
  (`apps/web/utils/user-display-name.ts` `getUserDisplayName` + `apps/web/CLAUDE.md` §Single Source of
  Truth) fixe l'ordre : **`displayName` > `firstName + lastName` > `username`**. La chaîne inline faisait
  `displayName` > `username` > `firstName`, et **n'utilisait jamais `lastName`**.
  Input : autre membre `{ displayName: null, firstName: "Alice", lastName: "Martin", username: "amartin_99" }`.
  - SSOT → **"Alice Martin"** ; inline → **"amartin_99"** (handle cryptique).
- **[LIVE]** Appelant : `transformConversations` → `apps/web/hooks/v2/use-conversations-v2.ts:199`
  (hook de **liste de conversations** V2 — cœur de l'UI messagerie). Chaque conversation directe avec un
  utilisateur sans `displayName` custom affichait son pseudo au lieu de son prénom/nom.

### Root cause
Réimplémentation inline de la résolution de nom au lieu d'appeler le helper SSOT dédié
(`getUserDisplayName`/`getUserDisplayNameOrNull`), avec un ordre de priorité erroné. Violation directe du
principe « Single Source of Truth » du CLAUDE.md web.

### Business impact
Sur l'écran le plus vu de l'app (liste des conversations), un contact qui n'a pas défini de `displayName`
apparaît sous son **identifiant technique** (`amartin_99`) au lieu de « Alice Martin ». Dégrade la
lisibilité et la reconnaissance des contacts — friction produit directe.

### Technical impact
Remplacement de la chaîne inline par `getUserDisplayNameOrNull(otherUser)` (SSOT), en **préservant** les
fallbacks de niveau participant (member `displayName`, `nickname`, `conversation.title`, `'Utilisateur'`).
Aucun changement de signature ni de forme de retour.

### Risk assessment
Très faible. `getUserDisplayNameOrNull` retourne `null` (et non un fallback) quand l'objet user est vide,
préservant exactement la cascade de fallbacks existante. Seuls les cas où `firstName`/`lastName` existent
sans `displayName` changent — et deviennent corrects. Fonction pure.

### Proposed improvements (implémenté ce cycle)
- Import `getUserDisplayNameOrNull` + remplacement de la chaîne inline + commentaire expliquant le *pourquoi*.

### Expected benefits
- Vrai nom (prénom + nom) affiché en liste de conversations, conforme au SSOT et à iOS/Android.
- Élimination d'une réimplémentation divergente d'un helper existant (dette technique).

### Implementation complexity
Très faible (1 import + 1 chaîne remplacée ; 5 tests neufs, dont 2 RED→GREEN de régression d'ordre).

### Validation criteria
- [x] RED prouvé : sur l'ancien code, « firstName+lastName avant username » et « firstName seul » échouent.
- [x] GREEN : 5/5 verts après fix.
- [ ] Suite web complète verte + CI.

## Candidats différés ce cycle
- **F85** (MEDIUM, gateway) : `ConversationMessageStatsService.onNewMessage` classe en `text` tout message
  sans attachement avec contenu (ignore `messageType`), alors que `recompute()` (l'autorité) exige
  `msgType === 'text'` — les messages `system`/`location` gonflent `contentTypes.text` en incrémental
  jusqu'au prochain recompute. Fix : passer `messageType` dans `onNewMessage`/`onMessageDeleted`.
- **F86** (LOW, web) : `getMessageType` mappe `video/*` sur `'file'` (pas d'entrée `'video'` dans l'union
  `ConversationItemData`) — plutôt gap de design que défaut.

## Améliorations futures (report)
Reports antérieurs : F82b (#1528), F83b (tokens non filtrés), F51b, F56b, F60b, F67b, F68b, F69, F70, F74, F75.
</content>

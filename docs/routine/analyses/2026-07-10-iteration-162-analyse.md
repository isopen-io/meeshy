# Iteration 162 — Analyse d'optimisation (2026-07-10)

## Protocole (démarrage)
`main` @ `8f51807` (dernier merge : PR #1798 iter 155 — composer left-boundary).
Branche `claude/brave-archimedes-1kh8ql` recréée sur `origin/main` (0/0). Ce cycle prend **162**.

PRs ouvertes au démarrage (autres sessions, hors périmètre autonome) :
- #1803 — gateway/messages : empty content on edit (attachment caption removal)
- #1802 — ios/calls : VideoFiltersPanel `.shared` injection
- #1801 — gateway/realtime : replay attachment reactions to offline participants (iter 161)

Périmètres verrouillés (pour ne pas dupliquer / entrer en conflit) : mentions autocomplete,
stats participant / online-users, posts/story watch-time, realtime delivery/receipts / delivery
queue, calls / signaling, typing suppression, translator queue, presence label,
message-edit empty-content, attachment-reaction offline replay, notification:read badge.

Fan-out : deux agents Explore parallèles — (a) `services/gateway/src`, (b) `apps/web` +
`packages/shared`. Consigne : **un** défaut de logique quasi-pure, haute confiance,
**actuellement en production**, non couvert par les tests, hors des périmètres verrouillés.
Priorité 1 = features récemment développées (le feed social / commentaires est en évolution active).

Candidat web retenu par l'agent (non pris ce cycle, faible impact — 2 jours DST/an) :
DST-unsafe « hier » boundary dans `formatContentPublishedAt`
(`apps/web/utils/notification-helpers.ts`) qui soustrait `86400000` au lieu d'utiliser
`calendarDayDiff` déjà importé. Consigné ici pour un futur cycle.

---

## Cible retenue : F122 — `PostCommentService.deleteComment` orpheline les réponses d'un commentaire supprimé et sur-compte `commentCount` de façon permanente

### Current state
`services/gateway/src/services/PostCommentService.ts:286`.

`addComment` (l.101-105) incrémente `post.commentCount` pour **chaque** commentaire —
top-level **et** réponse (l'incrément est inconditionnel), plus `parent.replyCount` pour une
réponse. `commentCount` compte donc le **thread non-supprimé complet** (niveau 1 + réponses).

`deleteComment` (l.286-311, avant ce cycle) faisait un soft-delete du **seul** commentaire ciblé
puis :
```ts
await this.prisma.post.update({
  where: { id: comment.postId },
  data: { commentCount: { decrement: 1 } },   // toujours exactement 1
});
if (comment.parentId) { /* decrement parent.replyCount */ }
```

La relation `PostComment.parent` est `onDelete: NoAction` (schema l.3102) et le modèle autorise
des chaînes de réponses de **profondeur arbitraire** (tout commentaire vivant peut être un `parentId`).

### Problems identified
1. **Réponses orphelines** : supprimer un commentaire top-level `C1` porteur d'une réponse `R1`
   laisse `R1` **non-supprimée**. `getComments` filtre `parentId: null` (l.161-163) → `R1` (parentId
   défini) est exclue ; le parent `C1` supprimé n'est jamais rendu, donc `getReplies(C1)` n'est
   **jamais** appelé côté client. `R1` (et ses éventuelles sous-réponses) devient invisible mais
   toujours en base.
2. **Sur-comptage permanent** : `commentCount` n'est décrémenté que de 1 alors que N réponses
   survivantes restent comptées. Le badge « N commentaires » du post reste faux indéfiniment ;
   ouvrir la feuille de commentaires n'affiche rien de ces N réponses.

### Root cause
`deleteComment` n'a jamais implémenté la cascade que `onDelete: NoAction` délègue au code
applicatif. Le décrément constant `1` ignore que `commentCount` inclut les réponses.

### Business impact
Feature feed social (Priorité 1). Compteur de commentaires faux + réponses fantômes → perte de
confiance, incohérence entre badge et contenu, données orphelines qui gonflent la base.

### Technical impact
Invariant `commentCount == #(commentaires non-supprimés du post)` cassé. La route
`DELETE /posts/:postId/comments/:commentId` relit `post.commentCount` **après** `deleteComment`
et le **broadcast** (`comments.ts:430-438`) → la valeur fausse est propagée en temps réel à tous
les clients.

### Risk assessment
Faible. Changement isolé à une méthode ; contrat de retour (`{ success: true }` | `null`)
inchangé ; aucune migration. Le décrément reste borné par les descendants réellement comptés
(cohérent avec les incréments d'`addComment`) → pas de compteur négatif.

### Proposed improvements
Soft-delete du **sous-arbre complet** (BFS sur `parentId`) et décrément de
`commentCount` par `1 + #descendants`. `replyCount` du parent direct : décrément de 1 inchangé
(un seul enfant direct disparaît ; les replyCount des descendants deviennent hors-sol).

### Expected benefits
Invariant `commentCount` rétabli, plus de réponses orphelines, badge/broadcast corrects,
cascade correcte à profondeur arbitraire.

### Implementation complexity
Faible : ~25 lignes dans une méthode, logique quasi-pure (BFS + `updateMany`).

### Validation criteria
- RED : nouveaux tests cascade échouent contre l'ancien code (vérifié : 4 échecs).
- GREEN : 25/25 `PostCommentService`, 217/217 suites comment-related, `tsc --noEmit` propre.
- Contrat de retour et broadcast inchangés.

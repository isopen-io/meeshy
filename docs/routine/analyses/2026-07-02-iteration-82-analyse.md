# Iteration 82 — Analyse d'optimisation (2026-07-02)

## Protocole (démarrage)
`main` @ `27e2fd20` (working tree propre). Branche de travail `claude/brave-archimedes-rs455q`
recréée depuis `origin/main` (main avait été force-updated depuis la dernière itération — aucun
commit non-mergé à préserver).

Revue des itérations récentes + des 3 PR ouvertes (#1360 iOS a11y, #1361 android calls, #1362
gateway read-status cursor) : le **thème dominant des dernières 48 h est le durcissement des
races « lost-update / out-of-order » sur les curseurs et compteurs partagés du gateway** :
- `c0939a3f` — `ReactionService.updateMessageReactionSummary` : race lost-update sur le compteur
  de réactions (fix via `$transaction` + `count()` autoritaire).
- PR #1362 — `MessageReadStatusService.markMessagesAsRead/Received` : régression de curseur
  out-of-order (garde `isStaleCursorMessageId` comparant les ObjectId hex).

Cible retenue (Priorité 1 — feature récemment développée) : **trouver et corriger les analogues
NON encore corrigés de cette même classe de bug.** Un audit dédié (sous-agent) a tracé le pattern
read-then-write (findUnique/findFirst → dérive → update) et les écritures inconditionnelles de
champs « last/latest/high-water-mark » à travers `services/*.ts` et `socketio/handlers/*.ts`.

## Cibles iter 82 — 2 analogues non corrigés (compteur + curseur)

### A. `AffiliateTrackingService.convertAffiliateVisit` — compteur lost-update

**Current state.** `services/gateway/src/services/AffiliateTrackingService.ts` lit
`affiliateToken.currentUses` via `findUnique` (l.81) puis écrit
`currentUses: affiliateToken.currentUses + 1` (l.132) — **valeur calculée en JS**, pas un
increment atomique. C'est la signature exacte du bug de compteur corrigé dans
`updateMessageReactionSummary`, mais sur un autre champ.

**Problem identified.** Deux conversions concurrentes sur le même token lisent la même valeur
`N` et écrivent chacune `N+1` : une incrémentation est **perdue**. Comme `currentUses` sert de
garde de cap (`currentUses >= maxUses`, l.95), un compteur sous-évalué peut laisser passer des
conversions au-delà de la limite (crédit d'affiliation excédentaire).

**Root cause.** Read-modify-write non atomique là où Prisma/MongoDB offre `{ increment: 1 }`
(sérialisé côté DB). Contraste : le chemin share-link équivalent (`routes/anonymous.ts:431`)
utilise déjà `{ increment: 1 }` — l'idiome correct existait mais n'avait pas été appliqué ici.

**Business impact.** Intégrité du compteur d'affiliation (comptage de parrainages, respect du
cap `maxUses`). Faible volume mais réel (fraude/sur-crédit possible sous concurrence).

**Technical impact.** 1 ligne : `currentUses: affiliateToken.currentUses + 1` →
`currentUses: { increment: 1 }`. Aucune signature publique modifiée.

**Risk assessment.** TRÈS FAIBLE. Increment atomique = strictement plus correct, aucun changement
de comportement observable hors concurrence. Le fast-path de cap (l.95) reste inchangé.

**Résidu documenté (hors périmètre).** Le TOCTOU du cap lui-même (deux conversions passant
simultanément le check l.95 avant l'increment → dépassement possible de 1) nécessiterait une
`updateMany` conditionnelle transactionnelle + rollback de la relation déjà créée — plus invasif,
reporté (Améliorations futures F47).

### B. `MessageHandler.handleMessageDelete` — curseur `lastMessageAt` out-of-order

**Current state.** `services/gateway/src/socketio/handlers/MessageHandler.ts` (l.732-743) : après
soft-delete, `findFirst` du dernier message non-supprimé puis `conversation.update` écrivant
**inconditionnellement** `lastMessageAt = lastNonDeleted?.createdAt ?? conversation.createdAt`.
C'est l'analogue exact du bug de curseur de PR #1362, sur `lastMessageAt`.

**Problem identified.** Un `message:new` qui commit **entre** le `findFirst` et le `update` fait
reculer `lastMessageAt` : le `findFirst` (pris avant le nouveau message) renvoie un message plus
ancien, et l'`update` écrase le `lastMessageAt` fraîchement avancé par le nouveau message. La
conversation régresse dans le tri de la liste et le bump du nouveau message est perdu.

**Root cause.** Écriture inconditionnelle d'un high-water-mark sans garde de non-régression.

**Subtilité écartée.** `lastMessageAt` est estampillé `new Date()` à la création (MessagingService
l.315), **décorrélé** de `message.createdAt` (décalage de quelques ms). Une garde basée sur
`message.createdAt` serait donc peu fiable (risque de laisser un `lastMessageAt` obsolète après
suppression du dernier message). **Formulation robuste retenue : concurrence optimiste** —
`updateMany` avec `where: { id, lastMessageAt: <valeur lue au début du handler> }`. Si un message
a avancé le curseur entre-temps, la clause échoue (0 ligne), sans hypothèse d'alignement d'horloge.

**Business impact.** Tri correct de la liste de conversations (UX Prisme : la conversation la plus
récente en tête). Modéré sur les groupes actifs (delete concurrent d'un `message:new`).

**Technical impact.**
- `+ lastMessageAt: true` dans le `select` conversation du `findFirst` message (l.681).
- `conversation.update(...)` → `conversation.updateMany({ where: { id, lastMessageAt: read }, data })`.
- Comportement préservé hors concurrence (garde toujours vraie si le curseur n'a pas bougé).

**Risk assessment.** FAIBLE. Concurrence optimiste standard, sans dépendance à l'alignement des
horloges. Couvert par la suite `MessageHandler.core` (test existant adapté + 1 test neuf fallback).

## Améliorations futures
- **F47** : cap `maxUses` du token d'affiliation — `updateMany` conditionnelle transactionnelle
  (`where currentUses < maxUses`) + rollback de la relation si le cap est atteint dans la fenêtre
  de course. Ferme le TOCTOU résiduel du cap (au-delà du lost-update déjà corrigé ici).
- **F48** : `ConversationMessageStatsService` (`onMessageEdited`/`onMessageDeleted`) — écritures
  **absolues** dérivées d'une lecture (`existing.totalWords + diff`, `existing.totalMessages - 1`)
  sur les champs numériques non-increment ; analogue lost-update le plus lourd restant (partiel-
  lement auto-corrigé par `recompute()` périodique mais pas les valeurs absolues edit/delete).
- **F49** : `ConversationStatsService.updateOnNewMessage` — lost-update in-process sur le cache
  `messagesPerLanguage` (auto-guéri par TTL, sévérité basse).

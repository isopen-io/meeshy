# Iteration 161 — Analyse d'optimisation (2026-07-10)

## Protocole (démarrage)
`main` @ `28af519` (dernier merge : PR #1794 iter 160 — `conversation:join` n'inflate plus les
stats de messages). Branche `claude/brave-archimedes-2zhlza` recréée sur `origin/main` (0/0).
Ce cycle prend **161**.

PRs ouvertes au démarrage (autres branches / cycles antérieurs, hors périmètre autonome) :
#1796 #1795 #1792 (iOS/Android/calls), #1791 (composer left-boundary iter 160), #1788
(auto-mark delivered), #1787 (web calls group stream), #1785 (posts watch-time iter 160),
#1781 (stats participant iter 159), #1778 (translator FIFO), #1775/#1772 (mentions autocomplete).
Périmètres à éviter pour ne pas dupliquer / entrer en conflit : mentions, stats participant /
online-users, posts watch-time, realtime delivery/receipts, calls, typing suppression,
translator queue, presence label.

Fan-out : deux agents Explore parallèles — (a) `services/gateway/src`, (b) `apps/web` +
`packages/shared`. Consigne : **un** défaut de logique quasi-pure, haute confiance,
**actuellement en production**, non couvert par les tests, hors des périmètres verrouillés
ci-dessus. Priorité 1 = features récemment développées (notifications temps-réel web).

---

## Cible retenue : F121 — le handler socket `notification:read` ne décrémente pas `pages[0].unreadCount`, le seul champ que le badge de notifications affiche → sur-comptage persistant

### Current state
`apps/web/hooks/queries/use-notifications-manager-rq.tsx`. Le compteur non-lu affiché
**partout** dans l'UI (titre d'onglet `(N)`, point favicon via `useTabNotification`, badge de
la cloche, `counts.unread`) provient d'**un seul** endroit :

```ts
// ligne 45
const unreadCount = notificationsData?.pages[0]?.unreadCount ?? 0;
```

C'est le champ `unreadCount` embarqué sur la **page 0 de la liste infinie**. Ce champ est un
**total global** renvoyé par le serveur sur chaque page (`services/notification.service.ts:180`
→ `response.data.unreadCount`), pas un décompte par page.

Toutes les autres mutations de l'état non-lu maintiennent **ce** champ :

- Nouvelle notification (`handleNewNotification`, l. 128-130) incrémente `page.unreadCount`
  sur la page 0 **et** la query séparée `unreadCount()`.
- Mark-as-read local (`useMarkNotificationAsReadMutation.onMutate`,
  `use-notifications-query.ts:90`) décrémente `page.unreadCount` sur chaque page **et** la
  query `unreadCount()`.
- Suppression (`useDeleteNotificationMutation`, l. 198-199) décrémente `page.unreadCount`
  **sous garde** `!deleted.state.isRead`.

Mais le handler socket **`notification:read`** (l. 165-189, chemin « lu sur un autre
appareil ») met à jour uniquement :

```ts
pages: data.pages.map((page) => ({
  ...page,
  notifications: page.notifications?.map((n) =>
    n.id === notificationId ? { ...n, state: { ...n.state, isRead: true, readAt: new Date() } } : n
  ),
  // <-- page.unreadCount JAMAIS décrémenté
})),
```
… puis décrémente la query `unreadCount()` **inconditionnellement**. Le champ réellement
rendu (`pages[0].unreadCount`) reste inchangé.

### Problems identified
1. **Sur-comptage persistant du badge.** 3 non-lus → badge `(3)`. L'utilisateur en lit une
   sur un autre appareil → le gateway émet `notification:read` → l'item passe `isRead:true`
   dans la liste, mais le badge reste **(3)** jusqu'à un refetch complet non lié.
2. **Double-décompte sur self-echo / redelivery.** Quand l'utilisateur lit une notification
   **localement** (mutation optimiste : item → `isRead:true`, `unreadCount()` décrémenté),
   le gateway ré-émet `notification:read` **au même appareil**. Le handler décrémente alors
   `unreadCount()` **une seconde fois** (décrément inconditionnel l. 187) → **sous-comptage**
   de la query autonome. Idem à toute redelivery socket après reconnexion.

### Root cause
Le handler socket est le seul des quatre chemins de mutation à (a) ignorer le champ
load-bearing `pages[].unreadCount` et (b) décrémenter le compteur sans garde d'idempotence.
Divergence de contrat entre chemins sœurs.

### Business impact
Le badge de notifications est un signal de confiance central. Un compteur figé au-dessus de
la réalité (ou qui plonge sous zéro visuellement après un mark-read local suivi de l'echo
serveur) dégrade la crédibilité du temps-réel — précisément sur une feature récemment
retravaillée (manager RQ socket-driven).

### Technical impact
Aucune donnée persistée corrompue (cache RQ éphémère, `staleTime` élevé). Le refetch complet
(`refetch`, focus window) réaligne. Le défaut est purement dans la synchro optimiste du cache.

### Risk assessment
Très faible. Le correctif aligne le handler sur le contrat déjà respecté par les trois
mutations sœurs, en réutilisant le motif garde-`wasUnread` **exact** de
`useDeleteNotificationMutation`. Pour une notification déjà lue, comportement inchangé (garde
`false`).

### Proposed improvement
Dans `handleNotificationRead` : calculer `wasUnread` (la notif existe non-lue dans au moins
une page), décrémenter `page.unreadCount` **sous cette garde par page** (`foundUnread`), et
ne décrémenter la query `unreadCount()` que si `wasUnread`.

### Expected benefits
- Badge stable et correct sur le chemin socket (lecture cross-device) : `(3)` → `(2)`.
- Idempotence : self-echo / redelivery n'entraîne plus de double-décompte (page **et** query
  autonome).
- Convergence des quatre chemins de mutation non-lu vers un contrat unique.

### Implementation complexity
Triviale (~12 lignes de prod, motif copié de la mutation delete sœur).

### Validation criteria
- Test RED d'abord : page semée `unreadCount:2` + 2 non-lues + 1 lue. Fire
  `onNotificationRead('notif-1')` → `unreadCount` doit passer à **1** (échoue avant : reste 2).
- Idempotence : re-fire `onNotificationRead('notif-1')` → reste **1** (pas 0).
- Notif déjà lue (`notif-3`) : `unreadCount` inchangé (**2**), item marqué lu.
- Suite `use-notifications-query.test.ts` (sœur) intégralement verte (19/19), inchangée.

### Tests — absence de couverture confirmée
Aucun fichier de test pour `use-notifications-manager-rq.tsx` avant ce cycle (seul
`use-notifications-query.test.tsx` existait, couvrant les mutations, pas le handler socket).
Le chemin buggé était intégralement non testé. Nouveau fichier
`__tests__/hooks/queries/use-notifications-manager-rq.test.tsx` (3 tests).

---

## Suivis (backlog, non traités ce cycle)
- **`useMessageStatusDetails` key collision** (`use-message-status-details.ts:29` +
  `query-keys.ts:23`) : la clé `statusDetails(messageId)` omet l'argument `filter` qui change
  le résultat → collision latente `{filter:'read'}` vs `{filter:'unread'}` sous
  `staleTime: Infinity`. Défaut de cache-key réel mais **latent** (le seul appelant filtre
  côté client, ne passe jamais de `filter` non-défaut). Runner-up de ce cycle.
- **Composer mention left-boundary** : couvert par les PRs #1791/#1775 en vol.

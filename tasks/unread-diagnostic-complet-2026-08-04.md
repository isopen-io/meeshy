# Diagnostic COMPLET — états non-lus & consommation des notifications (2026-08-04)

Périmètre : gateway, web, iOS (+SDK, NSE, widgets), **Android**, service workers web, données de production.
Méthode : 8 audits de code exhaustifs + vérification des données prod (lecture seule).
État de départ : le cœur est déjà corrigé sur `fix/unread-read-sync` (PR #2560) — cascade gateway fiable,
`notification:read`/`deleted` émis, parité web, 5 trous iOS bouchés. Ce document couvre TOUT le reste.

---

## 0. Données de production (mesuré le 2026-08-04, lecture seule)

- **102 262** notifications, **74 915 non lues (73 %)** — la plus ancienne non-lue date du **28 janvier 2026**.
- Répartition des non-lues : `new_message` **66 216** (toutes avec `context.conversationId` → consommables par
  la cascade réparée), sociales avec `context.postId` **≈ 8 100** (friend_new_story 4 577, friend_story_comment 2 293,
  friend_new_mood 715, friend_new_post 507, post_like 120, …), **orphelines sans contexte** : `login_new_device` 159,
  `friend_request` 10.
- **Divergence `isRead`/`readAt` : 0** — le passage au prédicat `isRead` (G6) est sans risque de saut de badge.
- **Analyse fine (2e passe, jointure curseurs — CORRIGE la conclusion initiale)** : sur les 66 358 non-lues de
  type conversation, **58 596 (88 %) appartiennent à des destinataires SANS curseur de lecture** (jamais de
  mark-as-read : comptes dormants — top 8 inactifs depuis fin 2025 — ou clients Android dont le mark-as-read
  404 depuis toujours), 7 762 ont un curseur EN RETARD (réellement non lues), et **0 sont marquables**
  (la cascade au fil de l'eau avait déjà consommé tout ce qui était derrière un curseur). Backlog réparti sur
  236 comptes. **Conclusion corrigée : PAS de backfill technique à faire** — le script
  `scripts/reconcile-read-notifications.mongodb.js` (dry-run validé en prod : 0 éligible) reste comme filet
  idempotent, et l'assainissement réel passe par (a) le fix Android T1 et (b) une décision produit de
  RÉTENTION/expiration des notifications des comptes dormants.

---

## 1. GATEWAY — inventaire des types et chemins de consommation

Un seul point d'écriture (`NotificationService.createNotification`). Six chemins de consommation :
cascade conversation (A), cascade post (B), read-by-types (C), unitaire (D, émet `notification:read` depuis PR #2560),
read-all (E), suppression (F, émet `notification:deleted` unitaire).

### 1.1 Couverture par famille
- **Famille conversation** (new_message, user_mentioned msg, message_reaction, message_reply, missed_call,
  member_*, new_conversation_*, added_to_conversation) : `context.conversationId` posé → cascade A ✅.
  Exceptions : `removed_from_conversation` (le destinataire n'ouvrira jamais la conversation → cascade
  inatteignable en pratique) ; `member_left` et `translation_ready` = **code mort** (aucun créateur appelé).
- **Famille post/social** (post_like/story_reaction/status_reaction, post_comment, post_repost, comment_reply,
  comment_like, comment_reaction, story_new_comment, story_thread_reply, friend_story_comment,
  user_mentioned post/commentaire, friend_new_*) : `context.postId` posé → cascade B ✅.
  Détail : `comment_like` ne pose pas `context.commentId` (seulement metadata) contrairement à ses siblings.
- **Famille SANS cascade possible** :
  - `friend_request` : `context.friendRequestId` seul — clé NON supportée par `markContextNotificationsAsRead`
    (`'conversationId' | 'postId'` uniquement, NotificationService.ts:3864). Seule sortie : read-by-types (C),
    appelé par UN seul écran (iOS FriendRequestListView).
  - `friend_accepted` via `routes/friends.ts:519-523` : créé avec `conversationId: undefined` (« Sera ajouté
    après » — jamais fait, alors que `acceptedConversationId` existe à la ligne 605). Le chemin devices.ts:481 est correct.
  - **Orphelins durs, `context: {}`** : `system` (refus d'amitié friends.ts:526, liens partagés links/creation.ts:334),
    `password_changed`, `two_factor_enabled/disabled`, `login_new_device`. Priority high → push + email + badge,
    et AUCUN chemin de consommation en masse. 159 login_new_device non lues en prod le confirment.

### 1.2 Émissions manquantes / muettes
- **`data.notificationId` ABSENT du payload push** (NotificationService.ts:891-957) : aucun client ne peut
  marquer lu au tap d'une push. C'est LE trou structurant — il condamne les orphelins du §1.1 sur toutes les
  plateformes. `data.url` testé par les SW web n'est jamais peuplé non plus.
- `DELETE /notifications/admin/clear-all` (routes/notifications.ts:588) : `deleteMany({})` direct, zéro émission
  → toutes les cloches de tous les utilisateurs restent figées.
- `routes/friends.ts:486-505` : marquage friend_request en boucle `prisma.update` hors service → ni counts ni
  `notification:read`, N+1, filtre en mémoire.
- Cascades A/B, read-all, read-by-types, deleteAllRead : émettent `notification:counts` mais **jamais
  `notification:read`/`deleted` par ligne** → les autres appareils reçoivent le nouveau total sans savoir quelles
  lignes retirer (gras conservé jusqu'au refetch). Alternative économique à l'unitaire par ligne : un événement
  de PORTÉE (`notification:read-scope { conversationId | postId | types }`) que les clients savent appliquer localement.
- Pushes sans ligne de cloche (voulu, à garder cohérent) : appel entrant (CallEventsHandler:2093-2121),
  pushes silencieuses call_cancel/answered_elsewhere. Types déclarés jamais créés : `community_*`, `contact_*` (legacy).

---

## 2. WEB — périphérie (le cœur est corrigé)

### 🔴 Critiques
1. **Temps réel limité à /conversations** : `useSocketCacheSync` a UN call site (ConversationLayout.tsx:248).
   `conversation:unread-updated` et `message:new` sont reçus par le socket global (presence.service.ts:92-97)
   puis JETÉS sur `/`, `/feed/*`, `/notifications`, `/dashboard`, `/contacts`, `/search`… Les badges de
   conversations ne vivent que sur la page conversations.
2. **Cache conversations persisté 24 h JAMAIS revalidé au montage** : `useInfiniteConversationsQuery` sans
   `refetchOnMount:'always'` (use-conversations-query.ts:56-73) + staleTime Infinity + persist IndexedDB 24 h.
   Démarrage à froid = badges d'il y a 24 h. (Le défaut symétrique a été corrigé pour les notifications, pas
   pour les conversations.)
3. **Clic sur une push web = zéro consommation** (sw.js:206-214, firebase-messaging-sw.js:175-230) — bloqué en
   partie par l'absence de `notificationId` dans le payload (§1.2).
4. **/contacts ne consomme rien** : aucun appel `read-by-types` côté web (service sans méthode, module
   notification-read-sync sans scope `types`), accept/reject muets → friend_request/accepted non lues à vie
   hors clic unitaire.

### 🟠 Majeurs
5. Routage push DUPLIQUÉ et divergent : `buildNotificationTargetUrl` (2 copies SW) vs `getNotificationLink`
   (helpers) — stories/moods sans postType → /post au lieu de /story|/mood ; amis → /notifications au lieu de
   /contacts. Les DEUX SW sont vivants (sw.js scope / + firebase-messaging-sw.js via getToken sans registration)
   avec des stratégies de clic différentes (foreground ≠ background).
6. Badge OS PWA posé par le SW FCM et **jamais effacé** (les helpers de reset n'ont aucun appelant et postent
   vers le mauvais SW) ; `use-pwa-badge.ts` entièrement mort → badge applicatif jamais synchronisé.
7. `read-status:updated` : champs `lastReadAt`/`unreadCount` (sync multi-appareils du curseur) toujours ignorés
   (presence.service.ts:125-135) ; aucun listener sur `message:read-status-updated` (rupture programmée en fin
   de dual-emit).
8. **GET /notifications sur les pages publiques** : TabNotificationManager au layout racine sans garde d'auth,
   query sans `enabled` → fetch + retries non authentifiés sur /login, /join/*, etc.

### 🟡 Moyens
9. `/feed/reels` (ReelsFeedScreen) ne consomme pas les notifications des réels vus dans le flux (seule la page
   /reel/:id est corrigée).
10. `/search` : badges unread d'un fetch brut hors React Query — figés à vie de la page.
11. Clé `queryKeys.notifications.unreadCount()` écrite en 8 endroits, lue par personne.
12. `NOTIFICATION_CLICKED` → `window.location.href` (rechargement dur, perte du cache RQ).

### ⚪ Hygiène
13. Code mort : NotificationBell, ConnectionStatusIndicator (notifications), chaîne v2
    (use-conversations-v2 → ConversationSidebar → SplitViewLayout → ConversationItem v2), use-app-badge,
    use-push-notifications, useUnreadNotificationCountQuery, useNotificationCountsQuery,
    useDeleteAllReadNotificationsMutation, pwa-badge.syncWithServiceWorker, sw-registration.updateBadge.
14. use-tab-notification : deux listeners visibilitychange redondants, cleanup qui réécrit document.title.

---

## 3. iOS — périphérie (le cœur est corrigé)

### 🔴 Graves
- **G1 — Le réveil background écrase le badge à 0** : `contentAvailable:true` est posé sur TOUTES les pushes
  d'alerte (PushNotificationService.ts:780-782) → AppDelegate:187-208 exécute `syncNow()` sur un coordinateur
  VIDE au réveil à froid → `setBadgeCount(0)` + `unread_count=0` annulent l'aps.badge et le miroir NSE que la
  push venait d'écrire. Aggravé par : `userInfo["unreadCount"] as? Int` échoue (le gateway envoie une String)
  et `userInfo["conversationUnread"]` n'a AUCUN producteur (code mort).
- **G2 — Deux sémantiques pour une clé** : `aps.badge`/`data.unreadCount` = non-lus de la CLOCHE (gateway),
  `NotificationCoordinator.badgeTotal` = non-lus de MESSAGES (app) — les deux écrivent `unread_count`
  (App Group) et le badge d'icône, qui oscille entre les deux définitions. **Décision produit requise** (§6.1).
- **G3/G4/M5 — Les bannières système livrées ne sont jamais effacées à la lecture** :
  ni sur `notification:read` reçu (NotificationToastManager:591-595), ni sur `read-status:updated`
  (NotificationCoordinator:280-285), ni à l'ouverture in-app d'une conversation quand l'app est déjà active
  (le removeAll de MeeshyApp:577-580 ne joue qu'à la transition background→active).
- **G5 (T6) — L'aperçu long-press marque lu comme une vraie ouverture** (POST read serveur, badge à 0,
  notifications nées consommées). Correctif minimal identifié : propager `previewMode` au ViewModel et gater
  UNIQUEMENT `socketHandler?.activate()` (ConversationViewModel.swift:1030) — pas `start()`. Neutralise AUSSI
  le warm-up DEBUG (M1) qui tire `onConversationOpened("metadata-warmup")` (POST 404 + état fantôme).
- **G6 — Le swipe/menu « Marquer lu » de la liste ne consomme pas la cloche** : ConversationListViewModel:1522-1534
  n'appelle pas `onConversationMarkedRead` (contrairement aux quick-actions push/widget corrigées).

### 🟠 Moyens
- M2/M3 : tap sur les types système/sécurité/achievement/affiliate (et toast friend_request → profil) : on ouvre
  un écran SANS consommer la ligne.
- M4 : lecture par portée conversation/post non propagée aux autres appareils (dépend du correctif gateway §1.2).
- M6 : la NSE écrit le miroir widget sans `WidgetCenter.reloadAllTimelines()` (pas de WidgetKit dans la cible).

### 🟡 Faible / dette
- F1 : `firstUnreadMessageId` = code mort dupliqué (pas de séparateur « nouveaux messages » — le bouton
  scroll-down couvre le besoin).
- F2/F3 : NSE.applyBadge mort ; AppDelegate silent-push casts morts.
- F4 : double décrément transitoire cloche (écho `notification:read` à l'émetteur) — auto-corrigé par counts.
- F5 : `call_recording_ready` absent de MeeshyNotificationType → coercé .system.
- F6 : taps muets si conversationId/postId absents du payload.
- F7 : le widget décrémente `unread_count` de 1 par conversation — incohérent selon la sémantique retenue (G2).
- iPhone/iPad : AUCUNE divergence de consommation restante (vérifié chemin par chemin).

---

## 4. ANDROID — l'étage le plus cassé (rien ne fonctionne de bout en bout)

### 🔴 P0 — implémenté mais CASSÉ
- **T1 — Le mark-as-read n'atteint JAMAIS le serveur** : `@PATCH("conversations/{id}/read")`
  (ConversationApi.kt:46-47) alors que le gateway n'expose que des POST → **404 systématique**, outbox épuisée
  après 5 tentatives, et le prochain refresh REST **réhydrate le badge** depuis le serveur. Les badges Android
  ne se vident jamais durablement. Fix : 1 ligne (`@POST .../mark-as-read`).
- **T2 — Mode fenêtre** (payload `{}`) : sur-marquage massif dès que T1 est corrigé — aucun tracking de
  visibilité n'existe (pas de mode exact messageIds).
- **T3 — mark-as-read en session = no-op** : `markReadOptimistic` sort si `unreadCount == 0` au cache, or le
  cache n'est jamais incrémenté par le socket (la valeur de l'événement est ignorée, cf. T12).
- **T4 — AUCUN événement `notification:*` écouté** (0 occurrence dans apps/android) : pas de
  NotificationSocketManager, cloche figée, zéro sync multi-appareils, zéro temps réel.
- **T5 — Le tap sur une notification in-app ne NAVIGUE PAS** (NotificationsScreen.kt:109) : marquage seul,
  tout le NotificationContext (conversationId, postId, commentId…) est ignoré. Cul-de-sac UX.

### 🟠 P1 — pas implémenté
- T6 : aucun endpoint de marquage groupé déclaré (conversation/post/read-by-types absents de NotificationApi.kt).
- T7 : aucun compteur global (badge du menu radial jamais alimenté, unreadCount() jamais appelé, totalUnread
  de l'événement jamais lu).
- T8 : aucun badge d'icône launcher (`notificationBadgeEnabled` synchronisé au serveur mais inerte).
- T9 : notifications système jamais annulées à la lecture (aucun cancel() hors appels).
- T10 : `POST /posts/:id/view` = code mort (feed/réels/détail ne remontent aucune vue).
- T11 : onglet Demandes d'amis : ni temps réel ni consommation de notifications.

### 🟡 P2 — dette
- T12 : 3 refetch REST complets par frame socket (unreadUpdated/messageReceived/conversationUpdated →
  repository.refresh() sans debounce), la valeur absolue de l'événement suffirait.
- T13 : flows replay=0 → événements perdus hors écran Conversations.
- T14 : optimiste cloche sans rollback ni outbox.
- T15 : cloche jamais rechargée au retour d'écran.
- T16 : canal FCM `meeshy_notifications` ciblé par le gateway JAMAIS créé par l'app (+ pas de canal par défaut
  au manifeste) → pushes background sur canal de repli ; collision d'ID de notification (hashCode() de null = 0).
- T17 : push affichée même conversation ouverte (aucune notion de conversation active).
- T18 : séparateur « nouveaux messages » basé sur un unreadCount faussé par T1.

---

## 5. Matrice de consommation cible (où on en est après PR #2560)

| Surface ouverte | Gateway | Web | iOS | Android |
|---|---|---|---|---|
| Conversation | cascade A fiable ✅ | ✅ (corrigé) | ✅ | ❌ (T1/T6) |
| Post détail | cascade B ✅ | ✅ (corrigé) | ✅ | ❌ (T6/T10) |
| Réel | ✅ | page ✅ / feed réels ❌ (§2.9) | ✅ (corrigé) | ❌ |
| Story (par slide) | ✅ | ✅ (corrigé) | ✅ | ❌ |
| Commentaires | via scope post ✅ | ✅ | ✅ (corrigé) | ❌ |
| Demandes d'amis | C (read-by-types) | ❌ (§2.4) | ✅ | ❌ (T11) |
| Système/sécurité | ❌ aucun chemin de masse | ❌ | tap unitaire seul | ❌ |
| Tap push | ❌ pas de notificationId | ❌ (§2.3) | cascades seulement | ❌ |
| Multi-appareils (ligne précise) | unitaire ✅ / masse ❌ | unitaire ✅ | unitaire ✅ (+ bannières ❌) | ❌ (T4) |

---

## 6. Plan de correction priorisé (reste à faire)

### P0 — casse fonctionnelle visible
1. **Android T1** : `@PATCH` → `@POST("conversations/{id}/mark-as-read")` (1 ligne, débloque tout l'étage messages).
2. **iOS G1** : gater le `syncNow()` du réveil background (ne jamais écraser le badge quand le coordinateur
   n'est pas hydraté) + corriger le cast String de `unreadCount` ; gateway : cesser de poser
   `contentAvailable:true` sur toutes les pushes d'alerte OU envoyer un état exploitable.
3. **Gateway** : ajouter `notificationId` (et idéalement `url`) au `data` du push → débloque le marquage au tap
   sur les 4 plateformes, seul chemin possible pour les types orphelins.
4. **Web §2.1/§2.2** : consommer `conversation:unread-updated` globalement (abonnement au niveau layout connecté,
   réutilisant `setConversationUnreadInCache`) + `refetchOnMount:'always'` sur la liste de conversations.
5. **Données prod** : réconciliation one-shot — marquer lues les `new_message` dont `createdAt <= lastReadAt`
   du curseur de la conversation correspondante (66 216 lignes assainies d'un coup), et statuer sur le stock
   social/orphelin (expiration ? read-all assisté ?).

### P1 — cohérence produit et multi-appareils
6. Gateway : événement de portée (`notification:read-scope`) émis par les cascades A/B/C/E + friends.ts via le
   service (counts + scope) + clear-all admin qui émet.
7. iOS : effacer les bannières système sur notification:read / ouverture / read-status ; G6 (swipe → 
   `onConversationMarkedRead`) ; G5/M1 (gate previewMode sur `activate()`).
8. Web : /contacts + scope `types` (module + service + page) ; unifier le routage push sur UN SW ; marquage au
   clic de push (dépend de 3) ; badge PWA posé/effacé ; feed réels.
9. **Décision produit G2** : sémantique UNIQUE du badge d'icône (recommandation : total cloche = ce que le
   gateway envoie déjà, et faire converger NotificationCoordinator dessus) — puis aligner widget iOS (F7),
   badge web, badge Android (T8).
10. Android : NotificationSocketManager (new/read/deleted/counts), navigation au tap (le contexte est déjà là),
    endpoints groupés, annulation des notifications système, canal FCM `meeshy_notifications`.
11. Gateway : donner un contexte aux orphelins (friend_accepted → conversationId disponible ligne 605 ;
    system/sécurité → catégorie read-by-types consommée par l'écran notifications à l'ouverture) ; étendre
    `markContextNotificationsAsRead` à `friendRequestId`.

### P2 — dette
12. Suppression du code mort listé (§2.13, §3 F1-F2, gateway member_left/translation_ready, Android T10 si
    non câblé volontairement), read-exactness Android (T2), debounce des refetch Android (T12),
    listener `message:read-status-updated` web avant fin du dual-emit, `comment_like` → poser context.commentId.

## 6bis. Revue de code de la branche (2026-08-04) + P0 appliqués

Revue indépendante des 4 premiers commits : architecture validée (cascade indépendante du curseur, registre
partagé, counts absolus, gates miroirs web/iOS), aucun problème critique de données. Corrigé dans la foulée :
- **Bloquant** : sessions anonymes (liens de partage) → garde d'authentification CENTRALE dans
  `markScopeNotificationsRead` (plus 401 rejoués par withRetry) + `useSeenMessages` désactivé en anonyme
  (la route mark-as-read est `allowAnonymous: false`).
- Purge des entrées expirées de la Map de coalescing ; aria-label de la pastille i18n (clé
  `newMessagesWhileAway`, 4 locales × 2 namespaces) ; fermeture de la sheet commentaires iOS rendue
  insensible à l'ordre onDismiss/onDisappear (`claimedActivePost`).
- P0 appliqués dans le même lot : Android `@POST mark-as-read` (T1), guard d'hydratation
  `NotificationCoordinator.syncNow()` + cast String du unreadCount (G1), `notificationId` dans le data push,
  sync globale web de `conversation:unread-updated` + `refetchOnMount:'always'` conversations + query
  notifications gated auth.
- Restes documentés (non corrigés, volontaire) : duplication `unread-cache` vs
  `updateInfiniteConversationCache` (refactor à part), clamp iOS pendant la fenêtre app-backgroundée-socket-
  encore-connecté (décision assumée, miroir du sync engine), événements de portée multi-appareils (P1.6).

### Décisions produit à trancher (bloquantes pour certains items)
- **Badge d'icône = quel compteur ?** (messages, notifications, ou somme — G2/F7/T8 en dépendent)
- **L'aperçu long-press vaut-il lecture ?** (G5 — recommandation : non)
- **Politique du stock prod** : backfill + expiration des notifications anciennes (`expiresAt` existe sur les
  stories seulement).
- **`removed_from_conversation`** : consommer à la vue de la liste ? à l'affichage du toast ?

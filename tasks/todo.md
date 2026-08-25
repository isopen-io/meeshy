# Notifications in-app + indicateurs de frappe — 2026-08-25

## Règle produit (validée avec l'utilisateur)

1. **Un message rétracte la frappe qui l'annonçait.** L'arrivée d'un message d'un
   auteur éteint immédiatement son indicateur de frappe dans cette conversation,
   sur toutes les surfaces. Pendant exact de la règle déjà gravée
   (« typing:start reçu = preuve d'activité »).
2. **Toute notification arrive en bannière in-app quand l'app est au premier plan.**
   Seule exception : la conversation où l'on se trouve. Les toggles PAR TYPE restent
   honorés (les réglages gardent un effet) ; `pushEnabled`, Ne-pas-déranger et le
   Focus iOS ne gouvernent plus l'in-app — ce sont des filtres pour ne pas être
   dérangé quand on n'est PAS dans l'app.

## Lots

- [x] 1. Rétractation de la frappe par le message (web + iOS)
- [x] 2. Vitesse de rendu (prop morte `index` + memo web ; churn RootView iOS)
- [x] 3. Couverture in-app : ouvrir les gates sauf la conversation ouverte
- [x] 4. SyncPill remontée de 3× sa hauteur
- [x] 5. NotificationToastView opaque clair/foncé
- [x] 6. Vrai avatar dans l'indicateur de frappe en conversation
- [x] 7. Bouton scroll-to-bottom : avatars des frappeurs + points animés
- [x] 8. Bouton scroll-to-bottom stable pendant la frappe locale
- [x] 9. Fond de conversation opaque

## Ce qui a été fait, par site

| Lot | Site | Changement |
|---|---|---|
| 1 | `typing.service.ts` | `clearTypingForUser()` — retrait immédiat, annule le linger ; le linger 3 s reste pour la PAUSE |
| 1 | `messaging.service.ts` | `setTypingRetractor()`, appelé après le dedup et AVANT `decryptMessage` |
| 1 | `orchestrator.service.ts` | câble les deux services (le lien vit chez le propriétaire, hors socket) |
| 1 | `ConversationListViewModel.swift` | abonnement `messageReceived` → `handleTypingStopped` |
| 2 | `NotificationItem/List/Dropdown.tsx` | prop morte `index` retirée (elle invalidait `memo` sur toute la liste) |
| 2 | `use-notifications-manager-rq.tsx` | `useMemo` sur le `flatMap` |
| 2 | `NotificationToastManager.swift` | `activeConversationId`/`activePostId` dépubliés (churn racine) |
| 3 | `UserNotificationPreferences+Filter.swift` | `allowsInAppBanner(type:)` — seuls les toggles par type |
| 3 | `NotificationToastManager.swift` | gate `activePostId` retiré ; `focusFilterProvider` supprimé (plus aucun lecteur) |
| 4 | `SyncPill.swift`, `ConnectionBanner.swift` | `SyncPillMetrics.topLift` + `liftedTopPadding(base:)`, appliqué aux 3 hôtes qui ont de la marge |
| 5 | `NotificationToastView.swift` | fond opaque `backgroundPrimary(isDark:)`, `isDark` lu sur `ThemeManager` (même source que le texte) |
| 6/7 | `TypingParticipant.swift` (neuf) | type porteur userId + displayName + avatarURL, résolu LOCALEMENT |
| 6 | `MessageListViewController.swift` | `TypingIndicatorBubble` porte le visage, en mode bulles ET plat |
| 7 | `ConversationScrollControlsView.swift` | pile d'avatars + points animés par-dessus ; toutes les features existantes conservées |
| 8 | `ConversationView.swift` | `resolvedScrollButtonAnchor` — l'ancrage se fige pendant la rédaction |
| 9 | `ConversationAnimatedBackground.swift` | plancher opaque + teintes composées au lieu d'alphas |

## Décisions produit prises avec l'utilisateur

- **Bannière in-app** : seuls les interrupteurs PAR TYPE la gouvernent. `pushEnabled`, « Ne pas déranger »
  et le Focus iOS ne s'y appliquent plus — ils protègent l'attention d'un utilisateur ABSENT.
- **Conséquence signalée** : `MeeshyFocusFilter` / `MeeshyFocusStore` et leur App Intent n'ont plus de
  consommateur. À supprimer ou à rebrancher — décision produit laissée ouverte.
- **Story/post ouvert** : ne supprime plus la bannière (une seule exception au monde : la conversation ouverte).

## Faits mesurés à l'origine du chantier

| # | Site | Fait |
|---|---|---|
| A1 | `typing.service.ts:87` | `handleTypingStopWithDelay` retarde le retrait de 3 s ; l'expéditeur émet `typing:stop` à l'ENVOI ⇒ « X écrit… » survit 3 s au message affiché. |
| A2 | `useConversationTyping.ts` | aucun chemin `message:new` → retrait ; filet à 8 s. |
| A3 | `ConversationListViewModel.swift:940` | écoute `typingStarted`/`typingStopped`, jamais `messageReceived` ; nettoyage à 15 s. |
| A4 | `StatusHandler.ts` | le gateway n'émet aucun `typing:stop` implicite à la création d'un message. |
| B1 | `NotificationItem.tsx:32,44` | prop `index` MORTE ⇒ `memo` invalidé sur toute la liste à chaque insertion en tête. |
| B2 | `use-notifications-manager-rq.tsx:95` | `flatMap` sans `useMemo` ⇒ identité neuve à chaque rendu. |
| B3 | `RootView.swift:197`, `iPadRootView.swift:52` | `@ObservedObject NotificationToastManager.shared` ⇒ la racine se ré-évalue sur `unreadCount`/`activeConversationId`/`activePostId`/`currentToast`. Churn documenté par `ConversationSocketHandler.swift:137`. |

---

# Like / favori dans l'onglet Posts d'un profil — 2026-08-25

## Deux défauts DISTINCTS, tous deux prouvés

### A — Parité des flags personnels (CORRIGÉ)

`isLikedByMe` / `isBookmarkedByMe` / `isRepostedByMe` ne décrivent pas le post :
ils décrivent la RELATION DU LECTEUR au post. Servis séparément, ils mentent —
le SDK décode un champ absent en `?? false`.

Mesuré sur l'API réelle (`GET /posts/user/:id`) : `isLikedByMe` présent,
`isBookmarkedByMe` et `isRepostedByMe` **absents du JSON**, alors que
`GET /posts/bookmarks` contenait ce même post. Le favori existait, la surface ne
pouvait pas le savoir.

Audit des 6 méthodes servant des posts — **seule `getFeed` posait les trois** :

| méthode | avant | surface |
|---|---|---|
| `getFeed` | 3 flags | feed principal |
| `getUserPosts` | like seul | **onglet Posts d'un profil** |
| `getCommunityFeed` | like seul | feed de communauté |
| `getBookmarks` | AUCUN | écran Favoris (ne disait pas que ses posts sont en favori) |
| `enrichReelsForViewer` | like + favori | réels — commentaire « aligné sur getFeed » MENSONGER |
| `getStories` | like seul | stories (suivi, cf. plus bas) |

Correctif : `resolvePersonalFlags()` + `personalFlagsFor()` — un helper UNIQUE,
appliqué aux 5 sites, `getFeed` compris. C'est la recopie des deux requêtes qui a
produit la divergence ; il n'y a plus de recopie à faire diverger.

Gate : 876 suites / 19 750 tests gateway, 0 échec.

### B — Le bookmark répond 500 en PRODUCTION (diagnostiqué, NON corrigé)

`POST` et `DELETE /posts/:postId/bookmark` → **500 systématique**, sur tous les
posts testés. C'est lui qui produit le symptôme rapporté : le client applique
l'optimistic, l'appel échoue, `catch` → `bookmarkedOverrides[postId] = current`
→ « ça met et quitte immédiatement ».

Pire : **l'écriture est committée avant le 500.** La ligne `PostBookmark` a été
créée à `17:19:01.943Z` pendant un appel qui a rendu 500. Le client rollback
pendant que la base dit l'inverse — désynchronisation garantie.

Ce qui est PROUVÉ :
- le 500 survient AUSSI pour un `postId` inexistant, où `bookmarkPost` rend
  `null` sans aucun create ni update ⇒ l'exception naît APRÈS `bookmarkPost` ;
- le seul appel restant est `broadcastPostBookmarked(...)` — **le seul broadcast
  SYNCHRONE non protégé** du fichier ; le like protège le sien par `.catch()`,
  ce qui explique qu'il survive là où le favori tombe ;
- la prod tourne bien le code du dépôt (bundle vérifié) ;
- `POST_BOOKMARKED`, `ROOMS.feed` et `SocialEventsHandler` existent en prod.

Ce qui MANQUE : l'exception exacte. Les `fastify.log.error` de ces deux routes
sont muets en prod (défaut connu, 166 sites) — rien dans `docker logs`, rien dans
`/app/logs/error.log`.

**Non corrigé volontairement** : protéger le broadcast sans connaître la cause
serait masquer l'erreur. Décision à prendre — cf. rapport.

## Suivis ouverts

- `getStories` ne sert ni favori ni repost : à trancher (une story est-elle
  bookmarkable dans l'UI ?), pas supposé.
- `likeCount` / `bookmarkCount` sont stockés en **Long (int64)** sur les 763
  posts, alors que Prisma les déclare `Int`. Lecture OK aujourd'hui — noté comme
  anomalie de données, écartée comme cause du 500.
- Disque local PLEIN (100 %, 460 Gi) — a bloqué la session. 4 Go libérés en
  supprimant mes propres artefacts ; `apps/ios/Build` (10 Go) laissé intact car
  partagé.

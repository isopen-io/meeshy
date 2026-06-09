# Conversation perf + fluidité — plan (branche _pr405)

Cause racine (3 investigations convergentes) : boucle SwiftUI create/destroy auto-entretenue
à l'ouverture d'une conversation → centaines de `POST /notifications/.../read` + `GET unread-count`
→ 429 en cascade → réseau saturé → app lente partout. + thundering herd au démarrage. + vue bulles
qui reconstruit tout l'arbre SwiftUI à chaque reconfigure (`.equatable()` jamais câblé).

Décisions user : **simplification forte** des bulles + **portée complète** (tempête + vue + démarrage).

## TIER 1 — Tuer la tempête à l'ouverture (correctness + perf) ★ priorité 1
- [x] 1.1 Gate idempotent dans `NotificationToastManager.onConversationOpened` (early-return si déjà active) — casse la boucle à la source
- [x] 1.2 Coalescer/limiter `refreshUnreadCount` (1 GET au lieu de ~11 au démarrage)
- [x] 1.3 Garder le fix `[weak self]`/`didActivate` existant de `_pr405` (conservé)

## TIER 3 — Vue liste messages : simplifiée + ULTRA fluide ★ priorité 2
- [~] 3.1 ABANDONNÉ — `.equatable()` sur `ThemedMessageBubble` = footgun @State documenté (mémoire, prouvé sur cette vue) : casse le tap drapeau/sheets. ET n'aide pas le scroll-into-view. Levier réel = passes offscreen ci-dessous.
- [x] 3.2 Retirer l'ombre portée par bulle (`BubbleStandardLayout` shadow)
- [x] 3.3 Aplatir `BubbleBackground` (dégradés → couleur unie) — simplification forte
- [x] 3.4 Monter `BubbleReactionsOverlay` seulement si réactions (gate `hasOverflowingOverlay` réutilisé)
- [~] 3.5 ABANDONNÉ — `ConversationView` détient `@StateObject viewModel` (ObservableObject à invalidation grossière) : toute mutation `@Published` re-évalue déjà le body quoi qu'on lise. Découpler la ligne 891 = no-op ; vrai fix = split du VM (hors scope). La liste est déjà découplée (MessageStore).
- [x] 3.6 Précalcul `firstLinkURL` dans `BubbleContent` (NSDataDetector hors body, ×2 sites). `UIScreen.main.bounds` NON touché (bon marché + risque de drift hauteur cellules self-sizing)

## TIER 2 — Thundering herd au démarrage (perf) ★ priorité 3
- [x] 2.1 `loadConversations` : guard in-flight pleine fonction (coalesce les appels concurrents) — `performLoadConversations` + Task partagée
- [x] 2.2 `register-device-token` : guard in-flight avant le réseau (`inFlightTokenRegistration`)
- [x] 2.3 `prefetchRecentStories` : cache-first (skip si stories cache `.fresh`/`.stale`)

## Vérif
- [x] `./apps/ios/meeshy.sh build` vert (16s)
- [x] 3 nouveaux tests verts (firstLinkURL ×2, coalescing ×1)
- [x] 163 tests app verts (ConversationListViewModelTests + BubbleContentMatrixTests) — 0 régression
- [x] 14 tests SDK PushNotificationManagerTests verts — 0 régression
- [ ] Device-test user : ouvrir conversation = plus de storm 429, scroll fluide, bulles plates

## Review
Cause racine de la lenteur = boucle SwiftUI auto-entretenue à l'ouverture (throwaway VM/handler →
`onConversationOpened` → `@Published` → re-render parent → throwaway → …) générant des centaines de
`POST /read` + `GET unread-count` → 429 en cascade → réseau saturé. Tuée à la source par le gate
idempotent (1.1) + coalescing (1.2). Fluidité : suppression des passes offscreen par cellule
(ombre 3.2, double dégradé 3.3) + overlay réactions conditionnel (3.4) + NSDataDetector hors body (3.6).
Démarrage : coalescing loadConversations (2.1) + dédup device-token (2.2) + stories cache-first (2.3).
Abandons motivés : 3.1 (footgun @State prouvé sur cette vue), 3.5 (no-op vu l'invalidation grossière ObservableObject).

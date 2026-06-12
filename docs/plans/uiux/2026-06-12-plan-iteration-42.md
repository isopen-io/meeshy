# Plan — UI/UX Iteration 42 (2026-06-12)

Base : main @ 0977931 (post-merge PR #580). Branche : `claude/blissful-ritchie-fst8wf`.
Analyse source : `docs/analyses/uiux/2026-06-12-iteration-42.md`.

## Objectifs
1. Solder les carry-over iter-41 : hex iOS hors surface liens, polices fixes vues liens,
   AudioEffectTile, validation client ID conversation.
2. Corriger les findings des surfaces jamais auditées (profil web, NotificationBell, VideoPlayer,
   AuthViewModel/SettingsScreen Android).
3. Assurer la cohérence cross-frontend sur chaque sujet touché (cf. tableau de l'analyse).

## Checklist

### Web (apps/web)
- [x] PostCard.tsx : "Translate" → i18n ; divs cliquables → role/tabIndex/onKeyDown
- [x] LanguageOrb.tsx : role="button" + aria-label + clavier (si interactif)
- [x] u/[username]/page.tsx : "Profil" / erreurs → clés i18n (4 langues)
- [x] conversation/[conversationId]/page.tsx : validation ObjectId 24-hex avant fetch
- [x] NotificationBell.tsx : aria-label i18n avec interpolation count
- [x] ConversationHeader.tsx : clé `unreadInOtherConversations` garantie 4 langues, fallback retiré
- [x] conversation-details-sidebar.tsx : 3× "Loading..." → common.loading
- [x] AudioEffectTile.tsx : role/tabIndex/onKeyDown + aria-label (carry-over)
- [x] VideoPlayer.tsx : overlay + progress bar accessibles
- [x] MediaImageCard.tsx : aria-label sélecteur de langue
- [x] Switch.tsx : examiné, conforme — pas de changement
- [x] tsc --noEmit : aucune nouvelle erreur vs baseline

### iOS (apps/ios + packages/MeeshySDK)
- [x] MeeshyColors : + `errorHex`, `infoHex`
- [x] SettingsView : 37 remplacements hex → tokens
- [x] NotificationSettingsView : 38 remplacements
- [x] DataExportView : reliquat (2) ; ShareLinksView accentColor → brandPrimaryHex
- [x] OnboardingView / MessageComposer : conservés (design intentionnel, documenté)
- [x] LinksHubView/ShareLinksView/TrackingLinksView : 22 textes → styles Dynamic Type
- [x] accessibilityLabel boutons "plus" (LinksHub ×3 via param `createLabel`, ShareLinks ×1)

### Android (apps/android)
- [x] AuthViewModel/AuthUiState : `errorRes` @StringRes + `login_error_required` en/fr ;
      LoginScreen résout errorRes ?: errorMessage
- [x] SettingsScreen : `.clickable { }` mort → `onOpenProfile(userId)` (état + câblage NavHost)
- [x] Deep link `meeshy://profile/{userId}` : navDeepLink + intent-filter host=profile
- [ ] Compilation Gradle : impossible localement (pas de SDK Android dans l'environnement) —
      diff relu intégralement, validation par CI

## Vérification
- tsc web : baseline inchangée (validé par l'agent d'implémentation)
- JSON locales (8 fichiers) : validés
- Swift : pas de build possible sur Linux — diff relu, syntaxe vérifiée
- CI de la PR : gate finale avant merge dans main

## Continuité
- Mettre à jour `branch-tracking.md` après merge (base 43 = main post-merge PR iter-42)
- Différés listés dans l'analyse §Différés (stories Android, réactions PJ, qualité es/pt,
  validation stricte /chat/[id])

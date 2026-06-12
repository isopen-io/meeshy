# Plan — UI/UX Iteration 41 (2026-06-12)

Base : main @ f313ab23. Branche : `claude/blissful-ritchie-9vesx9`.
Analyse : `docs/analyses/uiux/2026-06-12-iteration-41.md`.

## Objectifs
1. Solder les 2 reports différés iOS de l'itération 40 (tokens hex liens, polices Feed)
2. Couvrir les surfaces jamais auditées : Settings/Contacts Android, modales affiliate/dashboard/admin web
3. Cohérence : toute la surface "liens" iOS (9 fichiers) passe sur les nouveaux tokens, pas seulement les 5 vues différées

## Tâches

### SDK iOS (MeeshyUI)
- [x] `MeeshyColors` : +`trackingAccent/Hex`, `shareAccent/Hex`, `communityAccent/Hex` (alias indigo600/indigo400/warning), +`successHex`, `warningHex`, `neutral500Hex`, `indigo300Hex`

### iOS — surface liens (9 fichiers, 68 occurrences hex → tokens)
- [x] TrackingLinksView, TrackingLinkDetailView : A855F7→trackingAccent, 888888→neutral500, 08D9D6→indigo300, 2ECC71→success, FF2E63→error, 6366F1→brandPrimary ; helpers `utmTag`/`detailActionButton`/`breakdownCard`/`breakdownRow`/`deviceColor` passent de `String` hex à `Color`
- [x] ShareLinksView, ShareLinkDetailView, CreateShareLinkView : 08D9D6→shareAccent, FF6B6B→warning, 4ECDC4→indigo300 ; `actionButton` → `Color`
- [x] CommunityLinksView, CommunityLinkDetailView : F8B500→communityAccent ; `communityActionButton` → `Color`
- [x] LinksHubView, CreateTrackingLinkView : params accentHex → constantes tokens
- [x] i18n : statusBadge Actif/Inactif, STATISTIQUES/INFORMATIONS/Identifiant/Créé le/Expire le (ShareLinkDetail), CONFIGURATION UTM/URL destination/Créé le (TrackingLinkDetail), ConversationType.displayLabel (8 libellés)
- [x] a11y : labels boutons retour/créer/copier (TrackingLinksView, CommunityLinksView)

### iOS — Feed (Dynamic Type + a11y + i18n)
- [x] FeedPostCard : 36 polices fixes → sémantiques ; icône translate (label + trait bouton + cible 32pt) ; drapeaux langue (labels VoiceOver) ; `timeAgo` localisé ; "Voir le profil"/"Feeds"/"Moi" localisés
- [x] FeedView : 14 polices fixes → sémantiques (13 icônes grandes tailles conservées, justifiées)

### Android
- [x] feature/settings : création res values + values-fr (23 clés), SettingsScreen entièrement sur stringResource
- [x] feature/contacts : création res values + values-fr (3 clés), ContactsScreen localisé
- [x] feature/feed : `feed_unknown_author` (fallbacks Unknown/Author)
- [x] feature/profile : `profile_avatar` + displayName prioritaire en contentDescription
- [x] sdk-ui MessageBubble : compteur réactions → typography.labelSmall

### Web
- [x] share-affiliate-modal : 100 % i18n (namespace affiliate, 4 locales), suggestions via tArray
- [x] CreateGroupModal : i18n (namespace dashboard) + a11y (bouton X aria-label, row role/tabIndex/onKeyDown) + dark mode bouton primaire
- [x] StatusComposer, PostComposer, AudioPostComposer, RepostModal : i18n namespace v2 existant
- [x] AgentConfigDialog + ConversationPicker : i18n namespace admin, accents corrigés, locale dynamique pour toLocaleDateString
- [x] PhoneField : placeholder localisé
- [x] Parité clés en/fr/es/pt vérifiée + JSON valides + tsc --noEmit sans nouvelle erreur

## Vérifications
- [x] Aucun hex hors charte restant sur la surface liens iOS (grep négatif)
- [x] Parité locales web 4 langues
- [x] Parité values/values-fr Android (script)
- [ ] CI verte sur la PR
- [ ] Merge dans main + mise à jour branch-tracking

## Continuité itération 42
Reprendre les différés listés en fin d'analyse 41 (hex iOS hors liens par surface : SettingsView,
NotificationSettingsView, OnboardingView, DataExportView ; ContactsTab enum Android ; parité stories
Android ; réactions par pièce jointe web/Android).

---

## Addendum — passe parallèle PR #580 (branche claude/blissful-ritchie-68j2oq)

Tâches additionnelles réalisées par la passe parallèle, hors périmètre ci-dessus :
- [x] Android : deep link `meeshy://chat/{conversationId}` (navDeepLink + intent-filter host=chat)
- [x] Android : onglets ContactsScreen localisés (labelRes, 4 clés en+fr) — solde le différé « ContactsTab enum »
- [x] Android : ellipsis email SettingsScreen
- [x] Web : i18n routes `app/` (l/[token], chat/[id] état erreur → JoinError, forgot-password,
      communities/[id], search Rejoindre, signup Retour) — 4 langues
- [x] Web : dark mode admin/users/new (textarea/selects/hints), truncate admin/users/[id]
- [x] iOS : DataExportView FF6B6B → MeeshyColors.error ; overloads ThemeManager(tint: Color)
- [x] Résolution des conflits avec la PR #577 (périmètre recouvrant → version main retenue)

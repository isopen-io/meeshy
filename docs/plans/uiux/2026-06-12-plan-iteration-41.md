# Plan — UI/UX Iteration 41 (2026-06-12)

> Base: main @ 1c7d571 (merge PR #578). Continuité: clôture des reliquats différés de l'itération 40
> (hex colors iOS, fonts Feed) + nouveaux audits ciblés sur les axes peu couverts (deep links Android,
> i18n modules manquants, a11y boutons copy).

## Périmètre

### iOS (carry-over iter-40 + nouvelles trouvailles)
- [ ] **Décision tokens (actée)** : mapper les accents off-brand des écrans liens vers la palette de marque
      (règle SDK « new code MUST use indigo50–950 or semantic names ») :
      `A855F7` → `trackingAccent = indigo600`, `08D9D6` → `shareLinkAccent = indigo400`,
      `F8B500` → `communityAccent = warning`, `888888` → `inactiveState = neutral400`,
      `FF6B6B` → `error`, `2ECC71` → `success`, `4ECDC4`/`6366F1` → `indigo500`.
      Nouveaux alias ajoutés dans `MeeshyColors.swift` (section Feature Accents).
- [ ] Remplacement des ~34 hex dans TrackingLinks*/ShareLink*/CommunityLink*/CreateTrackingLink/CreateShareLink + DataExportView
- [ ] FeedPostCard/FeedView : migration ~40 polices fixes → Dynamic Type (.body/.headline/.callout/.caption/.caption2)
- [ ] i18n : ShareLinkDetailView "Actif/Inactif", TrackingLinkDetailView "CONFIGURATION UTM" + labels infoRow
- [ ] A11y : accessibilityLabel sur boutons copy icône-seuls (TrackingLinksView, ShareLinksView, CommunityLinksView)
      et sur les 4 actions de TrackingLinkDetailView

### Android (continuité iter-24/40 + nouvelles trouvailles)
- [ ] **CRITIQUE** : modules `feature/settings` et `feature/contacts` sans `res/` — créer strings.xml en+fr,
      convertir SettingsScreen (20+ chaînes) et ContactsScreen (3 chaînes + noms d'onglets enum.name)
- [ ] **Deep link chat (reliquat iter-24 A12, toujours absent)** : `navDeepLink meeshy://chat/{conversationId}`
      sur la destination chat + `<data>` host dans AndroidManifest
- [ ] SettingsScreen : email sans maxLines/ellipsis ; contentDescription "Back" hardcodée
- [ ] Touch targets : avatars NotificationsScreen 44dp / FeedScreen 40dp — corriger seulement si cliquables

### Web (selon audit — axes non couverts par iter 1–40)
- [ ] Audit ciblé deep links/scroll-to-message, dark mode récent, sélection/copie, alignements/truncate,
      focus-visible, i18n restant hors fichiers déjà traités
- [ ] Corrections selon trouvailles (complété après audit — voir analyse)

### Différés reconduits
- Réactions par pièce jointe web/Android (parité feature iOS) — nécessite wiring gateway
  `attachment:reaction-*`, dépasse une passe UI/UX.

## Cohérence cross-frontend
- iOS modifié (couleurs liens) → vérifier que web utilise déjà des tokens pour ses écrans liens ;
  les écrans liens n'existent pas sur Android (rien à aligner).
- Android modifié (deep link chat) → web gère déjà /chat/:id ; iOS a ses deep links (15 routes, iter-1).
- i18n : chaque chaîne ajoutée l'est en fr ET en sur les deux plateformes mobiles.

## Sortie
1. Analyse : `docs/analyses/uiux/2026-06-12-iteration-41.md`
2. Implémentation sur `claude/blissful-ritchie-68j2oq`
3. PR vers main, CI verte, merge, mise à jour `branch-tracking.md`

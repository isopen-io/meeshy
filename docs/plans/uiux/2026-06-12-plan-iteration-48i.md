# UI/UX Plan — Iteration 48i (2026-06-12)

## Base
Branche `claude/wizardly-rubin-ph295e`, synchronisée fast-forward sur `main` HEAD
`7659cb0e` (merge PR #610 = itération 47w), conformément au protocole branch-tracking.

## Objectif
Solder la « passe dédiée reliquats ancienne palette » du différé 45i, côté app iOS
exclusivement, avec la logique d'épuration de la routine : supprimer le code mort au lieu
de le repeindre, et mapper le vivant sur les tokens `MeeshyColors` de la charte Indigo.

## Étapes
- [x] Sync branche ← main (fast-forward 7659cb0e)
- [x] Audit grep trio `08D9D6|FF2E63|4ECDC4` sur apps/ios (app + widgets + tests)
- [x] Audit liveness (subagent Explore) : composers feed dupliqués → `FeedComposerSheet`
      + `composerOverlay` vivants ; bloc `ThemedFeedComposer`→`FeedAction` mort
- [x] Épuration : suppression `SampleData.swift` (différé 45i) + `MessageComposer.swift`
      (mort découvert) + pbxproj (8 entrées) + bloc mort RootViewComponents (697–1113)
      + commentaires d'index (Models.swift, RootView.swift)
- [x] Re-peinture charte : RootViewComponents (3 LIVE), FeedView (8), FeedView+Attachments
      (10), WidgetPreviewView (7), AttachmentPreparationService (3),
      ConversationAnimatedBackground (2), MeeshyWidgets (2 + miroir `indigo400Hex`),
      singles (ConversationInfoSheet, MemberManagementSection, BlockedUsersView,
      UserStatsView ×1, AboutView ×5, MediaDownloadSettingsView ×1)
- [x] A11y : 6 `.accessibilityLabel` manquants sur la toolbar FeedComposerSheet
- [x] i18n : 4 labels FR durs WidgetPreviewView → clés `widget.preview.action.*`
      ×5 locales dans Localizable.xcstrings (format Xcode préservé)
- [x] Documenter l'intentionnel : filtre story « cool » (`08D9D6` = contenu artistique)
- [x] Vérifs : équilibre braces/parens, JSON xcstrings valide, zéro occurrence trio
      restante hors intentionnel, imports MeeshyUI présents
- [ ] CI verte (ios-tests.yml compile l'app — valide les éditions pbxproj) puis merge PR
      dans main, suppression de la branche, mise à jour branch-tracking + status analyse

## Risques & parade
- Éditions pbxproj sans build local → couvertes par la CI iOS (compile + tests) ;
  en cas d'échec CI, re-diagnostic et correctif sur la même branche avant merge.

## Review
Périmètre tenu : aucune modification SDK (`packages/MeeshySDK`) hors périmètre ; les
occurrences SDK découvertes sont consignées au différé 48i pour l'itération iOS suivante.
Bilan : −1 027 lignes de code mort, 0 hex pré-charte restant côté app (1 intentionnel
documenté), +4 clés i18n, +6 labels VoiceOver.

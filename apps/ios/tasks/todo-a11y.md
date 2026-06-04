# Plan de remédiation accessibilité — suivi d'exécution

Référence : `apps/ios/Documentation/ACCESSIBILITY_AUDIT.md` (rapport directif complet).
Contraintes transverses : **iOS 16+ baseline** (API version-adaptatives via `Compatibility/`),
**généricité** (helpers SDK réutilisables), **configurabilité utilisateur**, réutiliser/compléter
l'existant. Build réel sur macOS via `./apps/ios/meeshy.sh` (pas de toolchain Swift sur l'env Linux
d'édition → revue statique + tests écrits, compilation déléguée à macOS/CI).

Boucle : implémenter → relire/review → corriger → passer à la phase suivante. On ne clôt pas tant
qu'il reste des erreurs/bugs/soupçons.

## Phase 0 — Infrastructure (SDK + wiring app) — ✅ implémentée (build macOS à valider)
- [x] `Compatibility/AdaptiveAccessibility.swift` — annonces VoiceOver version-adaptatives
      (iOS17+ `AccessibilityNotification.Announcement` + priorité `.high/.default/.low` ; iOS16
      `UIAccessibility.post`), `screenChanged`/`layoutChanged`, `isAssistiveTechRunning`.
      API priorité vérifiée vs doc Apple WWDC23.
- [x] `Theme/Accessibility.swift` — `meeshyAnimation(_:value:)` (reduce-motion-aware, ORe système
      + override in-app), `meeshyTapTarget(_:)`, `accessibilityDecorative()`,
      `MeeshyFont.relative(_:weight:design:)` + `textStyle(for:)` (Dynamic Type), `MeeshyA11yID`,
      `MeeshyAccessibilityPreferences` (store configurable, UserDefaults), env `meeshyForceReduceMotion`,
      `MeeshyMotion.shouldReduce` (pur, nonisolated).
- [x] `SkeletonView.swift` — shimmer gardé Reduce Motion + skeletons `.accessibilityHidden(true)`.
- [x] `ToastView.swift` — élément a11y groupé (`.ignore` + label + trait bouton).
- [x] `ToastManager.swift` — annonce VoiceOver + durée VO-aware (funnel `present`, `dismissDelay` pur).
- [x] `MeeshyApp.swift` — injection env `meeshyForceReduceMotion` + identifiant overlay toast.
- [x] Tests SDK (`AccessibilityHelpersTests`) + app (`ToastManagerTests.dismissDelay`).
- [x] Review statique Phase 0 (isolation MainActor, iOS16 availability, API iOS17 vérifiée).
- [ ] **À valider sur macOS** : `./apps/ios/meeshy.sh build` + `xcodebuild test -scheme MeeshySDK-Package`
      (pas de toolchain Swift sur l'env d'édition Linux).

## Phases suivantes (cf. rapport §8)
- [ ] Phase 1 — Conversation (bulle .combine→.contain, composer, annonces, delivery, audio)
- [ ] Phase 1 — Stories (auto-avance vs VoiceOver, actions, texte canvas, tray)
- [ ] Phase 1 — Appels (annonce appelant, raccrochage, cibles)
- [ ] Phase 1 — Feed (PostDetail actions, cellules UIKit, tuiles média)
- [ ] Phase 1 — Caméra / téléchargement média / seek audio
- [ ] Phase 2 — Toggles Privacy/Notifications, textContentType, annonces formulaires, pickers/QR/charts
- [ ] Phase 3 — Dynamic Type (migration), cibles tactiles, Reduce Motion, .isSelected, MeeshyStatusDot
- [ ] Phase 4 — Identifiants, décoratifs masqués, localisation, code mort

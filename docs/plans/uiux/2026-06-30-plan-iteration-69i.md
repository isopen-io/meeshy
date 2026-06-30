# Plan — Iteration 69i (2026-06-30) — iOS a11y : labels des boutons retour icône-seule

## Objectif
iOS exclusivement. Combler un gap d'accessibilité VoiceOver : des en-têtes custom rendent
un bouton retour `chevron.left` **icône-seule** sans `accessibilityLabel` → VoiceOver
annonce « chevron.left ». Ajouter le label SSOT `a11y.back` (déjà traduit 5 locales).
Bornée, **purement additive**, zéro changement visuel.

## Base
- Branche : `claude/upbeat-euler-ydfj5g`, resynchronisée sur `main` HEAD (post-#1073).
- Numéro **69i** (après le plus haut réclamé par les PR iOS en vol : 68i / #1080).

## Changements (1 ligne/fichier — `.accessibilityLabel(String(localized: "a11y.back", bundle: .main))`)
1. [x] `apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift`
2. [x] `apps/ios/Meeshy/Features/Main/Views/UserStatsView.swift`
3. [x] `apps/ios/Meeshy/Features/Main/Views/ShareLinksView.swift`
4. [x] `apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift`
5. [x] `apps/ios/Meeshy/Features/Main/Views/NewConversationView.swift`
6. [x] `apps/ios/Meeshy/Features/Main/Views/ThreadView.swift`
7. [x] `apps/ios/Meeshy/Features/Main/Views/LoginView.swift` (retour « désélectionner compte »)

## Hors-scope (volontaire — épuration / orthogonalité)
- En-têtes avec texte visible « Retour » (VoiceOver lit le texte) → déjà conformes.
- Boutons déjà labellisés (`CommunityLinksView`/`TrackingLinksView`/`ParticipantsView`/
  settings data/légal) et `ThemedBackButton` (référence) → non touchés.
- `GlobalSearchView`/`MentionSuggestionPanel`/`MiniAudioPlayerBar`/`LocationPickerView` →
  **en vol** (#1076/#1080/#1083), ne pas toucher (orthogonalité).
- `ContactCardView` hex `#2ECC71`/`#3498DB` → couleurs de contenu, PAS `success`/`info`.

## Vérification
- Pas de build local (SwiftUI/UIKit absent sur Linux) → **CI `ios-tests.yml`** = gate compile.
- Clé `a11y.back` présente + traduite 5 locales dans `apps/ios/Meeshy/Localizable.xcstrings`
  (vérifié) ; forme identique à `ThemedBackButton`.
- `grep` final : les 7 sites portent `a11y.back` ; aucun autre bouton retour icône-seule
  ne reste non labellisé (hors faux positif `ThemedBackButton`, déjà labellisé L118).

## Merge
- [ ] Push `claude/upbeat-euler-ydfj5g`, PR → `main`, merge après CI verte.
- [ ] Conflits attendus sur `branch-tracking.md` (3 PR iOS parallèles touchent la même zone) :
      résoudre en append-only (History) au merge, conserver toutes les lignes.
- [ ] Mettre à jour `branch-tracking.md` : base 70i+ = `main` post-merge 69i. Supprimer la branche.
# Plan — Iteration 69i (2026-06-30)

## Objectif
iOS only. Poursuivre l'adoption native iOS 26 Liquid Glass sur la dernière grosse surface de
chrome flottant non convertie (`ReplyThreadOverlay`, carte modale de thread de réponses) et
épurer l'a11y de l'overlay (bouton fermeture sans label, drag-indicator + skeleton décoratifs).
Itération bornée, « logique épurée », continuité directe de 51i/68i.

## Base
- Branche : `claude/upbeat-euler-dgnlfu` (resynchronisée sur `main` HEAD `b0c15b6`, post-#1081).

## Changements

### 1. `apps/ios/.../Views/ReplyThreadOverlay.swift` (app)
- [x] Carte de thread : `.background(RoundedRectangle(18).fill(theme.surfaceGradient(tint:))
      .overlay(stroke))` → `.adaptiveGlass(in: RoundedRectangle(cornerRadius: 18, style:
      .continuous), tint: Color(hex: accentColor).opacity(0.18))` + `.overlay(stroke)` conservé
      (liseré de marque) + `.clipShape(18)` + ombre d'accent inchangés.
- [x] Bouton de fermeture (`xmark.circle.fill`) → `.accessibilityLabel("common.close" → « Fermer »)`
      (réutilisation clé i18n existante).
- [x] `dragIndicator` (capsule décorative) → `.accessibilityHidden(true)`.
- [x] `skeletonContent` (3 lignes shimmer décoratives) → `.accessibilityHidden(true)`.
- [x] Scrim de fond + fonds de lignes du thread : **inchangés** (contenu, pas du chrome —
      conforme doctrine Liquid Glass).

### 2. Tests
- [x] Aucune extension requise : `CompatibilityLayerTests` couvre déjà `RoundedRectangle` +
      la variante teintée d'`adaptiveGlass` (lignes 70/85, ajoutées par 68i). La surface API de
      69i est donc déjà exercée.

## Vérification
- [x] `grep` : `surfaceGradient` n'est plus référencé dans le fichier (n'était utilisé que par
      le card converti) ; `adaptiveGlass` appliqué après le `.frame(maxHeight:)` (« apply LAST
      after sizing »), forme du verre == forme du `.clipShape` (pas d'artefact de clip).
# Plan — Iteration 69i (2026-06-30)

## Objectif
iOS only. Épuration palette : remplacer les couleurs **sémantiques** codées en dur
(`#2ECC71` → vert état, `#3498DB` → bleu info) par les tokens `MeeshyColors.success` /
`MeeshyColors.info`. Solde le différé explicite de 68i. Itération bornée, « logique
épurée », zéro changement de comportement/layout.

## Base
- Branche : `claude/upbeat-euler-ddel9j` (resynchronisée sur `main` HEAD `3b0b596`,
  post-#1088 / post-53i / post-68i).

## Changements

### 1. `apps/ios/.../Components/ContactCardView.swift` (app)
- [x] Icône téléphone : `Color(hex: "2ECC71")` → `MeeshyColors.success`.
- [x] Icône email : `Color(hex: "3498DB")` → `MeeshyColors.info`.
- [x] Inchangé : `Color(hex: accentColor)` (dynamique), liséré dégradé, `adaptiveGlass`.

### 2. `apps/ios/.../Views/AffiliateView.swift` (app)
- [x] Icône partager : `Color(hex: "2ECC71")` → `MeeshyColors.success` (cohérence avec le
      bouton frère « supprimer » déjà en `MeeshyColors.error`).

### 3. Exclusions documentées (aucune édition)
- [x] `FeedView+Attachments.swift:1011` dégradé location `[#2ECC71, #27AE60]` : **laissé**
      (dégradé décoratif, `#27AE60` sans token). Documenté dans l'analyse.

## Vérification
- [x] `grep` : plus aucun `Color(hex: "2ECC71")`/`Color(hex: "3498DB")` en foreground
      sémantique ; seul subsiste le dégradé location (exclu, décoratif).
- [x] `MeeshyColors` résolu app-wide via `@_exported import MeeshyUI` — aucun import ajouté.
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur) — seule vérif de build (pas de
      build SwiftUI local sur Linux).

## Merge
- [ ] Push `claude/upbeat-euler-dgnlfu`, PR → `main`, merge après CI verte. Supprimer la
- [ ] Push `claude/upbeat-euler-ddel9j`, PR → `main`, merge après CI verte. Supprimer la
      branche. Mettre à jour `branch-tracking.md` (base 70i = main post-merge 69i).
# Plan — Iteration 69i (2026-06-30) — iOS

## Objectif
Épuration palette : remplacer les deux couleurs flat hors-charte de `ContactCardView`
(icônes téléphone/e-mail) par les tokens sémantiques `MeeshyColors`. Solde le différé
« Palette tokens » de 68i. Borné, sans surcharge.

## Branche
- Partie de `origin/main` (HEAD `896c4c4`).
- Branche de dev : `claude/upbeat-euler-6wx5br`.

## Changements
1. `apps/ios/Meeshy/Features/Main/Components/ContactCardView.swift`
   - `+ import MeeshyUI` (pour accéder au type nommé `MeeshyColors` ; pattern frère établi).
   - icône `phone.fill` : `Color(hex: "2ECC71")` → `MeeshyColors.success`.
   - icône `envelope.fill` : `Color(hex: "3498DB")` → `MeeshyColors.info`.

## Hors-scope (délibérément)
- Les `Color(hex: accentColor)` (accent déterministe conversation) — conservés.
- Les `color: "3498DB"`/`"2ECC71"` ailleurs (identité de teinte de section, autre pattern).

## Vérification
- CI `ios-tests.yml` : compile Xcode 26.1.x (Swift 6.2) + tests simulateur iOS 18.2.
- Aucun test ne rend ces hex (seul `MessageModelsTests` SDK référence `SharedContact`,
  au niveau modèle — pas de couleur). Pas de régression de test attendue.

## Définition de terminé
- CI iOS verte → merge dans `main` → branche supprimée → traçage mis à jour.
# Plan — Iteration 69i (2026-06-30) — iOS

## Objectif
Solder le différé 68i (« `ContactCardView` hex → tokens ») en l'élargissant à **tous** les
indicateurs *sémantiques* de statut/confirmation encore en hex génériques hors-charte, alignés
sur les tokens `MeeshyColors` (success/warning/info). Pure épuration palette, zéro logique.

## Base de départ
- Branche tirée de `origin/main` (dernier merge `dfdcd28`, iter 71wb web).
- Branche de travail : `claude/upbeat-euler-gzrxp1` (réinitialisée sur main pour éviter toute divergence).

## Étapes
1. [x] `ContactCardView.swift` (app) : `import MeeshyUI` ; téléphone `#2ECC71`→`MeeshyColors.success`,
       email `#3498DB`→`MeeshyColors.info`.
2. [x] `MeeshyAvatar.swift` (SDK) : `dotColor` online→`success`, away→`warning`.
3. [x] `UserIdentityBar.swift` (SDK) : présence (dot + label) online→`success`, away→`warning`.
4. [x] `UserProfileSheet.swift` (SDK) : `e2eeBadge` ×4 `#2ECC71`→`MeeshyColors.success`.
5. [x] `VoiceRecordingView.swift` / `VoiceProfileWizardView.swift` / `VoiceProfileManageView.swift`
       (SDK) : checkmarks/waveform « prêt » → `MeeshyColors.success`.
6. [x] `LiveLocationBadge.swift` (SDK) : dot pulsant live → `MeeshyColors.success`.
7. [x] Vérifier qu'aucun reste `#2ECC71`/`#F39C12` sémantique ne subsiste (les restes = ladders
       catégoriels, hors-scope, laissés intacts).
8. [ ] Commit + push `claude/upbeat-euler-gzrxp1` ; attendre CI `ios-tests.yml` verte.
9. [ ] Merge dans `main` après CI verte ; mettre à jour `branch-tracking.md` ; supprimer la branche.

## Vérification
- Gate = CI `ios-tests.yml` (compile MeeshyUI + app, smoke tests présence existants).
- Aucun nouveau test : swap pur literal→token, pas de comportement testable
  (`dotColor` est `private` ; couverture structurelle existante suffisante).

## Risques
- Faible. Changement visuel mineur (vert générique → emeraude de marque, orange générique →
  ambre de marque). Aucun snapshot/baseline n'assertait ces hex.
# Plan — Iteration 69i (2026-06-30)

## Objectif
Continuer le ladder d'adoption iOS 26 Liquid Glass sur les **toolbars/headers de contrôle
flottant interactif au-dessus du contenu** restants (continuation 51i → 52i → 68i → 69i).
**iOS exclusivement.**

## Branche
- Développement : `claude/upbeat-euler-qbf015` (réinitialisée depuis `origin/main` @ #1083).
- Merge dans `main` après CI `ios-tests.yml` verte. Voir `branch-tracking.md`.

## Changements (3 fichiers prod + 1 test)
1. `apps/ios/Meeshy/Features/Main/Views/CallEffectsOverlay.swift`
   - `secondaryToolbar` : `.background(.ultraThinMaterial).clipShape(Capsule())`
     → `.adaptiveGlass(in: Capsule())`. Verre neutre (pas d'accent en scope appel).
2. `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift`
   - en-tête de recherche in-conversation (`searchBar`) :
     `.background(RoundedRectangle(16).fill(.ultraThinMaterial).shadow)`
     → `.adaptiveGlass(in: RoundedRectangle(cornerRadius: 16), tint: Color(hex: accentColor).opacity(0.12))`
       + `.shadow` en aval (pattern établi).
3. `packages/MeeshySDK/Tests/MeeshyUITests/Compatibility/CompatibilityLayerTests.swift`
   - Smoke test : ajouter un cas `Capsule()` (forme non couverte jusqu'ici).

## Vérification
- [x] Imports OK (`CallEffectsOverlay` importe `MeeshyUI` ; `ConversationView+MessageRow`
      importe `MeeshyUI`).
- [x] `accentColor` en scope dans l'extension `ConversationView` (utilisé lignes 96/105…).
- [x] Pattern shadow-après-glass conforme à `ContextActionMenu`/`LocationPickerView`.
- [x] Forme `Capsule()` ajoutée au smoke test.
- [ ] CI `ios-tests.yml` verte (compile Xcode 26.1.x + tests simu 18.2).

## Doctrine respectée (exclusions documentées)
- `searchResultsBanner` (bannière non-interactive) : exclu (verre = chrome interactif).
- Champ de saisie interne (fond plat opaque) : exclu (anti verre-sur-verre).
- `AudioEffectsPanel`/`VideoFiltersPanel` (cartes stateful in-scroll) : MARGINAL, hors scope.

## Suite (différés)
- `MessageOverlayMenu` (lot dédié, `AdaptiveGlassContainer`).
- `ContactCardView` palette (`#2ECC71`/`#3498DB` → `MeeshyColors.success`/`.info`).
- Ladder catégoriel arc-en-ciel ; grandes surfaces polices figées.

## Status : ⏳ développement terminé — push + CI ; merge après CI verte.

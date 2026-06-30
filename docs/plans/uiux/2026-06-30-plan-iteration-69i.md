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
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur) — seule vérif de build (pas de
      build SwiftUI local sur Linux).

## Merge
- [ ] Push `claude/upbeat-euler-dgnlfu`, PR → `main`, merge après CI verte. Supprimer la
      branche. Mettre à jour `branch-tracking.md` (base 70i = main post-merge 69i).

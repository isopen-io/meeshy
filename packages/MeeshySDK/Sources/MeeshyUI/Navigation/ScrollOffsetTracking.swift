import SwiftUI

// MARK: - iOS 18+ scroll-offset tracking

public extension View {
    /// Tracks a vertical `ScrollView`'s content offset on **iOS 18+**, where the
    /// `.onPreferenceChange`-based reader stops re-firing on scroll — it delivers
    /// only the initial value, so a `CollapsibleHeader` driven by it never collapses
    /// or reveals (verified on iOS 18.2 and iOS 26). Reports `contentOffset.y`
    /// (0 at the top, positive scrolling down). No-op on iOS 16–17, which keep the
    /// `.onPreferenceChange` + `ScrollOffsetPreferenceKey` path.
    ///
    /// Pair it with the existing preference reader so both iOS ranges are covered:
    /// ```
    /// ScrollView { content }
    ///     .coordinateSpace(name: "scroll")
    ///     .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollOffset = $0 } // iOS 16–17
    ///     .trackScrollContentOffset { scrollOffset = -$0 }                          // iOS 18+
    /// ```
    /// The negation matches the `minY` sign the preference path produces (negative
    /// while scrolling down), so `CollapsibleHeader`'s `progress = -scrollOffset / 60`
    /// behaves identically across iOS versions. The value is taken RELATIVE to
    /// the top content inset (`contentOffset.y + contentInsets.top`) so that the
    /// rest position reads `0` whatever the container adds above the content —
    /// a `.safeAreaInset(edge: .top)` (Lentille sticky sticker band) shifted the
    /// raw offset by its height and left the pull indicator stuck at 27 % and
    /// the collapsing header 44 pt late (2026-08-21). Containers using the
    /// ZStack-overlay + `Color.clear` spacer pattern have no inset: unchanged.
    ///
    /// **N'Y METTEZ JAMAIS DE DEBOUNCE** (réserve R-g,
    /// `tasks/lentille-workshop-execution.md` §8). Ce point est le SOMMET de la
    /// chaîne d'offset : ce qu'il émet devient, via `MeeshyRefreshableScroll` →
    /// `ScrollOffsetRelay`, la cadence du header repliable, de la pilule de
    /// section ET de l'élection de la focus card de la Lentille — laquelle est
    /// contractuellement tenue de suivre le défilement à la cadence de
    /// l'affichage. Une fenêtre ajoutée ici pour lisser UN consommateur les
    /// dégraderait tous les trois, et rien dans `Lentille/` ne le montrerait :
    /// c'est `LentilleFocusElectionCadenceTests` qui garde ce fichier.
    @ViewBuilder
    func trackScrollContentOffset(_ onChange: @escaping (CGFloat) -> Void) -> some View {
        if #available(iOS 18.0, *) {
            self.onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y + $0.contentInsets.top } action: { _, newValue in
                onChange(newValue)
            }
        } else {
            self
        }
    }

    /// Pendant HORIZONTAL de `trackScrollContentOffset`, pour la timeline.
    ///
    /// Même partage des rôles entre versions d'iOS : `onScrollGeometryChange`
    /// à partir d'iOS 18, où le lecteur par préférence ne re-déclenche plus ;
    /// en deçà, l'appelant garde le chemin `ScrollOffsetPreferenceKey`.
    /// Rapporte `contentOffset.x` — 0 tout à gauche, positif vers la droite.
    @ViewBuilder
    func trackScrollContentOffsetX(_ onChange: @escaping (CGFloat) -> Void) -> some View {
        if #available(iOS 18.0, *) {
            self.onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.x } action: { _, newValue in
                onChange(newValue)
            }
        } else {
            self
        }
    }
}

/// Décalage horizontal rapporté depuis l'intérieur du contenu défilant.
/// Chemin iOS 16–17 : à partir d'iOS 18 c'est `trackScrollContentOffsetX` qui
/// prend le relais, le lecteur par préférence n'y re-déclenchant plus.
public struct HorizontalScrollOffsetKey: PreferenceKey {
    public static let defaultValue: CGFloat = 0
    public static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

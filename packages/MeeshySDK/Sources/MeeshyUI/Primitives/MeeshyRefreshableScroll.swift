import SwiftUI

// MARK: - Meeshy Refreshable Scroll
//
// Wrapper ScrollView brand-coherent qui combine :
//   - le pull-to-refresh natif d'iOS (`.refreshable`) — solide, gere
//     automatiquement la detection du seuil, le release et le maintien
//     du spinner pendant que la closure async tourne ;
//   - un `MeeshyPullIndicator` overlay au top — meme animation visuelle
//     que la liste de conversations (logo dashes Meeshy + degrade indigo,
//     breathing pendant refresh, ring rotatif). Pas le spinner natif.
//
// L'animation `.pulling(progress:)` (logo qui rotate + scale en fonction
// du tirage) est calculee depuis le scroll offset via une PreferenceKey,
// AVANT que `.refreshable` ne trigger. Une fois `.refreshable` actif, on
// passe en `.refreshing` jusqu'a la fin de la closure, puis en
// `.completing` -> `.idle` avec haptic success.
//
// Usage minimal :
// ```swift
// MeeshyRefreshableScroll {
//     await viewModel.refresh()
// } content: {
//     LazyVStack { ForEach(items) { ItemRow(item: $0) } }
// }
// ```
//
// Le spinner natif iOS est masque par le proxy UIKit
// `UIRefreshControl.appearance().tintColor = .clear` (AppDelegate de l'app
// hote) — l'utilisateur ne voit que notre indicator brand. Ne JAMAIS le
// masquer via `.tint(.clear)` sur le ScrollView : l'environnement se
// propage au contenu et efface les icones des menus contextuels natifs
// iOS 26. Le coordinate space est expose au caller pour permettre un
// header sticky/collapsible qui reagit au scroll : passer un binding
// `headerScrollOffset` recupere l'offset.

public struct MeeshyRefreshableScroll<Content: View>: View {
    private let onRefresh: () async -> Void
    private let coordinateSpaceName: String
    private let onScrollOffsetChange: ((CGFloat) -> Void)?
    private let topPadding: CGFloat
    private let content: Content

    @State private var pullPhase: MeeshyPullPhase = .idle

    /// Seuil de pull (pt) au-dela duquel on passe en `.armed` visuellement
    /// (logo a 100% scale + rotation 180°). Choisi pour matcher le seuil
    /// implicite de `.refreshable` natif iOS (~80-100pt selon device) — au
    /// moment du release, l'animation termine sa transition vers `.armed`
    /// et iOS chaine sur la closure async juste apres.
    private static var pullThreshold: CGFloat { 90 }

    public init(
        onRefresh: @escaping () async -> Void,
        coordinateSpaceName: String = "meeshyRefreshableScroll",
        onScrollOffsetChange: ((CGFloat) -> Void)? = nil,
        topPadding: CGFloat = 0,
        @ViewBuilder content: () -> Content
    ) {
        self.onRefresh = onRefresh
        self.coordinateSpaceName = coordinateSpaceName
        self.onScrollOffsetChange = onScrollOffsetChange
        self.topPadding = topPadding
        self.content = content()
    }

    public var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                // Sentinel: capture le scroll offset dans le coordinate
                // space du ScrollView. Au repos minY = topPadding ;
                // overscroll au top fait minY > topPadding ; scroll vers
                // le bas (lecture) fait minY < topPadding.
                GeometryReader { geo in
                    Color.clear.preference(
                        key: ScrollOffsetPreferenceKey.self,
                        value: geo.frame(in: .named(coordinateSpaceName)).minY
                    )
                }
                .frame(height: 0)

                // Indicator au top du contenu — sa hauteur croit avec
                // pullPhase (0 en idle, 90pt en armed/refreshing). Quand
                // .refreshable est actif, le ScrollView native garde le
                // contenu pousse vers le bas, donc l'indicator reste
                // visible naturellement.
                MeeshyPullIndicator(phase: pullPhase)

                content
            }
            .padding(.top, topPadding)
        }
        .coordinateSpace(name: coordinateSpaceName)
        // iOS 16–17: the sentinel preference drives both the collapsing header and
        // the pull-to-refresh phase.
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { offset in
            onScrollOffsetChange?(offset)
            updatePullingPhase(scrollOffset: offset)
        }
        // iOS 18+: `.onPreferenceChange` no longer re-fires on scroll. Read
        // `contentOffset.y` natively and negate it to recover the sentinel's `minY`
        // sign (0 at rest, negative scrolling up, positive while pulling down) so
        // both the header collapse and the pull indicator keep working.
        .trackScrollContentOffset { contentOffsetY in
            let offset = -contentOffsetY
            onScrollOffsetChange?(offset)
            updatePullingPhase(scrollOffset: offset)
        }
        .refreshable {
            // iOS detecte le release armed et appelle cette closure. On
            // bascule visuellement en .refreshing, on lance le travail
            // async, puis on rejoue completing -> idle avec haptics.
            await performRefresh()
        }
        // PAS de `.tint(.clear)` ici pour masquer le spinner natif : le tint
        // d'environnement se propage a TOUT le contenu du scroll, et sur
        // iOS 26 les icones des menus contextuels natifs (Liquid Glass)
        // suivent ce tint → icones invisibles app-wide (cause racine du
        // faux « iOS 26 n'affiche pas les icones », elucide 2026-07-11).
        // Le spinner natif est masque par le proxy UIKit
        // `UIRefreshControl.appearance().tintColor = .clear` (AppDelegate),
        // documente comme le seul mecanisme efficace sur iOS 17+ — le tint
        // SwiftUI ne masquait deja plus rien ici. Invariant verrouille par
        // ConversationMenuSystemDesignGuardTests.
    }

    /// Met a jour pullPhase pendant le pull (avant que .refreshable
    /// ne trigger). Une fois en .refreshing/.completing, on ignore les
    /// updates de scroll pour ne pas perturber l'animation.
    private func updatePullingPhase(scrollOffset: CGFloat) {
        switch pullPhase {
        case .refreshing, .completing:
            return
        case .idle, .pulling, .armed:
            break
        }

        // L'overscroll au top produit un offset POSITIF (le contenu
        // descend → minY augmente). On retire le `topPadding` pour
        // matcher le seuil quel que soit le contexte d'inclusion (header
        // sticky, safe area, etc.).
        let pullDistance = max(0, scrollOffset - topPadding)

        if pullDistance == 0 {
            if pullPhase != .idle {
                pullPhase = .idle
            }
            return
        }

        let threshold = Self.pullThreshold
        if pullDistance >= threshold {
            if pullPhase != .armed {
                pullPhase = .armed
                // Haptic au crossing du seuil — feedback que le geste
                // est arme. Si l'utilisateur lache maintenant, refresh.
                HapticFeedback.medium()
            }
        } else {
            let progress = pullDistance / threshold
            pullPhase = .pulling(progress: progress)
        }
    }

    /// Joue la sequence refresh : refreshing -> work -> completing -> idle,
    /// avec haptic success/error et delai de respiration final.
    private func performRefresh() async {
        // Si `.refreshable` est trigger sans qu'on ait passe par .armed
        // (rare : ScrollView natif applique son propre seuil),
        // on emet l'haptic medium ici par securite.
        if case .armed = pullPhase {
            // Deja arme — pas besoin de re-haptic.
        } else {
            HapticFeedback.medium()
        }

        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            pullPhase = .refreshing
        }

        await onRefresh()

        HapticFeedback.success()
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            pullPhase = .completing
        }
        // Petite fenetre ou l'utilisateur voit que c'est fini avant
        // que l'indicator se replie. Aligne avec l'experience originale
        // de la liste de conversations (350ms).
        try? await Task.sleep(nanoseconds: 400_000_000)
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
            pullPhase = .idle
        }
    }
}

import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE GABARIT D'UNE PAGE DE PROGRESSION (#9564, amendement n° 2) — l'en-tête QUI SE RÉDUIT de #6480, monté UNE
/// fois pour toutes les pages du jeu : la première page, la fiche d'un concept, le tableau de bord, la ligue, la
/// saison, la vitrine, l'Atlas, le Prestige, les badges, les défis, les succès, les règles, le carnet, les réglages.
///
/// Grand titre au repos, barre compacte et translucide quand le contenu défile dessous, retour en disque de
/// verre : c'est `CollapsibleHeader`, le composant partagé. Il est monté ici « à la main » (et non par
/// `CollapsibleHeaderPage`) parce que les pages du jeu portent des modificateurs sur LEUR défilement — le
/// tirer-pour-rafraîchir, un lecteur de défilement pour viser une règle. La plomberie (relais, préférence
/// iOS 16–17, suivi iOS 18+, espace réservé sous l'en-tête) vit donc à UN endroit de l'app, plus dans cinq.
///
/// Le retour opère dans les trois contextes de présentation — pile iPhone, panneau droit iPad, feuille
/// (`PanelBackAction`). Le fond est celui du thème ; le contenu défile SOUS l'en-tête.
struct GamePageScaffold<Trailing: View, Content: View>: View {
    let title: String
    /// L'identifiant de la page, pour les témoins de rendu ; `nil` : la page n'en porte pas.
    var identifier: String?
    /// Le geste de retour par le bord gauche, que `navigationBarHidden(true)` retire en silence.
    var enablesEdgePop = true
    /// Tirer pour rafraîchir ; `nil` : la page ne relit rien.
    var onRefresh: (@MainActor () async -> Void)?
    /// « Voir la fiche » depuis les précisions d'un élément ; `nil` : la page EST la fiche du concept, ou sa sous-page.
    var onOpenConcept: ((ProgressionConcept) -> Void)?
    @ViewBuilder let trailing: () -> Trailing
    @ViewBuilder let content: () -> Content

    @Environment(\.dismiss) private var dismiss
    @Environment(\.isPresented) private var isPresented
    @Environment(\.meeshyPanelDismiss) private var panelDismiss
    /// « Comprendre les badges », posé par la page qui tient le routeur (#9640) : la feuille d'un badge l'offre.
    @Environment(\.gameOpenBadgesGuide) private var openBadgesGuide
    /// Référence stable, jamais observée par la page : seul l'en-tête se re-rend à la cadence du défilement.
    @State private var relay = ScrollOffsetRelay()
    /// L'élément dont la page présente les précisions — UNE feuille par page, pour tous ses éléments.
    @State private var detail: GameElementDetail?

    private var theme: ThemeManager { ThemeManager.shared }
    private var back: PanelBackAction {
        PanelBackAction(isPresented: isPresented, dismiss: dismiss, panelDismiss: panelDismiss)
    }

    private static var scrollSpace: String { "gamePage.scroll" }

    private var openDetail: ((GameElementDetail) -> Void)? {
        { element in detail = element }
    }

    var body: some View {
        ZStack(alignment: .top) {
            theme.backgroundGradient.ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                GeometryReader { geo in
                    Color.clear.preference(
                        key: ScrollOffsetPreferenceKey.self,
                        value: geo.frame(in: .named(Self.scrollSpace)).minY
                    )
                }
                .frame(height: 0)

                Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)

                content()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.top, MeeshySpacing.sm)
                    .padding(.bottom, MeeshySpacing.xxl)
            }
            .modifier(GamePageRefresh(onRefresh: onRefresh))
            .coordinateSpace(name: Self.scrollSpace)
            .onPreferenceChange(ScrollOffsetPreferenceKey.self) { relay.offset = $0 }      // iOS 16–17
            .trackScrollContentOffset { relay.offset = -$0 }                               // iOS 18+

            ScrollOffsetReader(relay: relay) { offset in
                CollapsibleHeader(
                    title: title,
                    scrollOffset: offset,
                    onBack: { back() },
                    titleColor: theme.textPrimary,
                    backArrowColor: MeeshyColors.brandPrimary,
                    backgroundColor: theme.backgroundPrimary,
                    trailing: trailing
                )
            }
        }
        // La porte des précisions : tout élément de la page (contenu ET en-tête) la trouve dans l'environnement.
        .environment(\.gameOpenDetail, openDetail)
        // Une `sheet`, jamais un `fullScreenCover` : il laisserait l'écran recouvert aveugle.
        .gameElementSheet($detail, onOpenConcept: onOpenConcept, onOpenBadgesGuide: openBadgesGuide)
        .modifier(GamePageEdgePop(enabled: enablesEdgePop))
        .modifier(GamePageIdentifier(identifier: identifier))
    }
}

extension GamePageScaffold where Trailing == EmptyView {
    init(title: String, identifier: String? = nil, enablesEdgePop: Bool = true,
         onRefresh: (@MainActor () async -> Void)? = nil, onOpenConcept: ((ProgressionConcept) -> Void)? = nil,
         @ViewBuilder content: @escaping () -> Content) {
        self.init(title: title, identifier: identifier, enablesEdgePop: enablesEdgePop, onRefresh: onRefresh,
                  onOpenConcept: onOpenConcept, trailing: { EmptyView() }, content: content)
    }
}

/// Le tirer-pour-rafraîchir, seulement quand la page a quelque chose à relire.
private struct GamePageRefresh: ViewModifier {
    let onRefresh: (@MainActor () async -> Void)?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let onRefresh {
            content.refreshable { await onRefresh() }
        } else {
            content
        }
    }
}

private struct GamePageEdgePop: ViewModifier {
    let enabled: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if enabled {
            content.background(InteractivePopEnabler())
        } else {
            content
        }
    }
}

private struct GamePageIdentifier: ViewModifier {
    let identifier: String?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let identifier {
            content.accessibilityIdentifier(identifier)
        } else {
            content
        }
    }
}

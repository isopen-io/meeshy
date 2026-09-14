import SwiftUI

/// LA PAGE À EN-TÊTE QUI SE RÉDUIT, en un seul composant (#6481).
///
/// Directive porteur 2026-09-14 : toutes les pages ouvertes depuis Réglages
/// portent le retour en verre et un en-tête clair. Réglages et Progression
/// montent `CollapsibleHeader` avec la même plomberie — relais de défilement,
/// lecteur, préférence iOS 16–17, suivi iOS 18+, espace réservé sous l'en-tête.
/// Vingt pages la recopieraient, et vingt jumelles finiraient par diverger (un
/// suivi iOS 18 oublié ne rougit nulle part : l'en-tête reste simplement figé).
/// Cette page les porte UNE fois ; l'écran ne fournit que son titre, son geste
/// de retour, ses actions et son contenu.
///
/// Agnostique du produit (pureté du SDK) : aucune couleur, aucun singleton —
/// l'appelant passe ses teintes, comme à `CollapsibleHeader`.
///
/// Le défilement appartient à la page. Un écran qui doit porter des
/// modificateurs sur SON `ScrollView` (`.refreshable`, `.scrollDismissesKeyboard`)
/// ou qui ne défile pas monte `CollapsibleHeader` directement.
public struct CollapsibleHeaderPage<Trailing: View, Content: View>: View {
    private let title: String
    private let onBack: () -> Void
    private let titleColor: Color
    private let backArrowColor: Color
    private let backgroundColor: Color
    private let trailing: () -> Trailing
    private let content: () -> Content

    /// Référence stable, jamais observée par la page : seul l'en-tête, via
    /// `ScrollOffsetReader`, se re-rend à la cadence du défilement (P1-1).
    @State private var relay = ScrollOffsetRelay()

    public init(
        title: String,
        onBack: @escaping () -> Void,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        @ViewBuilder trailing: @escaping () -> Trailing,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.onBack = onBack
        self.titleColor = titleColor
        self.backArrowColor = backArrowColor
        self.backgroundColor = backgroundColor
        self.trailing = trailing
        self.content = content
    }

    public var body: some View {
        ZStack(alignment: .top) {
            ScrollView(showsIndicators: false) {
                GeometryReader { geo in
                    Color.clear.preference(
                        key: ScrollOffsetPreferenceKey.self,
                        value: geo.frame(in: .named(Self.espaceDeDefilement)).minY
                    )
                }
                .frame(height: 0)

                Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)

                content()
            }
            .coordinateSpace(name: Self.espaceDeDefilement)
            .onPreferenceChange(ScrollOffsetPreferenceKey.self) { relay.offset = $0 }   // iOS 16–17
            .trackScrollContentOffset { relay.offset = -$0 }                            // iOS 18+

            ScrollOffsetReader(relay: relay) { offset in
                CollapsibleHeader(
                    title: title,
                    scrollOffset: offset,
                    onBack: onBack,
                    titleColor: titleColor,
                    backArrowColor: backArrowColor,
                    backgroundColor: backgroundColor,
                    trailing: trailing
                )
            }
        }
    }

    private static var espaceDeDefilement: String { "collapsibleHeaderPage.scroll" }
}

public extension CollapsibleHeaderPage where Trailing == EmptyView {
    init(
        title: String,
        onBack: @escaping () -> Void,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.init(
            title: title,
            onBack: onBack,
            titleColor: titleColor,
            backArrowColor: backArrowColor,
            backgroundColor: backgroundColor,
            trailing: { EmptyView() },
            content: content
        )
    }
}

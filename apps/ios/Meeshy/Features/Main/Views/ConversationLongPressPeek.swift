import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les deux hauteurs que la carte d'aperçu reçoit : celle de son REPOS, sur
/// laquelle ses messages se mettent en page une fois pour toutes, et celle
/// qu'elle occupe sous le doigt, qui ne fait que la découper (#17242).
struct ConversationPeekCardHeights: Equatable {
    let rest: CGFloat
    let current: CGFloat
}

/// Le chrome que la liste impose au menu pendant l'émergence et le morph en
/// pastille : décalage, opacité, flou.
struct ConversationPeekMenuChrome: Equatable {
    let offset: CGFloat
    let opacity: Double
    let blur: CGFloat
}

/// La hauteur de la tête compacte du menu (Épingler · Sourdine · Lu), lue
/// dans l'espace du contenu du menu : ce que le cran compact laisse voir.
struct ConversationPeekLeadHeightKey: PreferenceKey {
    static let coordinateSpace = "conversation.peek.menu"
    static let defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// L'aperçu d'appui long d'une rangée de conversation (#17242) : une grande
/// carte au-dessus d'un menu COMPACT qu'on tire vers le haut. La progression
/// vit ICI, jamais dans la liste : le geste ne ré-évalue ni la liste ni le
/// contenu du menu, seulement les deux cadres qu'il redimensionne.
struct ConversationLongPressPeek<Card: View, Menu: View>: View {
    let isVisible: Bool
    let reduceMotion: Bool
    let menuChrome: ConversationPeekMenuChrome
    /// La carte, construite pour les hauteurs servies — ses gestes de toucher
    /// et ses transformations d'émergence sont posés par la liste.
    let card: (ConversationPeekCardHeights) -> Card
    /// Le contenu du menu, construit UNE fois par passe de la liste.
    let menu: Menu
    /// Glisser vers le bas depuis le cran compact : le morph en pastille.
    let onChipDragChanged: (DragGesture.Value) -> Void
    let onChipDragEnded: (DragGesture.Value) -> Void

    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOverEnabled
    @State private var detent: ConversationPeekDetent = .compact
    @State private var progress: CGFloat = 0
    @State private var gestureStart: ConversationPeekDetent?
    @State private var cardRoute: ConversationPeekCardRoute?
    @State private var leadHeight: CGFloat = 0
    @State private var contentHeight: CGFloat = 0

    static var handleHeight: CGFloat { 28 }
    private static var fallbackLeadHeight: CGFloat { 84 }

    private var openingDetent: ConversationPeekDetent {
        .opening(prefersAllActions: voiceOverEnabled || reduceMotion)
    }

    var body: some View {
        GeometryReader { geometry in
            let layout = self.layout(in: geometry.size)
            VStack(spacing: ConversationPeekLayout.spacing) {
                card(ConversationPeekCardHeights(rest: layout.cardHeight(progress: 0), current: layout.cardHeight(progress: progress)))
                    .frame(width: layout.cardWidth, height: layout.cardHeight(progress: progress), alignment: .top)
                    .simultaneousGesture(drag(onCard: true, layout: layout))
                menuContainer(layout: layout)
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.vertical, MeeshySpacing.sm)
        .onAppear { reset() }
        .adaptiveOnChange(of: isVisible) { _, visible in
            if visible { reset() }
        }
    }

    private func layout(in size: CGSize) -> ConversationPeekLayout {
        let compact = Self.handleHeight + (leadHeight > 0 ? leadHeight : Self.fallbackLeadHeight)
        return ConversationPeekLayout(
            availableHeight: size.height,
            availableWidth: size.width,
            compactMenuHeight: compact,
            naturalMenuHeight: max(compact, Self.handleHeight + contentHeight)
        )
    }

    // MARK: - Menu

    private func menuContainer(layout: ConversationPeekLayout) -> some View {
        VStack(spacing: 0) {
            handle
            ScrollView(.vertical, showsIndicators: false) {
                menu
                    .fixedSize(horizontal: false, vertical: true)
                    .coordinateSpace(name: ConversationPeekLeadHeightKey.coordinateSpace)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
            }
            .scrollDisabled(!(detent == .expanded && gestureStart == nil && layout.menuOverflows))
            .onPreferenceChange(ConversationPeekLeadHeightKey.self) { measured in
                if measured > 0 { leadHeight = measured }
            }
        }
        .frame(width: layout.cardWidth, height: layout.menuHeight(progress: progress), alignment: .top)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus, style: .continuous))
        // Liquid Glass natif iOS 26, matériau avant : le conteneur du menu
        // custom (garde `ConversationMenuSystemDesignGuardTests`).
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus, style: .continuous))
        .highPriorityGesture(
            drag(onCard: false, layout: layout),
            including: detent == .expanded && layout.menuOverflows ? .subviews : .all
        )
        .offset(y: menuChrome.offset)
        .opacity(menuChrome.opacity)
        .blur(radius: menuChrome.blur)
    }

    /// La poignée : on la tire, ou on la touche pour basculer de cran. C'est
    /// aussi l'action « Plus d'actions » de VoiceOver.
    private var handle: some View {
        Button { settle(to: detent.toggled) } label: {
            Capsule()
                .fill(Color.primary.opacity(MeeshyOpacity.medium))
                .frame(width: 36, height: 5)
                .frame(maxWidth: .infinity, minHeight: Self.handleHeight)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(detent == .compact ? Self.moreActionsLabel : Self.fewerActionsLabel)
        .accessibilityIdentifier("conversation.peek.handle")
    }

    static var moreActionsLabel: String {
        String(localized: "conversation.peek.more_actions", defaultValue: "Plus d'actions", bundle: .main)
    }

    static var fewerActionsLabel: String {
        String(localized: "conversation.peek.fewer_actions", defaultValue: "Moins d'actions", bundle: .main)
    }

    // MARK: - Geste

    /// Le glissement suit le doigt image par image (la progression pilote les
    /// deux cadres), reste annulable jusqu'au lâcher, et le lâcher conclut au
    /// cran le plus proche de la position projetée.
    private func drag(onCard: Bool, layout: ConversationPeekLayout) -> some Gesture {
        DragGesture(minimumDistance: 8, coordinateSpace: .global)
            .onChanged { value in
                let translation = value.translation.height
                let start = gestureStart ?? detent
                if gestureStart == nil {
                    gestureStart = start
                    cardRoute = onCard ? .resolve(startDetent: start, translation: translation) : .detent
                }
                guard cardRoute != .chipMorph else { return onChipDragChanged(value) }
                progress = layout.progress(from: start, translation: translation)
            }
            .onEnded { value in
                let start = gestureStart ?? detent
                let route = cardRoute
                gestureStart = nil
                cardRoute = nil
                guard route != .chipMorph else { return onChipDragEnded(value) }
                settle(to: layout.settle(from: start, predictedEndTranslation: value.predictedEndTranslation.height))
            }
    }

    private func settle(to target: ConversationPeekDetent) {
        if target != detent { HapticFeedback.light() }
        let animation: Animation = reduceMotion ? .easeOut(duration: 0.18) : .spring(response: 0.32, dampingFraction: 0.86)
        withAnimation(animation) {
            detent = target
            progress = target.progress
        }
    }

    private func reset() {
        gestureStart = nil
        cardRoute = nil
        detent = openingDetent
        progress = openingDetent.progress
    }
}

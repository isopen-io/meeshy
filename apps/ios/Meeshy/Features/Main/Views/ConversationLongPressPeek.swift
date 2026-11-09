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
    /// Fermer l'aperçu : action « Fermer » de VoiceOver, Échap (#17258).
    let onDismiss: () -> Void

    /// Ce que l'aperçu annonce au chrome de la racine (#17260) ; écrit, jamais observé ici.
    var presence: LongPressPeekPresence = .shared

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
            let band = ConversationPeekLayout.veilBand(forHeight: geometry.size.height)
            let layout = self.layout(in: CGSize(width: geometry.size.width, height: geometry.size.height - band))
            VStack(spacing: ConversationPeekLayout.spacing) {
                card(ConversationPeekCardHeights(rest: layout.cardHeight(progress: 0), current: layout.cardHeight(progress: progress)))
                    .frame(width: layout.cardWidth, height: layout.cardHeight(progress: progress), alignment: .top)
                    .simultaneousGesture(drag(onCard: true, layout: layout))
                    .accessibilityAction(named: Text(Self.closeLabel)) { onDismiss() }
                menuContainer(layout: layout)
            }
            .frame(maxWidth: .infinity)
            // La bande du haut reste au voile : visible, et un toucher la ferme
            // (`LongPressVeil`, sous l'aperçu, la reçoit — #17258).
            .padding(.top, band)
        }
        .padding(.vertical, MeeshySpacing.sm)
        .dismissOnEscape(onDismiss)
        .onAppear { reset() }
        .adaptiveOnChange(of: isVisible, initial: true) { _, visible in
            if visible { reset() }
            // Le chrome flottant de la racine cède la place à l'aperçu ouvert (#17260).
            presence.update(isOpen: visible)
        }
        .onDisappear { presence.update(isOpen: false) }
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
        .accessibilityAction(named: Text(Self.closeLabel)) { onDismiss() }
    }

    static var moreActionsLabel: String {
        String(localized: "conversation.peek.more_actions", defaultValue: "Plus d'actions", bundle: .main)
    }

    static var closeLabel: String {
        String(localized: "common.close", defaultValue: "Fermer", bundle: .main)
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

// MARK: - Rien ne passe au-dessus de l'aperçu (#17260)

/// L'aperçu d'appui long est-il ouvert ? Écrit par la liste qui le porte, lu
/// par le chrome de la racine (bulles flottantes, pastille de synchronisation,
/// bannière du joueur) qui lui cède la place : ces surfaces vivent AU-DESSUS
/// du contenu, donc au-dessus de l'aperçu, et y captaient ses touchers.
@MainActor
final class LongPressPeekPresence: ObservableObject {
    static let shared = LongPressPeekPresence()

    @Published private(set) var isOpen = false

    nonisolated deinit {}

    func update(isOpen: Bool) {
        guard self.isOpen != isOpen else { return }
        self.isOpen = isOpen
    }
}

/// Ce que devient une surface flottante pendant que l'aperçu est ouvert.
nonisolated enum LongPressPeekConcealment {
    static func opacity(peekIsOpen: Bool) -> Double { peekIsOpen ? 0 : 1 }
    static func admitsTouches(peekIsOpen: Bool) -> Bool { !peekIsOpen }
}

/// Une surface flottante s'efface sous l'aperçu ouvert : invisible, sourde au
/// toucher et absente de VoiceOver. Seul ce modificateur observe la présence :
/// la surface qu'il porte n'est pas ré-évaluée.
struct ConcealedUnderLongPressPeek: ViewModifier {
    @ObservedObject var presence: LongPressPeekPresence

    func body(content: Content) -> some View {
        content
            .opacity(LongPressPeekConcealment.opacity(peekIsOpen: presence.isOpen))
            .allowsHitTesting(LongPressPeekConcealment.admitsTouches(peekIsOpen: presence.isOpen))
            .accessibilityHidden(presence.isOpen)
            .animation(.easeOut(duration: 0.18), value: presence.isOpen)
    }
}

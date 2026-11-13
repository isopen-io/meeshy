import SwiftUI

// MARK: - Le choix

/// **Le choix d'une ligne**, dans son ordre : le retour haptique, la fermeture,
/// PUIS l'`id` remis à l'hôte, une fois chacun.
enum MeeshyObjectMenuChoice {
    static func commit(
        id: String,
        haptic: MeeshyObjectMenuHaptic,
        playHaptic: () -> Void,
        dismiss: () -> Void,
        select: (String) -> Void
    ) {
        if haptic == .light { playHaptic() }
        dismiss()
        select(id)
    }
}

// MARK: - La configuration

/// Tout ce que l'hôte reçoit hors rappels, en valeurs : le calque ne se rend que
/// si l'une d'elles change.
struct MeeshyObjectMenuConfiguration: Equatable {
    let label: String
    let items: [MeeshyObjectMenuItem]
    let header: String?
    let preferredEdge: MeeshyObjectMenuEdge
    let alignment: MeeshyObjectMenuAlignment
    let backdrop: MeeshyObjectMenuBackdrop
    let tone: MeeshyGlassTone?
    let haptic: MeeshyObjectMenuHaptic
    let dismissLabel: String
    let pressedItemID: String?
    let anchor: MeeshyObjectMenuAnchor?
}

// MARK: - La pose

public extension View {
    /// Ouvre le menu d'un objet par-dessus cette vue tant que `isPresented` est
    /// vrai. Il s'ancre au contrôle déclaré par `.meeshyObjectMenuAnchor()` (ou à
    /// `anchor`), jamais à un appui long : l'hôte bascule `isPresented` au
    /// toucher du (…).
    ///
    /// - Le choix ferme le menu PUIS remet l'`id` ; un toucher dehors, Échap,
    ///   l'échappement du lecteur d'écran ferment aussi (et le toucher dehors est
    ///   consommé) ; une ancre disparue ferme.
    /// - L'assombrissement de la scène est à l'hôte, qui sait ce qu'elle est.
    func meeshyObjectMenu(
        isPresented: Binding<Bool>,
        label: String,
        items: [MeeshyObjectMenuItem],
        header: String? = nil,
        preferredEdge: MeeshyObjectMenuEdge = .above,
        alignment: MeeshyObjectMenuAlignment = .end,
        backdrop: MeeshyObjectMenuBackdrop = .clear,
        tone: MeeshyGlassTone? = nil,
        haptic: MeeshyObjectMenuHaptic = .light,
        dismissLabel: String = MeeshyObjectMenuCopy.dismiss,
        pressedItemID: String? = nil,
        anchor: MeeshyObjectMenuAnchor? = nil,
        onSelect: @escaping (String) -> Void
    ) -> some View {
        assert(!label.isEmpty, "meeshyObjectMenu : le nom du menu est obligatoire et non vide")
        return modifier(MeeshyObjectMenuHost(
            configuration: MeeshyObjectMenuConfiguration(
                label: label, items: items, header: header, preferredEdge: preferredEdge,
                alignment: alignment, backdrop: backdrop, tone: tone, haptic: haptic,
                dismissLabel: dismissLabel, pressedItemID: pressedItemID, anchor: anchor
            ),
            isPresented: isPresented,
            onSelect: onSelect
        ))
    }
}

private struct MeeshyObjectMenuHost: ViewModifier {
    let configuration: MeeshyObjectMenuConfiguration
    @Binding var isPresented: Bool
    let onSelect: (String) -> Void

    func body(content: Content) -> some View {
        content.overlayPreferenceValue(MeeshyObjectMenuAnchorKey.self) { anchors in
            MeeshyObjectMenuLayer(
                configuration: configuration,
                anchors: anchors,
                isPresented: isPresented,
                dismiss: { isPresented = false },
                onSelect: onSelect
            )
        }
    }
}

// MARK: - Le calque

/// Le calque en surimpression : frère du contenu, monté seulement ouvert. Il lit
/// la place du (…) à l'ouverture et quand le conteneur ou l'ancre changent,
/// jamais par image ; la première pose part d'une hauteur estimée, corrigée par
/// la mesure sans animation.
private struct MeeshyObjectMenuLayer: View {
    let configuration: MeeshyObjectMenuConfiguration
    let anchors: MeeshyObjectMenuAnchorSet
    let isPresented: Bool
    let dismiss: () -> Void
    let onSelect: (String) -> Void

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userReduceMotion
    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var measuredHeight: CGFloat?

    var body: some View {
        ZStack {
            if isPresented { stage }
        }
        .animation(isPresented ? motion.enter : motion.exit, value: isPresented)
        .adaptiveOnChange(of: shouldDismiss, initial: true) { _, wanted in
            if wanted { dismiss() }
        }
    }

    private var motion: MeeshyObjectMenuMotion {
        MeeshyObjectMenuMotion.resolve(
            reduceMotion: MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userReduceMotion)
        )
    }

    private var rows: [MeeshyObjectMenuItem] { MeeshyObjectMenuOrder.resolve(configuration.items) }

    private var hasAnchor: Bool { configuration.anchor != nil || anchors.control != nil }

    /// Une liste vide ou une ancre disparue : le menu se ferme.
    private var shouldDismiss: Bool {
        isPresented && (rows.isEmpty || !hasAnchor)
    }

    private var stage: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                scrim
                if let placement = placement(in: proxy) { menu(placement) }
            }
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
        }
    }

    private var scrim: some View {
        (configuration.backdrop == .dim ? MeeshyColors.scrimSoft : Color.clear)
            .ignoresSafeArea()
            .contentShape(Rectangle())
            .onTapGesture(perform: dismiss)
            .accessibilityHidden(true)
            .transition(.opacity)
    }

    private func menu(_ placement: MeeshyObjectMenuPlacement) -> some View {
        MeeshyObjectMenu(
            items: configuration.items,
            header: configuration.header,
            tone: configuration.tone,
            pressedItemID: configuration.pressedItemID,
            width: placement.frame.width,
            maxHeight: placement.scrolls ? placement.frame.height : nil,
            onSelect: choose
        )
        .onPreferenceChange(MeeshyObjectMenuSizeKey.self) { size in
            if size.height > 0, measuredHeight != size.height { measuredHeight = size.height }
        }
        .offset(x: placement.frame.minX, y: placement.frame.minY)
        .animation(nil, value: placement)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(configuration.label)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(named: Text(configuration.dismissLabel), dismiss)
        .dismissOnEscape(dismiss)
        .onDisappear { measuredHeight = nil }
        .transition(
            .scale(scale: motion.scale, anchor: UnitPoint(x: placement.origin.x, y: placement.origin.y))
                .combined(with: .opacity)
        )
    }

    private func choose(_ id: String) {
        MeeshyObjectMenuChoice.commit(
            id: id, haptic: configuration.haptic,
            playHaptic: { HapticFeedback.light() }, dismiss: dismiss, select: onSelect
        )
    }

    private func placement(in proxy: GeometryProxy) -> MeeshyObjectMenuPlacement? {
        guard let target = target(in: proxy) else { return nil }
        let isRightToLeft = layoutDirection == .rightToLeft
        let safe = proxy.safeAreaInsets
        let height = measuredHeight ?? MeeshyObjectMenuRecipe.estimatedHeight(
            rowCount: rows.count, hasHeader: MeeshyObjectMenuChrome.resolve(
                rowCount: rows.count, header: configuration.header, backdrop: .clear
            ).showsHeader
        )
        return MeeshyObjectMenuPlacement.resolve(
            control: target.control,
            surface: target.surface,
            menu: CGSize(width: MeeshyObjectMenuRecipe.width(isAccessibilitySize: dynamicTypeSize.isAccessibilitySize), height: height),
            container: proxy.size,
            insets: MeeshyObjectMenuInsets(
                top: safe.top,
                left: isRightToLeft ? safe.trailing : safe.leading,
                bottom: safe.bottom,
                right: isRightToLeft ? safe.leading : safe.trailing
            ),
            preferredEdge: configuration.preferredEdge,
            alignment: configuration.alignment,
            isRightToLeft: isRightToLeft
        )
    }

    private func target(in proxy: GeometryProxy) -> (control: CGRect, surface: CGRect?)? {
        if let explicit = configuration.anchor { return (explicit.control, explicit.surface) }
        guard let control = anchors.control else { return nil }
        return (proxy[control], anchors.surface.map { proxy[$0] })
    }
}

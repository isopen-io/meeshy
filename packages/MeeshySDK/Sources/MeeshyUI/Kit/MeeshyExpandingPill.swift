import SwiftUI

/// **La pilule qui s'ouvre vers le haut** (K11) : K10 qui grandit, DANS son
/// verre, pour porter une option à réglages ou une confirmation. En-tête
/// ‹ Retour · titre · ✕ Fermer, corps fourni par l'hôte, rangée de la pilule
/// gardée en pied ou retirée. Elle ENVELOPPE `MeeshyGlassPill` : le verre, sa
/// largeur, son morphisme, la rangée, le retrait et l'ancrage sont à K10 ; elle
/// n'écrit aucun verre.
///
/// - `option == nil` : la pilule de K10 au repos, serrée, densité `regular`.
/// - `option` : son `id` pilote le fondu enchaîné (même `id`, aucun mouvement) ;
///   `keepsRow == false` retire la rangée (K11 choisit seul `withoutRow`) ;
///   `showsHeader == false` retire l'en-tête (un outil, une confirmation).
/// - `onBack` et `onClose` : un bouton n'existe que si son rappel existe.
///   `onEscape` (échappement du lecteur d'écran, Échap au clavier) vaut, par
///   défaut, `onBack`, sinon `onClose`. Aucun glissé ne ferme ; un toucher hors
///   du verre n'est pas capté (l'hôte décide) ; la scène derrière garde sa taille.
/// - `content(option)` : le corps de l'option reçue, y compris celle qui part.
///   Au-delà du plafond (62 % de l'hôte pour le verre entier, plancher de 160 ;
///   `maxBodyHeight` le remplace) il défile.
/// - `headerTrailing` : un accessoire avant ✕ (un compteur, une bascule).
///
/// Ne se re-rend pas : la rangée quand l'option s'ouvre ou que son corps bouge,
/// l'en-tête quand seul le corps change. N'observe aucun magasin. À poser dans un
/// `MeeshyGlassPillDock` : la hauteur de l'hôte est celle que l'ancrage offre.
public struct MeeshyExpandingPill<Buttons: View, Primary: View, HeaderTrailing: View, Content: View>: View {
    private let label: String
    private let option: MeeshyExpandingPillOption?
    private let onBack: (() -> Void)?
    private let onClose: (() -> Void)?
    private let onEscape: (() -> Void)?
    private let backLabel: String
    private let closeLabel: String
    private let maxBodyHeight: CGFloat?
    private let isBodyScrollLocked: Bool
    private let takesFocus: Bool
    private let presence: MeeshyGlassPillPresence
    private let layout: MeeshyGlassPillLayout
    private let tone: MeeshyGlassTone?
    private let showsDivider: Bool
    private let expandedMaxWidth: CGFloat
    private let onRevive: (() -> Void)?
    private let buttons: (MeeshyGlassButtonSize) -> Buttons
    private let primary: Primary
    private let headerTrailing: HeaderTrailing
    private let content: (MeeshyExpandingPillOption) -> Content

    @State private var hostHeight: CGFloat = 0
    @State private var bodyIsEmpty = false
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userReduceMotion

    public init(
        label: String,
        option: MeeshyExpandingPillOption? = nil,
        onBack: (() -> Void)? = nil,
        onClose: (() -> Void)? = nil,
        onEscape: (() -> Void)? = nil,
        backLabel: String = MeeshyExpandingPillCopy.back,
        closeLabel: String = MeeshyExpandingPillCopy.close,
        maxBodyHeight: CGFloat? = nil,
        isBodyScrollLocked: Bool = false,
        takesFocus: Bool = true,
        presence: MeeshyGlassPillPresence = .shown,
        layout: MeeshyGlassPillLayout = .hug,
        tone: MeeshyGlassTone? = nil,
        showsDivider: Bool = false,
        expandedMaxWidth: CGFloat = MeeshyGlassPillRecipe.expandedMaxWidth,
        onRevive: (() -> Void)? = nil,
        @ViewBuilder buttons: @escaping (MeeshyGlassButtonSize) -> Buttons,
        @ViewBuilder primary: () -> Primary,
        @ViewBuilder headerTrailing: () -> HeaderTrailing,
        @ViewBuilder content: @escaping (MeeshyExpandingPillOption) -> Content
    ) {
        assert(!label.isEmpty, "MeeshyExpandingPill : le nom de la pilule est obligatoire et non vide")
        self.label = label
        self.option = option
        self.onBack = onBack
        self.onClose = onClose
        self.onEscape = onEscape
        self.backLabel = backLabel
        self.closeLabel = closeLabel
        self.maxBodyHeight = maxBodyHeight
        self.isBodyScrollLocked = isBodyScrollLocked
        self.takesFocus = takesFocus
        self.presence = presence
        self.layout = layout
        self.tone = tone
        self.showsDivider = showsDivider
        self.expandedMaxWidth = expandedMaxWidth
        self.onRevive = onRevive
        self.buttons = buttons
        self.primary = primary()
        self.headerTrailing = headerTrailing()
        self.content = content
    }

    public var body: some View {
        let reduceMotion = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userReduceMotion)
        let isOpen = MeeshyExpandingPillRule.isOpen(option: option, bodyIsEmpty: bodyIsEmpty)
        return MeeshyGlassPill(
            label: label,
            presence: MeeshyExpandingPillRule.presence(host: presence, option: option),
            layout: layout,
            tone: tone,
            showsDivider: showsDivider,
            expandedMaxWidth: expandedMaxWidth,
            onRevive: onRevive,
            aboveIsShown: isOpen,
            buttons: buttons,
            primary: { primary },
            above: { opening(reduceMotion: reduceMotion) }
        )
        .frame(maxHeight: .infinity, alignment: .bottom)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { hostHeight = $0 }
    }

    // MARK: Ouverture

    /// Le dessus : le panneau de l'option, qui entre et sort en fondu (échelle de
    /// 0,94 ancrée en bas ; fondu seul sous « réduire les animations »). Le
    /// changement d'`id` est un fondu enchaîné dans le même verre.
    private func opening(reduceMotion: Bool) -> some View {
        ZStack(alignment: .bottom) {
            if let option {
                panel(for: option)
                    .id(option.id)
                    .transition(Self.transition(reduceMotion: reduceMotion))
            }
        }
        .animation(MeeshyExpandingPillRecipe.fadeAnimation(reduceMotion: reduceMotion), value: option?.id)
    }

    private func panel(for option: MeeshyExpandingPillOption) -> some View {
        MeeshyExpandingPillPanel(
            option: option,
            hostHeight: hostHeight,
            onBack: onBack,
            onClose: onClose,
            escape: escapeAction,
            backLabel: backLabel,
            closeLabel: closeLabel,
            maxBodyHeight: maxBodyHeight,
            isBodyScrollLocked: isBodyScrollLocked,
            takesFocus: takesFocus,
            bodyIsEmpty: $bodyIsEmpty,
            headerTrailing: headerTrailing,
            content: content(option)
        )
    }

    private var escapeAction: (() -> Void)? {
        switch MeeshyExpandingPillRule.escapeTarget(
            isOpen: option != nil, hasEscape: onEscape != nil, hasBack: onBack != nil, hasClose: onClose != nil
        ) {
        case .escape: return onEscape
        case .back: return onBack
        case .close: return onClose
        case .none: return nil
        }
    }

    private static func transition(reduceMotion: Bool) -> AnyTransition {
        reduceMotion
            ? .opacity
            : .opacity.combined(with: .scale(scale: MeeshyExpandingPillRecipe.enterScale, anchor: .bottom))
    }
}

// MARK: - Les inits sans emplacement vide

public extension MeeshyExpandingPill where HeaderTrailing == EmptyView {
    init(
        label: String,
        option: MeeshyExpandingPillOption? = nil,
        onBack: (() -> Void)? = nil,
        onClose: (() -> Void)? = nil,
        onEscape: (() -> Void)? = nil,
        backLabel: String = MeeshyExpandingPillCopy.back,
        closeLabel: String = MeeshyExpandingPillCopy.close,
        maxBodyHeight: CGFloat? = nil,
        isBodyScrollLocked: Bool = false,
        takesFocus: Bool = true,
        presence: MeeshyGlassPillPresence = .shown,
        layout: MeeshyGlassPillLayout = .hug,
        tone: MeeshyGlassTone? = nil,
        showsDivider: Bool = false,
        expandedMaxWidth: CGFloat = MeeshyGlassPillRecipe.expandedMaxWidth,
        onRevive: (() -> Void)? = nil,
        @ViewBuilder buttons: @escaping (MeeshyGlassButtonSize) -> Buttons,
        @ViewBuilder primary: () -> Primary,
        @ViewBuilder content: @escaping (MeeshyExpandingPillOption) -> Content
    ) {
        self.init(
            label: label, option: option, onBack: onBack, onClose: onClose, onEscape: onEscape,
            backLabel: backLabel, closeLabel: closeLabel, maxBodyHeight: maxBodyHeight,
            isBodyScrollLocked: isBodyScrollLocked, takesFocus: takesFocus, presence: presence, layout: layout,
            tone: tone, showsDivider: showsDivider, expandedMaxWidth: expandedMaxWidth, onRevive: onRevive,
            buttons: buttons, primary: primary, headerTrailing: { EmptyView() }, content: content
        )
    }
}

public extension MeeshyExpandingPill where Primary == EmptyView {
    init(
        label: String,
        option: MeeshyExpandingPillOption? = nil,
        onBack: (() -> Void)? = nil,
        onClose: (() -> Void)? = nil,
        onEscape: (() -> Void)? = nil,
        backLabel: String = MeeshyExpandingPillCopy.back,
        closeLabel: String = MeeshyExpandingPillCopy.close,
        maxBodyHeight: CGFloat? = nil,
        isBodyScrollLocked: Bool = false,
        takesFocus: Bool = true,
        presence: MeeshyGlassPillPresence = .shown,
        layout: MeeshyGlassPillLayout = .hug,
        tone: MeeshyGlassTone? = nil,
        showsDivider: Bool = false,
        expandedMaxWidth: CGFloat = MeeshyGlassPillRecipe.expandedMaxWidth,
        onRevive: (() -> Void)? = nil,
        @ViewBuilder buttons: @escaping (MeeshyGlassButtonSize) -> Buttons,
        @ViewBuilder headerTrailing: () -> HeaderTrailing,
        @ViewBuilder content: @escaping (MeeshyExpandingPillOption) -> Content
    ) {
        self.init(
            label: label, option: option, onBack: onBack, onClose: onClose, onEscape: onEscape,
            backLabel: backLabel, closeLabel: closeLabel, maxBodyHeight: maxBodyHeight,
            isBodyScrollLocked: isBodyScrollLocked, takesFocus: takesFocus, presence: presence, layout: layout,
            tone: tone, showsDivider: showsDivider, expandedMaxWidth: expandedMaxWidth, onRevive: onRevive,
            buttons: buttons, primary: { EmptyView() }, headerTrailing: headerTrailing, content: content
        )
    }
}

public extension MeeshyExpandingPill where Primary == EmptyView, HeaderTrailing == EmptyView {
    init(
        label: String,
        option: MeeshyExpandingPillOption? = nil,
        onBack: (() -> Void)? = nil,
        onClose: (() -> Void)? = nil,
        onEscape: (() -> Void)? = nil,
        backLabel: String = MeeshyExpandingPillCopy.back,
        closeLabel: String = MeeshyExpandingPillCopy.close,
        maxBodyHeight: CGFloat? = nil,
        isBodyScrollLocked: Bool = false,
        takesFocus: Bool = true,
        presence: MeeshyGlassPillPresence = .shown,
        layout: MeeshyGlassPillLayout = .hug,
        tone: MeeshyGlassTone? = nil,
        showsDivider: Bool = false,
        expandedMaxWidth: CGFloat = MeeshyGlassPillRecipe.expandedMaxWidth,
        onRevive: (() -> Void)? = nil,
        @ViewBuilder buttons: @escaping (MeeshyGlassButtonSize) -> Buttons,
        @ViewBuilder content: @escaping (MeeshyExpandingPillOption) -> Content
    ) {
        self.init(
            label: label, option: option, onBack: onBack, onClose: onClose, onEscape: onEscape,
            backLabel: backLabel, closeLabel: closeLabel, maxBodyHeight: maxBodyHeight,
            isBodyScrollLocked: isBodyScrollLocked, takesFocus: takesFocus, presence: presence, layout: layout,
            tone: tone, showsDivider: showsDivider, expandedMaxWidth: expandedMaxWidth, onRevive: onRevive,
            buttons: buttons, primary: { EmptyView() }, headerTrailing: { EmptyView() }, content: content
        )
    }
}

import SwiftUI

// MARK: - Les deux rails

/// **Les rails d'actions des bords** (K12) : deux rails verticaux de verre, au
/// bord de début et au bord de fin de leur conteneur. Courts et sans texte quand
/// ils sortent à la demande et se rangent par leur bord ; libellés, avec un
/// en-tête, quand la place existe et qu'ils restent sortis.
///
/// L'hôte choisit tout ce qui est produit : les actions, leur ordre, leurs mots,
/// la présentation (élue par la place libre autour du contenu, jamais par la
/// classe de taille) et la visibilité. Ce composant ne porte aucune chaîne
/// traduite et ne nomme aucun type d'écran.
///
/// - Un rail sans entrée n'existe pas.
/// - `onAction(id)` part une fois, au relâcher dans la cible.
/// - `custom` rend les emplacements `.custom(id:)` (Coller, une rangée enveloppée
///   dans un menu) : une cellule de 44 × 44 en court, une rangée de 44 de haut en
///   libellé. Le contenu d'un emplacement porte son propre état.
public struct MeeshyEdgeRails<Custom: View>: View {
    private let leading: MeeshyEdgeRailSpec?
    private let trailing: MeeshyEdgeRailSpec?
    private let presentation: MeeshyEdgeRailsPresentation
    private let visibility: MeeshyEdgeRailsVisibility
    private let tone: MeeshyGlassTone?
    private let edgeInset: CGFloat
    private let safeInset: CGFloat
    private let leadingClearance: MeeshyEdgeRailClearance
    private let trailingClearance: MeeshyEdgeRailClearance
    private let onAction: (String) -> Void
    private let onLongPress: ((String) -> Void)?
    private let custom: (String, MeeshyEdgeRailsPresentation) -> Custom

    public init(
        leading: MeeshyEdgeRailSpec? = nil,
        trailing: MeeshyEdgeRailSpec? = nil,
        presentation: MeeshyEdgeRailsPresentation = .compact,
        visibility: MeeshyEdgeRailsVisibility = .shown,
        tone: MeeshyGlassTone? = nil,
        edgeInset: CGFloat = MeeshyEdgeRailsRecipe.defaultEdgeInset,
        safeInset: CGFloat = 0,
        leadingClearance: MeeshyEdgeRailClearance = .zero,
        trailingClearance: MeeshyEdgeRailClearance = .zero,
        onAction: @escaping (String) -> Void,
        onLongPress: ((String) -> Void)? = nil,
        @ViewBuilder custom: @escaping (String, MeeshyEdgeRailsPresentation) -> Custom
    ) {
        self.leading = leading
        self.trailing = trailing
        self.presentation = presentation
        self.visibility = visibility
        self.tone = tone
        self.edgeInset = edgeInset
        self.safeInset = safeInset
        self.leadingClearance = leadingClearance
        self.trailingClearance = trailingClearance
        self.onAction = onAction
        self.onLongPress = onLongPress
        self.custom = custom
    }

    public var body: some View {
        ZStack {
            rail(leading, side: .leading, clearance: leadingClearance)
            rail(trailing, side: .trailing, clearance: trailingClearance)
        }
    }

    private func rail(
        _ spec: MeeshyEdgeRailSpec?,
        side: MeeshyEdgeRailSide,
        clearance: MeeshyEdgeRailClearance
    ) -> some View {
        MeeshyEdgeRail(
            spec: spec, side: side, presentation: presentation, visibility: visibility, tone: tone,
            edgeInset: edgeInset, safeInset: safeInset, clearance: clearance,
            onAction: onAction, onLongPress: onLongPress, custom: custom
        )
        .equatable()
    }
}

public extension MeeshyEdgeRails where Custom == EmptyView {
    init(
        leading: MeeshyEdgeRailSpec? = nil,
        trailing: MeeshyEdgeRailSpec? = nil,
        presentation: MeeshyEdgeRailsPresentation = .compact,
        visibility: MeeshyEdgeRailsVisibility = .shown,
        tone: MeeshyGlassTone? = nil,
        edgeInset: CGFloat = MeeshyEdgeRailsRecipe.defaultEdgeInset,
        safeInset: CGFloat = 0,
        leadingClearance: MeeshyEdgeRailClearance = .zero,
        trailingClearance: MeeshyEdgeRailClearance = .zero,
        onAction: @escaping (String) -> Void,
        onLongPress: ((String) -> Void)? = nil
    ) {
        self.init(
            leading: leading, trailing: trailing, presentation: presentation, visibility: visibility,
            tone: tone, edgeInset: edgeInset, safeInset: safeInset,
            leadingClearance: leadingClearance, trailingClearance: trailingClearance,
            onAction: onAction, onLongPress: onLongPress, custom: { _, _ in EmptyView() }
        )
    }
}

// MARK: - Un rail

/// **Un rail seul**, posé par l'hôte (le viseur n'en garde qu'un). `spec` nul :
/// l'hôte veut le rail rangé. Un rail monté déjà demandé s'affiche à sa place,
/// sans entrer : l'entrée et le rangement se jouent quand la demande change. Il compare ses VALEURS (les rappels, passés par
/// `id`, n'en font pas partie) : un hôte qui se re-rend à valeurs égales ne
/// re-rend pas le rail, ni l'autre rail, ni les voisins d'une entrée pressée.
public struct MeeshyEdgeRail<Custom: View>: View, Equatable {
    let spec: MeeshyEdgeRailSpec?
    let side: MeeshyEdgeRailSide
    let presentation: MeeshyEdgeRailsPresentation
    let visibility: MeeshyEdgeRailsVisibility
    let tone: MeeshyGlassTone?
    let edgeInset: CGFloat
    let safeInset: CGFloat
    let clearance: MeeshyEdgeRailClearance
    let onAction: (String) -> Void
    let onLongPress: ((String) -> Void)?
    let custom: (String, MeeshyEdgeRailsPresentation) -> Custom

    @State private var presence = MeeshyEdgeRailsPresence<MeeshyEdgeRailSpec>()
    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userReduceMotion

    public init(
        spec: MeeshyEdgeRailSpec?,
        side: MeeshyEdgeRailSide,
        presentation: MeeshyEdgeRailsPresentation = .compact,
        visibility: MeeshyEdgeRailsVisibility = .shown,
        tone: MeeshyGlassTone? = nil,
        edgeInset: CGFloat = MeeshyEdgeRailsRecipe.defaultEdgeInset,
        safeInset: CGFloat = 0,
        clearance: MeeshyEdgeRailClearance = .zero,
        onAction: @escaping (String) -> Void,
        onLongPress: ((String) -> Void)? = nil,
        @ViewBuilder custom: @escaping (String, MeeshyEdgeRailsPresentation) -> Custom
    ) {
        self.spec = spec
        self.side = side
        self.presentation = presentation
        self.visibility = visibility
        self.tone = tone
        self.edgeInset = edgeInset
        self.safeInset = safeInset
        self.clearance = clearance
        self.onAction = onAction
        self.onLongPress = onLongPress
        self.custom = custom
        var initial = MeeshyEdgeRailsPresence<MeeshyEdgeRailSpec>()
        initial.wants(visibility == .hidden ? nil : spec?.normalized)
        initial.settled()
        _presence = State(initialValue: initial)
    }

    public static func == (lhs: MeeshyEdgeRail, rhs: MeeshyEdgeRail) -> Bool {
        lhs.spec == rhs.spec && lhs.side == rhs.side && lhs.presentation == rhs.presentation
            && lhs.visibility == rhs.visibility && lhs.tone == rhs.tone && lhs.edgeInset == rhs.edgeInset
            && lhs.safeInset == rhs.safeInset && lhs.clearance == rhs.clearance
    }

    public var body: some View {
        switch presentation {
        case .compact:
            compactBody
        case .labeled(let width):
            labeledBody(width)
        }
    }

    // MARK: Court : il sort, il se range

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userReduceMotion)
    }

    /// Ce que l'hôte veut vu : rien quand le rail est rangé (`hidden`) ou vide.
    private var wantedCompact: MeeshyEdgeRailSpec? {
        visibility == .hidden ? nil : spec?.normalized
    }

    @ViewBuilder
    private var compactBody: some View {
        let isAway = presence.isAway
        ZStack {
            if let content = presence.content {
                placed(MeeshyEdgeRailCompactBody(
                    spec: content, tone: tone, onAction: onAction, onLongPress: onLongPress, custom: custom
                ))
                .offset(x: MeeshyEdgeRailsRecipe.travel(
                    side: side, isRightToLeft: layoutDirection == .rightToLeft, edgeInset: edgeInset,
                    safeInset: safeInset, isAway: isAway, reduceMotion: reduceMotion
                ))
                .opacity(isAway ? 0 : (visibility == .dimmed ? MeeshyEdgeRailsRecipe.dimmedOpacity : 1))
                .animation(
                    .easeInOut(duration: MeeshyEdgeRailsRecipe.slideDuration(reduceMotion: reduceMotion)),
                    value: isAway
                )
                .allowsHitTesting(presence.acceptsTouch && visibility != .dimmed)
                .accessibilityHidden(!MeeshyEdgeRailsRecipe.isReadByScreenReader(visibility))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .adaptiveOnChange(of: wantedCompact) { _, wanted in presence.wants(wanted) }
        .task(id: presence.phase) { await drivePresence() }
    }

    /// Entrant : à sa place une image plus tard. Sortant : démonté une fois la
    /// sortie jouée. Le démontage annule la tâche : ni minuteur ni écouteur retenu.
    private func drivePresence() async {
        switch presence.phase {
        case .entering:
            do { try await Task.sleep(for: .milliseconds(16)) } catch { return }
            presence.settled()
        case .leaving:
            let seconds = MeeshyEdgeRailsRecipe.slideDuration(reduceMotion: reduceMotion)
            do { try await Task.sleep(for: .seconds(seconds)) } catch { return }
            presence.exited()
        case .absent, .present:
            break
        }
    }

    // MARK: Libellé : il reste, il se grise

    @ViewBuilder
    private func labeledBody(_ width: MeeshyEdgeRailWidth) -> some View {
        if let content = spec?.normalized {
            placed(MeeshyEdgeRailLabeledBody(
                spec: content, width: width, tone: tone, onAction: onAction, onLongPress: onLongPress, custom: custom
            ))
            .opacity(MeeshyEdgeRailsRecipe.opacity(of: visibility))
            .animation(
                .easeInOut(duration: MeeshyEdgeRailsRecipe.dimDuration(reduceMotion: reduceMotion)),
                value: visibility
            )
            .allowsHitTesting(MeeshyEdgeRailsRecipe.servesTouch(visibility))
            .accessibilityHidden(!MeeshyEdgeRailsRecipe.isReadByScreenReader(visibility))
        }
    }

    // MARK: La place

    private func placed<Content: View>(_ content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: side == .leading ? .leading : .trailing)
            .padding(.horizontal, safeInset + edgeInset + clearance.inline)
            .padding(.top, clearance.top)
            .padding(.bottom, clearance.bottom)
    }
}

public extension MeeshyEdgeRail where Custom == EmptyView {
    init(
        spec: MeeshyEdgeRailSpec?,
        side: MeeshyEdgeRailSide,
        presentation: MeeshyEdgeRailsPresentation = .compact,
        visibility: MeeshyEdgeRailsVisibility = .shown,
        tone: MeeshyGlassTone? = nil,
        edgeInset: CGFloat = MeeshyEdgeRailsRecipe.defaultEdgeInset,
        safeInset: CGFloat = 0,
        clearance: MeeshyEdgeRailClearance = .zero,
        onAction: @escaping (String) -> Void,
        onLongPress: ((String) -> Void)? = nil
    ) {
        self.init(
            spec: spec, side: side, presentation: presentation, visibility: visibility, tone: tone,
            edgeInset: edgeInset, safeInset: safeInset, clearance: clearance,
            onAction: onAction, onLongPress: onLongPress, custom: { _, _ in EmptyView() }
        )
    }
}

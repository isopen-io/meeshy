import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'état de dépliage d'un message long, remis par l'hôte de la liste
/// (#8147) : UN seul message déplié à la fois, et c'est l'hôte qui le sait —
/// lui seul peut replier le précédent, réserver la hauteur sans saut de
/// défilement et poser l'effet Focal sur le déplié.
///
/// Voyage par l'environnement jusqu'à la bulle, dont la chaîne
/// `ThemedMessageBubble` → `BubbleStandardLayout` n'a pas à le connaître ;
/// la rangée plate le reçoit par son `FocalRowInput`. Égalité sur l'état
/// seul : la fermeture est reconstruite à chaque configuration.
struct LongMessageExpansion: Equatable {
    let isExpanded: Bool
    let toggle: () -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.isExpanded == rhs.isExpanded
    }
}

private struct LongMessageExpansionKey: EnvironmentKey {
    static let defaultValue: LongMessageExpansion? = nil
}

extension EnvironmentValues {
    var longMessageExpansion: LongMessageExpansion? {
        get { self[LongMessageExpansionKey.self] }
        set { self[LongMessageExpansionKey.self] = newValue }
    }
}

/// Texte d'un message, replié sur son EXTRAIT quand il est long (#8147).
///
/// La loi de l'extrait est `LongMessageExcerpt` (SDK, miroir de la loi
/// partagée) : au-delà du seuil, un quart du texte coupé au mot, suivi de
/// « … Lire la suite ». Le dépliage se fait EN PLACE, dans le fil, et
/// « Réduire » replie — il n'existe plus de feuille de lecture.
///
/// Le texte reçu est le texte SERVI par le Prisme : l'extrait porte sur la
/// langue affichée, jamais sur l'original quand une traduction est servie.
///
/// Équatable manuel : on exclut les fermetures et l'état local.
struct BubbleExpandableText: View, Equatable {

    /// Etat pur, testable sans SwiftUI.
    struct State: Equatable {
        let content: String
        let isExpanded: Bool

        var isLong: Bool { LongMessageExcerpt.isLong(content) }

        /// Le texte à rendre : l'extrait replié, le message entier sinon.
        var displayedText: String {
            guard !isExpanded, let excerpt = LongMessageExcerpt.excerpt(content) else { return content }
            return excerpt + "…"
        }

        var showsReadMore: Bool { isLong && !isExpanded }
        var showsCollapse: Bool { isLong && isExpanded }
    }

    let content: String
    let isMe: Bool
    let mentionDisplayNames: [String: String]
    let highlightTerm: String?
    let mentionTint: Color
    let hashtagTint: Color
    let linkTint: Color
    /// Porte par les inputs (comme les voisins du dossier, cf.
    /// `BubbleMetaBadges.swift:8-10`) pour forcer le re-render au bascule
    /// clair/sombre : sans lui, `Equatable` juge la vue inchangee et `body`
    /// n'est pas rappele, donc `MeeshyColors.textPrimary` garde son ancienne
    /// valeur jusqu'a la reconstruction de la cellule.
    let isDark: Bool
    /// `[rawURL: token]` outbound-link tracking map → raw URLs link to
    /// `/l/<token>`. Empty by default (no rewrite) for non-message callers.
    var trackedLinks: [String: String] = [:]
    /// Taille de rendu du texte. `15` = la cote de bulle historique ; la
    /// rangée plate passe la sienne (`FocalMetrics.Text.size`).
    /// `MessageTextRenderer.render` produit une `AttributedString` dont
    /// chaque run porte sa police explicite : un `.font()` externe serait un
    /// no-op silencieux.
    var fontSize: CGFloat = 15
    /// Dépliage piloté par l'hôte. `nil` ⇒ l'environnement
    /// (`longMessageExpansion`) ; à défaut, un état local — un hôte qui ne
    /// sait rien du dépliage garde un texte qui se déplie et se replie.
    var expansion: LongMessageExpansion? = nil

    @SwiftUI.State private var localExpanded = false
    @Environment(\.longMessageExpansion) private var hostExpansion
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.content == rhs.content &&
        lhs.isMe == rhs.isMe &&
        lhs.mentionDisplayNames == rhs.mentionDisplayNames &&
        lhs.highlightTerm == rhs.highlightTerm &&
        lhs.mentionTint == rhs.mentionTint &&
        lhs.hashtagTint == rhs.hashtagTint &&
        lhs.linkTint == rhs.linkTint &&
        lhs.isDark == rhs.isDark &&
        lhs.trackedLinks == rhs.trackedLinks &&
        lhs.fontSize == rhs.fontSize &&
        lhs.expansion == rhs.expansion
    }

    private var resolvedExpansion: LongMessageExpansion? { expansion ?? hostExpansion }

    private var state: State {
        State(content: content, isExpanded: resolvedExpansion?.isExpanded ?? localExpanded)
    }

    var body: some View {
        let state = state
        let textColor = isMe ? Color.white : MeeshyColors.textPrimary(isDark: isDark)

        VStack(alignment: .leading, spacing: 4) {
            MessageTextRenderer.render(state.displayedText, fontSize: fontSize, color: textColor, mentionColor: mentionTint, hashtagColor: hashtagTint, accentColor: linkTint, mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames, highlightTerm: highlightTerm, trackedLinks: trackedLinks.isEmpty ? nil : trackedLinks)
                .fixedSize(horizontal: false, vertical: true)
                .tint(linkTint)
                // Pas de `.textSelection(.enabled)` : le long-press doit ouvrir
                // le menu contextuel custom Meeshy (`MessageActionsMenu`, qui
                // porte « Copier »), jamais le menu d'édition natif iOS.

            if state.isLong {
                toggleLabel(isExpanded: state.isExpanded, textColor: textColor)
            }
        }
    }

    /// « Lire la suite » / « Réduire », aligné en bas à droite.
    ///
    /// - `.padding(.trailing, 48)` : exclut le coin où l'overlay des réactions
    ///   (bouton « + », 40 pt débordant de 4) prend ses touches.
    /// - `.highPriorityGesture` : le tap gagne sur l'appui long du parent
    ///   (`BubbleSwipeContainer`).
    /// - Hauteur de layout compacte (24 pt) : la cible atteint les 44 pt HIG
    ///   par une forme de contact étendue vers le BAS seulement, jamais vers
    ///   le texte au-dessus.
    /// - Ce n'est pas un vrai `Button` : l'activation VoiceOver passe par
    ///   `.accessibilityAction`, et l'état se dit par `accessibilityValue`.
    private func toggleLabel(isExpanded: Bool, textColor: Color) -> some View {
        let title = isExpanded ? Self.collapseTitle : Self.readMoreTitle
        return Text(title)
            .font(MeeshyFont.relative(12, weight: .semibold))
            .foregroundColor(textColor.opacity(0.6))
            .frame(maxWidth: .infinity, minHeight: 24, alignment: .trailing)
            .padding(.trailing, 48)
            .contentShape(DownwardExtendedTapShape(extraBottom: 20))
            .textSelection(.disabled)
            .highPriorityGesture(TapGesture().onEnded { toggle() })
            .accessibilityIdentifier(isExpanded ? "bubble.expand.less" : "bubble.expand.more")
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(title)
            .accessibilityValue(isExpanded ? Self.expandedValue : Self.collapsedValue)
            .accessibilityHint(Text(isExpanded ? Self.collapseHint : Self.readMoreHint))
            .accessibilityAction { toggle() }
    }

    /// Partagé par le tap et l'action VoiceOver. L'hôte anime la hauteur de
    /// la cellule ; seul l'état local (hôte muet) s'anime ici — jamais sous
    /// Réduire le mouvement.
    private func toggle() {
        HapticFeedback.light()
        if let resolvedExpansion {
            resolvedExpansion.toggle()
            return
        }
        guard !reduceMotion else { return localExpanded.toggle() }
        withAnimation(.easeInOut(duration: 0.25)) { localExpanded.toggle() }
    }

    // MARK: - Libellés (un seul vocabulaire pour tous les modes de lecture)

    static var readMoreTitle: String {
        String(localized: "message.long.readMore", defaultValue: "Lire la suite", bundle: .main)
    }

    static var collapseTitle: String {
        String(localized: "message.long.collapse", defaultValue: "Réduire", bundle: .main)
    }

    static var readMoreHint: String {
        String(localized: "bubble.expand.more.hint", defaultValue: "Affiche le message complet", bundle: .main)
    }

    static var collapseHint: String {
        String(localized: "message.long.collapse.hint", defaultValue: "Replie le message sur son extrait", bundle: .main)
    }

    static var expandedValue: String {
        String(localized: "message.long.expanded", defaultValue: "Déplié", bundle: .main)
    }

    static var collapsedValue: String {
        String(localized: "message.long.collapsed", defaultValue: "Replié", bundle: .main)
    }
}

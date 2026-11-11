import CoreGraphics
import Foundation

/// #17343 — ce que la pilule porte de TEXTE au-dessus de sa rangée de base. Les
/// sous-titres et le journal vivent DANS son verre, en duo comme en groupe ; le
/// journal s'ouvre à la place des sous-titres ; (…) les range tous deux et refermer
/// les actions les rend ; un toucher qui range la pilule laisse les sous-titres dans
/// un verre sans rangée (loi 11 de `docs/product/appels-vue-finale.md`).
enum CallPillText: Equatable, Sendable {
    /// Rien au-dessus de la rangée de base.
    case none
    /// Les deux dernières phrases, dans le verre de la pilule.
    case captions
    /// Tout l'appel, à la place des sous-titres.
    case journal
    /// La pilule est rangée : les sous-titres restent, dans un verre sans rangée de base.
    case captionsAlone

    /// `isCaptionsEnabled` : le réglage Sous-titres de l'utilisateur. Le journal, lui,
    /// garde tout l'appel sous-titres allumés ou non (#17342).
    static func resolve(isCaptionsEnabled: Bool, layer: CallScreenLayer, isChromeRevealed: Bool) -> CallPillText {
        guard !layer.freesTheScreen else { return .none }
        guard isChromeRevealed else { return isCaptionsEnabled ? .captionsAlone : .none }
        if layer.pillPanel == .journal { return .journal }
        return isCaptionsEnabled && layer == .idle ? .captions : .none
    }

    /// Seule la pilule rangée laisse les sous-titres sans leur rangée de base.
    var hasBaseRow: Bool {
        self != .captionsAlone
    }

    /// Le journal prend une part de la fenêtre (`CallJournalSizing`) : en audio,
    /// l'avatar se resserre alors en en-tête compact pour lui laisser la place.
    var compactsAudioLayout: Bool {
        self == .journal
    }
}

/// #17343 — UNE largeur pour le verre : la pilule qui porte du texte et le verre
/// des sous-titres rangés sont limités à 560 pt pour que l'œil ne balaie pas tout
/// l'écran (paysage, tablette) ; la pilule au repos garde ses 440 pt.
enum CallPillWidth {
    static let resting: CGFloat = 440
    static let text: CGFloat = 560

    static func maxWidth(for content: CallPillText) -> CGFloat {
        content == .none ? resting : text
    }
}

/// #17343 — la hauteur du journal dans la pilule : une part de la fenêtre, jamais
/// sous un plancher lisible ni au-dessus d'un plafond (la grille de groupe garde ainsi
/// sa place).
enum CallJournalSizing {
    static let share: CGFloat = 0.45
    static let minimum: CGFloat = 160
    static let maximum: CGFloat = 440

    static func height(windowHeight: CGFloat) -> CGFloat {
        min(max(windowHeight * share, minimum), maximum)
    }
}

/// #17343 — le pied des sous-titres : ce que la ligne dit de sa traduction, à côté du
/// bouton Journal (« EN → FR · toucher = original »).
enum CallCaptionsFooter: Equatable, Sendable {
    case none
    case touchForOriginal(pair: String)

    static func resolve(lines: [CallCaptionLine]) -> CallCaptionsFooter {
        guard let pair = lines.last(where: { !$0.isEvent && $0.languageTag != nil })?.languageTag else { return .none }
        return .touchForOriginal(pair: pair)
    }
}

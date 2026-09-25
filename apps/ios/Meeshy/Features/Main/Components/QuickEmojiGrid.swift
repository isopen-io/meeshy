import CoreGraphics

/// **Les emojis rapides de l'emplacement d'action** (#7931, #7985).
///
/// Trois emojis, les plus employés, sur UNE rangée à la hauteur de la ligne de
/// saisie — EN PERMANENCE, focus ou non (directive porteur 2026-09-25 : « on
/// doit maintenir le composant des emojis à 3 tout le temps »). La barre
/// d'outils garde toute sa largeur. Chaque cellule reste sous la cible tactile
/// de 44 pt (décision ouverte #7979) ; l'appui long vers la feuille des emojis
/// en est le recours.
nonisolated enum QuickEmojiGrid {

    static let count = 3
    static let cell: CGFloat = 32
    static let spacing: CGFloat = 3
    static let inset: CGFloat = 4
    static let emojiSize: CGFloat = 24
    /// La hauteur de la ligne de saisie, sur laquelle le cadre s'aligne.
    static let rowHeight: CGFloat = 44

    /// La largeur de la rangée.
    static var width: CGFloat {
        CGFloat(count) * cell + CGFloat(count - 1) * spacing
    }

    /// La largeur du cadre de verre, et donc celle que la ligne lui réserve.
    static var frameWidth: CGFloat { width + 2 * inset }

    /// Les trois premiers, jamais plus.
    static func row(_ emojis: [String]) -> [String] {
        Array(emojis.prefix(count))
    }
}

/// **Le retour après envoi, adouci** (#7985, directive porteur 2026-09-25 :
/// « l'effet de retour après l'envoi du message doit être moins accentué »).
///
/// Le bouton d'envoi part et les emojis rapides reviennent dans le même
/// emplacement. Le tourbillon d'origine (#3927) les faisait tourner de 250° en
/// partant d'un vingtième de leur taille, sur un ressort qui rebondissait : un
/// effet plus fort que l'acte qu'il accompagne, rejoué à CHAQUE envoi. Il en
/// reste un léger pivot, un léger grossissement et un ressort presque amorti.
nonisolated enum ComposerSlotMotion {
    static let rotationDegrees: Double = 40
    static let startScale: CGFloat = 0.6
    static let response: Double = 0.3
    static let damping: Double = 0.86
    static let sendBounceScale: CGFloat = 1.08
}

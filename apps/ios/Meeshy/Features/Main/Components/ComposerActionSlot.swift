import Foundation

/// **Ce que l'emplacement d'action du composer MONTRE.**
///
/// L'emplacement de 44 points à droite du champ porte deux emojis rapides
/// quand il n'y a rien à envoyer (#3927), et le bouton d'envoi dès qu'il y a
/// quelque chose — du texte compris (directive porteur 2026-09-25 : « remettre
/// le bouton envoyer quand on a un texte à envoyer plutôt que les stickers
/// textuels »). Les cadres à mots de #5326 restent à un appui long du bouton
/// d'envoi.
nonisolated enum ComposerActionSlot: Equatable {

    /// Deux emojis rapides — il n'y a rien à envoyer (#3927).
    case quickEmoji
    /// Le bouton rond : envoi, ou coche en mode édition. Le site le rend
    /// invisible quand il n'y a rien à envoyer, sans jamais l'effondrer.
    case send

    /// **Au-delà de sept mots, la touche Retour passe à la ligne** (directive
    /// porteur 2026-09-14, #6537) : un texte long se met en forme, une phrase
    /// courte part d'une touche.
    static let textStickerWordLimit = 7

    /// Les mots d'une saisie — une loi PURE, insensible aux espaces multiples
    /// et aux retours à la ligne. `split(whereSeparator:)` écarte les
    /// séparations vides, donc « a   b\n\nc » vaut trois mots, pas six.
    static func wordCount(_ text: String) -> Int {
        text.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).count
    }

    /// `true` quand la saisie dépasse la borne — le seul prédicat que l'hôte
    /// consulte, pour que la borne ne se recopie nulle part.
    static func exceedsTextStickerLimit(_ text: String) -> Bool {
        wordCount(text) > textStickerWordLimit
    }

    /// - Parameters:
    ///   - hasText: le champ porte du texte.
    ///   - hasOtherContent: pièce jointe, lieu en attente ou enregistrement.
    ///   - isEditMode: un message existant est en cours de modification.
    ///   - offersQuickEmoji: le mode autorise les emojis rapides.
    static func resolve(hasText: Bool,
                        hasOtherContent: Bool,
                        isEditMode: Bool,
                        offersQuickEmoji: Bool) -> ComposerActionSlot {
        if isEditMode || hasOtherContent || hasText { return .send }
        return offersQuickEmoji ? .quickEmoji : .send
    }
}

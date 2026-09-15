import Foundation

/// **Ce que l'emplacement d'action du composer MONTRE** (directive porteur
/// 2026-09-06, #5326 : « le bouton d'envoi qui apparaissait après la zone de
/// texte doit devenir une des icônes de sticker dynamique »).
///
/// L'emplacement de 44 points à droite du champ a porté successivement un
/// bouton d'envoi (toujours monté, invisible à vide — bug 2026-05-28), puis
/// deux emojis rapides quand il n'y a rien à envoyer (#3927), et désormais un
/// cadre à mots quand il n'y a QUE du texte.
///
/// ## Pourquoi une règle, et pas trois conditions dans le corps de la vue
///
/// Les trois contenus se recouvrent : du texte ET une pièce jointe, une
/// édition dont on a tout effacé, un envoi déjà en vol. Écrite dans un
/// `@ViewBuilder`, cette décision ne se vérifie qu'en montant un clavier ;
/// écrite ici, chaque état a son témoin.
///
/// ## Ce que la touche du clavier a changé
///
/// Depuis que la touche Retour envoie (`ComposerReturnKey`), le bouton rond
/// DOUBLONNE le clavier pour un message de texte. C'est ce doublon que la
/// directive récupère — mais **seulement là où le clavier est effectivement une
/// sortie**. Une pièce jointe en attente, un enregistrement, une édition, **ou
/// simplement un clavier baissé** : dans ces états le bouton reste le seul moyen
/// d'envoyer. Le rendre partout aurait échangé un doublon contre une impasse.
nonisolated enum ComposerActionSlot: Equatable {

    /// Deux emojis rapides — il n'y a rien à envoyer (#3927).
    case quickEmoji
    /// La pastille du cadre à mots — un tap envoie le texte rendu dedans.
    case textSticker
    /// Le bouton rond : envoi, ou coche en mode édition. Le site le rend
    /// invisible quand il n'y a rien à envoyer, sans jamais l'effondrer.
    case send

    /// - Parameters:
    ///   - hasText: le champ porte du texte.
    ///   - hasOtherContent: pièce jointe, lieu en attente ou enregistrement en
    ///     cours — tout ce qu'un sticker ne saurait pas emporter.
    ///   - isEditMode: un message existant est en cours de modification.
    ///   - isSending: un envoi est déjà en vol (piloté par l'hôte).
    ///   - keyboardIsUp: le champ a le focus, donc la touche du clavier est
    ///     une sortie. **C'est la condition qui empêche l'impasse** : un
    ///     brouillon restauré à l'ouverture, ou un texte dont le défilement a
    ///     fermé le clavier (`.scrollDismissesKeyboard(.interactively)`),
    ///     laisse un champ plein SANS touche Retour à portée. Rendre la
    ///     pastille là aurait retiré le seul moyen d'envoyer ce texte — on
    ///     aurait échangé un doublon contre un cul-de-sac.
    ///   - offersQuickEmoji: le mode autorise les emojis rapides.
    ///   - exceedsWordLimit: la saisie dépasse `textStickerWordLimit` (#6537).
    ///     **Passé la borne, le bouton ordinaire gagne sur tout**, y compris sur
    ///     un clavier ouvert : c'est la seule condition qui ne regarde pas l'état
    ///     du chrome mais le CONTENU.
    ///   - offersTextSticker: **l'hôte sait envoyer un sticker de texte.** Sans
    ///     lui la pastille ne partirait nulle part, et un contrôle qui ne fait
    ///     rien ne se monte pas (loi 4).
    /// **Au-delà de sept mots, un cadre à mots n'a plus de sens** (directive
    /// porteur 2026-09-14, #6537).
    ///
    /// La pastille rend le texte DANS une image : elle sert une phrase, pas un
    /// paragraphe. Passé cette borne, le bouton d'envoi ordinaire reprend la
    /// place — et la touche Retour du clavier redevient un saut de ligne, pour
    /// qu'un texte long se mette en forme.
    ///
    /// Sept, et non « une longueur en caractères » : c'est la borne que la
    /// directive donne, et le mot est l'unité que l'auteur voit.
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

    static func resolve(hasText: Bool,
                        hasOtherContent: Bool,
                        isEditMode: Bool,
                        isSending: Bool,
                        keyboardIsUp: Bool,
                        offersQuickEmoji: Bool,
                        offersTextSticker: Bool,
                        exceedsWordLimit: Bool) -> ComposerActionSlot {
        // Une édition se valide, elle ne se décore pas : la coche gagne sur
        // tout le reste, y compris sur un champ vidé.
        if isEditMode { return .send }
        // Le clavier n'est pas garanti ouvert dès qu'autre chose attend :
        // le bouton reste alors la seule sortie.
        if hasOtherContent { return .send }
        if hasText {
            // AU-DELÀ DE SEPT MOTS, le bouton ordinaire (#6537) — quel que soit
            // l'état du clavier. Un cadre à mots sert une phrase ; un paragraphe
            // veut un envoi et des sauts de ligne.
            if exceedsWordLimit { return .send }
            let laToucheEstUneSortie = keyboardIsUp && !isSending
            return (offersTextSticker && laToucheEstUneSortie) ? .textSticker : .send
        }
        return offersQuickEmoji ? .quickEmoji : .send
    }
}

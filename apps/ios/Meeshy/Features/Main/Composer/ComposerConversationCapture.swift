import UIKit

// **La caméra de la barre de composition, et ce que la scène rend au message**
// (#9123, #9124). Règles pures : le meuble les compose, aucune ne lit un état.

/// **Le viseur s'arme à l'ouverture pour UNE porte : la caméra de la barre**
/// (#9123). C'est une règle d'ORIGINE, distincte de #4851 qui a retiré
/// l'armement au montage pour toutes les portes de composition : ici l'auteur a
/// touché « caméra » — le viseur EST ce qu'il a demandé, pas un écran imposé.
nonisolated enum ComposerConversationCapture {

    static func armsViewfinderOnOpen(origin: ComposerOrigin) -> Bool {
        isCaptureDoor(origin)
    }

    /// Une prise que l'auteur n'a pas retouchée repart TELLE QUELLE — le
    /// message n'en a aucune autre copie. Une retouche intacte, elle, garde la
    /// pièce d'origine déjà en attente.
    static func returnsUneditedCapture(origin: ComposerOrigin) -> Bool {
        isCaptureDoor(origin)
    }

    private static func isCaptureDoor(_ origin: ComposerOrigin) -> Bool {
        switch origin {
        case .conversationCapture:
            return true
        case .storyTray, .feedComposer, .moodChip, .repost, .edit, .draft, .share,
             .conversationMedia, .socialMedia, .conversationDraftImage:
            return false
        }
    }
}

/// Le média que « Terminé » rend au message : une image composée, ou une vidéo.
enum ComposerReturnedMedia {
    case image(UIImage)
    case video(URL)
}

nonisolated enum ComposerReturnAction: Equatable {
    /// Rien à rendre : la pièce en attente reste celle d'origine.
    case dismiss
    /// La prise elle-même, sans rendu — pleine définition, métadonnées comprises.
    case returnCapture
    case renderImage
    /// Une scène qui porte une vidéo se rend en vidéo (`StoryVideoExportService`).
    case renderVideo
}

nonisolated enum ComposerReturnMedia {
    static func action(edited: Bool, returnsCapture: Bool,
                       sceneHoldsMedia: Bool, sceneHasVideo: Bool) -> ComposerReturnAction {
        guard edited else { return returnsCapture && sceneHoldsMedia ? .returnCapture : .dismiss }
        return sceneHasVideo ? .renderVideo : .renderImage
    }
}

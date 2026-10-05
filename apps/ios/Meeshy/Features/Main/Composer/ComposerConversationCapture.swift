import UIKit

// **Ce que la scène rend au message** (#9123, #9124). Règles pures : le meuble
// les compose, aucune ne lit un état.
//
// **La caméra de la barre ne passe plus par la scène** (#9295, directive porteur
// 2026-10-04) : elle ouvre le viseur plein écran et verse sa prise au message
// (`ComposerReturnedMedia(capture:)`). L'origine `.conversationCapture` n'a donc
// plus de porte qui la monte ; ses règles restent tant que l'origine existe.

/// **Le viseur s'arme à l'ouverture pour UNE origine : `.conversationCapture`**
/// (#9123). C'est une règle d'ORIGINE, distincte de #4851 qui a retiré
/// l'armement au montage pour toutes les portes de composition : l'auteur a
/// touché « caméra » — le viseur EST ce qu'il a demandé, pas un écran imposé.
nonisolated enum ComposerConversationCapture {

    static func armsViewfinderOnOpen(origin: ComposerOrigin) -> Bool {
        isCaptureDoor(origin)
    }

    /// Un média que l'auteur n'a pas retouché repart TEL QUEL quand le message
    /// n'en a aucune autre copie — la prise de la caméra, la pièce de la bande
    /// des médias récents (#9124). Une retouche intacte d'une pièce DÉJÀ en
    /// attente, elle, la laisse en place.
    static func returnsUntouchedMedia(origin: ComposerOrigin) -> Bool {
        if case .conversationDraftMedia(let staged) = origin { return !staged }
        return isCaptureDoor(origin)
    }

    private static func isCaptureDoor(_ origin: ComposerOrigin) -> Bool {
        switch origin {
        case .conversationCapture:
            return true
        case .storyTray, .feedComposer, .moodChip, .repost, .edit, .draft, .share,
             .conversationMedia, .socialMedia, .conversationDraftMedia:
            return false
        }
    }
}

/// Le média que « Terminé » rend au message : une image composée, ou une vidéo.
enum ComposerReturnedMedia {
    case image(UIImage)
    case video(URL)
}

extension ComposerReturnedMedia {
    /// **La prise du viseur plein écran, versée au message** (#9295) : la
    /// caméra de la barre ne passe plus par la scène, elle rend sa prise par
    /// le même chemin de pose qu'une scène terminée.
    init(capture: CameraResult) {
        switch capture {
        case .photo(let image, _): self = .image(image)
        case .video(let url): self = .video(url)
        }
    }
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

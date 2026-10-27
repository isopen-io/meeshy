/// Libellés de la file de publication hors ligne.
///
/// Extrait de `StoryViewModel+Publication.swift`.

import Foundation
import MeeshySDK

/// **Ce que dit la file hors ligne, selon ce que l'auteur publie** (#8522).
/// Un post mis en file s'annonçait « Story enregistrée ».
nonisolated enum StoryPublishCopy {
    static func queuedForOffline(_ type: PostType) -> String {
        switch type {
        case .story:
            return String(localized: "story.publish.queue.enqueued",
                          defaultValue: "Story enregistrée — publication au retour en ligne")
        case .reel:
            return String(localized: "reel.publish.queue.enqueued",
                          defaultValue: "Réel enregistré — publication au retour en ligne")
        case .post, .status:
            return String(localized: "post.publish.queue.enqueued",
                          defaultValue: "Post enregistré — publication au retour en ligne")
        }
    }

    /// Le média qu'une publication hors ligne n'a pas pu garder, NOMMÉ
    /// (#10495) — « les médias » ne disait pas lequel reprendre.
    static func unsavedMedia(_ kind: StoryOfflineMediaWriter.MediaKind) -> String {
        switch kind {
        case .image:
            return String(localized: "story.publish.queue.mediaError.image",
                          defaultValue: "Une photo n'a pas pu être enregistrée — votre publication est gardée dans vos brouillons")
        case .video:
            return String(localized: "story.publish.queue.mediaError.video",
                          defaultValue: "Une vidéo n'a pas pu être enregistrée — votre publication est gardée dans vos brouillons")
        case .audio:
            return String(localized: "story.publish.queue.mediaError.audio",
                          defaultValue: "Un son n'a pas pu être enregistré — votre publication est gardée dans vos brouillons")
        }
    }
}

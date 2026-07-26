import Foundation
import MeeshySDK

/// Ce qu'il faut précharger quand on ouvre le composer sur un repost, et
/// surtout SOUS QUELLE CLÉ le ranger.
///
/// Le préchargement rangeait ses bitmaps sous `slideImages[url.absoluteString]`.
/// Or `slideImages` est la map des FONDS de slide, lue par `slideImages[slide.id]`
/// (`StoryComposerView+SyncRestore`, `+Publication`), tandis que le canvas
/// d'édition lit `loadedImages` keyé par `StoryMediaObject.id`. Aucun lecteur
/// n'interrogeait donc jamais une clé-URL : le préchargement était
/// intégralement perdu et le canvas repartait à zéro au montage.
///
/// Pire, `persistPublishIntentToQueue` re-clé TOUT `slideImages` en
/// `"slide-bg-<clé>"` : ces entrées parasites partaient en file hors-ligne
/// comme faux fonds de slide — fichiers écrits sur disque et références média
/// qu'aucune slide ne réclamerait jamais.
nonisolated enum RepostMediaPreload {

    /// Où ranger le bitmap une fois chargé.
    enum Destination: Equatable {
        /// `slideImages[slideId]` — le fond de la slide.
        case slideBackground
        /// `loadedImages[objectId]` — un média de premier plan du canvas.
        case canvasObject
    }

    struct Target: Equatable {
        let storageKey: String
        let url: URL
        let destination: Destination
    }

    /// - Parameter slideId: l'id de la slide CLONÉE (pas celui de la source) —
    ///   c'est sous lui que le composer relira son fond.
    static func targets(for story: StoryItem, slideId: String) -> [Target] {
        var targets: [Target] = []

        // Fond : première pièce jointe du post, comme le clone lui-même
        // (`mediaURL: story.media.first?.url`).
        if let first = story.media.first,
           let urlString = first.url,
           let url = MeeshyConfig.resolveMediaURL(urlString) {
            targets.append(Target(storageKey: slideId, url: url, destination: .slideBackground))
        }

        // Premiers plans : chaque objet du canvas retrouve son URL distante via
        // `postMediaId`. Deux objets peuvent partager le même média (duplication
        // sur le canvas) — chacun reçoit alors sa propre entrée, sous SA clé.
        for object in story.storyEffects?.mediaObjects ?? [] {
            guard !object.postMediaId.isEmpty,
                  let media = story.media.first(where: { $0.id == object.postMediaId }),
                  let urlString = media.url,
                  let url = MeeshyConfig.resolveMediaURL(urlString) else { continue }
            targets.append(Target(storageKey: object.id, url: url, destination: .canvasObject))
        }

        return targets
    }
}

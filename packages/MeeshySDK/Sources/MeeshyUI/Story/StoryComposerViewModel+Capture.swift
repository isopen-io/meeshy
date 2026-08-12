import SwiftUI
import UIKit
import MeeshySDK

// MARK: - StoryComposerViewModel + insertion de média en premier plan
//
// Extraction SANS RÉÉCRITURE de la moitié « insertion » du chemin média, qui
// vivait enfermée dans deux blocs `await MainActor.run { … }` de la View
// (`StoryComposerView+Media.swift`) : non testable, et obligeant tout nouveau
// point d'entrée (caméra, dernière photo de la pellicule) à en écrire un
// JUMEAU. Les cinq points fragiles historiquement documentés sont conservés
// mot pour mot — bump de `loadedImagesVersion` via `registerLoadedImage`,
// `setMediaURL`, `setMediaAspectRatio`, nettoyage des entrées provisoires
// quand l'id généré diffère, `autoExtendDuration`.

extension StoryComposerViewModel {

    /// Pose une image en premier plan sur `slideId` et branche TOUT ce dont le
    /// canvas CALayer a besoin pour la rendre.
    ///
    /// `objectId` sert AUSSI de nom de fichier temp (`{objectId}.jpg`) : c'est
    /// cet alignement qui permet au `composerKey` dérivé du fichier de
    /// retrouver le bitmap sous `loadedImages[obj.id]`. Quand le plafond
    /// `canAddMedia` refuse l'objet, rien n'est écrit — pas d'entrée orpheline.
    @discardableResult
    func insertForegroundImage(
        _ image: UIImage,
        fileURL: URL?,
        intoSlideId slideId: String,
        objectId: String
    ) -> StoryMediaObject? {
        guard let obj = addMediaObject(kind: .image, toSlideId: slideId, id: objectId) else {
            return nil
        }
        // `registerLoadedImage` bump `loadedImagesVersion` : sans ça le
        // `ComposerImageCacheReader` du canvas reste périmé et le bitmap frais
        // n'est jamais stampé → canvas noir (bug 2026-07-20).
        registerLoadedImage(image, for: obj.id)
        // Pont critique entre l'UIImage en mémoire et le pipeline CALayer :
        // sans `mediaURL`, la layer n'a aucune source à charger.
        if let fileURL {
            setMediaURL(id: obj.id, url: fileURL.absoluteString, slideId: slideId)
        }
        // AspectRatio natif depuis `image.size` — sans lui la layer rend
        // l'image en carré 540×540 (fix B1).
        let size = image.size
        if size.width > 0, size.height > 0 {
            setMediaAspectRatio(
                id: obj.id, aspectRatio: Double(size.width / size.height), slideId: slideId)
        }
        dropProvisionalEntries(objectId: objectId, resolvedId: obj.id)
        return obj
    }

    /// Pose une vidéo en premier plan sur `slideId`, vignette et durée natives
    /// comprises. `duration` étend la slide (`autoExtendDuration`) : sans ça la
    /// fenêtre de visibilité du lecteur est plus courte que la vidéo et celle-ci
    /// « disparaît au bout d'une seconde » pendant que l'audio continue.
    @discardableResult
    func insertForegroundVideo(
        url: URL,
        thumbnail: UIImage?,
        aspectRatio: Double?,
        duration: Float?,
        intoSlideId slideId: String,
        objectId: String
    ) -> StoryMediaObject? {
        loadedVideoURLs[objectId] = url
        if let thumbnail { loadedImages[objectId] = thumbnail }
        guard let obj = addMediaObject(kind: .video, toSlideId: slideId, id: objectId) else {
            // Refus du plafond : les deux entrées provisoires ci-dessus
            // deviendraient orphelines (le canvas les garderait en mémoire sans
            // objet correspondant).
            loadedVideoURLs.removeValue(forKey: objectId)
            loadedImages.removeValue(forKey: objectId)
            return nil
        }
        loadedVideoURLs[obj.id] = url
        // Même raison que le chemin image : le canvas doit se rafraîchir pour
        // stamper la vignette de la vidéo posée.
        if let thumbnail { registerLoadedImage(thumbnail, for: obj.id) }
        setMediaURL(id: obj.id, url: url.absoluteString, slideId: slideId)
        if let aspectRatio {
            setMediaAspectRatio(id: obj.id, aspectRatio: aspectRatio, slideId: slideId)
        }
        dropProvisionalEntries(objectId: objectId, resolvedId: obj.id)
        if let duration {
            setMediaDuration(id: obj.id, duration: duration, slideId: slideId)
            autoExtendDuration(forElementEnd: duration, slideId: slideId)
        }
        return obj
    }

    /// L'id retenu par `addMediaObject` peut différer de celui demandé : les
    /// entrées semées sous l'id provisoire seraient alors invisibles ET
    /// indestructibles.
    private func dropProvisionalEntries(objectId: String, resolvedId: String) {
        guard resolvedId != objectId else { return }
        loadedVideoURLs.removeValue(forKey: objectId)
        loadedImages.removeValue(forKey: objectId)
    }
}

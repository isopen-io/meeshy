import AVFoundation
import UIKit
import MeeshySDK

// MARK: - Ce qu'une vidéo posée sur la scène doit DIRE d'elle-même

extension StoryComposerViewModel {

    /// **Mesurer une vidéo qui vient d'être posée — site UNIQUE** (#5418).
    ///
    /// ## Le défaut que cette extraction ferme
    ///
    /// Deux chemins posent une vidéo sur une scène, et **un seul la mesurait** :
    ///
    /// | chemin | vignette | ratio | durée |
    /// |---|---|---|---|
    /// | la GRAINE (`init(seeding:)`) | oui | oui | oui |
    /// | `applyContentMedia` — le pont document → canvas du composer v3 | **non** | **non** | oui |
    ///
    /// Le second passait `thumbnail: nil, aspectRatio: nil` à
    /// `insertForegroundVideo`, littéralement. Mesuré sur staging
    /// (2026-09-06) : une story publiée depuis le composer v3 avec une vidéo
    /// part avec `aspectRatio: null` dans son canvas, là où la même story avec
    /// une IMAGE porte `1.498`. Le lecteur n'a alors plus sa source de
    /// dimensionnement primaire, et la story reste sur « Chargement… » ; sa
    /// vignette, calculée sans image chargée, sort VIDE.
    ///
    /// > **Deux chemins qui posent la même chose ne posent pas la même chose.**
    /// > Le nom de la fonction appelée était identique — `insertForegroundVideo` —
    /// > et c'est ce qui rendait l'écart invisible : il vivait dans ses
    /// > ARGUMENTS, deux `nil` qu'aucune signature n'oblige à remplir.
    ///
    /// ## Pourquoi une tâche, et pourquoi elle est suivie
    ///
    /// Les trois mesures sont asynchrones (`AVAsset.load`), et la pose ne peut
    /// pas l'être : le canvas doit recevoir son objet SYNCHRONIQUEMENT, sans
    /// quoi `restoreCanvas` — un instantané qui ne relit jamais ce qui arrive
    /// après lui — le manquerait. L'objet est donc posé d'abord, mesuré
    /// ensuite, et le canvas se rafraîchit quand la mesure arrive.
    ///
    /// La tâche est RETENUE par objet : une session refermée ne finit pas de
    /// décoder, et plusieurs vidéos ingérées ensemble ne peuvent pas se voler
    /// leur poignée — ce qu'une poignée unique (`preloadTask`) aurait fait.
    func measureVideo(objectId: String, fileURL: URL, slideId: String) {
        videoMeasureTasks[objectId]?.cancel()
        videoMeasureTasks[objectId] = Task { [weak self] in
            let mesure = await Self.videoMeasurement(of: fileURL)
            guard !Task.isCancelled, let self else { return }
            if let thumbnail = mesure.thumbnail { self.registerLoadedImage(thumbnail, for: objectId) }
            if let ratio = mesure.aspectRatio {
                self.setMediaAspectRatio(id: objectId, aspectRatio: ratio, slideId: slideId)
            }
            if let duration = mesure.duration {
                self.setMediaDuration(id: objectId, duration: duration, slideId: slideId)
                self.autoExtendDuration(forElementEnd: duration, slideId: slideId)
            }
            self.videoMeasureTasks.removeValue(forKey: objectId)
        }
    }

    /// Ce qu'un fichier vidéo dit de lui-même. `nil` sur chaque champ que
    /// l'asset ne rend pas — un ratio inventé serait pire qu'absent : il
    /// dimensionnerait le lecteur sur une forme que la vidéo n'a pas.
    struct VideoMeasurement: Sendable {
        let thumbnail: UIImage?
        let aspectRatio: Double?
        let duration: Float?
    }

    /// **Le `preferredTransform` n'est pas décoratif** : une vidéo tournée par
    /// l'appareil porte ses dimensions NATIVES dans `naturalSize` et son quart
    /// de tour dans la transformation. Lire la première sans appliquer la
    /// seconde rend 16:9 pour une vidéo filmée à la verticale — soit l'inverse
    /// exact de ce que l'auteur voit.
    static func videoMeasurement(of url: URL) async -> VideoMeasurement {
        let thumbnail = await StoryMediaLoader.shared.videoThumbnail(url: url, maxDimension: 400)
        let asset = AVURLAsset(url: url)

        var duration: Float?
        if let cmDur = try? await asset.load(.duration) {
            let secs = CMTimeGetSeconds(cmDur)
            if secs > 0, secs.isFinite { duration = Float(secs) }
        }

        var aspectRatio: Double?
        if let track = try? await asset.loadTracks(withMediaType: .video).first,
           let natural = try? await track.load(.naturalSize),
           let transform = try? await track.load(.preferredTransform) {
            let effective = natural.applying(transform)
            let w = abs(effective.width)
            let h = abs(effective.height)
            if w > 0, h > 0 { aspectRatio = Double(w / h) }
        }

        return VideoMeasurement(thumbnail: thumbnail, aspectRatio: aspectRatio, duration: duration)
    }
}

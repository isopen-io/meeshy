import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - Ce que « Modifier » écrit, pour le sticker et le lieu (#13839, L5)

/// **Le sticker choisi REMPLACE celui qu'on modifiait** (inventaire H6) : il
/// prend sa place, sa taille, sa rotation, son rang et sa fenêtre de temps ;
/// l'ancien part. Une seule écriture de la slide, donc un seul cran
/// d'annulation.
nonisolated enum SceneStickerReplacement {

    static func replacing(_ oldId: String, with newId: String, in slide: StorySlide) -> StorySlide {
        let stickers = slide.effects.stickerObjects ?? []
        guard oldId != newId,
              let ancien = stickers.first(where: { $0.id == oldId }),
              let neuf = stickers.first(where: { $0.id == newId }) else { return slide }
        let pose = placed(neuf, like: ancien)
        let suite = stickers.compactMap { sticker -> StorySticker? in
            if sticker.id == newId { return nil }
            return sticker.id == oldId ? pose : sticker
        }
        var resultat = slide
        resultat.effects.stickerObjects = suite
        return resultat
    }

    private static func placed(_ neuf: StorySticker, like ancien: StorySticker) -> StorySticker {
        var pose = neuf
        pose.x = ancien.x
        pose.y = ancien.y
        pose.scale = ancien.scale
        pose.rotation = ancien.rotation
        pose.zIndex = ancien.zIndex
        pose.anchor = ancien.anchor
        pose.startTime = ancien.startTime
        pose.duration = ancien.duration
        pose.fadeIn = ancien.fadeIn
        pose.fadeOut = ancien.fadeOut
        return pose
    }
}

/// **Le lieu choisi repointe la pastille** : même identifiant, même place, même
/// décoration — seul l'endroit nommé change.
nonisolated enum ComposerPlaceRepoint {

    static func repointing(_ id: String, to place: SharedPlace, in slide: StorySlide) -> StorySlide {
        var resultat = slide
        resultat.locationObjects = slide.locationObjects.map { lieu in
            guard lieu.id == id else { return lieu }
            var repointe = lieu
            repointe.place = place
            return repointe
        }
        return resultat
    }
}

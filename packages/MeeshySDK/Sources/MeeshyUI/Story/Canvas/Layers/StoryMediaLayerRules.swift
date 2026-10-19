import Foundation
import CoreGraphics
import AVFoundation
import UIKit
import MeeshySDK

/// Règles PURES du média foreground : calage timeline, géométrie de base,
/// recadrage, filtre cuit dans le bitmap et résolution d'URL. Elles ne lisent
/// que leurs entrées — `StoryMediaLayer` en est la façade (mêmes noms), et le
/// seul à tenir l'état (player, tâches, observer).
enum StoryMediaLayerRules {

    // MARK: - Calage timeline

    /// Au-delà de cette dérive (secondes) entre la position du player et la cible
    /// timeline, on seek ; en-deçà on lance la lecture telle quelle (pas de
    /// hoquet sur un resume déjà aligné).
    nonisolated static let timelineSeekDriftThreshold: Double = 0.30

    /// Pure drift decision (WS3.3 / F4): the aligned start seeks the foreground
    /// player ONLY when the gap between the current position and the timeline
    /// `target` exceeds `timelineSeekDriftThreshold`. A resume-in-place
    /// (long-press) or an already-aligned start stays put (no jump); a video that
    /// arrived late (network) or an open-at-`t>0` is recaled. Non-finite inputs
    /// never seek. Extracted (non-private) so the seek trigger is unit-testable
    /// without a decodable `AVAsset` — `AVPlayer` seek movement on a fixture mp4
    /// is not observable.
    nonisolated static func shouldSeekToAlign(current: Double, target: Double) -> Bool {
        guard target.isFinite, current.isFinite else { return false }
        return abs(current - target) > timelineSeekDriftThreshold
    }

    /// Position de seek DANS LA SOURCE pour un playhead de slide donné, la
    /// fenêtre de rognage repliée dedans. `bounds == nil` (rognage jamais
    /// déclaré, ou pas encore chargé) rend exactement `max(0, slidePlayheadSeconds
    /// − mediaStartTime)` — le calcul d'aujourd'hui, bit à bit : c'est le repli
    /// "source entière" qui garantit qu'un média non rogné ne change jamais de
    /// comportement. Une fois `bounds` connu, l'origine du média glisse de `0`
    /// à `bounds.start` et la cible ne dépasse jamais `bounds.end` — un resume
    /// tardif ou une dérive réseau ne rejoue donc jamais la portion coupée.
    /// Pure et statique : éprouvable sans `AVAsset` ni simulateur, comme
    /// `shouldSeekToAlign` ci-dessus.
    nonisolated static func trimmedSeekTarget(bounds: MediaTrimBounds?,
                                              slidePlayheadSeconds: Double,
                                              mediaStartTime: Double) -> Double {
        let elapsedInMedia = max(0, slidePlayheadSeconds - mediaStartTime)
        guard let bounds else { return elapsedInMedia }
        return min(bounds.start + elapsedInMedia, bounds.end)
    }

    /// **Ce que devient un clip arrivé à la fin de son item en lecture** (#6757).
    ///
    /// Sa disparition appartient à sa FENÊTRE (`StoryRenderer.shouldRender`,
    /// `startTime ..< startTime + duration`), pas à l'horloge du player. Les deux
    /// divergent dès que la timeline de la slide gèle — chargement du fond,
    /// stall — pendant que l'AVPlayer roule : masquer à la fin de l'item
    /// escamotait la vidéo avant l'heure. La story de recette, clip de 6 s posé
    /// sur un panorama, montrait le fond seul pendant la pause (capture 244).
    ///
    /// Sans durée déclarée, la fenêtre est infinie et rien d'autre ne retirerait
    /// le clip : il part à la fin de son item, comme depuis 09cfcf95f0.
    nonisolated static func leavesAtItemEnd(declaredDuration: Double?) -> Bool {
        declaredDuration == nil
    }

    // MARK: - Géométrie

    static func baseMediaDesignSize(aspectRatio: Double) -> CGSize {
        let target: CGFloat = CanvasGeometry.designWidth * 0.65   // 702
        let ratio = max(0.1, min(10.0, CGFloat(aspectRatio)))
        if abs(ratio - 1.0) < 0.05 {
            let side = CanvasGeometry.designWidth * 0.5  // 540 carré
            return CGSize(width: side, height: side)
        }
        if ratio < 1.0 {
            return CGSize(width: target * ratio, height: target)
        }
        return CGSize(width: target, height: target / ratio)
    }

    /// **Le recadrage, posé sur le COMPOSITEUR** (#5085).
    ///
    /// `contentsRect` prend un sous-rectangle normalisé des contenus : c'est
    /// exactement la forme de `MediaCropRect`, et rien n'est ré-encodé — le
    /// fichier reste celui qui est déjà en train de partir.
    ///
    /// Le remettre au cadre ENTIER quand il n'y a pas de recadrage n'est pas
    /// une redite : un calque réutilisé garderait sinon le `contentsRect` de
    /// l'objet qu'il peignait avant, et l'auteur verrait un média recadré
    /// qu'il n'a jamais recadré.
    nonisolated static func contentsRect(for crop: MediaCropRect?) -> CGRect {
        guard let crop, !crop.isFull else {
            return CGRect(x: 0, y: 0, width: 1, height: 1)
        }
        let borné = MediaCropRule.clamped(crop)
        return CGRect(x: borné.x, y: borné.y,
                      width: borné.width, height: borné.height)
    }

    // MARK: - Filtre

    /// **Le filtre PROPRE à l'objet** (retour porteur 2026-09-28), cuit dans
    /// le bitmap au même point de passage que l'orientation — comme le fond le
    /// fait pour le filtre de slide (`StoryBackgroundLayer.stampFinalImage`).
    /// La clé de cache suit l'INSTANCE d'image : un bitmap retouché ne resservira
    /// jamais le filtre de l'ancien.
    /// Les RÉGLAGES de l'objet (#9175) suivent le filtre, dans l'ordre de
    /// l'éditeur d'image : filtre, puis réglages.
    static func filtered(_ image: UIImage?, for media: StoryMediaObject) -> UIImage? {
        guard let image else { return nil }
        let instance = "\(media.id)-\(ObjectIdentifier(image).hashValue)"
        let filtree = media.parsedFilter.map { StoryFilterProcessor.apply($0, to: image, imageId: instance) } ?? image
        return StoryMediaAdjustmentsProcessor.apply(media.adjustments, to: filtree, imageId: "\(instance)-\(media.filter ?? "")")
    }

    // MARK: - URL resolution

    /// Resolves the playable URL for a foreground media object.
    ///
    /// Order (identical to `StoryReaderContext.postMediaURLResolver`):
    ///  1. `resolver(media.postMediaId)` — preloaded composer-preview asset,
    ///     then the published `StoryItem.media` remote URL.
    ///  2. Fallback `media.mediaURL` — fixtures and the `file://` URL the
    ///     composer edition embeds directly on the object. A `file://` here is
    ///     the AUTHOR's local edition asset: on another viewer's device it points
    ///     into the author's sandbox and never exists. Honouring it would feed a
    ///     dead path to the loader (silent blank foreground, or a video player
    ///     wired to nothing) — the exact "foreground missing on another user's
    ///     story" symptom. So a file URL is only used when it resolves on THIS
    ///     device; otherwise the media is treated as unresolved and the reader's
    ///     content-readiness failsafe takes over.
    @MainActor
    static func resolvedMediaURL(for media: StoryMediaObject,
                                 resolver: (@Sendable (String) -> URL?)?) -> URL? {
        if !media.postMediaId.isEmpty, let resolved = resolver?(media.postMediaId) {
            return resolved
        }
        // #7056 — `resolveMediaURL` porte la branche « clé de stockage » et
        // traite `file://` AVANT tout (`MeeshyConfig.swift:139-143`), donc le
        // garde d'existence ci-dessous reste exact. `URL(string:)` nu rendait
        // une URL relative sur une clé nue : le média ne se chargeait jamais,
        // sans qu'aucun `nil` ne le signale.
        guard let urlString = media.mediaURL, let url = MeeshyConfig.resolveMediaURL(urlString) else {
            return nil
        }
        // The file-existence guard applies ONLY in the READER (a resolver is
        // always provided there). A `file://` that survives a resolver miss is
        // the AUTHOR's local edition path — dead on another viewer's device — so
        // we honour it only when it resolves on THIS device. In the COMPOSER /
        // edit (resolver == nil) the file:// IS the intended local asset (and
        // fixtures use placeholder paths), so it is used as-is.
        if resolver != nil, url.isFileURL {
            return FileManager.default.fileExists(atPath: url.path) ? url : nil
        }
        return url
    }
}

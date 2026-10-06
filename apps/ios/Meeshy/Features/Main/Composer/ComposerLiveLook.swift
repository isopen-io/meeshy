import AVFoundation
import CoreGraphics
import CoreImage
import Foundation
import ImageIO

// **Les filtres et les cadres se choisissent EN DIRECT dans le viseur** (#9329,
// directive porteur 2026-10-04).
//
// > « Les frames doivent pouvoir se choisir en direct lors de la capture, idem
// > pour les filtres, exactement comme pour les filtres de l'appel vidéo. […]
// > La capture plein écran (vidéo ou image) permet de changer filtre et frame
// > sans changement ! »
//
// Rien n'est redessiné : la trame de l'objectif passe par la colorimétrie de
// l'appel (`VideoFilterColorimetry`), puis par le compositeur de son cadre en
// direct (`CallLiveFrameCompositor`). L'aperçu, la photo et la vidéo passent
// par le même peintre (`ComposerLookPainter`, #9347) : ce qu'on voyait est ce
// qui part.

/// Les lois du look en direct — pures, éprouvables sans caméra.
nonisolated enum ComposerLiveLookRule {

    /// **Les cadres en direct : les classiques du Montage, puis les ambiances du
    /// catalogue** (#9348). Un classique se peint désormais en couches GPU
    /// (`CallMontageRenderer.layers`) : il se compose en direct comme un cadre.
    static func chips() -> [CallMontageMoodChip] {
        ComposerPhotoLookRule.chips().filter { puce in
            frames(for: puce).contains { $0 != ComposerPhotoFrame.none }
        }
    }

    /// « Aucun cadre » en tête ; un cadre du catalogue ne s'offre que s'il se
    /// compose en direct (`CallLiveFrameRule.isEligible`).
    static func frames(for chip: CallMontageMoodChip) -> [ComposerPhotoFrame] {
        ComposerPhotoLookRule.frames(for: chip).filter { cadre in
            guard case .montage(.frame) = cadre else { return true }
            return design(for: cadre).map(CallLiveFrameRule.isEligible) ?? false
        }
    }

    /// Toucher une ambiance montre son premier cadre, comme au Montage.
    static func entering(_ chip: CallMontageMoodChip) -> ComposerPhotoFrame {
        frames(for: chip).first { $0 != ComposerPhotoFrame.none } ?? .none
    }

    /// La puce ouverte pour un look : celle de son cadre.
    static func chip(for look: ComposerPhotoLook) -> CallMontageMoodChip? {
        ComposerPhotoLookRule.chip(of: look.frame)
    }

    /// Le dessin du cadre à composer ; `nil` sans cadre, ou pour un cadre
    /// inconnu du catalogue.
    static func design(for frame: ComposerPhotoFrame) -> CallFrameDesign? {
        guard case .montage(.frame(let id)) = frame else { return nil }
        return CallMontageFrameRule.design(id: id)
    }

    /// **Sans look, l'aperçu reste la couche système** — aucun coût, aucune
    /// trame retenue.
    static func rendersLive(_ look: ComposerPhotoLook) -> Bool {
        !look.isUntouched
    }

    /// **Le look ne change plus une fois la prise commencée.** Une vidéo
    /// s'accumule en segments (#4099) et part avec UN look : le changer entre
    /// deux segments rendrait au premier un look qu'il n'avait pas à l'écran.
    static func isLocked(stage: ComposerSceneCameraStage, pendingSegments: Int) -> Bool {
        stage == .recording || pendingSegments > 0
    }

    /// Le capteur sert des trames couchées : l'objectif arrière se redresse,
    /// l'avant se redresse EN MIROIR — comme l'aperçu système.
    static func orientation(for position: AVCaptureDevice.Position) -> CGImagePropertyOrientation {
        position == .front ? .leftMirrored : .right
    }

    /// L'espace du drawable de l'aperçu : Display P3, qui contient tout ce que
    /// le capteur sert — chaque trame y est convertie, jamais écrêtée.
    static var colorSpace: CGColorSpace {
        CGColorSpace(name: CGColorSpace.displayP3) ?? CGColorSpaceCreateDeviceRGB()
    }

    /// Une trame filtrée, ramenée à l'origine. `.natural` la rend telle quelle.
    ///
    /// Le cube lit la trame dans l'espace qu'ELLE déclare — la loi même de la
    /// photo (`ComposerPhotoLookRule.colorSpace(declared:)`) : une caméra qui
    /// sert du sRGB et une qui sert du P3 donnent, à l'aperçu, à la vidéo et à
    /// la photo, la même teinte.
    static func graded(_ image: CIImage, filter: VideoFilterPreset, declared: CGColorSpace? = nil) -> CIImage {
        let posee = image.transformed(by: CGAffineTransform(translationX: -image.extent.minX,
                                                            y: -image.extent.minY))
        guard ComposerPhotoLookRule.grades(filter) else { return posee }
        let espace = ComposerPhotoLookRule.colorSpace(declared: declared ?? image.colorSpace)
        return VideoFilterColorimetry.graded(posee, config: filter.config, colorSpace: espace)
    }

    /// **Un cadre se montre ENTIER** : la photo et la vidéo le rendent à la
    /// toile du Montage (9:16) — l'aperçu le pose dans l'écran sans rien en
    /// couper, des bandes noires plutôt qu'un bord manquant.
    static func fit(scene: CGSize, into drawable: CGSize) -> CGAffineTransform {
        guard scene.width > 0, scene.height > 0 else { return .identity }
        let scale = min(drawable.width / scene.width, drawable.height / scene.height)
        let drawn = CGSize(width: scene.width * scale, height: scene.height * scale)
        return CGAffineTransform(scaleX: scale, y: scale)
            .concatenating(CGAffineTransform(translationX: (drawable.width - drawn.width) / 2,
                                             y: (drawable.height - drawn.height) / 2))
    }
}

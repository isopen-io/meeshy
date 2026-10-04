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
// direct (`CallLiveFrameCompositor`). La photo est peinte par le peintre de la
// prise (`ComposerPhotoLookRenderer`), la vidéo par la même chaîne image par
// image (`ComposerLookVideoExporter`) : ce qu'on voyait est ce qui part.

/// Où le sélecteur d'effets se pose : au-dessus de l'obturateur et de sa
/// légende, qu'il ne couvre jamais.
nonisolated enum ComposerLiveLookPanelLayout {
    static func bottomInset(for size: ComposerSceneCameraSize) -> CGFloat {
        size == .fullScreen ? 156 : 132
    }
}

/// Les lois du look en direct — pures, éprouvables sans caméra.
nonisolated enum ComposerLiveLookRule {

    /// **Les cadres en direct sont ceux du catalogue** — ceux que l'appel
    /// compose en direct (`CallLiveFrameSurface`). Un classique du Montage est
    /// le peintre d'une image FIGÉE : il reste offert à la prise d'une photo
    /// (`ComposerPhotoLookReview`), pas au flux.
    static func chips() -> [CallMontageMoodChip] {
        ComposerPhotoLookRule.chips().filter { $0 != .classics }
    }

    /// « Aucun cadre » en tête, puis les cadres de l'ambiance qui se composent
    /// en direct.
    static func frames(for chip: CallMontageMoodChip) -> [ComposerPhotoFrame] {
        ComposerPhotoLookRule.frames(for: chip).filter(isLive)
    }

    static func isLive(_ frame: ComposerPhotoFrame) -> Bool {
        switch frame {
        case .none, .montage(.frame): return true
        case .montage(.classic): return false
        }
    }

    /// Toucher une ambiance montre son premier cadre, comme au Montage.
    static func entering(_ chip: CallMontageMoodChip) -> ComposerPhotoFrame {
        frames(for: chip).first { $0 != ComposerPhotoFrame.none } ?? .none
    }

    /// La puce ouverte pour un look : celle de son cadre, sinon la première.
    static func chip(for look: ComposerPhotoLook) -> CallMontageMoodChip? {
        let ouverte = ComposerPhotoLookRule.chip(of: look.frame)
        return ouverte == .classics ? chips().first : ouverte
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
        !look.isUntouched && isLive(look.frame)
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

    /// L'espace des trames et du rendu : celui de la prise (#9327).
    static var colorSpace: CGColorSpace {
        CGColorSpace(name: CGColorSpace.displayP3) ?? CGColorSpaceCreateDeviceRGB()
    }

    /// Une trame filtrée, ramenée à l'origine. `.natural` la rend telle quelle.
    static func graded(_ image: CIImage, filter: VideoFilterPreset) -> CIImage {
        let posee = image.transformed(by: CGAffineTransform(translationX: -image.extent.minX,
                                                            y: -image.extent.minY))
        guard ComposerPhotoLookRule.grades(filter) else { return posee }
        return VideoFilterColorimetry.graded(posee, config: filter.config, colorSpace: colorSpace)
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

    /// La taille, aux proportions de la toile du Montage, qui tient dans `view`.
    static func sceneSize(in view: CGSize) -> CGSize {
        let toile = ComposerPhotoLookRule.frameCanvas
        guard view.width > 0, view.height > 0 else { return .zero }
        let scale = min(view.width / toile.width, view.height / toile.height)
        return CGSize(width: toile.width * scale, height: toile.height * scale)
    }

    /// La toile d'une vidéo exportée : celle du Montage sous un cadre, la
    /// vidéo redressée sinon.
    static func exportSize(for look: ComposerPhotoLook, upright: CGSize) -> CGSize {
        design(for: look.frame) == nil ? upright : ComposerPhotoLookRule.frameCanvas
    }
}

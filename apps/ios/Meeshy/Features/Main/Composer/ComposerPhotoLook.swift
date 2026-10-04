import CoreGraphics
import CoreImage
import Foundation

// **La photo prise reçoit les FILTRES et les CADRES de l'appel vidéo** (#9295,
// directive porteur 2026-10-04).
//
// > « Il faut réutiliser les frames de l'appel vidéo et les filtres sur l'image !
// > (Les frames d'une personne, ou alors une partie des frames de deux.) Le plus
// > important est de t'assurer de la réutilisation des éléments développés. »
//
// Rien n'est redessiné ici : les filtres sont les préréglages de l'appel
// (`VideoFilterPreset`, passés par `VideoFilterColorimetry`, la fonction même du
// flux), les cadres sont ceux du mode Montage (`CallMontageChoice` : les
// classiques, qui servent une personne, et les cadres du catalogue), peints par
// `CallCaptureController.render` — le peintre de la capture d'appel.

/// Ce que le carrousel des cadres propose : rien, ou un élément du Montage.
nonisolated enum ComposerPhotoFrame: Hashable, Sendable {
    case none
    case montage(CallMontageChoice)
}

/// Le rendu choisi pour la photo : un filtre (`.natural` ⇒ la photo telle
/// quelle) et un cadre.
nonisolated struct ComposerPhotoLook: Hashable, Sendable {
    var filter: VideoFilterPreset = .natural
    var frame: ComposerPhotoFrame = .none

    /// Rien n'a été choisi : la prise part telle quelle, octets d'origine compris.
    var isUntouched: Bool { filter == .natural && frame == .none }
}

nonisolated enum ComposerPhotoLookRule {

    /// **Une photo porte une personne ; le catalogue commence au duo.** Les
    /// cadres d'un duo la servent quand même — leur géométrie retombe en grille
    /// d'une case (`CallFrameLayoutGeometry.servedArrangement`) : c'est « une
    /// partie des frames de deux ». Les classiques servent une personne d'emblée.
    static let catalogPeople = 2

    /// Les filtres de l'appel, dans son ordre ; `.natural` en tête rend l'original.
    static let filters: [VideoFilterPreset] = VideoFilterPreset.allCases

    /// « Classiques » puis les ambiances du catalogue — les puces du Montage.
    static func chips() -> [CallMontageMoodChip] {
        CallMontageFrameRule.chips(forPeople: catalogPeople)
    }

    /// Le carrousel d'une puce, « Aucun cadre » en tête : on revient toujours à
    /// la photo nue en un toucher, quelle que soit l'ambiance ouverte.
    static func frames(for chip: CallMontageMoodChip) -> [ComposerPhotoFrame] {
        [.none] + CallMontageFrameRule.items(for: chip, people: catalogPeople).map { ComposerPhotoFrame.montage($0) }
    }

    /// **Toucher une ambiance montre son premier cadre** — l'auteur voit l'effet
    /// tout de suite, comme dans le Montage (`CallMontageFrameRule.entering`) ;
    /// « Aucun cadre », en tête du carrousel, le retire d'un toucher.
    static func entering(_ chip: CallMontageMoodChip) -> ComposerPhotoFrame {
        .montage(CallMontageFrameRule.entering(chip, people: catalogPeople, remembered: nil))
    }

    /// La puce qui porte un cadre ; « Aucun cadre » vit chez les classiques.
    static func chip(of frame: ComposerPhotoFrame) -> CallMontageMoodChip {
        guard case .montage(let choice) = frame else { return .classics }
        return CallMontageFrameRule.chip(of: choice)
    }

    /// Ce que le peintre de l'appel reçoit. Un cadre inconnu du catalogue ne
    /// peint rien plutôt qu'un autre cadre.
    static func captureLook(for frame: ComposerPhotoFrame) -> CallCaptureLook? {
        switch frame {
        case .none:
            return nil
        case .montage(.classic(let style)):
            return .classic(style)
        case .montage(.frame(let id)):
            return CallMontageFrameRule.design(id: id).map { CallCaptureLook.frame($0) }
        }
    }

    /// Un filtre ne coûte une passe que s'il change quelque chose.
    static func grades(_ preset: VideoFilterPreset) -> Bool {
        preset != .natural
    }

    /// La toile d'un cadre : celle de la capture d'appel (9:16, 1080 × 1920).
    static let frameCanvas = CallMontageLayout.captureSize

    /// L'aperçu et les vignettes se peignent petit ; la remise, en pleine taille.
    static let previewMaxPixel: CGFloat = 1280
    static let thumbnailMaxPixel: CGFloat = 240
    static let previewFrameCanvas = CallCaptureController.previewCanvas
    static let thumbnailFrameCanvas = CallCaptureController.thumbnailCanvas

    /// **L'espace de la photo traverse tout le rendu** (#9327). L'iPhone prend
    /// en Display P3 et l'aperçu l'affiche ainsi : repeinte en sRGB, la prise
    /// pâlirait dès qu'on touche un filtre ou un cadre. Un espace étendu ou HDR
    /// ne tient pas dans une toile 8 bits : il retombe sur Display P3, qui
    /// couvre ce que le capteur sert ; une image sans espace RVB, sur sRGB.
    static func colorSpace(of photo: CGImage) -> CGColorSpace {
        let srgb = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
        guard let space = photo.colorSpace, space.model == .rgb else { return srgb }
        guard CGColorSpaceUsesExtendedRange(space) || CGColorSpaceUsesITUR_2100TF(space) else { return space }
        return CGColorSpace(name: CGColorSpace.displayP3) ?? srgb
    }

    /// L'échelle qui borne la plus grande dimension à `maxPixel` — jamais un
    /// agrandissement.
    static func downscale(for size: CGSize, maxPixel: CGFloat) -> CGFloat {
        let longest = max(size.width, size.height)
        guard longest > maxPixel, longest > 0 else { return 1 }
        return maxPixel / longest
    }
}

/// La photo et ce que les cadres écrivent autour d'elle — figés à la prise.
nonisolated struct ComposerPhotoLookSource: @unchecked Sendable {
    let photo: CGImage
    let person: CallFramePerson
    let texts: CallFrameTexts
    let caption: CallMontageCaption

    /// Les textes d'un cadre de capture d'appel, pour une photo prise maintenant :
    /// le nom de l'auteur, la date, la marque — les mêmes que le Montage.
    static func taken(_ photo: CGImage, by person: CallFramePerson, at date: Date) -> ComposerPhotoLookSource {
        ComposerPhotoLookSource(
            photo: photo,
            person: person,
            texts: CallFrameTexts(groupName: nil, isGroup: false,
                                  date: CallFrameTextsRule.dateText(date), accentHex: nil),
            caption: CallMontageCaption(title: CallCaptureController.brand,
                                        subtitle: date.formatted(date: .abbreviated, time: .shortened)))
    }
}

/// **Le peintre de la photo** : le filtre d'abord, le cadre ensuite — un cadre
/// teinte lui-même sa case (sépia, noir et blanc…) sur l'image déjà filtrée.
nonisolated enum ComposerPhotoLookRenderer {

    /// Construit une fois : coûteux à monter, sûr à partager entre threads.
    private static let context = CIContext(options: [.cacheIntermediates: false])

    /// - Parameters:
    ///   - maxPixel: borne de la photo filtrée (`nil` ⇒ pleine définition).
    ///   - frameCanvas: la toile du cadre, s'il y en a un.
    static func render(_ look: ComposerPhotoLook, source: ComposerPhotoLookSource,
                       maxPixel: CGFloat?, frameCanvas: CGSize) -> CGImage? {
        guard let filtered = graded(source.photo, filter: look.filter, maxPixel: maxPixel) else { return nil }
        guard let captureLook = ComposerPhotoLookRule.captureLook(for: look.frame) else { return filtered }
        let space = ComposerPhotoLookRule.colorSpace(of: source.photo)
        let person = source.person
        let faces = CallCaptureFaces(
            montage: [CallMontagePortrait(id: person.id, name: person.name, image: filtered)],
            frame: [CallFramePortrait(id: person.id, name: person.name, handle: person.handle,
                                      isSelf: person.isSelf, image: filtered)])
        return CallCaptureController.render(captureLook, faces: faces, caption: source.caption,
                                            texts: source.texts, size: frameCanvas, colorSpace: space)
    }

    /// La photo, bornée puis passée au filtre de l'appel. Sans borne ni filtre,
    /// c'est la photo elle-même — aucun ré-encodage.
    static func graded(_ photo: CGImage, filter: VideoFilterPreset, maxPixel: CGFloat?) -> CGImage? {
        let scale = maxPixel.map {
            ComposerPhotoLookRule.downscale(for: CGSize(width: photo.width, height: photo.height), maxPixel: $0)
        } ?? 1
        guard scale < 1 || ComposerPhotoLookRule.grades(filter) else { return photo }
        let space = ComposerPhotoLookRule.colorSpace(of: photo)
        let source = CIImage(cgImage: photo)
        let scaled = scale < 1 ? source.transformed(by: CGAffineTransform(scaleX: scale, y: scale)) : source
        let image = ComposerPhotoLookRule.grades(filter)
            ? VideoFilterColorimetry.graded(scaled, config: filter.config, colorSpace: space)
            : scaled
        return context.createCGImage(image, from: scaled.extent.integral, format: .RGBA8, colorSpace: space)
    }
}

/// Les vignettes d'une rangée, peintes ensemble hors du fil principal.
nonisolated struct ComposerPhotoLookThumbnails: @unchecked Sendable {
    let filters: [VideoFilterPreset: CGImage]
    let frames: [ComposerPhotoFrame: CGImage]

    static let empty = ComposerPhotoLookThumbnails(filters: [:], frames: [:])

    /// Les vignettes des filtres, sur la photo réduite — elles ne dépendent que
    /// de la photo.
    static func paintingFilters(source: ComposerPhotoLookSource) -> ComposerPhotoLookThumbnails {
        let small = reduced(source.photo)
        let filtres = ComposerPhotoLookRule.filters.reduce(into: [VideoFilterPreset: CGImage]()) { result, preset in
            result[preset] = ComposerPhotoLookRenderer.graded(small, filter: preset, maxPixel: nil)
        }
        return ComposerPhotoLookThumbnails(filters: filtres, frames: [:])
    }

    /// Les vignettes des cadres d'une puce, sur la photo déjà filtrée — ce que
    /// l'auteur obtiendra.
    static func paintingFrames(source: ComposerPhotoLookSource, filter: VideoFilterPreset,
                               frames: [ComposerPhotoFrame]) -> ComposerPhotoLookThumbnails {
        let reduite = ComposerPhotoLookSource(photo: reduced(source.photo), person: source.person,
                                              texts: source.texts, caption: source.caption)
        let cadres = frames.reduce(into: [ComposerPhotoFrame: CGImage]()) { result, frame in
            result[frame] = ComposerPhotoLookRenderer.render(
                ComposerPhotoLook(filter: filter, frame: frame), source: reduite,
                maxPixel: nil, frameCanvas: ComposerPhotoLookRule.thumbnailFrameCanvas)
        }
        return ComposerPhotoLookThumbnails(filters: [:], frames: cadres)
    }

    private static func reduced(_ photo: CGImage) -> CGImage {
        ComposerPhotoLookRenderer.graded(photo, filter: .natural, maxPixel: ComposerPhotoLookRule.thumbnailMaxPixel) ?? photo
    }
}

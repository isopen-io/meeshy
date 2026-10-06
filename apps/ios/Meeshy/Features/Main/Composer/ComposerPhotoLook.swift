import CoreGraphics
import Foundation
import UIKit

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
// le peintre unique de la capture (`ComposerLookPainter`, #9347).

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

    /// Un filtre ne coûte une passe que s'il change quelque chose.
    static func grades(_ preset: VideoFilterPreset) -> Bool {
        preset != .natural
    }

    /// **L'espace de la photo traverse tout le rendu** (#9327). L'iPhone prend
    /// en Display P3 et l'aperçu l'affiche ainsi : repeinte en sRGB, la prise
    /// pâlirait dès qu'on touche un filtre ou un cadre. Un espace étendu ou HDR
    /// ne tient pas dans une toile 8 bits : il retombe sur Display P3, qui
    /// couvre ce que le capteur sert ; une image sans espace RVB, sur sRGB.
    static func colorSpace(of photo: CGImage) -> CGColorSpace {
        colorSpace(declared: photo.colorSpace)
    }

    /// La même loi pour un espace DÉCLARÉ — celui d'une trame de l'objectif
    /// (#9329), qui suit l'espace actif de la caméra : P3 ou sRGB selon le
    /// format que la session a élu.
    static func colorSpace(declared: CGColorSpace?) -> CGColorSpace {
        let srgb = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
        guard let space = declared, space.model == .rgb else { return srgb }
        guard CGColorSpaceUsesExtendedRange(space) || CGColorSpaceUsesITUR_2100TF(space) else { return space }
        return CGColorSpace(name: CGColorSpace.displayP3) ?? srgb
    }
}

/// Ce que les cadres écrivent autour d'une prise, et ses pixels debout.
nonisolated enum ComposerPhotoLookSource {

    /// La légende d'un classique du Montage pour une prise faite à `date`.
    static func caption(at date: Date) -> CallMontageCaption {
        CallMontageCaption(title: CallCaptureController.brand,
                           subtitle: date.formatted(date: .abbreviated, time: .shortened))
    }

    /// Les pixels debout : le traitement de la prise (#8695) les rend déjà
    /// redressés ; une image venue d'ailleurs l'est ici, une fois.
    static func upright(_ image: UIImage) -> CGImage? {
        if image.imageOrientation == .up, let cgImage = image.cgImage { return cgImage }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let size = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }.cgImage
    }

    /// Ce que les cadres écrivent d'une prise faite à `date` — partagé par la
    /// photo et par le look en direct du viseur (#9329).
    static func texts(at date: Date) -> CallFrameTexts {
        CallFrameTexts(groupName: nil, isGroup: false, date: CallFrameTextsRule.dateText(date), accentHex: nil)
    }
}

/// L'auteur, tel que les cadres l'écrivent — son nom d'affichage, sinon son pseudo.
nonisolated enum ComposerPhotoLookPerson {
    static let selfId = "self"

    static func author(id: String?, displayName: String?, username: String?) -> CallFramePerson {
        let nom = [displayName, username]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? ""
        return CallFramePerson(id: id ?? selfId, name: nom, handle: username, isSelf: true)
    }
}

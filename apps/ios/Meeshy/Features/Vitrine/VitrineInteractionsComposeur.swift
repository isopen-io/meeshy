#if DEBUG
import Foundation
import MeeshySDK
import MeeshyUI

/// Un sticker posé sur une scène du composeur (#9810) : le composeur s'ouvre depuis la rangée des stories, la photo du
/// post le plus récent du kit — un portrait, fait pour la scène 9:16 — y entre comme le choix de la photothèque à
/// l'ouverture, puis Mee et Meo se posent par la feuille des stickers.
extension VitrineInteractions {
    /// La feuille monte et ses onglets se peignent avant le choix.
    static let tenueDeLaFeuille: Duration = .milliseconds(1300)
    /// La feuille se referme, le sticker se pose et s'ouvre en édition.
    static let tenueDuSticker: Duration = .milliseconds(1800)

    static func photoDeLaScene(_ f: VitrineFixtures, dossier: URL) -> URL? {
        guard let fichier = f.posts.first?.media?.first(where: { $0.mimeType?.hasPrefix("image/") ?? false })?.fileName,
              f.medias.contains(where: { $0.fichier == fichier && $0.genre == .image }) else { return nil }
        return dossier.appendingPathComponent(fichier)
    }

    /// Mee et Meo ensemble — le duo de la marque —, de préférence celui qui dit l'amour.
    static var stickerDeLaScene: StickerSheetChoice? {
        let duos = MeeStickerCatalog.stickers(of: .duo)
        return (duos.first { $0.intent == .amour } ?? duos.first).map(StickerSheetChoice.mee)
    }

    /// Le composeur des stories s'ouvre comme depuis sa tuile ; la photo d'ouverture l'attend dans le relais.
    static func ouvrirLeComposeur(_ f: VitrineFixtures) {
        guard let photo = photoDeLaScene(f, dossier: VitrineLaunch.dossierMedias), let copie = copierPourLeComposeur(photo) else {
            fatalError("Vitrine « \(VitrineScene.interactionSticker.rawValue) » : aucune photo du kit pour la scène")
        }
        VitrineRendu.shared.mediaDuComposeur = VitrineMediaDOuverture(url: copie, mimeType: "image/jpeg")
        NotificationCenter.default.post(name: .openStoryComposer, object: nil)
    }

    /// La porte du sticker s'ouvre par le rail, la feuille se laisse voir, le duo se pose par son choix.
    static func poserUnSticker(_ scene: VitrineScene) async {
        guard let ouvrir = VitrineRendu.shared.ouvrirLesStickers, let sticker = stickerDeLaScene else {
            fatalError("Vitrine « \(scene.rawValue) » : le composeur n'a pas prêté sa porte du sticker")
        }
        ouvrir()
        await VitrineRendu.shared.attendre([.feuilleDeStickers])
        try? await Task.sleep(for: tenueDeLaFeuille)
        guard let choisir = VitrineRendu.shared.choisirUnSticker else {
            fatalError("Vitrine « \(scene.rawValue) » : la feuille des stickers n'a pas prêté son choix")
        }
        choisir(sticker)
        try? await Task.sleep(for: tenueDuSticker)
    }

    /// Le composeur range ses médias dans ses propres fichiers : il reçoit une COPIE, jamais la photo du kit.
    static func copierPourLeComposeur(_ fichier: URL, prefixe: String = "composer_photo") -> URL? {
        let copie = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(prefixe)_\(UUID().uuidString).\(fichier.pathExtension)")
        return (try? FileManager.default.copyItem(at: fichier, to: copie)).map { copie }
    }
}
#endif

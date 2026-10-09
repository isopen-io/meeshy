#if DEBUG
import Foundation
import MeeshySDK

/// Un réel publié depuis le composeur (#9820) : le fil se montre, le composeur des stories s'ouvre comme depuis sa tuile
/// sur la vraie vidéo du kit — elle y entre comme le choix de la photothèque à l'ouverture —, puis au clap « Réel » est
/// choisi au chevron et « Publier » touché. Le réel monte, puis arrive en tête du fil, où il joue.
extension VitrineInteractions {
    /// La vidéo joue sur la scène du composeur avant la publication.
    static let tenueDuComposeur: Duration = .milliseconds(1500)
    /// Le réel arrivé en tête du fil s'y laisse voir jouer.
    static let tenueDuReel: Duration = .milliseconds(3500)
    /// Ce que l'auteur arme au chevron : un réel, sans disposition.
    static let choixDuReel = ComposerPublishChoice(format: .reel, layout: nil)

    static func videoDuReel(_ f: VitrineFixtures, dossier: URL) -> URL? {
        f.medias.first { $0.genre == .video }.map { dossier.appendingPathComponent($0.fichier) }
    }

    /// Sur iPhone le fil se révèle d'abord (sur iPad il occupe déjà la colonne gauche) ; une fois peint, le composeur
    /// s'ouvre sur une COPIE de la vidéo — le composeur range ses médias dans ses propres fichiers.
    static func ouvrirLeFilPuisLeComposeur(_ f: VitrineFixtures) {
        guard let video = videoDuReel(f, dossier: VitrineLaunch.dossierMedias),
              let copie = copierPourLeComposeur(video, prefixe: "composer_video") else {
            fatalError("Vitrine « \(VitrineScene.interactionReel.rawValue) » : aucune vidéo du kit pour le réel")
        }
        VitrineRendu.shared.montrerLeFil?()
        Task {
            await VitrineRendu.shared.attendre([.fil])
            try? await Task.sleep(for: VitrineStage.pose)
            VitrineRendu.shared.mediaDuComposeur = VitrineMediaDOuverture(url: copie, mimeType: "video/mp4")
            NotificationCenter.default.post(name: .openStoryComposer, object: nil)
        }
    }

    /// Le geste de l'auteur : « Réel » armé au chevron, « Publier » touché ; la scène tient jusqu'au réel dans le fil.
    static func publierLeReel(_ scene: VitrineScene) async {
        try? await Task.sleep(for: tenueDuComposeur)
        guard let publier = VitrineRendu.shared.publierDepuisLeComposeur else {
            fatalError("Vitrine « \(scene.rawValue) » : le composeur n'a pas prêté sa flèche de publication")
        }
        publier(choixDuReel)
        await VitrineRendu.shared.attendre([.reelPublie])
        try? await Task.sleep(for: tenueDuReel)
    }
}
#endif

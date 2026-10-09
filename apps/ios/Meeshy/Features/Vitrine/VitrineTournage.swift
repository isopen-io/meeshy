#if DEBUG
import Foundation

/// Ce qui a libéré l'action d'une scène filmée.
nonisolated enum VitrineClap: Equatable, Sendable {
    /// Le script a déposé `go.txt` : l'enregistreur tourne.
    case donne
    /// Aucun clap dans le délai : une simple capture, sans tournage.
    case repli
}

/// Le clap du tournage (#9810). L'enregistreur du simulateur démarre 0,4 à 2 s après « prêt » : un délai fixe laissait
/// partir l'action hors du film. Après « prêt », la scène ATTEND donc que le script dépose `go.txt` — il le fait une fois
/// l'enregistrement lancé — puis encadre son action par « celebration-debut » et « celebration-fin ». Sans tournage,
/// aucun clap ne vient : l'action part après le repli. Le script dépose `go.txt` jusqu'à 4,5 s après « prêt » :
/// un repli plus court partirait avant le clap et rendrait la poignée de main inutile.
@MainActor
enum VitrineTournage {
    static let repli: Duration = .seconds(8)
    static let pas: Duration = .milliseconds(50)

    static func attendreLeClap(_ go: URL = VitrineLaunch.marqueurGo, repli: Duration = VitrineTournage.repli) async -> VitrineClap {
        let limite = ContinuousClock.now + repli
        while !FileManager.default.fileExists(atPath: go.path) {
            guard ContinuousClock.now < limite else { return .repli }
            try? await Task.sleep(for: pas)
        }
        return .donne
    }

    static let prefixeDEtape = "etape-"

    /// Un clap, une borne ou une étape d'une prise précédente ferait partir, finir ou dater la suivante trop tôt.
    static func effacerLesMarqueurs(dans dossier: URL = VitrineLaunch.dossier) {
        let etapes = ((try? FileManager.default.contentsOfDirectory(atPath: dossier.path)) ?? []).filter { $0.hasPrefix(prefixeDEtape) }
        for nom in [VitrineLaunch.marqueurGo, VitrineLaunch.marqueurCelebrationDebut, VitrineLaunch.marqueurCelebrationFin].map(\.lastPathComponent) + etapes {
            try? FileManager.default.removeItem(at: dossier.appendingPathComponent(nom))
        }
    }

    /// Une étape de l'action, datée par un fichier (`etape-<nom>.txt`) : le script y ancre les fenêtres de mouvement dont
    /// l'instant dépend du rendu d'un écran — le choix d'un émoji après que le menu s'est montré, par exemple.
    static func etape(_ nom: String, dans dossier: URL = VitrineLaunch.dossier) {
        marquer(dossier.appendingPathComponent("\(prefixeDEtape)\(nom).txt"), contenu: nom)
    }

    /// Après « prêt » : le clap, « début », l'action, puis « fin » une fois l'action rendue.
    static func tourner(_ scene: VitrineScene, dans dossier: URL = VitrineLaunch.dossier, action: @MainActor () async -> Void) async {
        _ = await attendreLeClap(dossier.appendingPathComponent(VitrineLaunch.marqueurGo.lastPathComponent))
        marquer(dossier.appendingPathComponent(VitrineLaunch.marqueurCelebrationDebut.lastPathComponent), scene)
        await action()
        marquer(dossier.appendingPathComponent(VitrineLaunch.marqueurCelebrationFin.lastPathComponent), scene)
    }

    private static func marquer(_ marqueur: URL, _ scene: VitrineScene) {
        marquer(marqueur, contenu: scene.rawValue)
    }

    private static func marquer(_ marqueur: URL, contenu: String) {
        try? FileManager.default.createDirectory(at: marqueur.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? Data(contenu.utf8).write(to: marqueur)
    }
}
#endif

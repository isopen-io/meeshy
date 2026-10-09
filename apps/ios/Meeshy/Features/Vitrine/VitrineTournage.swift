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
/// aucun clap ne vient : l'action part après le repli.
@MainActor
enum VitrineTournage {
    static let repli: Duration = .seconds(3)
    static let pas: Duration = .milliseconds(50)

    static func attendreLeClap(_ go: URL = VitrineLaunch.marqueurGo, repli: Duration = VitrineTournage.repli) async -> VitrineClap {
        let limite = ContinuousClock.now + repli
        while !FileManager.default.fileExists(atPath: go.path) {
            guard ContinuousClock.now < limite else { return .repli }
            try? await Task.sleep(for: pas)
        }
        return .donne
    }

    /// Un clap ou une borne d'une prise précédente ferait partir ou finir la suivante trop tôt.
    static func effacerLesMarqueurs(dans dossier: URL = VitrineLaunch.dossier) {
        for nom in [VitrineLaunch.marqueurGo, VitrineLaunch.marqueurCelebrationDebut, VitrineLaunch.marqueurCelebrationFin].map(\.lastPathComponent) {
            try? FileManager.default.removeItem(at: dossier.appendingPathComponent(nom))
        }
    }

    /// Après « prêt » : le clap, « début », l'action, puis « fin » une fois l'action rendue.
    static func tourner(_ scene: VitrineScene, dans dossier: URL = VitrineLaunch.dossier, action: @MainActor () async -> Void) async {
        _ = await attendreLeClap(dossier.appendingPathComponent(VitrineLaunch.marqueurGo.lastPathComponent))
        marquer(dossier.appendingPathComponent(VitrineLaunch.marqueurCelebrationDebut.lastPathComponent), scene)
        await action()
        marquer(dossier.appendingPathComponent(VitrineLaunch.marqueurCelebrationFin.lastPathComponent), scene)
    }

    private static func marquer(_ marqueur: URL, _ scene: VitrineScene) {
        try? FileManager.default.createDirectory(at: marqueur.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? Data(scene.rawValue.utf8).write(to: marqueur)
    }
}
#endif

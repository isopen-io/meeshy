import Foundation

/// **Une part de la barre du haut : un segment clos, ou la prise qui s'écrit**
/// (#17268). `start` et `length` se lisent en part du maximum du format.
nonisolated struct ComposerCaptureBarSpan: Equatable, Sendable {
    let start: Double
    let length: Double
    let live: Bool
}

/// **Ce que la capture MONTRE pendant qu'on filme** (#17268, retour porteur du
/// 2026-11-09 : « je n'ai pas vu les segments apparaître en haut ni le cercle
/// sur l'anneau pendant la capture par appui long sur la scène ou par-dessus »).
///
/// Deux défauts, une règle :
/// - le composer pose toujours un maximum, donc la barre du haut n'était que
///   cinq cases remplies d'un blanc continu : aucun segment ne s'y lisait. Elle
///   porte désormais UNE capsule par segment, placée à sa part du maximum, et la
///   prise en cours en rouge, qui grandit ;
/// - la barre et l'anneau attendaient l'étape `.recording`, qui n'arrive qu'une
///   fois la session prête à écrire. Ils partent dès que la TENUE commence : le
///   doigt sait tout de suite qu'il filme.
nonisolated enum ComposerCaptureProgressDisplay {

    /// La prise est-elle à l'écran ? Dès la tenue, avant même que la caméra écrive.
    static func isCapturing(stage: ComposerSceneCameraStage, holding: Bool) -> Bool {
        stage == .recording || (holding && stage == .armed)
    }

    /// La durée de la prise EN COURS : hors enregistrement, la caméra garde la
    /// dernière valeur atteinte, que la tenue qui commence ne doit pas reprendre.
    static func liveDuration(_ raw: TimeInterval, stage: ComposerSceneCameraStage) -> TimeInterval {
        stage == .recording ? max(0, raw) : 0
    }

    /// La barre du maximum paraît dès que la prise commence, et reste tant que des
    /// segments attendent ; jamais en retouche, jamais sans maximum.
    static func showsBudgetBar(editing: Bool, budget: TimeInterval?, capturing: Bool, segmentCount: Int) -> Bool {
        !editing && budget.map { $0 > 0 } == true && (capturing || segmentCount > 0)
    }

    /// Les parts de la barre, de gauche à droite : chaque segment clos à sa durée,
    /// puis la prise en cours. Rien ne déborde du maximum.
    static func spans(segments: [TimeInterval], live: TimeInterval, capturing: Bool,
                      budget: TimeInterval?) -> [ComposerCaptureBarSpan] {
        guard let budget, budget > 0 else { return [] }
        let durees = segments.map { (duree: $0, live: false) } + (capturing ? [(duree: live, live: true)] : [])
        return durees.reduce(into: [ComposerCaptureBarSpan]()) { parts, part in
            let debut = parts.last.map { $0.start + $0.length } ?? 0
            let longueur = min(max(0, part.duree) / budget, max(0, 1 - debut))
            parts.append(ComposerCaptureBarSpan(start: debut, length: longueur, live: part.live))
        }
    }

    /// La part du maximum que l'anneau du déclencheur montre : segments clos et
    /// prise en cours.
    static func ringProgress(segments: [ComposerCaptureSegment], rawLive: TimeInterval,
                             stage: ComposerSceneCameraStage, budget: TimeInterval?) -> Double {
        ComposerCaptureRecordingBudget.fraction(
            elapsed: ComposerCaptureSegments.totalDuration(segments) + liveDuration(rawLive, stage: stage),
            budget: budget)
    }
}

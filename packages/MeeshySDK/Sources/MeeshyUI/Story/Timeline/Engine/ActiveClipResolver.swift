import Foundation
import MeeshySDK

/// Quel clip est « actif » à un instant donné de la lecture.
///
/// `TimelineViewModel` s'abonnait depuis toujours à
/// `engine.onElementBecameActive` pour que l'inspecteur suive le clip franchi
/// pendant la lecture — mais l'engine n'appelait jamais ce callback. Le
/// consommateur était câblé, le producteur n'existait pas : la sélection
/// restait figée sur le dernier clip touché, quoi qu'il joue.
///
/// Pur et sans état : le moteur l'interroge à chaque tick et ne signale que
/// les CHANGEMENTS.
nonisolated enum ActiveClipResolver {

    /// - Returns: l'identifiant du clip dont la fenêtre contient `time`, ou
    ///   `nil` dans un trou. Bornes `[start, start + duration)` — la fin
    ///   appartient au clip SUIVANT, sinon deux clips adjacents se
    ///   disputeraient l'instant pivot.
    static func activeClipId(at time: Float, in project: TimelineProject) -> String? {
        candidates(in: project)
            .filter { $0.start <= time && time < $0.start + $0.duration }
            // Sur un chevauchement, le clip démarré le PLUS RÉCEMMENT gagne :
            // c'est celui que l'utilisateur voit arriver par-dessus.
            .max { lhs, rhs in lhs.start < rhs.start }?
            .id
    }

    private struct Window {
        let id: String
        let start: Float
        let duration: Float
    }

    /// Les clips éligibles. Sont écartés :
    /// - les FONDS, qui couvrent toute la slide et resteraient actifs en
    ///   permanence — la sélection ne bougerait jamais ;
    /// - les clips « permanents » (durée nil ou ≤ 0, tout texte fraîchement
    ///   posé), qui couvrent la slide pour la même raison.
    private static func candidates(in project: TimelineProject) -> [Window] {
        var windows: [Window] = []
        for m in project.mediaObjects where !m.isBackground {
            if let d = m.duration, d > 0 {
                windows.append(Window(id: m.id, start: Float(m.startTime ?? 0), duration: Float(d)))
            }
        }
        for a in project.audioPlayerObjects where !(a.isBackground ?? false) {
            if let d = a.duration, d > 0 {
                windows.append(Window(id: a.id, start: a.startTime ?? 0, duration: d))
            }
        }
        for t in project.textObjects {
            if let d = t.duration, d > 0 {
                windows.append(Window(id: t.id, start: Float(t.startTime ?? 0), duration: Float(d)))
            }
        }
        for s in project.stickerObjects {
            if let d = s.duration, d > 0 {
                windows.append(Window(id: s.id, start: Float(s.startTime ?? 0), duration: Float(d)))
            }
        }
        // **La cinquième famille, et le trou s'OUVRAIT avec #4840.** Tant
        // qu'aucun geste ne pouvait poser de fenêtre sur un lieu, `duration`
        // valait toujours `nil` : ce filtre ne tombait jamais, et l'absence
        // était sans effet. Elle devient visible à l'instant où la fenêtre est
        // atteignable — une pastille qui en porte une doit devenir le clip
        // actif pendant la lecture, comme ses quatre sœurs.
        for l in project.locationObjects {
            if let d = l.duration, d > 0 {
                windows.append(Window(id: l.id, start: Float(l.startTime ?? 0), duration: Float(d)))
            }
        }
        return windows
    }
}

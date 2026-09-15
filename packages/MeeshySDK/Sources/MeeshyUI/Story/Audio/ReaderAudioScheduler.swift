import Foundation
import AVFoundation

/// **Ce que le mixer du lecteur REMET au moteur pour une passe** — la fenêtre
/// de frames, rendue comme une VALEUR plutôt que comme un appel.
nonisolated enum ReaderAudioScheduleWindow: Equatable, Sendable {
    /// Le fichier ENTIER (`AVAudioPlayerNode.scheduleFile`) — aucun rognage
    /// déclaré et aucune entrée en cours de piste.
    case wholeFile
    /// Une fenêtre de frames (`scheduleSegment`) — rognage, entrée en cours de
    /// piste, ou les deux.
    case segment(startingFrame: AVAudioFramePosition, frameCount: AVAudioFrameCount)
}

/// **Le contrat d'ORDONNANCEMENT du mixer de lecture — et le seam par lequel
/// un témoin l'observe.**
///
/// `TimelineAudioWindow` éprouve le CALCUL de la fenêtre ; rien n'éprouvait son
/// APPLICATION. Or une entrée en cours de piste tient à DEUX décisions prises
/// au même endroit, et la seconde ne se lit dans aucune valeur calculée :
///
/// 1. la frame de départ — `TimelineAudioWindow.segment` la rend ;
/// 2. **l'heure** — `at: nil` (immédiat). Sans elle, le node est planifié à une
///    heure DÉJÀ PASSÉE, ce qu'`AVAudioPlayerNode` rend en jouant le fichier
///    depuis sa frame 0 : la loi est juste, la lecture est fausse.
///
/// Un témoin qui n'observe que (1) laisse (2) se casser en silence. Ce
/// protocole rend les deux lisibles sans `AVAudioEngine` ni sortie audio.
protocol ReaderAudioSchedulerProviding: AnyObject {
    func schedule(node: AVAudioPlayerNode,
                  file: AVAudioFile,
                  window: ReaderAudioScheduleWindow,
                  at: AVAudioTime?,
                  completionHandler: (@Sendable () -> Void)?)
}

/// L'implémentation de PRODUCTION : elle ne décide rien, elle pose. Toute règle
/// vit chez l'appelant (`ReaderAudioMixer.scheduleAudio`), qui reste le site
/// unique d'où part la planification — foreground comme fond.
final class ReaderAudioNodeScheduler: ReaderAudioSchedulerProviding {
    // iOS 26.1 : la `deinit` synthétisée d'un type isolé MainActor (SE-0466,
    // isolation par défaut du module) double-libère à la libération hors tâche.
    // Garde : `MeeshyUIDeinitSourceGuardTests`.
    nonisolated deinit {}

    func schedule(node: AVAudioPlayerNode,
                  file: AVAudioFile,
                  window: ReaderAudioScheduleWindow,
                  at: AVAudioTime?,
                  completionHandler: (@Sendable () -> Void)?) {
        switch window {
        case .wholeFile:
            node.scheduleFile(file, at: at, completionHandler: completionHandler)
        case let .segment(startingFrame, frameCount):
            node.scheduleSegment(file,
                                 startingFrame: startingFrame,
                                 frameCount: frameCount,
                                 at: at,
                                 completionHandler: completionHandler)
        }
    }
}

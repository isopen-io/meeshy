import Foundation

/// Un enregistreur de message vocal que le début d'un appel doit arrêter.
@MainActor
public protocol CallInterruptibleRecorder: AnyObject {
    /// Arrête la capture en GARDANT ce qui a été enregistré — sans rendre la
    /// session audio, que l'appel possède désormais.
    func stopForCall()
}

/// **Un appel arrête l'enregistrement en cours.**
///
/// Au début d'un appel, seuls les LECTEURS étaient arrêtés
/// (`PlaybackCoordinator.stopAll()`). Un message vocal en cours d'enregistrement
/// — appel arrivé par le socket, app au premier plan, sans CallKit ni
/// interruption système — continuait de capturer : l'audio de l'appel finissait
/// dans le message, l'enregistreur disputait le micro au traitement vocal de
/// WebRTC, et le raccrochage rendait la session sous lui.
///
/// Les enregistreurs s'inscrivent ici au démarrage ; la pile d'appel appelle
/// `stopAllForCall()` à la transition inactif → actif. Références faibles :
/// un enregistreur libéré disparaît seul.
@MainActor
public final class RecorderCallGuard {
    nonisolated deinit {}
    public static let shared = RecorderCallGuard()

    private let recorders = NSHashTable<AnyObject>.weakObjects()

    public init() {}

    public func register(_ recorder: CallInterruptibleRecorder) {
        recorders.add(recorder)
    }

    public func unregister(_ recorder: CallInterruptibleRecorder) {
        recorders.remove(recorder)
    }

    public func stopAllForCall() {
        for case let recorder as CallInterruptibleRecorder in recorders.allObjects {
            recorder.stopForCall()
        }
    }

    /// Enregistreurs encore vivants inscrits (tests).
    public var registeredCount: Int { recorders.allObjects.count }
}

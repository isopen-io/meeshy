#if os(iOS)
import Foundation

/// Ce que l'orchestrateur d'enregistrement demande à la session partagée.
public protocol RecordingSessionControlling: Sendable {
    /// Pose la session d'enregistrement. `holding` : un enregistrement est en
    /// cours, et aucun lecteur de contenu ne doit la reconfigurer ni la rendre.
    /// `false` ⇒ la session n'a pas pu être prise (appel VoIP en cours).
    func configureRecordingSession(_ configuration: RecordingSessionConfiguration, holding: Bool) -> Bool
    func releaseRecordingHold()
    func handBackSession(_ handBack: RecordingSessionHandBack)
}

/// **L'enregistrement dans Meeshy, de son début à sa fin** (#11042).
@MainActor
public final class MeeshyRecordingSession {
    nonisolated deinit {}

    public static let shared = MeeshyRecordingSession()

    private let session: any RecordingSessionControlling
    private let ducker: RecordingPlaybackDucker

    init(session: any RecordingSessionControlling = MediaSessionCoordinator.shared,
         ducker: RecordingPlaybackDucker = .shared) {
        self.session = session
        self.ducker = ducker
    }

    @discardableResult
    public func begin(_ source: RecordingSource) -> Bool { false }

    public func finish(handingBackSession: Bool) {}

    @discardableResult
    public func prepare(_ source: RecordingSource) -> Bool { false }

    public func handBack() {}
}
#endif

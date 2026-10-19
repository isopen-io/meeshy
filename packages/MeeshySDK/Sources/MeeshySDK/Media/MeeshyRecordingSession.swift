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
///
/// Le seul chemin par lequel un enregistreur (vocal, caméra) prend la session
/// partagée et la rend :
/// - `begin` pose la session de `RecordingSessionLaw` (non mélangeable : les
///   sons extérieurs s'arrêtent) et BAISSE le son Meeshy qui joue, sans
///   l'arrêter ;
/// - `finish` le REMONTE au volume qu'il avait, puis, pour un vocal, rend la
///   session — à la lecture si un son Meeshy joue encore, aux autres apps
///   sinon ;
/// - la caméra garde la session tant que le viseur est ouvert (`prepare`
///   quand son micro entre, `handBack` quand il se ferme) : changer la
///   catégorie sous une capture qui tourne la reconfigurerait.
///
/// Pendant un appel VoIP, rien ne se reconfigure : `begin` est refusé par la
/// session, et aucun lecteur n'est touché.
@MainActor
public final class MeeshyRecordingSession {
    nonisolated deinit {}

    public static let shared = MeeshyRecordingSession()

    private let session: any RecordingSessionControlling
    private let ducker: RecordingPlaybackDucker
    /// Un enregistrement tient la session (entre `begin` et `finish`).
    private var isRecording = false
    /// La session a été posée pour enregistrer et n'a pas encore été rendue.
    private var ownsRecordingConfiguration = false

    init(session: any RecordingSessionControlling = MediaSessionCoordinator.shared,
         ducker: RecordingPlaybackDucker = .shared) {
        self.session = session
        self.ducker = ducker
    }

    /// Un enregistrement commence. `false` ⇒ la session n'a pas pu être prise
    /// (appel VoIP) : l'enregistreur ne démarre pas.
    @discardableResult
    public func begin(_ source: RecordingSource) -> Bool {
        let configuration = RecordingSessionLaw.configuration(
            for: source, meeshySoundPlaying: ducker.hasAudiblePlayback
        )
        guard session.configureRecordingSession(configuration, holding: true) else { return false }
        isRecording = true
        ownsRecordingConfiguration = true
        ducker.duck()
        return true
    }

    /// L'enregistrement se termine — envoi, annulation ou échec. Sans `begin`
    /// préalable, ne fait rien.
    public func finish(handingBackSession: Bool) {
        guard isRecording else { return }
        isRecording = false
        ducker.restore()
        session.releaseRecordingHold()
        guard handingBackSession else { return }
        handBackConfiguration()
    }

    /// La caméra arme son micro : la session devient capable d'enregistrer
    /// avant que la capture ne tourne, sans rien baisser ni rien tenir.
    @discardableResult
    public func prepare(_ source: RecordingSource) -> Bool {
        let configuration = RecordingSessionLaw.configuration(
            for: source, meeshySoundPlaying: ducker.hasAudiblePlayback
        )
        guard session.configureRecordingSession(configuration, holding: false) else { return false }
        ownsRecordingConfiguration = true
        return true
    }

    /// Le viseur se ferme : un enregistrement encore en cours se termine, et
    /// la session se rend si elle avait été posée pour enregistrer.
    public func handBack() {
        finish(handingBackSession: false)
        handBackConfiguration()
    }

    private func handBackConfiguration() {
        guard ownsRecordingConfiguration else { return }
        ownsRecordingConfiguration = false
        session.handBackSession(
            RecordingSessionLaw.handBack(meeshySoundStillPlaying: ducker.hasAudiblePlayback)
        )
    }
}
#endif

import Foundation
import AVFoundation
import os
import MeeshySDK

/// **Ce que le moteur partagé attend d'un mixer qui s'y attache (#9878).**
///
/// L'hôte ne connaît ni les clips, ni les fondus, ni l'ancre de la slide : il
/// demande au client s'il JOUE (le moteur doit tourner) et s'il TIENT des nodes
/// (le moteur doit garder ses ressources), puis lui remet les deux événements
/// système qu'un moteur ne surmonte pas seul.
@MainActor
protocol ReaderAudioEngineClient: AnyObject {
    var claimsRunningEngine: Bool { get }
    var holdsEngineNodes: Bool { get }
    /// Le moteur vient de redémarrer après un changement de sortie : les
    /// passes planifiées sont perdues, le client replanifie depuis son ancre.
    func engineDidRestartAfterConfigurationChange()
    /// Le moteur est NEUF (services média réinitialisés) : le client rattache
    /// ses nodes et, s'il jouait, replanifie.
    func engineWasRebuilt()
}

/// **La loi de repos du moteur partagé — pure, sans moteur ni horloge.**
///
/// Un mixer qui s'arrête ne coupe plus SON moteur : il dit à l'hôte qu'il ne
/// joue plus, et l'hôte décide pour tous. Un voisin préparé garde le moteur en
/// PAUSE (ressources tenues : la page suivante démarre sans allocation pendant
/// le geste) ; plus aucun node attaché ⇒ ARRÊT (ressources rendues).
nonisolated enum ReaderAudioEngineIdleLaw {
    nonisolated enum Action: Equatable, Sendable { case keepRunning, pause, stop }

    static func action(anyClientPlaying: Bool, anyClientHoldsNodes: Bool) -> Action {
        guard !anyClientPlaying else { return .keepRunning }
        return anyClientHoldsNodes ? .pause : .stop
    }
}

/// **UN `AVAudioEngine` pour toutes les surfaces de lecture (#9878).**
///
/// Avant : un moteur par canevas, créé même sans son — jusqu'à 4 dans le
/// lecteur de stories, 5 autour d'un réel, un par carte-scène visible. Un seul
/// jouait (`PlaybackCoordinator`), tous gardaient unité d'E/S, nodes et fichiers.
/// Désormais chaque `ReaderAudioMixer` de canevas attache et détache ses
/// `AVAudioPlayerNode` sur le moteur de `ReaderAudioEngineHost.reader`.
///
/// L'hôte observe aussi ce qu'aucun mixer n'observait :
/// - `AVAudioEngineConfigurationChange` (AirPods branchés, sortie changée) : le
///   moteur s'est arrêté seul ; il repart, et chaque client qui jouait
///   replanifie depuis son ancre — le son reprend où en est la slide ;
/// - `AVAudioSession.mediaServicesWereResetNotification` : le moteur est mort ;
///   un moteur neuf est construit et chaque client y rattache ses nodes.
final class ReaderAudioEngineHost {
    /// Le moteur des canevas de LECTURE (stories, réels, cartes-scènes du fil).
    static let reader = ReaderAudioEngineHost()

    private(set) var engine = AVAudioEngine()
    /// Nombre de moteurs construits depuis la naissance de l'hôte — 1, puis +1
    /// par réinitialisation des services média. Seam d'observation.
    private(set) var enginesBuilt = 1

    private var clients: [WeakClient] = []
    private var observers: ReaderAudioEngineObservers?
    private let logger = MeeshyLog.logger(.media)

    init() {
        observers = ReaderAudioEngineObservers(host: self)
    }

    nonisolated deinit {}

    // MARK: - Clients

    func register(_ client: any ReaderAudioEngineClient) {
        clients = clients.filter { $0.client != nil && $0.client !== client } + [WeakClient(client: client)]
    }

    private var liveClients: [any ReaderAudioEngineClient] {
        clients.compactMap { $0.client }
    }

    // MARK: - Transport

    /// Le moteur tourne, ou part. Appelé par un client qui va jouer.
    func startEngine() throws {
        guard !engine.isRunning else { return }
        try engine.start()
    }

    /// Un client vient de cesser de jouer (pause, arrêt, démontage) : le moteur
    /// suit la loi de repos sur l'ENSEMBLE des clients, jamais sur un seul.
    func clientDidGoIdle() {
        let live = liveClients
        let action = ReaderAudioEngineIdleLaw.action(
            anyClientPlaying: live.contains { $0.claimsRunningEngine },
            anyClientHoldsNodes: live.contains { $0.holdsEngineNodes })
        switch action {
        case .keepRunning:
            return
        case .pause:
            if engine.isRunning { engine.pause() }
        case .stop:
            if engine.isRunning { engine.stop() }
        }
    }

    // MARK: - Événements système

    /// `sender` : le moteur qui a changé de configuration. Ceux d'un appel ou du
    /// composer postent la même notification ; seul le nôtre nous concerne.
    func engineConfigurationDidChange(of sender: ObjectIdentifier?) {
        guard sender == ObjectIdentifier(engine) else { return }
        let playing = liveClients.filter { $0.claimsRunningEngine }
        guard !playing.isEmpty else { return }
        do {
            try startEngine()
        } catch {
            logger.error("ReaderAudioEngineHost restart after configuration change failed: \(error.localizedDescription, privacy: .public)")
            return
        }
        playing.forEach { $0.engineDidRestartAfterConfigurationChange() }
    }

    /// Les services média ont été réinitialisés : tout `AVAudioEngine` vivant
    /// est inutilisable. Un moteur neuf remplace l'ancien, et chaque client —
    /// joueur ou voisin préparé — y rattache ses nodes.
    func mediaServicesWereReset() {
        engine = AVAudioEngine()
        enginesBuilt += 1
        liveClients.forEach { $0.engineWasRebuilt() }
    }

    private struct WeakClient {
        weak var client: (any ReaderAudioEngineClient)?
    }
}

/// Les deux observateurs système de l'hôte, retirés quand l'hôte disparaît.
/// Les notifications arrivent sur un fil quelconque : seul l'identifiant de
/// l'émetteur traverse vers le fil principal.
nonisolated final class ReaderAudioEngineObservers: @unchecked Sendable {
    private let tokens: [NSObjectProtocol]

    @MainActor
    init(host: ReaderAudioEngineHost) {
        let center = NotificationCenter.default
        tokens = [
            center.addObserver(forName: .AVAudioEngineConfigurationChange,
                               object: nil, queue: nil) { [weak host] notification in
                let sender = notification.object.map { ObjectIdentifier($0 as AnyObject) }
                Task { @MainActor [weak host] in
                    host?.engineConfigurationDidChange(of: sender)
                }
            },
            center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification,
                               object: nil, queue: nil) { [weak host] _ in
                Task { @MainActor [weak host] in
                    host?.mediaServicesWereReset()
                }
            },
        ]
    }

    deinit {
        tokens.forEach { NotificationCenter.default.removeObserver($0) }
    }
}

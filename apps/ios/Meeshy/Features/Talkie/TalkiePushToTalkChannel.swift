import AVFoundation
import Foundation
import MeeshySDK
import os
import PushToTalk

private extension Logger {
    nonisolated static let talkiePTT = MeeshyLog.logger(.audioPlayback)
}

/// **LE CANAL PUSHTOTALK DU TALKIE** (#17143) — ce qui permet à une voix de sortir chez moi alors que Meeshy est en
/// arrière-plan : iOS réveille l'app sur un push `pushtotalk` (topic `<bundle>.voip-ptt`), active la session audio, et
/// la voix rejouée par la passerelle sort.
///
/// - Le canal se rejoint au PREMIER PLAN, sur un geste (l'activation du talkie) : c'est la règle du framework, et un
///   canal rejoint affiche l'interface système du talkie — on ne l'impose à personne qui ne s'en sert pas.
/// - Son jeton éphémère part sur `POST /api/v1/users/me/push-to-talk-token`, et se garde sur l'appareil. À la
///   déconnexion du compte, il est retiré du serveur AVANT l'effacement des identifiants (`SessionEndingHooks`), le
///   canal est quitté et son identifiant renouvelé : le compte suivant n'hérite d'aucun réveil.
/// - Sans l'entitlement `com.apple.developer.push-to-talk`, l'instanciation échoue proprement : rien ne se rejoint, et
///   le réveil passe par la notification time-sensitive `talkie_incoming`.
@MainActor
protocol TalkiePushToTalkChanneling: AnyObject {
    /// Rejoint le canal s'il ne l'est pas déjà. À appeler sur un geste, app au premier plan.
    func activate() async
    /// Déconnexion du compte : retire le jeton du serveur (attendu), quitte le canal, renouvelle son identifiant.
    func endSession() async
}

/// Les décisions du canal, sans le framework : de quoi les éprouver.
nonisolated enum TalkiePushToTalkRules {
    static let channelDefaultsKey = "talkie.pushToTalk.channelUUID"
    static let tokenDefaultsKey = "talkie.pushToTalk.token"

    /// L'identifiant STABLE du canal : relu, sinon créé et gardé — iOS restaure le canal sous ce même identifiant.
    static func channelUUID(in defaults: UserDefaults) -> UUID {
        if let stored = defaults.string(forKey: channelDefaultsKey).flatMap(UUID.init(uuidString:)) { return stored }
        let fresh = UUID()
        defaults.set(fresh.uuidString, forKey: channelDefaultsKey)
        return fresh
    }

    /// Le nom que l'interface système affiche pour la voix qui arrive. Une charge illisible ne fait pas quitter le
    /// canal : elle s'affiche sous le libellé neutre, et rien ne se rejoint.
    static func participantName(for payload: [AnyHashable: Any], fallback: String) -> String {
        TalkieWakePush(pushToTalkPayload: payload)?.displayName(fallback: fallback) ?? fallback
    }

    /// Le jeton tel que la passerelle l'attend : hexadécimal, comme les autres jetons APNs.
    static func hex(_ token: Data) -> String {
        token.map { String(format: "%02x", $0) }.joined()
    }
}

/// Le jeton PushToTalk sur la passerelle.
nonisolated protocol TalkiePushToTalkTokenRegistering: Sendable {
    func register(token: String) async throws
    func unregister(token: String) async throws
}

/// Le corps d'enregistrement : le jeton ET l'environnement APNs de la build qui l'a produit. Sans lui, la passerelle
/// range le jeton en `production` et Apple refuse le réveil d'une build de développement (`BadEnvironmentKeyInToken`).
nonisolated struct TalkiePushToTalkRegistration: Encodable, Sendable {
    let token: String
    let apnsEnvironment: String
    let bundleId: String?

    init(token: String, apnsEnvironment: String = PushNotificationManager.apnsEnvironment, bundleId: String? = Bundle.main.bundleIdentifier) {
        self.token = token
        self.apnsEnvironment = apnsEnvironment
        self.bundleId = bundleId
    }
}

/// `POST/DELETE /api/v1/users/me/push-to-talk-token` (#17142), par le catalogue généré.
nonisolated struct APITalkiePushToTalkTokenRegistrar: TalkiePushToTalkTokenRegistering {
    private struct Body: Encodable, Sendable {
        let token: String
    }

    func register(token: String) async throws {
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.post(
            UsersEndpoint.mePushToTalkToken,
            body: TalkiePushToTalkRegistration(token: token)
        )
    }

    func unregister(token: String) async throws {
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.delete(UsersEndpoint.mePushToTalkToken, body: Body(token: token))
    }
}

/// Le canal réel. Le délégué du framework est appelé hors du fil principal : il ne garde que l'état de la réception,
/// sous verrou, et repasse tout le reste sur l'acteur principal.
@MainActor
final class TalkiePushToTalkChannel: TalkiePushToTalkChanneling {
    static let shared: TalkiePushToTalkChannel = {
        let channel = TalkiePushToTalkChannel()
        SessionEndingHooks.shared.add { [weak channel] in await channel?.endSession() }
        return channel
    }()

    private let registrar: TalkiePushToTalkTokenRegistering
    private let defaults: UserDefaults
    private var delegate: TalkiePushToTalkDelegate?
    private var manager: PTChannelManager?
    private var instantiating = false

    nonisolated deinit {}

    init(
        registrar: TalkiePushToTalkTokenRegistering = APITalkiePushToTalkTokenRegistrar(),
        defaults: UserDefaults = .standard
    ) {
        self.registrar = registrar
        self.defaults = defaults
    }

    /// L'identifiant du canal de CE compte.
    var channelUUID: UUID { TalkiePushToTalkRules.channelUUID(in: defaults) }

    /// Le jeton gardé sur l'appareil, celui qu'une déconnexion retire.
    var storedToken: String? { defaults.string(forKey: TalkiePushToTalkRules.tokenDefaultsKey) }

    func activate() async {
        guard let manager = await managerIfAvailable(), manager.activeChannelUUID == nil else { return }
        manager.requestJoinChannel(channelUUID: channelUUID, descriptor: TalkiePushToTalkDelegate.descriptor)
    }

    func endSession() async {
        let token = storedToken
        defaults.removeObject(forKey: TalkiePushToTalkRules.tokenDefaultsKey)
        defaults.removeObject(forKey: TalkiePushToTalkRules.channelDefaultsKey)
        if let token {
            do {
                try await registrar.unregister(token: token)
            } catch {
                Logger.talkiePTT.error("talkie · jeton PushToTalk non retiré : \(error.localizedDescription, privacy: .public)")
            }
        }
        if let manager, let channel = manager.activeChannelUUID {
            manager.leaveChannel(channelUUID: channel)
        }
        delegate?.reset()
    }

    /// iOS demande de restaurer le canal au lancement : l'instancier tôt garde le réveil vivant après un redémarrage.
    func restoreIfJoined() async {
        _ = await managerIfAvailable()
    }

    func tokenReceived(_ token: String) async {
        defaults.set(token, forKey: TalkiePushToTalkRules.tokenDefaultsKey)
        do {
            try await registrar.register(token: token)
        } catch {
            Logger.talkiePTT.error("talkie · jeton PushToTalk non enregistré : \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Le canal a été quitté depuis l'interface système, compte toujours ouvert : son jeton ne réveille plus rien.
    func channelLeft() async {
        guard let token = storedToken else { return }
        defaults.removeObject(forKey: TalkiePushToTalkRules.tokenDefaultsKey)
        try? await registrar.unregister(token: token)
    }

    private func makeDelegate() -> TalkiePushToTalkDelegate {
        TalkiePushToTalkDelegate(
            fallbackName: String(localized: "talkie.incoming.someone", defaultValue: "Quelqu’un", bundle: .main),
            onToken: { token in Task { @MainActor in await TalkiePushToTalkChannel.shared.tokenReceived(token) } },
            onLeft: { Task { @MainActor in await TalkiePushToTalkChannel.shared.channelLeft() } }
        )
    }

    private func managerIfAvailable() async -> PTChannelManager? {
        if let manager { return manager }
        guard !instantiating else { return nil }
        instantiating = true
        defer { instantiating = false }
        let delegate = self.delegate ?? makeDelegate()
        self.delegate = delegate
        do {
            let created = try await PTChannelManager.channelManager(delegate: delegate, restorationDelegate: delegate)
            manager = created
            TalkieVoicePlayer.onSystemSessionIdle = { [weak created, weak self] in
                guard let self else { return }
                created?.setActiveRemoteParticipant(nil, channelUUID: self.channelUUID) { _ in }
            }
            return created
        } catch {
            Logger.talkiePTT.notice("talkie · PushToTalk indisponible, repli sur la notification : \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }
}

/// Le délégué du framework PushToTalk : l'état de la réception sous verrou, le reste confié à l'acteur principal.
nonisolated final class TalkiePushToTalkDelegate: NSObject, PTChannelManagerDelegate, PTChannelRestorationDelegate, Sendable {
    static var descriptor: PTChannelDescriptor { PTChannelDescriptor(name: "Meeshy", image: nil) }

    /// Le réveil annoncé par `incomingPushResult`, que `didActivate` rejoint une fois la session audio levée.
    private let pending = OSAllocatedUnfairLock<TalkieWakePush?>(initialState: nil)
    private let fallbackName: String
    private let onToken: @Sendable (String) -> Void
    private let onLeft: @Sendable () -> Void

    init(
        fallbackName: String,
        onToken: @escaping @Sendable (String) -> Void,
        onLeft: @escaping @Sendable () -> Void
    ) {
        self.fallbackName = fallbackName
        self.onToken = onToken
        self.onLeft = onLeft
    }

    /// La session du compte finit : un réveil annoncé pour lui ne se rejoint plus.
    func reset() {
        pending.withLock { $0 = nil }
    }

    // MARK: Canal

    func channelManager(_ channelManager: PTChannelManager, didJoinChannel channelUUID: UUID, reason: PTChannelJoinReason) {
        Logger.talkiePTT.info("talkie · canal PushToTalk rejoint")
    }

    func channelManager(_ channelManager: PTChannelManager, didLeaveChannel channelUUID: UUID, reason: PTChannelLeaveReason) {
        onLeft()
    }

    func channelManager(_ channelManager: PTChannelManager, receivedEphemeralPushToken pushToken: Data) {
        onToken(TalkiePushToTalkRules.hex(pushToken))
    }

    // MARK: Réception

    func incomingPushResult(channelManager: PTChannelManager, channelUUID: UUID, pushPayload: [String: Any]) -> PTPushResult {
        let push = TalkieWakePush(pushToTalkPayload: pushPayload)
        pending.withLock { $0 = push }
        if push != nil {
            Task { @MainActor in TalkieWakeJoiner.shared.prepareConnection() }
        }
        let name = TalkiePushToTalkRules.participantName(for: pushPayload, fallback: fallbackName)
        return .activeRemoteParticipant(PTParticipant(name: name, image: nil))
    }

    func channelManager(_ channelManager: PTChannelManager, didActivate audioSession: AVAudioSession) {
        let push = pending.withLock { current -> TalkieWakePush? in
            defer { current = nil }
            return current
        }
        Task { @MainActor in
            TalkieVoicePlayer.systemActivatedSession = true
            if let push { TalkieWakeJoiner.shared.wake(push) }
        }
    }

    func channelManager(_ channelManager: PTChannelManager, didDeactivate audioSession: AVAudioSession) {
        Task { @MainActor in TalkieVoicePlayer.systemActivatedSession = false }
    }

    // MARK: Émission — le talkie de Meeshy part du bouton de l'app, jamais de l'interface système

    func channelManager(_ channelManager: PTChannelManager, channelUUID: UUID, didBeginTransmittingFrom source: PTChannelTransmitRequestSource) {
        channelManager.stopTransmitting(channelUUID: channelUUID)
    }

    func channelManager(_ channelManager: PTChannelManager, channelUUID: UUID, didEndTransmittingFrom source: PTChannelTransmitRequestSource) {}

    // MARK: Restauration

    func channelDescriptor(restoredChannelUUID channelUUID: UUID) -> PTChannelDescriptor {
        Self.descriptor
    }
}

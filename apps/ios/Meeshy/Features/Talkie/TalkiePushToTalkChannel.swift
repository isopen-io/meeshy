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
/// - Son jeton éphémère part sur `POST /api/v1/users/me/push-to-talk-token` ; quitter le canal le retire.
/// - Sans l'entitlement `com.apple.developer.push-to-talk`, l'instanciation échoue proprement : rien ne se rejoint, et
///   le réveil passe par la notification time-sensitive `talkie_incoming`.
@MainActor
protocol TalkiePushToTalkChanneling: AnyObject {
    /// Rejoint le canal s'il ne l'est pas déjà. À appeler sur un geste, app au premier plan.
    func activate() async
    /// Quitte le canal et retire le jeton (déconnexion du compte).
    func leave() async
}

/// Les décisions du canal, sans le framework : de quoi les éprouver.
nonisolated enum TalkiePushToTalkRules {
    static let channelDefaultsKey = "talkie.pushToTalk.channelUUID"

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

/// `POST/DELETE /api/v1/users/me/push-to-talk-token { token }` (#17142). La route n'est pas encore dans le manifeste
/// généré du catalogue : elle s'écrit ici le temps que la passerelle la publie, puis rejoint `UsersEndpoint`.
nonisolated struct APITalkiePushToTalkTokenRegistrar: TalkiePushToTalkTokenRegistering {
    private struct Endpoint: MeeshyEndpoint {
        var path: String { "/api/v1/users/me/push-to-talk-token" }
    }

    private struct Body: Encodable, Sendable {
        let token: String
    }

    func register(token: String) async throws {
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.post(Endpoint(), body: Body(token: token))
    }

    func unregister(token: String) async throws {
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.delete(Endpoint(), body: Body(token: token))
    }
}

/// Le canal réel. Le délégué du framework est appelé hors du fil principal : son état partagé est sous verrou, et le
/// travail repasse sur l'acteur principal.
@MainActor
final class TalkiePushToTalkChannel: TalkiePushToTalkChanneling {
    static let shared = TalkiePushToTalkChannel()

    private let delegate: TalkiePushToTalkDelegate
    private var manager: PTChannelManager?
    private var instantiating = false

    nonisolated deinit {}

    init(
        registrar: TalkiePushToTalkTokenRegistering = APITalkiePushToTalkTokenRegistrar(),
        defaults: UserDefaults = .standard
    ) {
        delegate = TalkiePushToTalkDelegate(
            registrar: registrar,
            channelUUID: TalkiePushToTalkRules.channelUUID(in: defaults),
            fallbackName: String(localized: "talkie.incoming.someone", defaultValue: "Quelqu’un", bundle: .main)
        )
    }

    func activate() async {
        guard let manager = await managerIfAvailable(), manager.activeChannelUUID == nil else { return }
        manager.requestJoinChannel(channelUUID: delegate.channelUUID, descriptor: delegate.descriptor)
    }

    func leave() async {
        guard let manager, let channel = manager.activeChannelUUID else { return }
        manager.leaveChannel(channelUUID: channel)
    }

    /// iOS demande de restaurer le canal au lancement : l'instancier tôt garde le réveil vivant après un redémarrage.
    func restoreIfJoined() async {
        _ = await managerIfAvailable()
    }

    private func managerIfAvailable() async -> PTChannelManager? {
        if let manager { return manager }
        guard !instantiating else { return nil }
        instantiating = true
        defer { instantiating = false }
        do {
            let created = try await PTChannelManager.channelManager(delegate: delegate, restorationDelegate: delegate)
            manager = created
            let channel = delegate.channelUUID
            TalkieVoicePlayer.onSystemSessionIdle = { [weak created] in
                created?.setActiveRemoteParticipant(nil, channelUUID: channel) { _ in }
            }
            return created
        } catch {
            Logger.talkiePTT.notice("talkie · PushToTalk indisponible, repli sur la notification : \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }
}

/// Le délégué du framework PushToTalk.
nonisolated final class TalkiePushToTalkDelegate: NSObject, PTChannelManagerDelegate, PTChannelRestorationDelegate, @unchecked Sendable {
    let channelUUID: UUID
    private let registrar: TalkiePushToTalkTokenRegistering
    private let fallbackName: String
    private let lock = NSLock()
    private var token: String?
    private var pending: TalkieWakePush?

    init(registrar: TalkiePushToTalkTokenRegistering, channelUUID: UUID, fallbackName: String) {
        self.registrar = registrar
        self.channelUUID = channelUUID
        self.fallbackName = fallbackName
    }

    var descriptor: PTChannelDescriptor { PTChannelDescriptor(name: "Meeshy", image: nil) }

    // MARK: Canal

    func channelManager(_ channelManager: PTChannelManager, didJoinChannel channelUUID: UUID, reason: PTChannelJoinReason) {
        Logger.talkiePTT.info("talkie · canal PushToTalk rejoint")
    }

    func channelManager(_ channelManager: PTChannelManager, didLeaveChannel channelUUID: UUID, reason: PTChannelLeaveReason) {
        let previous = lock.withLock { () -> String? in
            defer { token = nil }
            return token
        }
        guard let previous else { return }
        let registrar = registrar
        Task { try? await registrar.unregister(token: previous) }
    }

    func channelManager(_ channelManager: PTChannelManager, receivedEphemeralPushToken pushToken: Data) {
        let hex = TalkiePushToTalkRules.hex(pushToken)
        lock.withLock { token = hex }
        let registrar = registrar
        Task {
            do {
                try await registrar.register(token: hex)
            } catch {
                Logger.talkiePTT.error("talkie · jeton PushToTalk non enregistré : \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    // MARK: Réception

    func incomingPushResult(channelManager: PTChannelManager, channelUUID: UUID, pushPayload: [String: Any]) -> PTPushResult {
        let push = TalkieWakePush(pushToTalkPayload: pushPayload)
        lock.withLock { pending = push }
        if push != nil {
            Task { @MainActor in TalkieWakeJoiner.shared.prepareConnection() }
        }
        let name = TalkiePushToTalkRules.participantName(for: pushPayload, fallback: fallbackName)
        return .activeRemoteParticipant(PTParticipant(name: name, image: nil))
    }

    func channelManager(_ channelManager: PTChannelManager, didActivate audioSession: AVAudioSession) {
        let push = lock.withLock { () -> TalkieWakePush? in
            defer { pending = nil }
            return pending
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
        descriptor
    }
}

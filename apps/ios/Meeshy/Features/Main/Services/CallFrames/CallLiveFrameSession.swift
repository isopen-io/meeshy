import Combine
import Foundation
import MeeshySDK
import os

/// **LE CHOIX DU CADRE EN DIRECT D'UN APPEL À DEUX** (#9214, doc frames 06 § 4.4).
///
/// Le même cadre des deux côtés : mon choix s'applique tout de suite chez moi (optimiste),
/// part par la signalisation de l'appel avec le prénom que je partage, et revient en arrière
/// si la passerelle refuse. Le choix de l'autre arrive par `call:frame-selected` et remplace
/// le mien — le dernier qui choisit gagne, chez les deux. Rien n'est persisté : un nouvel
/// appel repart sans cadre.
@MainActor
final class CallLiveFrameSession: ObservableObject {
    static let clockPeriodNs: UInt64 = 60_000_000_000

    @Published private(set) var frameId: String?
    @Published private(set) var remoteSharedName: String?
    @Published private(set) var texts: CallFrameTexts?

    private(set) var callId: String?
    private var context: CallFrameCallContext?

    private let socket: any CallLiveFrameSocketProviding
    private let textsProvider: any CallFrameTextsProviding
    private let myName: () -> String?
    private let notify: (String) -> Void
    private let wait: @MainActor (UInt64) async -> Void
    private var subscription: AnyCancellable?
    private let logger = Logger(subsystem: "me.meeshy.app", category: "call-live-frame")

    nonisolated deinit {}

    init(
        socket: (any CallLiveFrameSocketProviding)? = nil,
        textsProvider: (any CallFrameTextsProviding)? = nil,
        myName: (() -> String?)? = nil,
        notify: ((String) -> Void)? = nil,
        wait: (@MainActor (UInt64) async -> Void)? = nil,
        events: AnyPublisher<CallLiveFrameSelectedEvent, Never>? = nil
    ) {
        let resolvedSocket = socket ?? MessageSocketManager.shared
        self.socket = resolvedSocket
        self.textsProvider = textsProvider ?? CallFrameTextsResolver.shared
        self.myName = myName ?? {
            let user = AuthManager.shared.currentUser
            return CallCaptureIdentity.myName(displayName: user?.displayName, username: user?.username, fallback: "")
        }
        self.notify = notify ?? { FeedbackToastManager.shared.showError($0) }
        self.wait = wait ?? { try? await Task.sleep(nanoseconds: $0) }
        subscription = (events ?? resolvedSocket.callLiveFrameEvents)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in self?.receive(event) }
    }

    // MARK: - L'appel

    /// Un autre appel (ou plus d'appel) : le cadre et le nom partagé de l'ancien s'effacent.
    /// Les textes se résolvent tout de suite depuis ce qu'on sait, puis s'affinent du cache.
    func bind(callId: String?, context: CallFrameCallContext) async {
        if callId != self.callId {
            self.callId = callId
            frameId = nil
            remoteSharedName = nil
            texts = nil
        }
        self.context = context
        guard callId != nil else { return }
        if texts == nil { texts = textsProvider.immediateTexts(for: context) }
        await refreshTexts()
    }

    /// Le duo n'en est plus un : le cadre s'efface localement, sans rien envoyer.
    func leaveDuo() {
        frameId = nil
        remoteSharedName = nil
    }

    /// Les textes du cadre (la date) se relisent une fois par minute ; un texte identique
    /// ne publie rien, donc ne repeint rien.
    func runClock() async {
        while !Task.isCancelled {
            await wait(Self.clockPeriodNs)
            guard !Task.isCancelled else { return }
            await refreshTexts()
        }
    }

    func refreshTexts() async {
        guard let context else { return }
        let fresh = await textsProvider.texts(for: context)
        guard fresh != texts else { return }
        texts = fresh
    }

    // MARK: - Choisir

    /// Optimiste : le cadre change tout de suite ; un refus le remet comme avant, sauf si
    /// l'autre a choisi entre-temps (son choix est plus récent que le mien).
    func select(_ id: String?) async {
        guard let callId else { return }
        guard id.map(CallLiveFrameRule.isFrameId) ?? true else { return }
        let previous = frameId
        frameId = id
        do {
            try await socket.selectCallLiveFrame(callId: callId, frameId: id, texts: CallLiveFrameTexts(name: myName()))
        } catch {
            logger.warning("call-live-frame: choix refusé \((error as? CallControlRefusal)?.code ?? "?", privacy: .public)")
            guard self.callId == callId, frameId == id else { return }
            frameId = previous
            notify(CallLiveFrameCopy.refused)
        }
    }

    // MARK: - Recevoir

    func receive(_ event: CallLiveFrameSelectedEvent) {
        guard let callId, event.callId == callId else { return }
        if let id = event.frameId, !CallLiveFrameRule.isFrameId(id) { return }
        frameId = event.frameId
        let shared = event.texts?.name?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let shared, !shared.isEmpty { remoteSharedName = String(shared.prefix(CallLiveFrameTexts.maxLength)) }
    }
}

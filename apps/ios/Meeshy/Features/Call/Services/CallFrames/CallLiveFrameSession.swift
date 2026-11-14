import Combine
import Foundation
import MeeshySDK
import os
import UIKit

/// Une proposition reçue : le cadre que l'autre m'invite à appliquer, et le prénom qu'il partage.
nonisolated struct CallLiveFrameProposal: Equatable, Sendable {
    let frameId: String
    let from: String?
}

/// Ce que l'autre a répondu à MA proposition — montré par l'écran d'appel, pas par un toast :
/// la réponse arrive du réseau, et elle appartient à l'appel.
nonisolated struct CallLiveFrameAnswer: Equatable, Sendable {
    let frameId: String
    let reply: CallLiveFrameReply
    let from: String?
}

/// **Le cadre PARTAGÉ** (C1.10, #18183) — celui que nous montrons tous les deux, parce que l'un a
/// accepté celui de l'autre. Mêmes vecteurs que le web (`liveFrameReleaseReachesPeer`,
/// `liveFramePeerReleaseDropsMine`) et qu'Android (`CallLiveFrameMachine`).
nonisolated extension CallLiveFrameRule {
    /// Relâcher prévient l'autre quand ma proposition attend sa réponse, ou quand il montre le même
    /// cadre que moi. Un cadre refusé, ou que l'autre ne montre pas, se relâche en silence.
    static func releaseReachesPeer(frameId: String?, sentProposal: String?, peerFrameId: String?) -> Bool {
        sentProposal != nil || peerReleaseDropsMine(frameId: frameId, peerFrameId: peerFrameId)
    }

    /// Le retrait de l'autre fait tomber mon cadre quand c'était celui qu'il montrait — jamais un
    /// autre que j'ai gardé depuis.
    static func peerReleaseDropsMine(frameId: String?, peerFrameId: String?) -> Bool {
        frameId != nil && frameId == peerFrameId
    }
}

/// **LE CADRE EN DIRECT D'UN APPEL À DEUX** (#9214, #9287, doc frames 06 § 4.4).
///
/// Chacun reste libre de son cadre : le mien s'applique tout de suite CHEZ MOI et part à
/// l'autre comme une PROPOSITION, avec le prénom que je partage. Une proposition reçue ne
/// touche jamais à mon cadre — je l'applique ou je la refuse, et l'autre l'apprend. Un cadre
/// PARTAGÉ que l'un relâche tombe chez les deux (#18183) : le retrait est le même
/// `frameId: null` que celui d'une proposition retirée, donc un ancien client le lit comme
/// avant et garde son cadre. Rien n'est persisté : un nouvel appel repart sans cadre.
@MainActor
final class CallLiveFrameSession: ObservableObject {
    static let clockPeriodNs: UInt64 = 60_000_000_000

    @Published private(set) var frameId: String?
    @Published private(set) var proposal: CallLiveFrameProposal?
    @Published private(set) var sentProposal: String?
    @Published private(set) var answer: CallLiveFrameAnswer?
    @Published private(set) var remoteSharedName: String?
    @Published private(set) var texts: CallFrameTexts?

    private(set) var callId: String?
    private var context: CallFrameCallContext?

    private let socket: any CallLiveFrameSocketProviding
    private let textsProvider: any CallFrameTextsProviding
    private let myName: () -> String?
    private let notify: (String) -> Void
    private let announce: (String) -> Void
    private let wait: @MainActor (UInt64) async -> Void
    private var subscription: AnyCancellable?
    private var pendingReply: Task<Void, Never>?
    /// Le cadre que l'autre montre de son côté, quand il me l'a dit (proposé, ou accepté le mien).
    private var peerFrameId: String?
    private let logger = MeeshyLog.logger(.callLiveFrame)

    nonisolated deinit {}

    init(
        socket: (any CallLiveFrameSocketProviding)? = nil,
        textsProvider: (any CallFrameTextsProviding)? = nil,
        myName: (() -> String?)? = nil,
        notify: ((String) -> Void)? = nil,
        announce: ((String) -> Void)? = nil,
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
        self.announce = announce ?? { Self.announceQueued($0) }
        self.wait = wait ?? { _ = await cancellableSleep(for: .nanoseconds($0)) }
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
            forget()
            texts = nil
        }
        self.context = context
        guard callId != nil else { return }
        if texts == nil { texts = textsProvider.immediateTexts(for: context) }
        await refreshTexts()
    }

    /// Le duo n'en est plus un : le cadre s'efface localement, sans rien envoyer.
    func leaveDuo() {
        forget()
    }

    private func forget() {
        frameId = nil
        proposal = nil
        sentProposal = nil
        answer = nil
        remoteSharedName = nil
        peerFrameId = nil
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

    // MARK: - Mon cadre

    /// Mon cadre s'applique tout de suite chez moi, puis se PROPOSE à l'autre — sauf s'il le
    /// montre déjà. Retirer mon cadre retire ma proposition tant qu'elle attend sa réponse, et
    /// retire chez l'autre le cadre que nous partageons (#18183) — relâcher « Cadre » comme
    /// l'annuler par l'appui long sur (+) passent ici.
    /// Un refus de la passerelle ne m'enlève pas mon cadre : il n'est simplement pas proposé.
    func apply(_ id: String?) async {
        guard let callId else { return }
        guard id.map(CallLiveFrameRule.isFrameId) ?? true else { return }
        let held = frameId
        frameId = id
        answer = nil
        guard let id else {
            await release(held, callId: callId)
            return
        }
        guard id != peerFrameId else { return }
        sentProposal = id
        do {
            try await socket.selectCallLiveFrame(callId: callId, frameId: id, texts: CallLiveFrameTexts(name: myName()), reply: nil)
        } catch {
            logger.warning("call-live-frame: proposition refusée \((error as? CallControlRefusal)?.code ?? "?", privacy: .public)")
            guard self.callId == callId, sentProposal == id else { return }
            sentProposal = nil
            notify(CallLiveFrameCopy.notProposed)
        }
    }

    private func release(_ held: String?, callId: String) async {
        guard CallLiveFrameRule.releaseReachesPeer(frameId: held, sentProposal: sentProposal, peerFrameId: peerFrameId) else { return }
        if CallLiveFrameRule.peerReleaseDropsMine(frameId: held, peerFrameId: peerFrameId) { peerFrameId = nil }
        sentProposal = nil
        try? await socket.selectCallLiveFrame(callId: callId, frameId: nil, texts: nil, reply: nil)
    }

    // MARK: - La proposition de l'autre

    func accept() async {
        guard let proposal else { return }
        self.proposal = nil
        frameId = proposal.frameId
        peerFrameId = proposal.frameId
        await sendReply(proposal.frameId, .accepted)
    }

    func decline() async {
        guard let proposal else { return }
        self.proposal = nil
        await sendReply(proposal.frameId, .declined)
    }

    /// Attend la réponse que la session envoie d'elle-même (une proposition du cadre que je montre déjà).
    func settle() async {
        await pendingReply?.value
    }

    private func sendReply(_ frameId: String, _ reply: CallLiveFrameReply) async {
        guard let callId else { return }
        try? await socket.selectCallLiveFrame(callId: callId, frameId: frameId, texts: CallLiveFrameTexts(name: myName()), reply: reply)
    }

    // MARK: - Recevoir

    func receive(_ event: CallLiveFrameSelectedEvent) {
        guard let callId, event.callId == callId else { return }
        if let id = event.frameId, !CallLiveFrameRule.isFrameId(id) { return }
        let shared = event.texts?.name?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let shared, !shared.isEmpty { remoteSharedName = String(shared.prefix(CallLiveFrameTexts.maxLength)) }
        if let reply = event.reply {
            receiveReply(reply, frameId: event.frameId)
            return
        }
        let dropsMine = event.frameId == nil && CallLiveFrameRule.peerReleaseDropsMine(frameId: frameId, peerFrameId: peerFrameId)
        peerFrameId = event.frameId
        guard let id = event.frameId else {
            proposal = nil
            if dropsMine { dropSharedFrame() }
            return
        }
        guard id != frameId else {
            proposal = nil
            pendingReply = Task { [weak self] in await self?.sendReply(id, .accepted) }
            return
        }
        proposal = CallLiveFrameProposal(frameId: id, from: remoteSharedName)
    }

    private func receiveReply(_ reply: CallLiveFrameReply, frameId answered: String?) {
        guard let answered, answered == sentProposal else { return }
        sentProposal = nil
        if reply == .accepted { peerFrameId = answered }
        answer = CallLiveFrameAnswer(frameId: answered, reply: reply, from: remoteSharedName)
    }

    /// L'autre a relâché le cadre que nous partagions : il tombe chez moi, sans rien renvoyer,
    /// et le lecteur d'écran dit pourquoi l'image a changé (#18367).
    private func dropSharedFrame() {
        frameId = nil
        announce(CallLiveFrameCopy.peerReleased(by: remoteSharedName))
    }

    /// Une annonce polie : elle attend la fin de ce que VoiceOver dit déjà.
    private static func announceQueued(_ text: String) {
        let queued = NSAttributedString(string: text, attributes: [.accessibilitySpeechQueueAnnouncement: true])
        UIAccessibility.post(notification: .announcement, argument: queued)
    }

    /// L'écran a montré la réponse : elle s'efface.
    func dismissAnswer() {
        answer = nil
    }
}

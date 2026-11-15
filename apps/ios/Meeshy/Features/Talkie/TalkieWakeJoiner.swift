import Combine
import Foundation
import MeeshySDK
import os

private extension Logger {
    nonisolated static let talkieWake = MeeshyLog.logger(.audioPlayback)
}

/// **RÉVEILLÉ PAR UN TALKIE** (#17143) — un push de réveil (`pushtotalk` ou la notification `talkie_incoming`) dit
/// qu'une prise de parole m'attend sur la passerelle. Ce joueur lève la socket et, dès qu'elle est connectée, émet
/// `talkie:join { talkieId }` : la passerelle rejoue alors `talkie:incoming`, les fragments gardés et le direct, que
/// `TalkieCenter` lit comme d'habitude.
///
/// - Un réveil se rejoint UNE fois ; un doublon (push et toucher de la notification) ne rejoint rien de plus.
/// - Passé la fenêtre de rattrapage de la passerelle, un réveil ne se rejoint plus : il n'y a plus rien à rejouer.
/// - Rien n'est jugé ici : la passerelle a décidé avant de réveiller.
@MainActor
final class TalkieWakeJoiner {

    private struct Pending {
        let push: TalkieWakePush
        let receivedAt: Date
    }

    /// Assez pour qu'un push en double ne rejoigne pas deux fois ; borné, rien ne grossit.
    private static let joinedCap = 32

    private let emitter: TalkieEmitting
    private let connect: () -> Void
    private let now: () -> Date
    private var pending: [Pending] = []
    private var joined: [String] = []
    private var cancellable: AnyCancellable?

    nonisolated deinit {}

    init(
        emitter: TalkieEmitting,
        connected: AnyPublisher<Bool, Never>,
        connect: @escaping () -> Void,
        now: @escaping () -> Date = { Date() }
    ) {
        self.emitter = emitter
        self.connect = connect
        self.now = now
        cancellable = connected
            .filter { $0 }
            .sink { [weak self] _ in
                MainActor.assumeIsolated { self?.flush() }
            }
    }

    /// Les prises de parole qui attendent la socket.
    var waiting: [String] { pending.map(\.push.talkieId) }

    func wake(_ push: TalkieWakePush) {
        guard !joined.contains(push.talkieId), !pending.contains(where: { $0.push.talkieId == push.talkieId }) else { return }
        pending.append(Pending(push: push, receivedAt: now()))
        Logger.talkieWake.info("talkie · réveil · prise de parole en attente de la socket")
        guard emitter.isConnected else {
            connect()
            return
        }
        flush()
    }

    /// Un push `pushtotalk` vient d'arriver : la socket se lève dès maintenant, la session audio suivra.
    func prepareConnection() {
        guard !emitter.isConnected else { return }
        connect()
    }

    func flush() {
        guard emitter.isConnected else { return }
        let instant = now()
        let due = pending
        pending = []
        due.filter { instant.timeIntervalSince($0.receivedAt) <= TalkieWakeContract.catchUpWindow }.forEach { item in
            emitter.join(talkieId: item.push.talkieId)
            joined = Array((joined + [item.push.talkieId]).suffix(Self.joinedCap))
            Logger.talkieWake.info("talkie · réveil · talkie:join émis")
        }
    }
}

extension TalkieWakeJoiner {
    /// Le câblage de production : le seul endroit qui nomme les singletons.
    static let shared = TalkieWakeJoiner(
        emitter: TalkieSocketEmitter.shared,
        connected: MessageSocketManager.shared.$isConnected.receive(on: DispatchQueue.main).eraseToAnyPublisher(),
        connect: { MessageSocketManager.shared.connect() }
    )
}

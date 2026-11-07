import Combine
import Foundation
import MeeshySDK

/// Ce qui fait (et cesse de faire) sortir la voix d'un talkie. Le vrai son est `TalkieVoicePlayer` ; un double le
/// remplace dans les tests.
@MainActor
protocol TalkieSink: AnyObject {
    /// Un fragment, à jouer À LA SUITE du précédent de la même prise de parole.
    func play(_ talkieId: String, _ data: Data)
    /// `cut`, ou « Couper » : se taire sur-le-champ.
    func silence(_ talkieId: String)
    /// `sender` / `limit` : rien de plus n'arrivera, ce qui est en file finit de sonner.
    func release(_ talkieId: String)
}

/// Une prise de parole qui sort CHEZ MOI : qui, depuis quand (horloge de l'appareil), jusqu'à quand au plus.
struct TalkieSpeaker: Equatable, Identifiable {
    let talkieId: String
    let fromUserId: String
    var name: String?
    let openedAt: Date
    let maxDuration: TimeInterval

    var id: String { talkieId }

    /// La marge au-delà de la durée maximale : le dernier fragment et `talkie:ended` voyagent encore.
    static let expiryGrace: TimeInterval = 3

    var deadline: Date { openedAt.addingTimeInterval(maxDuration + Self.expiryGrace) }
}

/// LE TALKIE SUR iOS, côté RÉCEPTION (#16673, sous-lot `proche-talkie@ios`, iso du web #16638) — les prises de parole
/// reçues, app ouverte, pour toute la durée de l'app.
///
/// - `talkie:incoming` ouvre ; il ne porte aucun nom : les caches nomment l'émetteur.
/// - `talkie:chunk` se JOUE dès son arrivée, dans l'ordre des `seq` : un doublon, un fragment en retard, un fragment
///   d'un émetteur autre que celui annoncé ne jouent rien.
/// - `talkie:ended` ferme : `sender` / `limit` laissent finir la file, `cut` (blocage, réglage, appel) fait taire.
/// - Sans `talkie:ended` (socket coupée), la prise de parole se ferme passé sa durée maximale, comptée à l'horloge de
///   l'APPAREIL depuis la réception — jamais à `startedAt`, qu'une horloge décalée fausserait.
/// - Ma propre voix (un autre de mes appareils) ne s'ouvre jamais ici, et une prise de parole close ne se rouvre pas.
///
/// Le serveur a déjà jugé (niveau ≥ Proche, réception non coupée, hors E2EE, hors appel) : ce centre ne rejuge rien.
@MainActor
final class TalkieCenter: ObservableObject {

    /// Assez pour qu'un événement en retard d'une prise de parole close ne la rouvre pas ; borné, rien ne grossit.
    private static let closedCap = 64

    @Published private(set) var active: [TalkieSpeaker] = []

    private let sink: TalkieSink
    private let people: CirclePeopleResolving
    private let viewerId: () -> String?
    private let now: () -> Date
    private var lastSeq: [String: Int] = [:]
    private var closed: [String] = []
    private var timers: [String: Task<Void, Never>] = [:]
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    init(
        sink: TalkieSink,
        people: CirclePeopleResolving,
        viewerId: @escaping () -> String?,
        incomingEvents: AnyPublisher<TalkieIncoming, Never> = TalkieEvents.incoming,
        chunkEvents: AnyPublisher<TalkieChunk, Never> = TalkieEvents.chunk,
        endedEvents: AnyPublisher<TalkieEnded, Never> = TalkieEvents.ended,
        now: @escaping () -> Date = { Date() }
    ) {
        self.sink = sink
        self.people = people
        self.viewerId = viewerId
        self.now = now
        let lane = OrderedEventLane()
        incomingEvents
            .relay(through: lane) { [weak self] incoming in await self?.open(incoming) }
            .store(in: &cancellables)
        chunkEvents
            .relay(through: lane) { [weak self] chunk in await self?.receive(chunk) }
            .store(in: &cancellables)
        endedEvents
            .relay(through: lane) { [weak self] ended in await self?.end(ended) }
            .store(in: &cancellables)
        lane.store(in: &cancellables)
    }

    // MARK: - Recevoir

    func open(_ incoming: TalkieIncoming) {
        guard incoming.isPlayable,
              incoming.fromUserId != viewerId(),
              !closed.contains(incoming.talkieId),
              !active.contains(where: { $0.talkieId == incoming.talkieId }) else { return }
        let speaker = TalkieSpeaker(
            talkieId: incoming.talkieId,
            fromUserId: incoming.fromUserId,
            name: nil,
            openedAt: now(),
            maxDuration: incoming.maxDuration
        )
        lastSeq[incoming.talkieId] = -1
        active.append(speaker)
        schedule(speaker)
        Task { await self.hydrate(speaker) }
    }

    func receive(_ chunk: TalkieChunk) {
        guard let speaker = active.first(where: { $0.talkieId == chunk.talkieId }),
              speaker.fromUserId == chunk.fromUserId,
              let last = lastSeq[chunk.talkieId], chunk.seq > last else { return }
        lastSeq[chunk.talkieId] = chunk.seq
        sink.play(chunk.talkieId, chunk.data)
    }

    func end(_ ended: TalkieEnded) {
        close(ended.talkieId)
        if ended.silencesNow {
            sink.silence(ended.talkieId)
        } else {
            sink.release(ended.talkieId)
        }
    }

    /// « Couper » : cette prise de parole se tait ICI, sur-le-champ. L'émetteur n'en est pas prévenu.
    func mute(_ talkieId: String) {
        guard active.contains(where: { $0.talkieId == talkieId }) else { return }
        close(talkieId)
        sink.silence(talkieId)
    }

    /// Ce qui a passé sa durée maximale se ferme — le minuteur l'appelle, sans événement du serveur.
    func expireDue() {
        let instant = now()
        active.filter { $0.deadline <= instant }.forEach { speaker in
            close(speaker.talkieId)
            sink.release(speaker.talkieId)
        }
    }

    // MARK: - Interne

    private func close(_ talkieId: String) {
        timers.removeValue(forKey: talkieId)?.cancel()
        lastSeq.removeValue(forKey: talkieId)
        active.removeAll { $0.talkieId == talkieId }
        guard !closed.contains(talkieId) else { return }
        closed = Array((closed + [talkieId]).suffix(Self.closedCap))
    }

    private func schedule(_ speaker: TalkieSpeaker) {
        let delay = max(0, speaker.deadline.timeIntervalSince(now()))
        timers[speaker.talkieId] = Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(delay))
            } catch {
                return
            }
            self?.expireDue()
        }
    }

    private func hydrate(_ speaker: TalkieSpeaker) async {
        let known = await people.people(for: [speaker.fromUserId])
        guard let person = known[speaker.fromUserId],
              let index = active.firstIndex(where: { $0.talkieId == speaker.talkieId }) else { return }
        active[index].name = person.name
    }
}

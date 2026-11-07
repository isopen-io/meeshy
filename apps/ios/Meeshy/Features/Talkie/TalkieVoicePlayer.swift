import AVFoundation
import Foundation
import MeeshySDK

/// La voix d'un talkie, fragment par fragment (#16673). Chaque fragment AAC ADTS est autonome (ses trames portent leur
/// en-tête) : il se lit seul, et se planifie À LA SUITE du précédent sur l'horloge du périphérique audio, derrière un
/// court tampon de gigue. Le lecteur des vocaux lit des fichiers entiers ; celui-ci joue dès le premier fragment.
///
/// - Le bouton silencieux est RESPECTÉ : quand rien d'autre ne joue dans l'app, la session passe en `.ambient`, qui se
///   tait en mode silencieux et se mêle à la musique d'une autre app sans la couper. Quand l'app joue déjà (un vocal,
///   une story), sa catégorie est gardée : le talkie ne casse pas ce qui sonne.
/// - Pendant un appel, rien ne sort : la passerelle coupe déjà (`cut`), et la session reste à l'appel.
@MainActor
final class TalkieVoicePlayer: TalkieSink {

    /// Le tampon de gigue avant le premier fragment : assez pour que le second arrive avant la fin du premier.
    private static let jitter: TimeInterval = 0.08

    /// Un fragment planifié, gardé en vie jusqu'à sa fin : un `AVAudioPlayer` libéré se tait.
    private struct Scheduled {
        let player: AVAudioPlayer
        let endsAt: TimeInterval
    }

    private struct Queue {
        var scheduled: [Scheduled] = []
        var nextStart: TimeInterval = 0
        /// Rien de plus n'arrivera : la file finit de sonner, puis se libère.
        var released = false
    }

    private var queues: [String: Queue] = [:]
    private let isInCall: () -> Bool

    nonisolated deinit {}

    init(isInCall: @escaping () -> Bool = { CallManager.isCallActiveFlag }) {
        self.isInCall = isInCall
    }

    func play(_ talkieId: String, _ data: Data) {
        guard !isInCall(), let player = try? AVAudioPlayer(data: data, fileTypeHint: AVFileType.aac.rawValue) else { return }
        if queues.isEmpty { prepareSession() }
        var queue = queues[talkieId] ?? Queue()
        guard !queue.released else { return }
        let now = player.deviceCurrentTime
        queue.scheduled = queue.scheduled.filter { $0.endsAt > now }
        let start = max(queue.nextStart, now + Self.jitter)
        player.prepareToPlay()
        guard player.play(atTime: start) else { return }
        queue.nextStart = start + player.duration
        queue.scheduled.append(Scheduled(player: player, endsAt: queue.nextStart))
        queues[talkieId] = queue
    }

    func silence(_ talkieId: String) {
        queues.removeValue(forKey: talkieId)?.scheduled.forEach { $0.player.stop() }
        releaseSessionIfIdle()
    }

    func release(_ talkieId: String) {
        guard var queue = queues[talkieId] else { return }
        queue.released = true
        queues[talkieId] = queue
        let remaining = max(0, queue.nextStart - (queue.scheduled.last?.player.deviceCurrentTime ?? queue.nextStart))
        Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(remaining + 0.2))
            } catch {
                return
            }
            self?.drain(talkieId)
        }
    }

    private func drain(_ talkieId: String) {
        guard queues[talkieId]?.released == true else { return }
        queues.removeValue(forKey: talkieId)
        releaseSessionIfIdle()
    }

    private func prepareSession() {
        let session = AVAudioSession.sharedInstance()
        if session.category == .soloAmbient {
            try? session.setCategory(.ambient)
        }
        try? session.setActive(true)
    }

    private func releaseSessionIfIdle() {
        guard queues.isEmpty, AVAudioSession.sharedInstance().category == .ambient else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

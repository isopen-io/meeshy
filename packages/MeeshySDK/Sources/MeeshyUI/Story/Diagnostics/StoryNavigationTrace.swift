import Darwin
import Foundation
import os
import MeeshySDK

/// **La trace d'un balayage de story** (#18510), lisible dans Instruments
/// (instrument os_signpost, sous-système `me.meeshy.app`, catégorie
/// `story.nav`) : les intervalles geste→échange, échange→première image et
/// échange→lecture, un événement par story quittée avant sa première image, un
/// par blocage du fil principal. À la fermeture du lecteur, `summary()` rend le
/// tableau p50 / p95. Demandée par le réglage de débogage `defaultsKey`
/// (`-MeeshyStoryNavTrace 1` au lancement) ; sans lui, `shared` est `nil` et
/// rien ne coûte.
public final class StoryNavigationTrace {
    public nonisolated static let defaultsKey = "MeeshyStoryNavTrace"
    public nonisolated static let isRequested = UserDefaults.standard.bool(forKey: defaultsKey)
    public static let shared: StoryNavigationTrace? = isRequested
        ? StoryNavigationTrace(livePlayers: { PlaybackPlayerCensus.shared?.liveCount ?? 0 })
        : nil

    public enum Phase: String, Sendable {
        case lecture
        case transition
        case interlude
    }

    private let signposter = OSSignposter(logger: MeeshyLog.logger(.storyNav))
    private let logger = MeeshyLog.logger(.storyNav)
    private let livePlayers: () -> Int
    private var distributions: [StoryNavigationInterval: LatencyDistribution] = [:]
    private var gesture: (at: TimeInterval, state: OSSignpostIntervalState)?
    private var shown: ShownStory?
    public var phase: Phase = .lecture
    public private(set) var skippedUnseen = 0
    public private(set) var hangs = 0
    public private(set) var blockingHangs = 0
    public private(set) var peakLivePlayers = 0
    private lazy var sentinel = MainThreadSentinel { [weak self] gap in self?.hang(gap) }
    private var openedFootprint: UInt64 = 0
    private var peakFootprint: UInt64 = 0

    private struct ShownStory {
        let id: String
        let swappedAt: TimeInterval
        var firstFrame: OSSignpostIntervalState?
        var playback: OSSignpostIntervalState?
    }

    nonisolated deinit {}

    public init(livePlayers: @escaping () -> Int = { 0 }) {
        self.livePlayers = livePlayers
    }

    public static var now: TimeInterval { ProcessInfo.processInfo.systemUptime }

    public func distribution(_ interval: StoryNavigationInterval) -> LatencyDistribution {
        distributions[interval] ?? LatencyDistribution()
    }

    public func gestureBegan(at now: TimeInterval = StoryNavigationTrace.now) {
        gesture = (now, signposter.beginInterval("geste→échange"))
    }

    public func swapped(to storyId: String, at now: TimeInterval = StoryNavigationTrace.now) {
        if let gesture {
            signposter.endInterval("geste→échange", gesture.state)
            record(.gestureToSwap, now - gesture.at)
            self.gesture = nil
        }
        if let left = shown, left.firstFrame != nil {
            skippedUnseen += 1
            signposter.emitEvent("story quittée sans image", "\(left.id, privacy: .public)")
        }
        shown = ShownStory(id: storyId, swappedAt: now,
                           firstFrame: signposter.beginInterval("échange→première image"),
                           playback: signposter.beginInterval("échange→lecture"))
        let live = livePlayers()
        peakLivePlayers = max(peakLivePlayers, live)
        peakFootprint = max(peakFootprint, Self.footprint())
        signposter.emitEvent("lecteurs vivants", "\(live)")
    }

    /// La story montrée a changé, dans la phase `phase`.
    public func swapped(to storyId: String?, phase: Phase) {
        self.phase = phase
        if let storyId { swapped(to: storyId) }
    }

    public func firstFrame(storyId: String, at now: TimeInterval = StoryNavigationTrace.now) {
        guard var story = shown, story.id == storyId, let state = story.firstFrame else { return }
        signposter.endInterval("échange→première image", state)
        record(.swapToFirstFrame, now - story.swappedAt)
        story.firstFrame = nil
        shown = story
    }

    public func playbackStarted(storyId: String, at now: TimeInterval = StoryNavigationTrace.now) {
        guard var story = shown, story.id == storyId, let state = story.playback else { return }
        signposter.endInterval("échange→lecture", state)
        record(.swapToPlayback, now - story.swappedAt)
        story.playback = nil
        shown = story
    }

    public func playback(_ progressing: Bool, storyId: String?) {
        guard progressing, let storyId else { return }
        playbackStarted(storyId: storyId)
    }

    public func hang(_ gap: TimeInterval) {
        hangs += 1
        if gap > StoryNavigationBudget.blockingBudget { blockingHangs += 1 }
        let milliseconds = Int(gap * 1_000)
        signposter.emitEvent("blocage", "\(milliseconds) ms \(self.phase.rawValue, privacy: .public)")
        logger.notice("story.nav blocage \(milliseconds) ms phase=\(self.phase.rawValue, privacy: .public)")
    }

    public func summary() -> String {
        let rows = StoryNavigationInterval.allCases.map { interval -> String in
            let distribution = distribution(interval)
            let budget = StoryNavigationBudget.budget(for: interval)
            return "\(interval.rawValue): n=\(distribution.count) p50=\(Self.ms(distribution.p50)) p95=\(Self.ms(distribution.p95)) hors budget=\(distribution.overBudgetCount(budget))"
        }
        return (rows + [
            "blocages ≥100 ms=\(hangs) >250 ms=\(blockingHangs)",
            "lecteurs vivants max=\(peakLivePlayers)",
            "stories non affichées=\(skippedUnseen)",
            "mémoire ouverture=\(Self.mb(openedFootprint)) pic=\(Self.mb(peakFootprint)) maintenant=\(Self.mb(Self.footprint()))",
        ]).joined(separator: " | ")
    }

    public func publishSummary() {
        logger.notice("story.nav \(self.summary(), privacy: .public)")
    }

    /// Le lecteur s'ouvre : la mesure repart de zéro.
    public func reset() {
        openedFootprint = Self.footprint()
        peakFootprint = openedFootprint
        distributions = [:]
        gesture = nil
        shown = nil
        skippedUnseen = 0
        hangs = 0
        blockingHangs = 0
        peakLivePlayers = 0
        phase = .lecture
    }

    private func record(_ interval: StoryNavigationInterval, _ duration: TimeInterval) {
        var distribution = distributions[interval] ?? LatencyDistribution()
        distribution.record(duration)
        distributions[interval] = distribution
    }

    /// Le lecteur de stories est monté : la sentinelle bat tant qu'il l'est.
    /// L'empreinte lue avant la remise à zéro dit ce que la fermeture
    /// précédente a rendu.
    public func beginSession() {
        publishFootprint("avant ouverture")
        reset()
        sentinel.start()
    }

    /// Le lecteur se ferme : le tableau part au journal.
    public func endSession() {
        sentinel.stop()
        publishSummary()
    }

    public func publishFootprint(_ label: String) {
        logger.notice("story.nav mémoire \(label, privacy: .public)=\(Self.mb(Self.footprint()), privacy: .public)")
    }

    /// L'empreinte mémoire du processus (`phys_footprint`, celle de Jetsam).
    static func footprint() -> UInt64 {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }
        return result == KERN_SUCCESS ? info.phys_footprint : 0
    }

    private static func mb(_ bytes: UInt64) -> String {
        "\(bytes / 1_048_576) Mo"
    }

    private static func ms(_ value: TimeInterval?) -> String {
        value.map { "\(Int(($0 * 1_000).rounded())) ms" } ?? "—"
    }
}

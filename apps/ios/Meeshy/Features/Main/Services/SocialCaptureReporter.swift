import Foundation
import MeeshySDK

// MARK: - La capture d'écran d'un contenu social (#10508)
//
// On enregistre QU'une capture a eu lieu, sur quelle surface et quels contenus
// étaient à l'écran — jamais l'image, jamais le contenu. Ce rapporteur est un
// SECOND abonné des observateurs que `ContentCaptureReporter` (#9617) a déjà
// posés : aucune inscription `NotificationCenter` de plus. Une capture dans
// une CONVERSATION n'est pas son affaire : #9617 l'annonce au fil, et rien ne
// part ici.

/// Ce qu'une surface sociale montre à l'instant d'une capture.
struct SocialCaptureSnapshot: Equatable {
    let surface: SocialSurface?
    let targets: [SocialVisibleTarget]
}

/// **Une surface sociale qui sait ce qu'elle montre** — jumeau de
/// `ContentCaptureSource` pour le fil, les réels, le détail, la story, le profil.
@MainActor
protocol SocialCaptureSource: AnyObject {
    func socialCaptureSnapshot(at now: Date) -> SocialCaptureSnapshot?
}

/// Le second abonné des captures : appelé par `ContentCaptureReporter`.
@MainActor
protocol SocialCaptureObserving: AnyObject {
    func screenshotTaken()
    func screenCaptureChanged(isCaptured: Bool)
}

@MainActor
final class SocialCaptureReporter: SocialCaptureObserving {
    nonisolated deinit {}

    static let shared = SocialCaptureReporter()

    private struct WeakSource {
        weak var value: SocialCaptureSource?
    }

    private let reporter: @MainActor () -> SocialEventsV2Reporting
    private let isConversationOnScreen: @MainActor () -> Bool
    private let fallback: SocialCaptureSource
    private let now: @MainActor () -> Date

    private var sources: [WeakSource] = []
    private var recording: (startedAt: Date, snapshot: SocialCaptureSnapshot?)?

    init(
        reporter: @escaping @MainActor () -> SocialEventsV2Reporting = { SocialEventsV2Reporter.shared },
        isConversationOnScreen: @escaping @MainActor () -> Bool = { ContentCaptureReporter.shared.showsConversationContent },
        fallback: SocialCaptureSource = RecentDisplayCaptureSource.shared,
        now: @escaping @MainActor () -> Date = { Date() }
    ) {
        self.reporter = reporter
        self.isConversationOnScreen = isConversationOnScreen
        self.fallback = fallback
        self.now = now
    }

    /// Une surface PRÉCISE (cadres mesurés) passe avant l'approximation par
    /// les dernières apparitions.
    func register(_ source: SocialCaptureSource) {
        sources.removeAll { $0.value == nil || $0.value === source }
        sources.append(WeakSource(value: source))
    }

    func unregister(_ source: SocialCaptureSource) {
        sources.removeAll { $0.value == nil || $0.value === source }
    }

    private func snapshot() -> SocialCaptureSnapshot? {
        let at = now()
        sources.removeAll { $0.value == nil }
        let precise = sources.reversed().lazy.compactMap { $0.value?.socialCaptureSnapshot(at: at) }.first { !$0.targets.isEmpty }
        return precise ?? fallback.socialCaptureSnapshot(at: at).flatMap { $0.targets.isEmpty ? nil : $0 }
    }

    func screenshotTaken() {
        guard !isConversationOnScreen(), let shot = snapshot() else { return }
        emit(.screenshot, snapshot: shot, recordingMs: nil)
    }

    func screenCaptureChanged(isCaptured: Bool) {
        if isCaptured {
            guard recording == nil else { return }
            let shot = isConversationOnScreen() ? nil : snapshot()
            recording = (now(), shot)
            if let shot { emit(.recordingStarted, snapshot: shot, recordingMs: nil) }
        } else {
            guard let started = recording else { return }
            recording = nil
            guard let shot = started.snapshot else { return }
            let elapsed = Int((now().timeIntervalSince(started.startedAt) * 1_000).rounded())
            emit(.recordingStopped, snapshot: shot, recordingMs: elapsed)
        }
    }

    private func emit(_ action: SocialScreenCapture.Action, snapshot: SocialCaptureSnapshot, recordingMs: Int?) {
        guard let primary = snapshot.targets.first else { return }
        reporter().emit(SocialEventV2(
            occurredAt: now(),
            target: SocialTarget(kind: primary.kind, id: primary.id),
            surface: snapshot.surface,
            payload: .screenCapture(SocialScreenCapture(action: action, visibleTargets: snapshot.targets, recordingMs: recordingMs))
        ))
    }
}

// MARK: - L'approximation : les dernières apparitions

/// Ce qui vient d'APPARAÎTRE à l'écran, d'après les files d'impressions (le
/// même signal que le comptage, `onAppear`). La surface de la dernière
/// apparition est réputée au premier plan ; ses ≤ 10 dernières apparitions
/// des deux dernières minutes sont réputées visibles, sans fraction connue.
/// Une surface qui mesure ses cadres s'enregistre auprès du rapporteur et
/// passe avant.
@MainActor
final class RecentDisplayCaptureSource: SocialCaptureSource {
    nonisolated deinit {}

    static let shared = RecentDisplayCaptureSource()
    static let horizon: TimeInterval = 120
    static let capacity = 10

    private struct Entry: Equatable {
        let target: SocialTargetRef
        let surface: SocialSurface?
        let at: Date
    }

    private var entries: [Entry] = []

    /// Une citation de bulle vit dans une conversation : #9617 la couvre.
    func noteDisplayed(postId: String, source: String, surface: ReachSurface?, at date: Date = Date()) {
        guard !postId.isEmpty, surface != .citation else { return }
        let kind = Self.kind(source: source, surface: surface)
        let entry = Entry(target: SocialTargetRef(kind: kind, id: postId), surface: surface.map(SocialSurface.init), at: date)
        entries.removeAll { $0.target == entry.target }
        entries.append(entry)
        if entries.count > Self.capacity * 2 { entries.removeFirst(entries.count - Self.capacity * 2) }
    }

    func socialCaptureSnapshot(at now: Date) -> SocialCaptureSnapshot? {
        guard let front = entries.last, now.timeIntervalSince(front.at) < Self.horizon else { return nil }
        let visible = entries
            .filter { $0.surface == front.surface && now.timeIntervalSince($0.at) < Self.horizon }
            .suffix(Self.capacity)
            .reversed()
            .map { SocialVisibleTarget(kind: $0.target.kind, id: $0.target.id) }
        return SocialCaptureSnapshot(surface: front.surface, targets: Array(visible))
    }

    func reset() { entries.removeAll() }

    static func kind(source: String, surface: ReachSurface?) -> SocialTargetKind {
        if source == "status" { return .status }
        switch surface {
        case .reels: return .reel
        case .story, .storyRail: return .story
        case .moodAvatar: return .status
        default: return .post
        }
    }
}

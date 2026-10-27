import SwiftUI
import MeeshySDK
import MeeshyUI

/// What the pipeline needs to arm the visible slide: the current group's
/// stories, the visible index, the reader's Prism chain, the mute switch,
/// the slide duration and the slides a group swipe lands on (#10348).
struct StoryPlaybackWindow {
    let stories: [StoryItem]
    let index: Int
    let languages: [String]
    let mute: Bool
    let duration: TimeInterval
    let warmItems: [StoryItem]
}

/// The story reader's playback pipeline (#13135): the gated slide clock, the
/// offscreen prefetcher's sliding window, the neighbour ring N±1, N±2 and every
/// prefetch task it launches. Installed once per appearance, re-armed on every
/// slide, torn down when the reader leaves.
@MainActor
final class StoryPlaybackPipeline {
    let prefetcher: StoryReaderPrefetcher
    let timer: StoryReaderTimerController
    private let neighbors: StoryNeighborPrefetchQueue
    private var tasks: [Task<Void, Never>] = []
    private var isInstalled = false
    private var hasPreparedNeighbors = false

    init(prefetcher: StoryReaderPrefetcher = StoryReaderPrefetcher(),
         timer: StoryReaderTimerController = StoryReaderTimerController(),
         neighbors: StoryNeighborPrefetchQueue = StoryNeighborPrefetchQueue()) {
        self.prefetcher = prefetcher
        self.timer = timer
        self.neighbors = neighbors
    }

    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au
    // démontage hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    /// Wires the clock once per appearance: a re-entrant `.onAppear` keeps the
    /// running slide. The tick writes NO reader state (#9859) — it publishes
    /// through `onProgress`; its first tick prepares the neighbours if the
    /// visible content has not already done so; the end goes through the
    /// playback rule (`onCompletion`, #9821).
    func install(onProgress: @escaping (Double) -> Void,
                 onFirstTick: @escaping () -> Void,
                 onCompletion: @escaping () -> Void) {
        guard !isInstalled else { return }
        isInstalled = true
        timer.reset()
        timer.onProgressChange = { [weak self] progress in
            onProgress(progress)
            guard let self, progress > 0, !self.hasPreparedNeighbors else { return }
            self.hasPreparedNeighbors = true
            onFirstTick()
        }
        timer.onCompletion = onCompletion
    }

    /// A new slide starts: its first tick may prepare the neighbours again.
    func slideDidStart() {
        hasPreparedNeighbors = false
    }

    /// Re-arms the prefetch window and the gated clock on the visible slide.
    ///
    /// The prefetcher's canvases stay in `.edit` for life (a warm cache): the
    /// visible `StoryReaderRepresentable` is the ONLY playing canvas — promoting
    /// the prefetched one doubled every background video and audio (2026-05-28).
    ///
    /// `setCurrentSlide` un-pauses by contract; the requested pause is put back
    /// right after, at the single call site, so a re-arm during a pause (the
    /// identity interlude, a held long-press) never releases it in silence.
    func refresh(_ window: StoryPlaybackWindow, paused: Bool) {
        guard window.stories.indices.contains(window.index) else {
            timer.reset()
            return
        }
        let resolver = StoryPostMediaResolver.resolver(covering: window.stories + window.warmItems)
        let context = StoryReaderContext(preferredLanguages: window.languages, mute: window.mute,
                                         onCompletion: nil, postMediaURLResolver: resolver, imageCache: nil)
        prefetcher.updateWindow(items: window.stories, currentIndex: window.index, context: context,
                                preferredLanguages: window.languages, extraWarmItems: window.warmItems)
        let current = window.stories[window.index]
        timer.setCurrentSlide(id: current.id, duration: window.duration)
        timer.setPaused(paused)
        wireContentReadiness(of: current.id)
    }

    /// The prefetched canvas reports its background readiness — same cache as
    /// the visible canvas. A canvas bootstrapped before the callback (a solid
    /// colour fires on the next run loop) fast-forwards the clock at once.
    private func wireContentReadiness(of slideId: String) {
        guard let canvas = prefetcher.view(for: slideId) else { return }
        canvas.onContentReady = { [weak timer] in
            timer?.markContentReady(slideId: slideId)
        }
        if canvas.contentReadyFired {
            timer.markContentReady(slideId: slideId)
        }
    }

    /// Prefetches every medium of `story` (players included), then runs
    /// `probe` — the foreground video audio probe, so the sound button is
    /// settled before the slide shows (2026-05-28).
    @discardableResult
    func prefetch(_ story: StoryItem, then probe: @escaping @MainActor () async -> Void) -> Task<Void, Never> {
        let sources = Self.prefetchSources(of: story)
        let task = Task {
            await Self.prepare(sources, decodingImages: true, preparingPlayers: true)
            guard !Task.isCancelled else { return }
            await probe()
        }
        tasks.append(task)
        return task
    }

    /// **As soon as slide N is on screen, N±1 then N±2 prepare BEFORE any
    /// other slide** (#10348), the one in the gesture's direction first, across
    /// group boundaries — law `StoryNeighborWindow`. The ring decodes images in
    /// order (players for N±1 only, the decoder pool is bounded); the rest of
    /// the window is fetched as BYTES, in parallel. Idempotent per slide.
    func prepareNeighbors(at position: StorySlidePosition, groups: [StoryGroupShape],
                          story: (StorySlidePosition) -> StoryItem) {
        guard let direction = neighbors.begin(at: position) else { return }
        let plan = StoryNeighborWindow.preparations(from: position, groups: groups, direction: direction)
        let ring = plan.filter { $0.distance != nil }.map { preparation in
            (sources: Self.prefetchSources(of: story(preparation.position)),
             preparesPlayer: preparation.distance == 1)
        }
        let extended = plan.filter { $0.distance == nil }.map { Self.prefetchSources(of: story($0.position)) }
        tasks.append(neighbors.run {
            for neighbor in ring {
                guard !Task.isCancelled else { return }
                await Self.prepare(neighbor.sources, decodingImages: true, preparingPlayers: neighbor.preparesPlayer)
            }
            guard !Task.isCancelled else { return }
            await withTaskGroup(of: Void.self) { group in
                for sources in extended {
                    group.addTask { await Self.prepare(sources, decodingImages: false, preparingPlayers: false) }
                }
            }
        })
    }

    /// The slide changes: what has not started yet does not start.
    func interruptNeighbors() {
        neighbors.interrupt()
    }

    /// The reader leaves: the display link and the callbacks that capture the
    /// reader are cut, the prefetch tasks cancelled, the canvases released.
    /// The next appearance installs again.
    func tearDown() {
        timer.invalidate()
        tasks.forEach { $0.cancel() }
        tasks.removeAll()
        prefetcher.detach()
        isInstalled = false
    }

    /// Les URL RÉSOLUES (`MeeshyConfig.resolveMediaURL`) — la clé sous laquelle
    /// le canvas relit le cache (#7056). Préchauffer la chaîne brute ratait le
    /// cache pour toute clé de stockage ou tout chemin relatif.
    private static func prefetchSources(of story: StoryItem) -> [StoryPrefetchSource] {
        let byId = Dictionary(story.media.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let effects = story.storyEffects
        let referenced = (effects?.mediaObjects?.map(\.postMediaId) ?? [])
            + (effects?.audioPlayerObjects?.map(\.postMediaId) ?? [])
            + [effects?.backgroundAudioId].compactMap { $0 }
        let media = story.media + referenced.compactMap { byId[$0] }
        let sources = media.compactMap { item -> StoryPrefetchSource? in
            guard let raw = item.url, let url = MeeshyConfig.resolveMediaURL(raw) else { return nil }
            switch item.type {
            case .video: return StoryPrefetchSource(url: url.absoluteString, kind: .video)
            case .audio: return StoryPrefetchSource(url: url.absoluteString, kind: .audio)
            default: return StoryPrefetchSource(url: url.absoluteString, kind: .image)
            }
        }
        return sources.reduce(into: [StoryPrefetchSource]()) { unique, source in
            if !unique.contains(where: { $0.url == source.url }) { unique.append(source) }
        }
    }

    private static func prepare(
        _ sources: [StoryPrefetchSource],
        decodingImages: Bool,
        preparingPlayers: Bool
    ) async {
        for source in sources {
            guard !Task.isCancelled else { return }
            switch source.kind {
            case .video:
                // Le canvas relit la vidéo via `CacheCoordinator.shared.video`
                // (`videoLocalFileURL(for:)`) : c'est CE store qu'il faut peupler.
                _ = try? await CacheCoordinator.shared.video.data(for: source.url)
                if preparingPlayers, !Task.isCancelled, let url = URL(string: source.url) {
                    await StoryMediaLoader.shared.preloadAndCachePlayer(url: url)
                }
            case .audio:
                _ = try? await CacheCoordinator.shared.audio.data(for: source.url)
            case .image where decodingImages:
                // Décodée hors fil principal, dans le slot que
                // `StoryBackgroundLayer` lit en synchrone (`warmedImage`).
                _ = await CacheCoordinator.shared.images.image(for: source.url)
            case .image:
                _ = try? await CacheCoordinator.shared.images.data(for: source.url)
            }
        }
    }
}

/// Ce que la fenêtre des voisines retient d'un passage à l'autre : la dernière
/// slide préparée (d'où se lit le sens du geste) et la tâche en vol, annulée
/// dès que la slide change (#10348) — et suspendue tant que l'app n'est pas au
/// premier plan, relancée à son retour (#11284).
@MainActor
final class StoryNeighborPrefetchQueue {
    private var lastPosition: StorySlidePosition?
    private var preparedPosition: StorySlidePosition?
    private var direction: StoryNavigationDirection = .forward
    private var task: Task<Void, Never>?
    private let activity: PreloadActivityGate

    init(activity: PreloadActivityGate = .shared) {
        self.activity = activity
    }

    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free au démontage hors d'une tâche.
    // Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    /// `nil` quand la fenêtre de `position` est déjà lancée ; sinon le sens du
    /// dernier passage, lu dans le déplacement depuis la slide précédente.
    func begin(at position: StorySlidePosition) -> StoryNavigationDirection? {
        guard position != preparedPosition else { return nil }
        direction = StoryNeighborWindow.direction(from: lastPosition, to: position, otherwise: direction)
        lastPosition = position
        preparedPosition = position
        return direction
    }

    /// Lance le plan de la fenêtre sous le portier d'activité, en annulant le
    /// précédent ; rend la tâche pour que le lecteur l'annule en se fermant.
    @discardableResult
    func run(_ plan: @escaping @MainActor @Sendable () async -> Void) -> Task<Void, Never> {
        self.task?.cancel()
        let gate = activity
        let task = Task { await gate.runWhileActive(plan) }
        self.task = task
        return task
    }

    /// La slide change : ce qui n'a pas encore démarré ne démarre plus. Un
    /// téléchargement déjà parti s'achève (l'entonnoir réseau du cache est
    /// partagé), il ne se perd pas.
    func interrupt() {
        task?.cancel()
        task = nil
        preparedPosition = nil
    }
}

private nonisolated struct StoryPrefetchSource: Sendable {
    enum Kind: Sendable { case image, video, audio }
    let url: String
    let kind: Kind
}

import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que la fenêtre des voisines retient d'un passage à l'autre : la dernière
/// slide préparée (d'où se lit le sens du geste) et la tâche en vol, annulée
/// dès que la slide change (#10348).
@MainActor
final class StoryNeighborPrefetchQueue {
    private var lastPosition: StorySlidePosition?
    private var preparedPosition: StorySlidePosition?
    private var direction: StoryNavigationDirection = .forward
    private var task: Task<Void, Never>?

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

    func run(_ task: Task<Void, Never>) {
        self.task?.cancel()
        self.task = task
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

// MARK: - Prefetch

extension StoryViewerView {

    /// Précharge tous les médias d'une story : legacy media, mediaObjects,
    /// audioPlayerObjects, backgroundAudio — lecteur vidéo compris — puis sonde
    /// la piste audio des vidéos. Retourne un Task awaitable.
    @discardableResult
    func prefetchAllMedia(for story: StoryItem) -> Task<Void, Never> {
        let sources = Self.prefetchSources(of: story)
        let task = Task {
            await Self.prepare(sources, decodingImages: true, preparingPlayers: true)
            guard !Task.isCancelled else { return }
            // Pre-probe foreground video audio tracks so `storyHasAudibleSound`
            // resolves to its final value before the slide is rendered —
            // without this, the sound button « apparait après quelques 100 ms »
            // when the story carries a video with audio (user bug 2026-05-28).
            await self.preProbeVideoAudio(for: story)
        }
        prefetchTasks.append(task)
        return task
    }

    /// La slide affichée d'abord. Ses voisines suivent sa première image
    /// (`prepareNeighborWindow`) ; les entrées des groupes suivants font partie
    /// de cette fenêtre (directive user 2026-08-20 : « précharger les groupes
    /// suivants »).
    func prefetchCurrentGroup() {
        interruptNeighborWindow()
        guard let story = currentStory else { return }
        prefetchAllMedia(for: story)
    }

    /// **Dès que la slide N est à l'écran, N±1 puis N±2 se préparent AVANT
    /// toute autre slide** (#10348), la voisine dans le sens du geste en tête,
    /// à travers les frontières de groupe — loi `StoryNeighborWindow`.
    ///
    /// - l'anneau N±1, N±2 se prépare dans l'ordre, une slide après l'autre :
    ///   image décodée hors fil principal dans le cache que le canvas relit en
    ///   synchrone, lecteur vidéo préparé pour N±1 seulement (le pool de
    ///   décodeurs est borné) ;
    /// - le reste de la fenêtre se prépare en OCTETS, en parallèle.
    ///
    /// Idempotent par slide ; la slide qui change annule ce qui n'a pas démarré.
    func prepareNeighborWindow() {
        guard groups.indices.contains(currentGroupIndex),
              groups[currentGroupIndex].stories.indices.contains(currentStoryIndex) else { return }
        let position = StorySlidePosition(group: currentGroupIndex, slide: currentStoryIndex)
        guard let direction = neighborPrefetch.begin(at: position) else { return }

        let plan = StoryNeighborWindow.preparations(from: position, groups: storyGroupShapes, direction: direction)
        let ring = plan.filter { $0.distance != nil }.map { preparation in
            (sources: Self.prefetchSources(of: story(at: preparation.position)),
             preparesPlayer: preparation.distance == 1)
        }
        let extended = plan.filter { $0.distance == nil }.map { Self.prefetchSources(of: story(at: $0.position)) }

        let task = Task {
            for neighbor in ring {
                guard !Task.isCancelled else { return }
                await Self.prepare(neighbor.sources, decodingImages: true, preparingPlayers: neighbor.preparesPlayer)
            }
            guard !Task.isCancelled else { return }
            await withTaskGroup(of: Void.self) { group in
                for sources in extended {
                    group.addTask {
                        await Self.prepare(sources, decodingImages: false, preparingPlayers: false)
                    }
                }
            }
        }
        neighborPrefetch.run(task)
        prefetchTasks.append(task)
    }

    func interruptNeighborWindow() {
        neighborPrefetch.interrupt()
    }

    /// Les slides où atterrit un balayage d'auteur depuis le groupe courant,
    /// gardées chaudes par `StoryReaderPrefetcher`.
    func authorSwipeWarmItems() -> [StoryItem] {
        StoryNeighborWindow.authorSwipeLandings(from: currentGroupIndex, groups: storyGroupShapes)
            .map { story(at: $0) }
    }

    private var storyGroupShapes: [StoryGroupShape] {
        groups.map { StoryGroupShape(slideCount: $0.stories.count, entryIndex: entryIndex(of: $0)) }
    }

    private func story(at position: StorySlidePosition) -> StoryItem {
        groups[position.group].stories[position.slide]
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

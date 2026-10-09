import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - Qui préchauffer

/// **Le réel qui SUIT l'actif dans le fil** (#7009).
///
/// Le coordinateur d'autoplay n'élisait que le réel ACTIF : le voisin n'était
/// touché qu'au moment où il devenait actif à son tour, et le swipe montrait un
/// trou noir le temps du premier frame. Le tableau des frames porte pourtant
/// déjà tout ce qu'il faut — chacune sait son `midY`.
///
/// Règle purement GÉOMÉTRIQUE, donc éprouvable sans lecteur ni réseau : le fil
/// défile vers le bas, « suivant » est le `midY` immédiatement supérieur à
/// celui de l'actif. Le PRÉCÉDENT n'est pas préchauffé — il vient d'être joué,
/// et `SharedAVPlayerManager.load` rend son lecteur au pool (borné à trois,
/// éviction FIFO) au lieu de le détruire (#9702 ; avant ce lot, cette phrase
/// décrivait un comportement qui n'existait pas : le lecteur sortant était
/// jeté). Lui réserver une place de plus coûterait celle du suivant pour
/// servir le geste minoritaire.
nonisolated enum ReelPrewarmWindow {

    static func next(after activeId: String?, in frames: [ReelFrame]) -> String? {
        guard let activeId,
              let active = frames.first(where: { $0.id == activeId }) else { return nil }
        return frames
            .filter { $0.midY > active.midY }
            .min(by: { $0.midY < $1.midY })?
            .id
    }
}

// MARK: - Préchauffage d'un réel

/// Prépare l'`AVPlayerItem` d'un réel AVANT qu'il ne devienne actif.
///
/// Orchestration produit, donc app-side : elle lit un `FeedPost`, résout son
/// URL par `MeeshyConfig`, et encode une règle « quand préchauffer ». Le SDK
/// fournit les atomes — `StoryMediaLoader.preloadAndCachePlayer(url:)`, dont le
/// pool est déjà **borné à trois lecteurs** avec éviction FIFO et purge sur
/// avertissement mémoire ; c'est lui qui libère N−2 quand N+1 entre, et rien
/// ici n'a à le refaire.
///
/// Deux disciplines reprises du préchauffage de pagination
/// (`FeedViewModel`) et du prefetcher de stories :
/// - **garde thermique** — un appareil qui chauffe cesse d'ouvrir des sessions
///   de décodage, sinon un défilement rapide en empile jusqu'au throttling ;
/// - **priorité de fond** — le préchauffage ne dispute jamais le thread du
///   geste en cours.
///
/// Et surtout : on PRÉPARE, on ne JOUE pas. `preloadAndCachePlayer` ne appelle
/// jamais `play()`, donc la session audio n'est pas activée
/// (`SharedAVPlayerManager.play` en est le seul site) et le voisin reste muet.
@MainActor
enum ReelPrewarm {

    /// L'URL vidéo d'un réel, ou `nil` quand il n'en porte pas (réel photo,
    /// audio, scène sans vidéo) — auquel cas il n'y a rien à préchauffer.
    ///
    /// **`primaryReelDisplayMedia`, et surtout pas `media.first(…)`** : c'est
    /// la propriété que `ReelFeedVideoSurface` interroge pour décider quoi
    /// JOUER, et le préchauffage doit remplir le cache sous la clé que la
    /// lecture ira y chercher. Elle est de plus repost-consciente — un réel
    /// republié ne porte aucun média sur le post extérieur, et une résolution
    /// écrite à la main ici aurait silencieusement cessé de préchauffer toute
    /// cette famille. Un cache alimenté sous une clé que personne ne lit ne
    /// préchauffe rien ; il ne fait que dépenser.
    nonisolated static func videoURL(for post: FeedPost) -> URL? {
        guard let media = post.primaryReelDisplayMedia, media.type == .video,
              let raw = media.url, !raw.isEmpty else { return nil }
        return MeeshyConfig.resolveMediaURL(raw)
    }

    /// Prépare le réel `post` : son FICHIER d'abord, son lecteur ensuite.
    ///
    /// **Le fichier est la moitié qui manquait** (#7625). La surface vidéo
    /// (`ReelVideoView`, `ReelFeedVideoSurface`) ne charge le moteur que
    /// lorsque `VideoAvailabilityResolver` rend `.ready` — le fichier SUR
    /// DISQUE. Un lecteur préparé en streaming dormait donc dans le pool
    /// pendant que la page affichait poster et indicateur le temps du
    /// téléchargement, lancé seulement quand la page entrait à l'écran. Le
    /// fichier part désormais dans le registre partagé, en silence, et la
    /// surface montée au swipe le rejoint ou le trouve prêt.
    ///
    /// **Le lecteur se prépare SUR le fichier, donc après lui** (#9702). Un
    /// lecteur préparé pendant le téléchargement lisait l'URL distante : il
    /// jouait en streaming et re-téléchargeait le réel. Le préroulage attend
    /// désormais que le fichier soit posé, et le moteur partagé n'adopte un
    /// lecteur préparé que s'il lit ce fichier.
    ///
    /// `preroll: false` pour un voisin qu'on garde sans le préparer à jouer —
    /// le précédent, déjà vu : son fichier suffit, sa place dans le pool
    /// (trois lecteurs) revient au suivant.
    static func prepare(
        _ post: FeedPost,
        preroll: Bool = true,
        center: AttachmentDownloadCenter = .shared
    ) async {
        guard MediaThermalPolicy.shouldPrefetchVideo(
            thermalState: ProcessInfo.processInfo.thermalState
        ) else { return }
        guard let key = prefetchFile(of: post, center: center) else { return }
        guard preroll else { return }
        await awaitFile(key: key, center: center)
        await prerollFromDisk(post)
    }

    /// Lance — ou rejoint — le téléchargement silencieux du fichier vidéo de
    /// `post` dans le registre partagé. Rend la clé de cache, `nil` pour un
    /// réel sans vidéo.
    @discardableResult
    static func prefetchFile(of post: FeedPost, center: AttachmentDownloadCenter = .shared) -> String? {
        guard let media = post.primaryReelDisplayMedia, media.type == .video,
              videoURL(for: post) != nil else { return nil }
        let attachment = media.toMessageAttachment()
        center.prefetch(urlString: attachment.fileUrl,
                        expectedSize: Int64(attachment.fileSize),
                        cacheStore: .video)
        return AttachmentDownloadCenter.key(for: attachment.fileUrl)
    }

    /// Attend que le téléchargement de `key` se termine — fini, échoué ou
    /// annulé — ou que la tâche soit annulée. Le registre n'expose qu'un état
    /// (`progress(for:)`) : on le relit à cadence lente plutôt que de risquer
    /// de manquer l'événement de fin entre le lancement et l'abonnement.
    static func awaitFile(key: String, center: AttachmentDownloadCenter = .shared) async {
        while center.progress(for: key) != nil, !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 120_000_000)
        }
    }

    /// Prépare le lecteur de `post` — seulement si son fichier est sur le
    /// disque : préparé sur l'URL distante, il serait jeté à l'adoption.
    static func prerollFromDisk(_ post: FeedPost) async {
        guard !Task.isCancelled, let url = videoURL(for: post),
              CacheCoordinator.videoLocalFileURL(for: url.absoluteString) != nil else { return }
        await StoryMediaLoader.shared.preloadAndCachePlayer(url: url)
    }

    /// Rend ce que `post` tenait : son téléchargement automatique en cours
    /// (jamais un téléchargement manuel), et son lecteur préparé.
    static func release(_ post: FeedPost, center: AttachmentDownloadCenter = .shared) {
        guard let media = post.primaryReelDisplayMedia, media.type == .video,
              let url = videoURL(for: post) else { return }
        center.cancelPrefetch(urlString: media.toMessageAttachment().fileUrl)
        StoryMediaLoader.shared.discardCachedPlayer(for: url)
    }
}

// MARK: - Le lecteur plein écran : la fenêtre de préchargement (#9702)

/// **Prépare, autour du réel affiché, la fenêtre que l'USAGE réclame** —
/// de N±2 toujours à N±10 pour un balayeur rapide (`ReelPreloadWindow`, loi
/// pure jumelle de `apps/web/src/lib/reels/preload-window.ts`).
///
/// Chaque palier prend la ressource qu'il mérite, et pas plus :
/// - **décode** (N±1) — fichier, puis lecteur préparé SUR le fichier. Les
///   décodeurs matériels sont bornés : c'est le seul palier qui en tient un,
///   et le pool de `StoryMediaLoader` reste à trois.
/// - **monté** (N±2) — fichier entier, lancé aussitôt avec le palier décode.
/// - **amorcé** (N±3…N±R) — fichier entier aussi (le registre ne sait pas
///   servir une plage), mais APRÈS les proches et un à la fois : il ne dispute
///   jamais la bande passante du réel qu'on va voir.
///
/// Le plus proche d'abord, devant avant derrière. Ce qui sort de la fenêtre
/// rend son téléchargement automatique et son lecteur ; un appareil qui chauffe
/// garde son plancher (loi) et cesse tout préchargement au stade critique
/// (`MediaThermalPolicy`).
///
/// Classe et non valeur : l'horloge des visites traverse les `.task(id:)` du
/// pager, que chaque balayage annule et relance.
@MainActor
final class ReelPagerPreloader {
    // Même garde que les autres classes MainActor du dépôt (SE-0466, iOS 26.1).
    nonisolated deinit {}

    private var clock = ReelPreloadWindow.VisitClock()
    private let center: AttachmentDownloadCenter

    init(center: AttachmentDownloadCenter = .shared) {
        self.center = center
    }

    /// Note l'arrivée sur `index` (temps passé sur le réel quitté, sens du
    /// geste) et rend la fenêtre que l'usage et l'appareil réclament.
    func enter(index: Int, at now: Date = Date()) -> ReelPreloadWindow.Window {
        clock.enter(index: index, at: now)
        return ReelPreloadWindow.window(for: Self.liveContext(visits: clock.visits))
    }

    /// Les signaux de l'appareil, lus à l'instant : chemin réseau, mémoire,
    /// économie d'énergie, état thermique.
    static func liveContext(visits: [ReelPreloadWindow.Visit]) -> ReelPreloadWindow.Context {
        let info = ProcessInfo.processInfo
        return ReelPreloadWindow.Context(
            visits: visits,
            network: ReelPreloadWindow.Network(snapshot: NetworkPathSource.shared.current),
            deviceMemoryGb: ReelPreloadWindow.gigabytes(physicalMemory: info.physicalMemory),
            lowPower: info.isLowPowerModeEnabled,
            thermalState: info.thermalState
        )
    }

    /// Rend ce que tiennent les réels sortis de la fenêtre — téléchargement
    /// automatique en cours, lecteur préparé — et les lecteurs des réels qui
    /// n'y sont plus au palier « décode ». Synchrone : rien n'attend le réseau.
    func retire(reels: [FeedPost], activeIndex: Int, window: ReelPreloadWindow.Window) {
        let plan = ReelPreloadWindow.plan(count: reels.count, activeIndex: activeIndex, window: window)
        let tiers = Dictionary(uniqueKeysWithValues: plan.map { ($0.index, $0.tier) })
        for (index, reel) in reels.enumerated() where index != activeIndex {
            switch tiers[index] {
            case nil:
                ReelPrewarm.release(reel, center: center)
            case .some(.decode):
                continue
            case .some:
                if let url = ReelPrewarm.videoURL(for: reel) {
                    StoryMediaLoader.shared.discardCachedPlayer(for: url)
                }
            }
        }
    }

    /// Prépare la fenêtre autour de `activeIndex`, palier par palier.
    /// Annulable à tout instant : le balayage suivant relance le tout.
    func prepare(reels: [FeedPost], activeIndex: Int, window: ReelPreloadWindow.Window) async {
        retire(reels: reels, activeIndex: activeIndex, window: window)
        guard MediaThermalPolicy.shouldPrefetchVideo(
            thermalState: ProcessInfo.processInfo.thermalState
        ) else { return }
        let plan = ReelPreloadWindow.plan(count: reels.count, activeIndex: activeIndex, window: window)
        let near = plan.filter { $0.tier == .decode || $0.tier == .mount }
        let nearKeys: [(step: ReelPreloadWindow.Step, key: String)] = near.compactMap { step in
            ReelPrewarm.prefetchFile(of: reels[step.index], center: center).map { (step: step, key: $0) }
        }

        await prefetchAudio(reels: reels, plan: plan)
        for entry in nearKeys where entry.step.tier == .decode {
            guard !Task.isCancelled else { return }
            await ReelPrewarm.awaitFile(key: entry.key, center: center)
            await ReelPrewarm.prerollFromDisk(reels[entry.step.index])
        }
        for entry in nearKeys where entry.step.tier == .mount {
            await ReelPrewarm.awaitFile(key: entry.key, center: center)
        }
        for step in plan where step.tier == .prime {
            guard !Task.isCancelled else { return }
            guard let key = ReelPrewarm.prefetchFile(of: reels[step.index], center: center) else { continue }
            await ReelPrewarm.awaitFile(key: key, center: center)
        }
    }

    /// **Le son des voisins, avant leurs vidéos** (#9837) : une piste pèse
    /// quelques centaines de Ko et fait le premier instant du réel ; sans elle,
    /// le réel élu partait la chercher sur le réseau. Mis en cache sous la clé
    /// que la lecture lira (`CacheCoordinator.audio`, URL résolue). Le cache
    /// disque est borné par son budget ; rien à rendre en s'éloignant.
    private func prefetchAudio(reels: [FeedPost], plan: [ReelPreloadWindow.Step]) async {
        let languages = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        for step in plan where ReelAudioPrefetch.prefetches(tier: step.tier) {
            for url in ReelAudioPrefetch.urls(for: reels[step.index], preferredLanguages: languages)
            where CacheCoordinator.audioLocalFileURL(for: url.absoluteString) == nil {
                guard !Task.isCancelled else { return }
                _ = try? await CacheCoordinator.shared.audio.data(for: url.absoluteString)
            }
        }
    }

    /// Le lecteur se ferme : rien de ce qu'il préparait ne doit continuer à
    /// consommer réseau ou décodeur.
    func releaseAll(reels: [FeedPost], except activeId: String?) {
        for reel in reels where reel.id != activeId {
            ReelPrewarm.release(reel, center: center)
        }
    }
}

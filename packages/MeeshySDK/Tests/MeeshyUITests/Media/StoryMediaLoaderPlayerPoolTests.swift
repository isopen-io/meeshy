import AVFoundation
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le pool des lecteurs préparés (#9702)** — `StoryMediaLoader` tient, par
/// URL distante, au plus `PlayerPoolCapacity.players(for:)` `AVPlayer` dont la
/// première image est décodée — trois sur un appareil de tier haut (#11281).
/// C'est la ressource que le passage de réel à réel consomme : un lecteur
/// préparé sur le RÉSEAU, un lecteur périmé qui chasse un utile, ou un lecteur
/// jeté au lieu d'être rendu, et le geste suivant repart à froid.
@MainActor
final class StoryMediaLoaderPlayerPoolTests: XCTestCase {

    private func remoteURL() -> URL {
        URL(string: "https://cdn.example.invalid/reel-\(UUID().uuidString).mp4")!
    }

    private func assetURL(of player: AVPlayer?) -> URL? {
        (player?.currentItem?.asset as? AVURLAsset)?.url
    }

    /// Le pool à une taille FIXÉE le temps d'un témoin, puis rendu à la loi du
    /// tier : un hôte de CI qui chauffe ne doit pas changer ce qu'on mesure.
    private func withPoolCapacity(_ capacity: Int, _ body: (StoryMediaLoader) -> Void) {
        let loader = StoryMediaLoader.shared
        loader.clearPlayerCache()
        loader.setPlayerPoolCapacity { capacity }
        defer {
            loader.clearPlayerCache()
            loader.setPlayerPoolCapacity { PlayerPoolCapacity.players(for: DeviceMediaTier.current) }
        }
        body(loader)
    }

    // MARK: - (c) Un balayage rapide annule le préchauffage

    /// Le `.task(id:)` du pager est annulé à chaque balayage : un lecteur
    /// préparé pour un réel déjà dépassé ne doit pas entrer dans le pool, où
    /// il chasserait par FIFO le voisin qu'on va réellement montrer.
    func test_preloadAndCachePlayer_whenCancelled_cachesNothing() async {
        let loader = StoryMediaLoader.shared
        loader.clearPlayerCache()
        let url = remoteURL()

        let task = Task { @MainActor in await loader.preloadAndCachePlayer(url: url) }
        task.cancel()
        await task.value

        XCTAssertNil(loader.cachedPlayer(for: url),
                     "un préchauffage annulé ne doit laisser aucun lecteur dans le pool")
    }

    // MARK: - (a) Le lecteur se prépare sur le fichier, jamais sur le réseau

    /// Le fichier du réel est déjà sur disque (registre partagé) : préparer le
    /// lecteur sur l'URL distante le faisait jouer en streaming et télécharger
    /// une seconde fois, alors que la surface n'attend QUE le fichier local.
    ///
    /// Le témoin juge la SOURCE que `preloadVideoPlayer` lit — le registre du
    /// cache, puis `prerollSource` — et non l'item du lecteur : un fichier de
    /// test n'est pas une vidéo décodable, son item échoue aussitôt et
    /// `AVQueuePlayer` le retire de sa file, si bien que `currentItem` vaut
    /// `nil` avant toute assertion (runtime 26.1 de la CI).
    func test_preloadVideoPlayer_whenTheFileIsOnDisk_buildsTheItemFromTheLocalFile() async {
        let url = remoteURL()
        await CacheCoordinator.shared.video.store(Data(repeating: 0, count: 64), for: url.absoluteString)
        defer { Task { await CacheCoordinator.shared.video.remove(for: url.absoluteString) } }

        let localFile = CacheCoordinator.videoLocalFileURL(for: url.absoluteString)
        let source = StoryMediaLoader.prerollSource(remote: url, localFile: localFile)

        XCTAssertEqual(localFile?.isFileURL, true, "le registre partagé doit rendre le fichier déjà sur disque")
        XCTAssertEqual(source?.isFileURL, true,
                       "le lecteur préparé doit lire le fichier local, pas l'URL distante")
    }

    func test_prerollSource_prefersTheLocalFile() {
        let remote = remoteURL()
        let local = URL(fileURLWithPath: "/tmp/reel.mp4")
        XCTAssertEqual(StoryMediaLoader.prerollSource(remote: remote, localFile: local), local)
    }

    // MARK: - (e) Seuls les fichiers sur le disque deviennent des lecteurs préparés (#9882)

    /// Un lecteur préparé sur l'URL distante jouait en streaming, puis le
    /// moteur le jetait dès que le fichier arrivait : réseau et décodeur
    /// dépensés pour rien. Aucun producteur — conversation, fil, stories,
    /// réels — ne prépare plus depuis le réseau.
    func test_prerollSource_withoutTheFileOnDisk_isNothing() {
        XCTAssertNil(StoryMediaLoader.prerollSource(remote: remoteURL(), localFile: nil))
    }

    func test_prerollSource_aLocalAsset_isItsOwnSource() {
        let local = URL(fileURLWithPath: "/tmp/draft.mov")
        XCTAssertEqual(StoryMediaLoader.prerollSource(remote: local, localFile: nil), local)
    }

    /// Un appareil brûlant n'ouvre plus aucune session de décodage pour un
    /// préchauffage, quel que soit l'écran qui le demande.
    func test_prerollSource_onACriticallyHotDevice_isNothing() {
        let local = URL(fileURLWithPath: "/tmp/reel.mp4")
        XCTAssertNil(StoryMediaLoader.prerollSource(remote: remoteURL(), localFile: local, thermalState: .critical))
        XCTAssertEqual(StoryMediaLoader.prerollSource(remote: remoteURL(), localFile: local, thermalState: .serious), local)
    }

    func test_preloadVideoPlayer_withoutTheFileOnDisk_buildsNoPlayer() async {
        let player = await StoryMediaLoader.shared.preloadVideoPlayer(url: remoteURL())
        XCTAssertNil(player, "aucun AVPlayer ne se construit sur une URL distante")
    }

    // MARK: - (f) Le pool garde en priorité les voisins du réel affiché (#9882)

    /// Les trois places tiennent N−1, N+1 et N+2 : une vidéo de conversation
    /// ne se prépare pas pour être chassée à l'insertion — elle n'évince aucun
    /// voisin, et ne dépense aucun décodeur.
    func test_admitsPreparation_aConversationVideo_yieldsToTheReelNeighbours() {
        withPoolCapacity(3) { loader in
            let previous = remoteURL(), next = remoteURL(), nextNext = remoteURL(), conversation = remoteURL()
            loader.setRetentionDistances([
                previous.absoluteString: -1, next.absoluteString: 1, nextNext.absoluteString: 2,
            ])
            defer { loader.setRetentionDistances([:]) }
            [previous, next, nextNext].forEach { loader.returnPlayer(AVPlayer(), for: $0) }

            XCTAssertFalse(loader.admitsPreparation(for: conversation))
            XCTAssertNotNil(loader.peekCachedPlayer(for: next), "le voisin du réel affiché garde son lecteur")
        }
    }

    func test_admitsPreparation_withRoomLeft_acceptsAnyProducer() {
        withPoolCapacity(3) { loader in
            loader.returnPlayer(AVPlayer(), for: remoteURL())
            XCTAssertTrue(loader.admitsPreparation(for: remoteURL()))
        }
    }

    // MARK: - (b) Le lecteur sortant revient au pool

    func test_returnPlayer_makesItAdoptableForTheSameURL() {
        let loader = StoryMediaLoader.shared
        loader.clearPlayerCache()
        let url = remoteURL()
        let player = AVPlayer()

        loader.returnPlayer(player, for: url)

        XCTAssertTrue(loader.cachedPlayer(for: url) === player,
                      "un retour en arrière doit retrouver le lecteur qu'on vient de quitter")
    }

    func test_returnPlayer_staysBoundedToThreePlayers_oldestFirst() {
        withPoolCapacity(3) { loader in
            let urls = (0..<4).map { _ in remoteURL() }

            urls.forEach { loader.returnPlayer(AVPlayer(), for: $0) }

            XCTAssertNil(loader.cachedPlayer(for: urls[0]), "le plus ancien est évincé : les décodeurs sont bornés")
            XCTAssertNotNil(loader.cachedPlayer(for: urls[3]))
        }
    }

    /// Le pool déborde en rendant le lecteur le plus LOIN du réel affiché,
    /// jamais celui du réel qu'on vient de quitter (#10354).
    func test_insert_withDistances_evictsTheFarthest_notTheReelJustLeft() {
        withPoolCapacity(3) { loader in
            let previous = remoteURL(), next = remoteURL(), far = remoteURL(), nextNext = remoteURL()
            loader.setRetentionDistances([
                previous.absoluteString: -1, next.absoluteString: 1,
                far.absoluteString: 5, nextNext.absoluteString: 2,
            ])
            defer { loader.setRetentionDistances([:]) }

            [previous, far, next, nextNext].forEach { loader.returnPlayer(AVPlayer(), for: $0) }

            XCTAssertNil(loader.peekCachedPlayer(for: far), "le plus loin part, même arrivé après")
            XCTAssertNotNil(loader.peekCachedPlayer(for: previous), "le réel quitté garde son lecteur")
            XCTAssertNotNil(loader.peekCachedPlayer(for: next))
            XCTAssertNotNil(loader.peekCachedPlayer(for: nextNext))
        }
    }

    // MARK: - (d) La taille du pool suit le tier de l'appareil (#11281)

    func test_playerPoolCapacity_law_lowOne_midTwo_highAndProThree() {
        XCTAssertEqual(PlayerPoolCapacity.players(for: .low), 1)
        XCTAssertEqual(PlayerPoolCapacity.players(for: .mid), 2)
        XCTAssertEqual(PlayerPoolCapacity.players(for: .high), 3)
        XCTAssertEqual(PlayerPoolCapacity.players(for: .pro), 3)
    }

    func test_playerPoolCapacity_neverGrowsWhenTheTierDrops() {
        let sizes = DeviceMediaTier.allCases.map(PlayerPoolCapacity.players(for:))
        XCTAssertEqual(sizes, sizes.sorted(), "un tier plus faible ne tient jamais plus de décodeurs")
        XCTAssertGreaterThanOrEqual(sizes.min() ?? 0, 1, "même un appareil bas garde le réel suivant prêt")
    }

    /// Sans loi posée par un hôte, le pool lit la source UNIQUE du tier — jamais
    /// une constante qui survivrait à la perte de son câblage.
    func test_playerPoolCapacity_byDefault_followsTheLiveTier() {
        XCTAssertEqual(StoryMediaLoader.shared.playerPoolCapacity,
                       PlayerPoolCapacity.players(for: DeviceMediaTier.current))
    }

    func test_lowTier_keepsOnlyTheNextReel_theOneJustLeftYields() {
        withPoolCapacity(PlayerPoolCapacity.players(for: .low)) { loader in
            let previous = remoteURL(), next = remoteURL()
            loader.setRetentionDistances([previous.absoluteString: -1, next.absoluteString: 1])
            defer { loader.setRetentionDistances([:]) }

            loader.returnPlayer(AVPlayer(), for: previous)
            loader.returnPlayer(AVPlayer(), for: next)

            XCTAssertNil(loader.peekCachedPlayer(for: previous), "à distance égale, le plus ancien cède")
            XCTAssertNotNil(loader.peekCachedPlayer(for: next), "le balayage vers l'avant reste instantané")
        }
    }

    /// Un appareil qui chauffe descend de tier : le pool rend ses lecteurs en
    /// trop dès que sa loi change, sans attendre le prochain préchauffage.
    func test_setPlayerPoolCapacity_shrinking_releasesTheSurplusAtOnce() {
        withPoolCapacity(3) { loader in
            let urls = (0..<3).map { _ in remoteURL() }
            urls.forEach { loader.returnPlayer(AVPlayer(), for: $0) }

            loader.setPlayerPoolCapacity { 1 }

            XCTAssertNil(loader.peekCachedPlayer(for: urls[0]))
            XCTAssertNil(loader.peekCachedPlayer(for: urls[1]))
            XCTAssertNotNil(loader.peekCachedPlayer(for: urls[2]))
            XCTAssertEqual(loader.playerPoolCapacity, 1)
        }
    }

    func test_discardCachedPlayer_freesItsPlace() {
        let loader = StoryMediaLoader.shared
        loader.clearPlayerCache()
        let url = remoteURL()
        loader.returnPlayer(AVPlayer(), for: url)

        loader.discardCachedPlayer(for: url)

        XCTAssertNil(loader.cachedPlayer(for: url))
    }
}

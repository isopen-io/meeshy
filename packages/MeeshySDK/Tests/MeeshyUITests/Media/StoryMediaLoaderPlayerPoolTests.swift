import AVFoundation
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le pool des lecteurs préparés (#9702)** — `StoryMediaLoader` tient, par
/// URL distante, au plus trois `AVPlayer` dont la première image est décodée.
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
    func test_preloadVideoPlayer_whenTheFileIsOnDisk_buildsTheItemFromTheLocalFile() async {
        let url = remoteURL()
        await CacheCoordinator.shared.video.store(Data(repeating: 0, count: 64), for: url.absoluteString)
        defer { Task { await CacheCoordinator.shared.video.remove(for: url.absoluteString) } }

        let player = await StoryMediaLoader.shared.preloadVideoPlayer(url: url)

        XCTAssertEqual(assetURL(of: player)?.isFileURL, true,
                       "le lecteur préparé doit lire le fichier local, pas l'URL distante")
    }

    func test_prerollSource_prefersTheLocalFile() {
        let remote = remoteURL()
        let local = URL(fileURLWithPath: "/tmp/reel.mp4")
        XCTAssertEqual(StoryMediaLoader.prerollSource(remote: remote, localFile: local), local)
        XCTAssertEqual(StoryMediaLoader.prerollSource(remote: remote, localFile: nil), remote)
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
        let loader = StoryMediaLoader.shared
        loader.clearPlayerCache()
        let urls = (0..<4).map { _ in remoteURL() }

        urls.forEach { loader.returnPlayer(AVPlayer(), for: $0) }

        XCTAssertNil(loader.cachedPlayer(for: urls[0]), "le plus ancien est évincé : les décodeurs sont bornés")
        XCTAssertNotNil(loader.cachedPlayer(for: urls[3]))
        loader.clearPlayerCache()
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

import CoreImage
import Foundation

/// Ce que la capture attend du cache de scènes — injecté dans la surface, la
/// bande et la session.
protocol ComposerLookSceneProviding: AnyObject, Sendable {
    nonisolated func cached(_ key: ComposerLookSceneKey) -> CallLiveFrameScene?
    nonisolated func prepare(_ key: ComposerLookSceneKey, ready: @escaping @MainActor @Sendable () -> Void)
    nonisolated func purge()
}

/// **Les scènes cuites, une fois par (look, toile, date, auteur)** (spec § 4.1).
///
/// Cuire un cadre coûte des millisecondes de processeur : jamais sur le fil
/// principal, jamais deux fois. `NSCache` borné ; `purge` à la fermeture du viseur.
nonisolated final class ComposerLookSceneCache: ComposerLookSceneProviding, @unchecked Sendable {
    static let shared = ComposerLookSceneCache()

    private let scenes = NSCache<NSString, CallLiveFrameScene>()
    private let queue = DispatchQueue(label: "me.meeshy.composer.look-scenes", qos: .userInitiated)
    private let lock = NSLock()
    /// Les clés en cuisson, et qui attend chacune : tout appelant est prévenu.
    private var pending: [NSString: [@MainActor @Sendable () -> Void]] = [:]
    private let painter: @Sendable (ComposerLookSceneKey) -> CallLiveFrameScene?

    nonisolated deinit {}

    /// Borné en NOMBRE et en OCTETS : une scène de l'aperçu (1080×1920, trois
    /// couches BGRA) pèse ~25 Mo ; 64 Mo en gardent deux, et toute la bande (162×288).
    init(countLimit: Int = 48, totalCostLimit: Int = 64 * 1_024 * 1_024,
         painter: @escaping @Sendable (ComposerLookSceneKey) -> CallLiveFrameScene? = { ComposerLookPainter.scene(for: $0) }) {
        scenes.countLimit = countLimit
        scenes.totalCostLimit = totalCostLimit
        self.painter = painter
    }

    /// Le poids d'une scène : fond, calque et masques, 4 octets par pixel.
    static func cost(of key: ComposerLookSceneKey) -> Int {
        Int(key.canvas.width * key.canvas.height) * 4 * 3
    }

    func cached(_ key: ComposerLookSceneKey) -> CallLiveFrameScene? {
        scenes.object(forKey: key.cacheKey)
    }

    /// `ready` est TOUJOURS appelé, sur le fil principal : à la fin de la cuisson
    /// — celle qu'on lance ou celle déjà en cours —, ou tout de suite si la scène
    /// est déjà là. Un appelant qui tient ses clés « en cuisson » ne les perd pas.
    func prepare(_ key: ComposerLookSceneKey, ready: @escaping @MainActor @Sendable () -> Void) {
        let cle = key.cacheKey
        guard scenes.object(forKey: cle) == nil else {
            Task { @MainActor in ready() }
            return
        }
        lock.lock()
        let dejaEnCours = pending[cle] != nil
        pending[cle, default: []].append(ready)
        lock.unlock()
        guard !dejaEnCours else { return }
        nonisolated(unsafe) let cleFigee = cle
        queue.async {
            if let scene = self.painter(key) { self.scenes.setObject(scene, forKey: cleFigee, cost: Self.cost(of: key)) }
            self.lock.lock()
            let attente = self.pending.removeValue(forKey: cleFigee) ?? []
            self.lock.unlock()
            Task { @MainActor in attente.forEach { $0() } }
        }
    }

    /// Vide les scènes ; une cuisson en cours finit et prévient ses appelants.
    func purge() {
        scenes.removeAllObjects()
    }
}

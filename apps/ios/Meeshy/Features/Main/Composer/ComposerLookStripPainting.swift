import Foundation

/// Ce qu'une place de l'atlas montre : la case, le look visé, et s'il y est
/// peint ENTIER — `false` ⇒ son seul filtre, le cadre cuisait encore (#9351).
nonisolated struct ComposerLookStripSlot: Equatable, Sendable {
    let index: Int
    let look: ComposerPhotoLook
    let complete: Bool
}

/// **Ce que la bande repeint** (#9351, spec § 5) — le coût GPU de la bande est
/// cette règle : une trame vivante repeint toutes les cases ; sans elle, seule
/// une case neuve, dont le look a changé, ou dont le cadre vient de cuire, se
/// peint. Une case figée (palier « serious », défilement) garde son image.
nonisolated enum ComposerLookStripPaintRule {

    static func tilesToPaint(_ tiles: [ComposerLookStripTile], painted: [Int: ComposerLookStripSlot], slots: Int,
                             live: Bool, scenesReady: Set<Int>) -> [ComposerLookStripTile] {
        guard !live else { return tiles }
        return tiles.filter { tile in
            guard let place = painted[ComposerLookStripGeometry.slot(of: tile.index, slots: slots)],
                  place.index == tile.index, place.look == tile.look else { return true }
            return !place.complete && scenesReady.contains(tile.index)
        }
    }

    /// Une case sans image attend une trame — même figée : une miniature ne
    /// reste jamais un glyphe parce que l'appareil était déjà chaud à l'armement.
    static func needsFrame(_ tiles: [ComposerLookStripTile], painted: [Int: ComposerLookStripSlot],
                           slots: Int) -> Bool {
        !tilesToPaint(tiles, painted: painted, slots: slots, live: false, scenesReady: []).isEmpty
    }
}

/// **Une cuisson par clé, jamais une boucle** (#9351) : une scène de cadre qui
/// ne cuit pas (mémoire, design absent) ne se redemande pas à chaque dessin, et
/// sa fin ne redemande un dessin que si la scène est vraiment là. Le cache
/// périmé (`reset`) rouvre les demandes.
final class ComposerLookStripScenes {
    private let provider: any ComposerLookSceneProviding
    private var requested: Set<NSString> = []

    nonisolated deinit {}

    init(provider: any ComposerLookSceneProviding) {
        self.provider = provider
    }

    func scene(for key: ComposerLookSceneKey,
               onReady: @escaping @MainActor @Sendable () -> Void) -> CallLiveFrameScene? {
        if let scene = provider.cached(key) { return scene }
        let cle = key.cacheKey
        guard !requested.contains(cle) else { return nil }
        requested.insert(cle)
        let provider = self.provider
        provider.prepare(key) {
            guard provider.cached(key) != nil else { return }
            onReady()
        }
        return nil
    }

    func isReady(_ key: ComposerLookSceneKey) -> Bool {
        provider.cached(key) != nil
    }

    func reset() {
        requested = []
    }
}

/// **La porte des trames de la bande** (#9351) : la cadence du palier, plus UNE
/// trame demandée quand une case n'a pas encore d'image — y compris figée
/// (`fps = 0`), sans quoi une bande armée à chaud resterait faite de glyphes.
nonisolated final class ComposerLookStripFrameGate: @unchecked Sendable {
    enum Admission: Equatable, Sendable {
        case refused
        /// Une trame au rythme du palier : toutes les cases vivent.
        case paced
        /// La trame demandée : seules les cases sans image se peignent.
        case requested
    }

    private let lock = NSLock()
    private let paced: ComposerFrameGate
    private var wanted = false

    init(fps: Int) {
        paced = ComposerFrameGate(fps: fps)
    }

    func setFPS(_ fps: Int) {
        paced.setFPS(fps)
    }

    func requestFrame() {
        lock.lock()
        defer { lock.unlock() }
        wanted = true
    }

    func admit(presentedAt time: TimeInterval) -> Admission {
        let rythme = paced.admit(presentedAt: time)
        lock.lock()
        defer { lock.unlock() }
        let demandee = wanted
        wanted = false
        if rythme { return .paced }
        return demandee ? .requested : .refused
    }
}

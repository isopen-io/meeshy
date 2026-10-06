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

/// **Une cuisson à la fois par clé, jamais une boucle** (#9351) : une clé en
/// cuisson ne se redemande pas ; une cuisson qui ÉCHOUE (mémoire, design absent)
/// se réessaie après un délai qui double, `maxRetries` fois au plus ; une scène
/// cuite puis ÉVINCÉE du cache partagé se recuit — la case retrouve son cadre.
/// La fin d'une cuisson ne redemande un dessin que si la scène est vraiment là.
final class ComposerLookStripScenes {
    /// Les nouveaux essais d'une cuisson qui échoue.
    static let maxRetries = 3
    /// Le premier délai avant un nouvel essai ; il double à chaque échec.
    static let firstRetryDelay: TimeInterval = 0.5

    private struct Failure {
        let count: Int
        let retryAt: Date
    }

    private let provider: any ComposerLookSceneProviding
    private let now: () -> Date
    private var inFlight: Set<NSString> = []
    private var failures: [NSString: Failure] = [:]

    nonisolated deinit {}

    init(provider: any ComposerLookSceneProviding, now: @escaping () -> Date = { Date() }) {
        self.provider = provider
        self.now = now
    }

    func scene(for key: ComposerLookSceneKey,
               onReady: @escaping @MainActor @Sendable () -> Void) -> CallLiveFrameScene? {
        let cle = key.cacheKey
        if let scene = provider.cached(key) {
            failures[cle] = nil
            return scene
        }
        guard !inFlight.contains(cle), mayRetry(cle) else { return nil }
        inFlight.insert(cle)
        let provider = self.provider
        provider.prepare(key) { [weak self] in
            let cuite = provider.cached(key) != nil
            self?.settle(key.cacheKey, baked: cuite)
            guard cuite else { return }
            onReady()
        }
        return nil
    }

    func isReady(_ key: ComposerLookSceneKey) -> Bool {
        provider.cached(key) != nil
    }

    func reset() {
        inFlight = []
        failures = [:]
    }

    private func mayRetry(_ cle: NSString) -> Bool {
        guard let echec = failures[cle] else { return true }
        return echec.count <= Self.maxRetries && now() >= echec.retryAt
    }

    private func settle(_ cle: NSString, baked: Bool) {
        inFlight.remove(cle)
        guard !baked else {
            failures[cle] = nil
            return
        }
        let compte = (failures[cle]?.count ?? 0) + 1
        let delai = Self.firstRetryDelay * pow(2, Double(compte - 1))
        failures[cle] = Failure(count: compte, retryAt: now().addingTimeInterval(delai))
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

import Foundation

/// **LA FENÊTRE DE PRÉCHARGEMENT DES RÉELS (#9702)** — PURE, et jumelle de
/// `apps/web/src/lib/reels/preload-window.ts` : toute évolution touche les deux,
/// mêmes constantes, mêmes cas, mêmes témoins (`ReelPreloadWindowTests` ↔
/// `preload-window.test.ts`).
///
/// Elle répond à deux questions, depuis l'USAGE observé et jamais depuis un
/// réglage : jusqu'où préparer devant et derrière le réel regardé, et jusqu'où
/// préparer chacun.
///
/// - **Le plancher est N−2…N+2, toujours** (directive porteur 2026-10-08).
///   Aucune contrainte ne le baisse.
/// - **Devant, la cadence élargit** : la MÉDIANE du temps passé par réel (un
///   arrêt long isolé ne referme pas la fenêtre d'un balayeur) — 1 s ou moins
///   ⇒ dix, 10 s ou plus ⇒ deux, une pente continue entre les deux.
/// - **Derrière, les retours en arrière élargissent** : au moins un tiers de
///   retours ⇒ derrière autant que devant ; sinon le plancher.
/// - **La contrainte plafonne** : données économisées, 2G, batterie faible —
///   et, propre à iOS, un appareil qui chauffe (`.serious` ou pire) — rendent
///   le plancher ; 3G ou peu de mémoire (≤ 2 Go) plafonnent à quatre.
///
/// Les PALIERS (`tier(offset:in:)`) suivent la rareté de la ressource : un
/// décodeur matériel est cher et borné (N±1 seulement le tient), un élément
/// monté coûte peu (N±2), des octets ne coûtent que du réseau.
///
/// Ce que iOS ajoute à la jumelle, sans rien en retrancher : `thermalState`
/// dans le contexte (le web ne le lit pas), `Network(snapshot:)` (le web lit
/// `navigator.connection`, iOS le chemin `NWPath`), `gigabytes(physicalMemory:)`
/// et `plan(count:activeIndex:window:)`, qui énumère les paliers dans l'ordre
/// de `primeTargets` en y gardant le palier « décode ».
public enum ReelPreloadWindow {

    public static let minRadius = 2
    public static let maxRadius = 10

    static let historyLength = 12
    /// Un réel traversé d'un trait par le défilement n'a pas été « regardé ».
    static let traversalMs = 150
    static let constrainedRadius = 4
    static let lowMemoryGb: Double = 2

    // MARK: - Types

    public enum VisitDirection: Sendable, Equatable {
        case forward, backward
    }

    public struct Visit: Sendable, Equatable {
        public let dwellMs: Int
        public let direction: VisitDirection

        public init(dwellMs: Int, direction: VisitDirection) {
            self.dwellMs = dwellMs
            self.direction = direction
        }
    }

    public enum ConnectionType: Sendable, Equatable {
        case slow2G, twoG, threeG, fourG
    }

    public struct Network: Sendable, Equatable {
        public let effectiveType: ConnectionType?
        public let saveData: Bool

        public init(effectiveType: ConnectionType? = nil, saveData: Bool = false) {
            self.effectiveType = effectiveType
            self.saveData = saveData
        }

        /// iOS ne connaît pas le débit effectif d'un chemin. Le mode « données
        /// réduites » (`isConstrained`) est l'équivalent exact de `saveData` ;
        /// un chemin CHER (cellulaire, point d'accès) reçoit le plafond du 3G :
        /// chaque octet préchargé y est facturé à l'utilisateur.
        public init(snapshot: NetworkPathSnapshot) {
            self.init(
                effectiveType: snapshot.isExpensive ? .threeG : nil,
                saveData: snapshot.isConstrained
            )
        }
    }

    public struct Context: Sendable {
        public let visits: [Visit]
        public let network: Network
        public let deviceMemoryGb: Double?
        public let lowPower: Bool
        public let thermalState: ProcessInfo.ThermalState

        public init(
            visits: [Visit],
            network: Network,
            deviceMemoryGb: Double? = nil,
            lowPower: Bool = false,
            thermalState: ProcessInfo.ThermalState = .nominal
        ) {
            self.visits = visits
            self.network = network
            self.deviceMemoryGb = deviceMemoryGb
            self.lowPower = lowPower
            self.thermalState = thermalState
        }
    }

    public struct Window: Sendable, Equatable {
        public let ahead: Int
        public let behind: Int

        public init(ahead: Int, behind: Int) {
            self.ahead = ahead
            self.behind = behind
        }
    }

    public enum Tier: Sendable, Equatable {
        case play, decode, mount, prime, idle
    }

    public struct PrimeTarget: Sendable, Equatable {
        public let url: String
        public let bytes: Int
    }

    /// Un réel à préparer : sa place dans le fil et son palier.
    public struct Step: Sendable, Equatable {
        public let index: Int
        public let offset: Int
        public let tier: Tier
    }

    // MARK: - La fenêtre

    public static func window(for context: Context) -> Window {
        let cap = constraintCap(context)
        let ahead = clampRadius(cadenceRadius(context.visits), cap: cap)
        let backward = context.visits.filter { $0.direction == .backward }.count
        let returning = !context.visits.isEmpty && backward * 3 >= context.visits.count
        return Window(ahead: ahead, behind: returning ? ahead : minRadius)
    }

    /// `offset` = index du réel − index du réel regardé (négatif : derrière).
    public static func tier(offset: Int, in window: Window) -> Tier {
        let distance = abs(offset)
        if distance == 0 { return .play }
        if distance > (offset > 0 ? window.ahead : window.behind) { return .idle }
        if distance == 1 { return .decode }
        return distance == 2 ? .mount : .prime
    }

    static let mountPrimeBytes = 1_536 * 1_024
    static let nearPrimeBytes = 768 * 1_024
    static let farPrimeBytes = 256 * 1_024

    /// Les octets de TÊTE à amorcer (jumelle de `primeBytesOf`). iOS télécharge
    /// aujourd'hui le fichier entier par le registre partagé ; la fonction est
    /// tenue ici pour que la loi reste UNE, et pour l'amorce par plage le jour
    /// où le registre la saura servir.
    public static func primeBytes(tier: Tier, distance: Int, network: Network) -> Int {
        guard tier == .mount || tier == .prime else { return 0 }
        let base = tier == .mount ? mountPrimeBytes : (distance <= 3 ? nearPrimeBytes : farPrimeBytes)
        let constrained = network.saveData || network.effectiveType == .slow2G || network.effectiveType == .twoG
        return constrained ? base / 4 : base
    }

    /// Jumelle de `recordVisit` : l'historique borné, la traversée ignorée.
    public static func recording(_ visit: Visit, into history: [Visit]) -> [Visit] {
        guard visit.dwellMs >= traversalMs else { return history }
        return Array((history + [visit]).suffix(historyLength))
    }

    /// Jumelle de `primeTargetsOf` : le plus proche d'abord, DEVANT avant
    /// derrière à distance égale, une source répétée une seule fois.
    public static func primeTargets(urls: [String?], activeIndex: Int, window: Window, network: Network) -> [PrimeTarget] {
        let candidates = orderedOffsets(window: window).compactMap { offset -> PrimeTarget? in
            let index = activeIndex + offset
            guard urls.indices.contains(index), let url = urls[index] else { return nil }
            let bytes = Self.primeBytes(tier: Self.tier(offset: offset, in: window), distance: abs(offset), network: network)
            return bytes == 0 ? nil : PrimeTarget(url: url, bytes: bytes)
        }
        return candidates.enumerated()
            .filter { position, candidate in candidates.firstIndex(where: { $0.url == candidate.url }) == position }
            .map(\.element)
    }

    /// Les réels à préparer, dans l'ordre de `primeTargets` — le palier
    /// « décode » compris, le réel joué et les « idle » exclus.
    public static func plan(count: Int, activeIndex: Int, window: Window) -> [Step] {
        orderedOffsets(window: window).compactMap { offset -> Step? in
            let index = activeIndex + offset
            guard index >= 0, index < count else { return nil }
            let stepTier = Self.tier(offset: offset, in: window)
            return stepTier == .idle ? nil : Step(index: index, offset: offset, tier: stepTier)
        }
    }

    /// `ProcessInfo.physicalMemory` en gigaoctets binaires — ce que le web
    /// reçoit de `navigator.deviceMemory`.
    public static func gigabytes(physicalMemory: UInt64) -> Double {
        Double(physicalMemory) / 1_073_741_824
    }

    // MARK: - Interne

    private static func orderedOffsets(window: Window) -> [Int] {
        let reach = max(window.ahead, window.behind)
        guard reach > 0 else { return [] }
        return (1...reach).flatMap { [$0, -$0] }
    }

    private static func clampRadius(_ radius: Int, cap: Int) -> Int {
        max(minRadius, min(cap, maxRadius, radius))
    }

    private static func median(_ values: [Int]) -> Double {
        let sorted = values.sorted()
        let middle = sorted.count / 2
        guard !sorted.isEmpty else { return 0 }
        if sorted.count % 2 == 1 { return Double(sorted[middle]) }
        return Double(sorted[middle - 1] + sorted[middle]) / 2
    }

    private static func cadenceRadius(_ visits: [Visit]) -> Int {
        guard !visits.isEmpty else { return minRadius }
        let dwell = median(visits.map(\.dwellMs))
        if dwell <= 1_000 { return maxRadius }
        if dwell >= 10_000 { return minRadius }
        let slope = (10_000 - dwell) / 9_000 * Double(maxRadius - minRadius)
        return Int((Double(minRadius) + slope).rounded())
    }

    private static func constraintCap(_ context: Context) -> Int {
        let network = context.network
        if context.lowPower || network.saveData { return minRadius }
        if context.thermalState == .serious || context.thermalState == .critical { return minRadius }
        if network.effectiveType == .slow2G || network.effectiveType == .twoG { return minRadius }
        if network.effectiveType == .threeG { return constrainedRadius }
        if let memory = context.deviceMemoryGb, memory <= lowMemoryGb { return constrainedRadius }
        return maxRadius
    }
}

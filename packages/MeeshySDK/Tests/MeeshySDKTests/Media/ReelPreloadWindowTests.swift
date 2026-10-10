import Foundation
import Testing
@testable import MeeshySDK

/// **La fenêtre de préchargement des réels (#9702)** — pure : combien de réels
/// préparer devant et derrière celui qu'on regarde, et jusqu'où chacun l'est.
///
/// Miroir ligne à ligne de `apps/web/src/lib/reels/preload-window.test.ts` :
/// les deux lois sont jumelles, leurs témoins le sont aussi. Les cas propres à
/// iOS (état thermique, chemin réseau, plan des paliers) sont en fin de suite.
@Suite("ReelPreloadWindow — la fenêtre de préchargement des réels")
struct ReelPreloadWindowTests {

    // MARK: - Fabriques

    typealias Law = ReelPreloadWindow

    static func context(
        visits: [Law.Visit] = [],
        network: Law.Network = Law.Network(effectiveType: .fourG, saveData: false),
        deviceMemoryGb: Double? = nil,
        lowPower: Bool = false,
        thermalState: ProcessInfo.ThermalState = .nominal
    ) -> Law.Context {
        Law.Context(visits: visits, network: network, deviceMemoryGb: deviceMemoryGb,
                    lowPower: lowPower, thermalState: thermalState)
    }

    static func visits(_ dwellsMs: [Int], _ direction: Law.VisitDirection = .forward) -> [Law.Visit] {
        dwellsMs.map { Law.Visit(dwellMs: $0, direction: direction) }
    }

    static let frantic = visits([600, 500, 700, 400, 650])

    // MARK: - Toujours N−2 à N+2, au moins

    @Test("sans historique, la fenêtre est le plancher : deux de chaque côté")
    func floorWithoutHistory() {
        #expect(Law.window(for: Self.context()) == Law.Window(ahead: Law.minRadius, behind: Law.minRadius))
        #expect(Law.minRadius == 2)
        #expect(Law.maxRadius == 10)
    }

    @Test("même sous la contrainte la plus forte, le plancher tient")
    func floorUnderStarvation() {
        let starved = Self.context(
            visits: Self.visits([400, 500, 300, 450]),
            network: Law.Network(effectiveType: .slow2G, saveData: true),
            deviceMemoryGb: 1,
            lowPower: true,
            thermalState: .critical
        )
        #expect(Law.window(for: starved) == Law.Window(ahead: 2, behind: 2))
    }

    // MARK: - La cadence élargit DEVANT

    @Test("un lecteur qui regarde chaque réel longtemps garde le plancher")
    func slowReaderKeepsFloor() {
        #expect(Law.window(for: Self.context(visits: Self.visits([12_000, 15_000, 9_000]))).ahead == 2)
    }

    @Test("plus on balaie vite, plus on prépare loin, jusqu'à dix")
    func cadenceWidens() {
        let calm = Law.window(for: Self.context(visits: Self.visits([5_000, 4_000, 5_500]))).ahead
        let brisk = Law.window(for: Self.context(visits: Self.visits([2_000, 2_500, 1_800]))).ahead
        let frantic = Law.window(for: Self.context(visits: Self.frantic)).ahead
        #expect(calm > 2)
        #expect(brisk > calm)
        #expect(frantic == Law.maxRadius)
    }

    @Test("la pente : 5 s de médiane donnent 6, comme le web (Math.round)")
    func cadenceSlopeMatchesTheWeb() {
        // 2 + (10 000 − 5 000) / 9 000 × 8 = 6,44… → 6
        #expect(Law.window(for: Self.context(visits: Self.visits([5_000]))).ahead == 6)
        // 2 + (10 000 − 2 125) / 9 000 × 8 = 9,0 → 9 (médiane paire : (2 000 + 2 250) / 2)
        #expect(Law.window(for: Self.context(visits: Self.visits([2_000, 2_250]))).ahead == 9)
    }

    @Test("la médiane, pas la moyenne : un seul arrêt long ne referme pas la fenêtre d'un balayeur")
    func medianNotMean() {
        let withOnePause = Law.window(for: Self.context(visits: Self.visits([600, 500, 60_000, 700, 400]))).ahead
        #expect(withOnePause == Law.maxRadius)
    }

    // MARK: - DERRIÈRE, la fenêtre suit les retours

    @Test("un balayeur qui ne revient jamais garde derrière le seul plancher")
    func forwardOnlyKeepsBehindFloor() {
        #expect(Law.window(for: Self.context(visits: Self.visits([600, 500, 700, 400]))).behind == 2)
    }

    @Test("un lecteur qui revient souvent en arrière est servi autant derrière que devant")
    func returningReaderIsServedBehind() {
        let mixed = Self.visits([600, 500], .forward)
            + Self.visits([700, 400], .backward)
            + Self.visits([500], .forward)
            + Self.visits([600], .backward)
        let window = Law.window(for: Self.context(visits: mixed))
        #expect(window.behind == window.ahead)
    }

    // MARK: - La contrainte plafonne, jamais sous deux

    @Test("les données économisées ou un réseau 2G rendent le plancher")
    func saveDataAnd2GGiveTheFloor() {
        #expect(Law.window(for: Self.context(visits: Self.frantic, network: Law.Network(saveData: true))).ahead == 2)
        #expect(Law.window(for: Self.context(visits: Self.frantic, network: Law.Network(effectiveType: .twoG))).ahead == 2)
    }

    @Test("un réseau 3G plafonne à quatre")
    func threeGCapsAtFour() {
        #expect(Law.window(for: Self.context(visits: Self.frantic, network: Law.Network(effectiveType: .threeG))).ahead == 4)
    }

    @Test("un appareil à peu de mémoire plafonne à quatre")
    func lowMemoryCapsAtFour() {
        #expect(Law.window(for: Self.context(visits: Self.frantic, deviceMemoryGb: 2)).ahead == 4)
    }

    @Test("la batterie faible rend le plancher")
    func lowPowerGivesTheFloor() {
        #expect(Law.window(for: Self.context(visits: Self.frantic, lowPower: true)).ahead == 2)
    }

    @Test("un réseau inconnu ne plafonne pas")
    func unknownNetworkDoesNotCap() {
        #expect(Law.window(for: Self.context(visits: Self.frantic, network: Law.Network())).ahead == Law.maxRadius)
    }

    // MARK: - Paliers

    static let asymmetric = Law.Window(ahead: 6, behind: 3)

    @Test("le réel regardé joue, ses voisins immédiats ont leur première image décodée")
    func playAndDecode() {
        #expect(Law.tier(offset: 0, in: Self.asymmetric) == .play)
        #expect(Law.tier(offset: 1, in: Self.asymmetric) == .decode)
        #expect(Law.tier(offset: -1, in: Self.asymmetric) == .decode)
    }

    @Test("à deux pas, l'élément est monté ; au-delà et dans la fenêtre, seuls les octets")
    func mountAndPrime() {
        #expect(Law.tier(offset: 2, in: Self.asymmetric) == .mount)
        #expect(Law.tier(offset: -2, in: Self.asymmetric) == .mount)
        #expect(Law.tier(offset: 3, in: Self.asymmetric) == .prime)
        #expect(Law.tier(offset: 6, in: Self.asymmetric) == .prime)
        #expect(Law.tier(offset: -3, in: Self.asymmetric) == .prime)
    }

    @Test("hors de la fenêtre, rien — et la fenêtre est asymétrique")
    func idleOutsideTheWindow() {
        #expect(Law.tier(offset: 7, in: Self.asymmetric) == .idle)
        #expect(Law.tier(offset: -4, in: Self.asymmetric) == .idle)
    }

    // MARK: - Amorce

    @Test("rien à amorcer pour un réel qui joue, décode ou est hors fenêtre")
    func noPrimeBytesOutsideMountAndPrime() {
        #expect(Law.primeBytes(tier: .play, distance: 0, network: Law.Network()) == 0)
        #expect(Law.primeBytes(tier: .decode, distance: 1, network: Law.Network()) == 0)
        #expect(Law.primeBytes(tier: .idle, distance: 9, network: Law.Network()) == 0)
    }

    @Test("le réel monté et le premier amorcé prennent plus que les lointains")
    func primeBytesDecreaseWithDistance() {
        let open = Law.Network(effectiveType: .fourG)
        let mount = Law.primeBytes(tier: .mount, distance: 2, network: open)
        let near = Law.primeBytes(tier: .prime, distance: 3, network: open)
        let far = Law.primeBytes(tier: .prime, distance: 9, network: open)
        #expect(mount > near)
        #expect(near > far)
        #expect(far > 0)
    }

    @Test("les données économisées divisent l'amorce")
    func saveDataDividesPrimeBytes() {
        let open = Law.primeBytes(tier: .mount, distance: 2, network: Law.Network(effectiveType: .fourG))
        let saving = Law.primeBytes(tier: .mount, distance: 2, network: Law.Network(saveData: true))
        #expect(saving < open)
        #expect(saving > 0)
    }

    // MARK: - Historique

    @Test("un réel traversé d'un trait (moins de 150 ms) ne compte pas comme une visite")
    func traversalIsNotAVisit() {
        #expect(Law.recording(Law.Visit(dwellMs: 80, direction: .forward), into: []) == [])
    }

    @Test("garde les douze dernières visites, la plus récente en dernier")
    func historyIsBounded() {
        let history = (0..<12).map { Law.Visit(dwellMs: 1_000 + $0, direction: .forward) }
        let next = Law.recording(Law.Visit(dwellMs: 9_999, direction: .backward), into: history)
        #expect(next.count == 12)
        #expect(next.first?.dwellMs == 1_001)
        #expect(next.last == Law.Visit(dwellMs: 9_999, direction: .backward))
    }

    // MARK: - Cibles de l'amorceur (jumelle de `primeTargetsOf`)

    static let urls: [String?] = ["u0", "u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"]

    @Test("seuls les paliers « monté » et « amorcé » ; devant avant derrière à distance égale")
    func primeTargetsOrder() {
        let targets = Law.primeTargets(urls: Self.urls, activeIndex: 4,
                                       window: Law.Window(ahead: 4, behind: 3),
                                       network: Law.Network(effectiveType: .fourG))
        #expect(targets.map(\.url) == ["u6", "u2", "u7", "u1", "u8"])
        #expect(targets.allSatisfy { $0.bytes > 0 })
    }

    @Test("un réel sans média lisible (image, scène) ne s'amorce pas")
    func primeTargetsSkipUnplayable() {
        let sparse: [String?] = ["u0", nil, "u2", nil, "u4"]
        let targets = Law.primeTargets(urls: sparse, activeIndex: 0,
                                       window: Law.Window(ahead: 4, behind: 2), network: Law.Network())
        #expect(targets.map(\.url) == ["u2", "u4"])
    }

    @Test("une même source répétée ne s'amorce qu'une fois")
    func primeTargetsDeduplicate() {
        let targets = Law.primeTargets(urls: ["a", "x", "b", "x", "x"], activeIndex: 0,
                                       window: Law.Window(ahead: 4, behind: 2), network: Law.Network())
        #expect(targets.map(\.url) == ["b", "x"])
    }

    // MARK: - iOS : thermique, chemin réseau, plan

    @Test("un appareil qui chauffe (sérieux ou critique) rend le plancher")
    func hotDeviceGivesTheFloor() {
        #expect(Law.window(for: Self.context(visits: Self.frantic, thermalState: .serious)).ahead == 2)
        #expect(Law.window(for: Self.context(visits: Self.frantic, thermalState: .critical)).ahead == 2)
        #expect(Law.window(for: Self.context(visits: Self.frantic, thermalState: .fair)).ahead == Law.maxRadius)
    }

    @Test("le mode données réduites vaut « données économisées », un chemin cher vaut le 3G")
    func networkFromPathSnapshot() {
        let lowData = Law.Network(snapshot: NetworkPathSnapshot(isSatisfied: true, isConstrained: true, isExpensive: true, usesCellular: true))
        let cellular = Law.Network(snapshot: NetworkPathSnapshot(isSatisfied: true, isExpensive: true, usesCellular: true))
        let wifi = Law.Network(snapshot: NetworkPathSnapshot(isSatisfied: true, usesWiFi: true))
        #expect(lowData.saveData)
        #expect(cellular == Law.Network(effectiveType: .threeG, saveData: false))
        #expect(wifi == Law.Network())
    }

    @Test("la mémoire physique se lit en gigaoctets, un iPhone de 2 Go reste sous le seuil")
    func physicalMemoryInGigabytes() {
        let twoGigabyteDevice: UInt64 = 2_013_265_920
        #expect(Law.gigabytes(physicalMemory: twoGigabyteDevice) <= 2)
        #expect(Law.gigabytes(physicalMemory: 6 * 1_073_741_824) == 6)
    }

    @Test("le plan : le plus proche d'abord, devant avant derrière, sans le réel joué ni les idle")
    func planOrdersNearestFirst() {
        let plan = Law.plan(count: 9, activeIndex: 4, window: Law.Window(ahead: 4, behind: 3))
        #expect(plan.map(\.index) == [5, 3, 6, 2, 7, 1, 8])
        #expect(plan.map(\.tier) == [.decode, .decode, .mount, .mount, .prime, .prime, .prime])
    }

    @Test("l'horloge des visites : le temps passé sur le réel quitté, et le sens du geste")
    func visitClockRecordsDwellAndDirection() {
        let start = Date(timeIntervalSinceReferenceDate: 0)
        var clock = Law.VisitClock()
        clock.enter(index: 4, at: start)
        clock.enter(index: 5, at: start.addingTimeInterval(2.5))
        clock.enter(index: 4, at: start.addingTimeInterval(3.1))
        #expect(clock.visits == [
            Law.Visit(dwellMs: 2_500, direction: .forward),
            Law.Visit(dwellMs: 600, direction: .backward),
        ])
    }

    @Test("l'horloge ignore un réel ré-annoncé et une traversée d'un trait")
    func visitClockIgnoresRepeatsAndTraversals() {
        let start = Date(timeIntervalSinceReferenceDate: 0)
        var clock = Law.VisitClock()
        clock.enter(index: 0, at: start)
        clock.enter(index: 0, at: start.addingTimeInterval(1))
        clock.enter(index: 1, at: start.addingTimeInterval(1.05))
        #expect(clock.visits == [Law.Visit(dwellMs: 1_050, direction: .forward)])
        clock.enter(index: 2, at: start.addingTimeInterval(1.10))
        #expect(clock.visits.count == 1, "50 ms sur un réel : traversé, pas regardé")
    }

    @Test("le plan s'arrête aux bords du fil")
    func planStopsAtTheEdges() {
        let plan = Law.plan(count: 3, activeIndex: 0, window: Law.Window(ahead: 10, behind: 10))
        #expect(plan.map(\.index) == [1, 2])
        #expect(Law.plan(count: 0, activeIndex: 0, window: Law.Window(ahead: 2, behind: 2)).isEmpty)
    }
}

import Foundation
import Testing
@testable import MeeshySDK

/// La file des invitations à immortaliser (#20653, tranche iOS de #20643) : miroir de `createPhotoAlerts`
/// (`apps/web/src/lib/game-photo/alerts.ts`), témoins tirés de `alerts.test.ts`. La loi est pure : la mémoire
/// appareil d'un compte entre, la mémoire suivante et la décision sortent ; l'hôte de l'app la range et accuse.
@Suite("Jeu Meeshy — la file des invitations à immortaliser")
struct GamePhotoAlertQueueTests {

    private static let minute = 60_000
    private static let hour = 60 * minute
    private static let t0 = 1_792_670_400_000

    private static func standing(flame: Int = 0, minted: Int = 0) -> PhotoCatchUpStanding {
        PhotoCatchUpStanding(flameRecord: flame).with(minted: minted)
    }

    private static func photo(invitations: PhotoInvitationsSetting = .every, baseline: PhotoCatchUpStanding? = nil,
                              moments: [GamePhotoMomentRow] = []) -> GamePhotoBlock {
        GamePhotoBlock(atmosphere: nil, invitations: invitations, baselineAt: nil, baseline: baseline,
                       treasuryPeakTier: nil, moments: moments)
    }

    private static func pacing(now: Int = t0, sessionStartedAt: Int? = t0 - hour, surface: PhotoAlertPacing.Surface = .passive,
                               memory: PhotoAlertMemory) -> PhotoAlertPacing {
        PhotoAlertPacing(now: now, dayKey: "2026-10-22", sessionStartedAt: sessionStartedAt, surface: surface, shown: memory.shown)
    }

    private static func row(_ stepId: String, presentedAt: String? = nil, notifiedAt: String? = nil, keptAt: String? = nil) -> GamePhotoMomentRow {
        GamePhotoMomentRow(stepId: stepId, detectedAt: nil, presentedAt: presentedAt, notifiedAt: notifiedAt, keptAt: keptAt)
    }

    /// Une lecture passive complète : observer, puis décider si une étape neuve est trouvée.
    private static func read(_ memory: PhotoAlertMemory, _ standing: PhotoCatchUpStanding, photo: GamePhotoBlock? = nil,
                             known: [String] = [], now: Int = t0, sessionStartedAt: Int? = t0 - hour) -> (GamePhotoAlertQueue.Decision, PhotoAlertMemory) {
        switch GamePhotoAlertQueue.observe(memory: memory, standing: standing, photo: photo) {
        case .baseline(let next): return (.none(next), next)
        case .unchanged(let next): return (.none(next ?? memory), next ?? memory)
        case .reached(let reached):
            let decision = GamePhotoAlertQueue.decide(
                memory: memory, reached: reached, standing: standing, photo: photo, notebookKept: [], notebookKnown: known,
                pacing: pacing(now: now, sessionStartedAt: sessionStartedAt, memory: memory))
            return (decision, decision.memory ?? memory)
        }
    }

    private static func alert(_ decision: GamePhotoAlertQueue.Decision) -> PhotoAlert? {
        if case .alert(let alert, _) = decision { return alert }
        return nil
    }

    @Test("la première lecture d'un compte n'alerte pas : la situation est gardée")
    func firstReadIsTheBaseline() {
        let observed = GamePhotoAlertQueue.observe(memory: .empty, standing: Self.standing(flame: 30), photo: nil)
        #expect(observed == .baseline(PhotoAlertMemory(standing: Self.standing(flame: 30), shown: [], noticed: [])))
    }

    @Test("la Flamme constatée à 7 jours après la ligne de base : l'étape annoncée et proposée")
    func flameSevenIsAnnounced() {
        let (_, memory) = Self.read(.empty, Self.standing(flame: 6))
        let (decision, next) = Self.read(memory, Self.standing(flame: 7))
        #expect(Self.alert(decision) == PhotoAlert(announce: "flame:7", propose: "flame:7", reached: ["flame:7"]))
        #expect(next.standing == Self.standing(flame: 7), "la situation avance dès qu'une étape est décidée")
    }

    @Test("la dixième Meesh sans la première : Meesh 10 annoncée, Meesh 1 proposée")
    func tenthMeeshProposesTheFirst() {
        let (_, memory) = Self.read(.empty, Self.standing(minted: 9))
        let (decision, _) = Self.read(memory, Self.standing(minted: 10))
        #expect(Self.alert(decision)?.announce == "meesh:10")
        #expect(Self.alert(decision)?.propose == "meesh:1")
    }

    @Test("pendant les dix premières minutes d'une session, l'étape passive ATTEND, sans toucher la mémoire")
    func sessionGraceWaits() {
        let (_, memory) = Self.read(.empty, Self.standing(flame: 6))
        let (waiting, kept) = Self.read(memory, Self.standing(flame: 7), sessionStartedAt: Self.t0)
        #expect(waiting == .wait)
        #expect(kept == memory)
        let (later, _) = Self.read(kept, Self.standing(flame: 7), now: Self.t0 + 11 * Self.minute, sessionStartedAt: Self.t0)
        #expect(Self.alert(later)?.propose == "flame:7")
    }

    @Test("notifiée, présentée ailleurs ou immortalisée ailleurs : rien, et l'étape ne reste pas en embuscade")
    func servedRegistrySilences() {
        let (_, memory) = Self.read(.empty, Self.standing(flame: 6))
        for row in [Self.row("flame:7", notifiedAt: "2026-10-22T10:00:00Z"), Self.row("flame:7", presentedAt: "2026-10-22T10:00:00Z"),
                    Self.row("flame:7", keptAt: "2026-10-22T10:00:00Z")] {
            let (decision, next) = Self.read(memory, Self.standing(flame: 7), photo: Self.photo(moments: [row]))
            #expect(decision == .none(next))
            #expect(Self.read(next, Self.standing(flame: 7)).0 == .none(next))
        }
    }

    @Test("réglage « jamais » : aucune invitation, mais la situation avance")
    func neverStillAdvances() {
        let (_, memory) = Self.read(.empty, Self.standing(flame: 6))
        let (decision, next) = Self.read(memory, Self.standing(flame: 7), photo: Self.photo(invitations: .never))
        #expect(Self.alert(decision) == nil)
        #expect(next.standing == Self.standing(flame: 7))
    }

    @Test("la ligne de base SERVIE l'emporte : une étape franchie avant elle ne s'annonce pas")
    func servedBaselineWins() {
        let served = Self.photo(baseline: Self.standing(flame: 7))
        let (_, memory) = Self.read(.empty, Self.standing(flame: 6), photo: served)
        #expect(Self.alert(Self.read(memory, Self.standing(flame: 7), photo: served).0) == nil)
    }

    @Test("une étape que le carnet de l'appareil connaît ne se repropose pas")
    func knownToTheNotebookIsSilent() {
        let (_, memory) = Self.read(.empty, Self.standing(minted: 9))
        #expect(Self.alert(Self.read(memory, Self.standing(minted: 10), known: ["meesh:1"]).0) == nil)
    }

    @Test("rien de neuf : la mémoire ne se réécrit que si la situation a bougé")
    func unchangedRewritesOnlyOnMove() {
        let (_, memory) = Self.read(.empty, Self.standing(flame: 8))
        #expect(GamePhotoAlertQueue.observe(memory: memory, standing: Self.standing(flame: 8), photo: nil) == .unchanged(nil))
        #expect(GamePhotoAlertQueue.observe(memory: memory, standing: PhotoCatchUpStanding(levelRecord: 2, flameRecord: 8), photo: nil)
                    == .unchanged(PhotoAlertMemory(standing: PhotoCatchUpStanding(levelRecord: 2, flameRecord: 8), shown: [], noticed: [])))
    }

    @Test("afficher l'invitation accuse les étapes atteintes ET l'étape proposée, et règle le rythme")
    func displayedAcknowledgesAndPaces() throws {
        let (_, memory) = Self.read(.empty, Self.standing(minted: 9))
        let (decision, next) = Self.read(memory, Self.standing(minted: 10))
        let alert = try #require(Self.alert(decision))
        let shown = GamePhotoAlertQueue.displayed(memory: next, alert: alert, at: Self.t0, dayKey: "2026-10-22")
        #expect(shown.acknowledge == ["meesh:10", "meesh:1"])
        #expect(shown.memory.shown == [PhotoAlertPacing.Shown(at: Self.t0, dayKey: "2026-10-22")])
        #expect(shown.memory.noticed == ["meesh:10", "meesh:1"])
        let (silent, _) = Self.read(shown.memory, Self.standing(flame: 7, minted: 10), now: Self.t0 + Self.hour)
        #expect(Self.alert(silent) == nil, "l'écart minimal et le plafond du jour rendent la suivante silencieuse")
    }

    @Test("le rythme ne garde que les douze dernières invitations montrées")
    func shownIsBounded() {
        let alert = PhotoAlert(announce: "flame:7", propose: "flame:7", reached: ["flame:7"])
        let memory = (0..<20).reduce(PhotoAlertMemory.empty) { memory, index in
            GamePhotoAlertQueue.displayed(memory: memory, alert: alert, at: index, dayKey: "2026-10-22").memory
        }
        #expect(memory.shown.count == GamePhotoAlertQueue.shownKept)
        #expect(memory.shown.first?.at == 8)
        #expect(memory.noticed == ["flame:7"])
    }

    @Test("un geste ne connaît pas le délai de grâce ; la journée cède à une étape de piste (D6)")
    func gestureAdmission() {
        #expect(GamePhotoAlertQueue.admitted(["flame:7", "day:2026-10-22"]) == ["flame:7"])
        #expect(GamePhotoAlertQueue.admitted(["day:2026-10-22"]) == ["day:2026-10-22"])
        let memory = PhotoAlertMemory(standing: Self.standing(flame: 6), shown: [], noticed: [])
        let decision = GamePhotoAlertQueue.decide(
            memory: memory, reached: ["flame:7"], standing: Self.standing(flame: 7), photo: nil, notebookKept: [], notebookKnown: [],
            pacing: Self.pacing(sessionStartedAt: Self.t0, surface: .gesture, memory: memory))
        #expect(Self.alert(decision)?.propose == "flame:7")
    }

    @Test("la pastille s'éteint à la visite du carnet")
    func carnetVisitedClearsTheBadge() {
        let memory = PhotoAlertMemory(standing: Self.standing(), shown: [], noticed: ["flame:7"])
        #expect(memory.hasNotice)
        #expect(!GamePhotoAlertQueue.carnetVisited(memory).hasNotice)
    }

    @Test("la mémoire se range et se relit à l'identique ; illisible, elle vaut « vide »")
    func memoryRoundTrips() throws {
        let memory = PhotoAlertMemory(standing: PhotoCatchUpStanding(rank: .ambassadeur, division: .iv, levelRecord: 30, minted: 12,
                                                                     treasuryTier: .coffret, flameRecord: 9),
                                      shown: [PhotoAlertPacing.Shown(at: Self.t0, dayKey: "2026-10-22")], noticed: ["rank:ambassadeur:4"])
        let data = try JSONEncoder().encode(memory)
        #expect(PhotoAlertMemory.read(data) == memory)
        #expect(PhotoAlertMemory.read(Data("{\"standing\":{\"rank\":\"astre\"}}".utf8)) == .empty)
        #expect(PhotoAlertMemory.read(nil) == .empty)
    }

    @Test("la journée locale se lit dans le fuseau donné")
    func localDayKey() throws {
        let paris = try #require(TimeZone(identifier: "Europe/Paris"))
        let tokyo = try #require(TimeZone(identifier: "Asia/Tokyo"))
        let lateEvening = 1_792_699_200_000
        #expect(GamePhotoAlertQueue.dayKey(at: lateEvening, timeZone: paris) == "2026-10-22")
        #expect(GamePhotoAlertQueue.dayKey(at: lateEvening, timeZone: tokyo) == "2026-10-23")
    }
}

private extension PhotoCatchUpStanding {
    func with(minted: Int) -> PhotoCatchUpStanding {
        PhotoCatchUpStanding(rank: rank, division: division, levelRecord: levelRecord, prestige: prestige, minted: minted,
                             treasuryTier: treasuryTier, flameRecord: flameRecord, pastCycleRecords: pastCycleRecords)
    }
}

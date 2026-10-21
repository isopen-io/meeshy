import XCTest
@testable import Meeshy
import MeeshySDK

/// LA CÉRÉMONIE DE LA FRAPPE sur iOS (#11177, épopée § 7) : la frappe arrive en dernier, le marteau reste levé tant
/// que la passerelle se tait, un refus ramène la lumière, un toucher passe la scène, « Réduire les animations » n'en
/// garde qu'un fondu, chaque coup vibre (le dernier plus fort) — et la scène est la MÊME que celle du web, nombre pour
/// nombre (valeurs relevées sur `apps/web/src/lib/game/choreography-mint-ceremony.ts`).
@MainActor
final class MintCeremonyTests: XCTestCase {

    // MARK: - Fabriques

    private final class Clock {
        var now: TimeInterval = 100
    }

    private func makeRun(edition: MeeshEdition = .silver, number: Int = 92, reduced: Bool = false,
                         clock: Clock = Clock()) -> (run: MintCeremonyRun, haptics: MockGameHaptics, finished: () -> Int) {
        let haptics = MockGameHaptics()
        var finishes = 0
        let run = MintCeremonyRun(edition: edition, number: number, reduced: reduced, modest: false, haptics: haptics,
                                  clock: { clock.now }, onFinish: { finishes += 1 })
        return (run, haptics, { finishes })
    }

    private func settled(_ outcome: GameMintSettlement.Outcome, key: Int) -> GameMintSettlement {
        GameMintSettlement(outcome: outcome, key: key)
    }

    // MARK: - La réponse qui compte est la première après le toucher

    func test_answer_beforeAnySettlement_isPending() {
        let request = MintCeremonyRequest(edition: .silver, number: 92, settled: settled(.refused(code: "NETWORK"), key: 3))
        XCTAssertEqual(request.answer(settled(.refused(code: "NETWORK"), key: 3)), .pending, "le refus d'AVANT le toucher ne compte pas")
        XCTAssertEqual(request.answer(nil), .pending)
    }

    func test_answer_aCoinSettledAfterTheTap_confirmsItsNumber() {
        let request = MintCeremonyRequest(edition: .silver, number: 92, settled: nil)
        XCTAssertEqual(request.answer(settled(.minted(number: 93), key: 1)), .confirmed(number: 93))
        XCTAssertEqual(request.answer(settled(.minted(number: nil), key: 1)), .confirmed(number: 92), "un ancien serveur : la pièce annoncée")
    }

    func test_answer_aRefusalSettledAfterTheTap_carriesItsCode() {
        let request = MintCeremonyRequest(edition: .gold, number: 100, settled: settled(.minted(number: 99), key: 4))
        XCTAssertEqual(request.answer(settled(.refused(code: "MINT_BLOCKED_BY_DEBT"), key: 5)), .refused(code: "MINT_BLOCKED_BY_DEBT"))
    }

    func test_settlement_insufficientIsARefusal_alreadyMintedIsACoin() {
        let insufficient = APIMeeshMintResult(status: "insufficient", balance: 3)
        XCTAssertEqual(GameMintSettlement.outcome(of: insufficient, preview: nil), .refused(code: "INSUFFICIENT_POINTS"))
        let replayed = APIMeeshMintResult(status: "already-minted", balance: 10, mintedLifetime: 13, number: 13, edition: .silver)
        XCTAssertEqual(GameMintSettlement.outcome(of: replayed, preview: nil), .minted(number: 13))
    }

    func test_settlement_aMissingNetworkIsSaidAsSuch() {
        XCTAssertEqual(GameMintSettlement.refusalCode(for: URLError(.notConnectedToInternet)), "NETWORK")
        XCTAssertEqual(GameMintCeremony.refusalReason(code: GameMintSettlement.refusalCode(for: URLError(.timedOut))), .offline)
        XCTAssertNil(GameMintSettlement.refusalCode(for: CocoaError(.fileNoSuchFile)))
    }

    // MARK: - Le marteau levé, la frappe en dernier

    func test_whileTheGatewayIsSilent_meoKeepsTheHammerRaised() {
        let plan = MintCeremonyRun.livePlan(edition: .silver, mode: .normal, answeredAtMs: nil, nowMs: 5500, modest: false)
        let frame = MintCeremonyChoreography.frame(plan, at: 5.5)
        XCTAssertGreaterThan(frame.hammerMeo.angle, MintCeremonyStage.wind - 3, "le marteau reste levé, il ne tombe pas")
        XCTAssertEqual(frame.coin.engraved, 0, "le flan n'est pas encore frappé")
        XCTAssertEqual(frame.flash, 0)
    }

    func test_theEngravingAppearsUnderTheHammer_onlyAtTheBlow() {
        let plan = GameMintCeremony.plan(edition: .silver, mode: .normal)
        let impact = Double(plan.strikes[0].impactMs) / 1000
        XCTAssertEqual(MintCeremonyChoreography.frame(plan, at: impact - 0.01).coin.engraved, 0)
        XCTAssertEqual(MintCeremonyChoreography.frame(plan, at: impact + 0.2).coin.engraved, 1)
        XCTAssertGreaterThan(MintCeremonyChoreography.frame(plan, at: impact + 0.05).flash, 0.5, "l'éclair du coup")
    }

    func test_thePrismScene_isTheWebSceneNumberForNumber() {
        let plan = GameMintCeremony.plan(edition: .prism, mode: .normal)
        let frame = MintCeremonyChoreography.frame(plan, at: 6.2)
        XCTAssertEqual(frame.hammerMeo.x, 260, accuracy: 1e-9)
        XCTAssertEqual(frame.hammerMeo.y, 347.7433158698748, accuracy: 1e-9)
        XCTAssertEqual(frame.hammerMeo.angle, -54, accuracy: 1e-9)
        XCTAssertEqual(frame.coin.y, 488, accuracy: 1e-9)
        XCTAssertEqual(frame.coin.scale, 0.7733333333333333, accuracy: 1e-9)
        XCTAssertEqual(frame.coin.squash, 0.9783688103937541, accuracy: 1e-9)
        XCTAssertEqual(frame.mee.y, 406.9971571709854, accuracy: 1e-9)
        XCTAssertEqual(frame.tchak.opacity, 0.125, accuracy: 1e-9)
        XCTAssertEqual(frame.tchak.scale, 0.8798699999999984, accuracy: 1e-9)
        XCTAssertTrue(frame.tchak.isFinal, "le grand TCHAK du dernier coup")
        XCTAssertEqual(frame.flash, 0.95, accuracy: 1e-9)
    }

    func test_thePrismLastBlow_isStruckByMeeAndMeoTogether() {
        let plan = GameMintCeremony.plan(edition: .prism, mode: .normal)
        let last = Double(plan.strikes[2].atMs) / 1000
        XCTAssertGreaterThan(MintCeremonyChoreography.frame(plan, at: last - 0.3).hammerMee.opacity, 0.99, "Mee prend un marteau à son tour")
        XCTAssertEqual(MintCeremonyChoreography.frame(GameMintCeremony.plan(edition: .gold, mode: .normal), at: last).hammerMee.opacity, 0)
    }

    // MARK: - Les particules : la même tresse que le web, dans le budget

    func test_theParticles_areDrawnFromTheWebGenerator() throws {
        let plan = GameMintCeremony.plan(edition: .prism, mode: .normal)
        let particles = MintCeremonyParticles.build(plan, seed: 92)
        let first = try XCTUnwrap(particles.weave.min { $0.s < $1.s })
        XCTAssertEqual(first.s, 0.3508397487822702, accuracy: 1e-12)
        XCTAssertEqual(first.d, 0.7079464781098068, accuracy: 1e-12)
        XCTAssertEqual(first.delta, -2.094446391185509, accuracy: 1e-12)
        XCTAssertEqual(first.jitter, -1.2358591735363007, accuracy: 1e-12)
        XCTAssertEqual(first.tone, 3)
        let diamond = try XCTUnwrap(particles.dust.first { $0.material == .diamond && $0.tone == 2 })
        XCTAssertEqual(diamond.origin.x, 95.94014560477808, accuracy: 1e-9)
        XCTAssertEqual(diamond.control.y, 225.94781038970837, accuracy: 1e-9)
        XCTAssertEqual(diamond.size, 1.1347782586701214, accuracy: 1e-12)
        XCTAssertEqual(particles.bursts[0].vx, 165.70766558721166, accuracy: 1e-9)
        XCTAssertEqual(particles.puff[0].vx, -121.34692908031866, accuracy: 1e-9)
    }

    func test_theWeaveAndDust_stayWithinTheBudget_andHalveOnAModestDevice() {
        for edition in MeeshEdition.allCases {
            let full = MintCeremonyParticles.build(GameMintCeremony.plan(edition: edition, mode: .normal), seed: 7)
            let modest = MintCeremonyParticles.build(GameMintCeremony.plan(edition: edition, mode: .normal, modest: true), seed: 7)
            XCTAssertLessThanOrEqual(full.weave.count + full.dust.count, GameMintCeremony.particleBudget)
            XCTAssertGreaterThanOrEqual(full.weave.count, 2600, "des milliers d'étincelles")
            XCTAssertEqual(modest.weave.count, full.weave.count / 2)
        }
    }

    func test_aRefusal_bringsEverySparkBackToTheLight() {
        let plan = GameMintCeremony.plan(edition: .silver, mode: .refused, answeredAtMs: 2600)
        let particles = MintCeremonyParticles.build(plan, seed: 92)
        XCTAssertGreaterThan(particles.batches(plan, at: 2.4).painted, 2000, "le cercle était tissé")
        let rewound = plan.sceneTime(Double(plan.refusal!.rewind.toMs) / 1000 + 0.1)
        XCTAssertLessThan(rewound, Double(plan.span(.emit)!.fromMs) / 1000, "la scène remonte avant le départ des étincelles")
        XCTAssertEqual(particles.batches(plan, at: 6).painted, 0, "aucune étincelle n'est perdue : elles sont toutes rentrées")
        XCTAssertTrue(plan.strikes.isEmpty, "le refus n'a ni coup ni pièce")
        XCTAssertGreaterThan(MintCeremonyChoreography.frame(plan, at: 3.0).shadow.opacity, 0.5, "l'Ombre voile le cercle")
    }

    func test_aFrame_paintsItsThousandsOfParticlesInAFewStrokes() {
        let plan = GameMintCeremony.plan(edition: .prism, mode: .normal)
        let particles = MintCeremonyParticles.build(plan, seed: 1000)
        let frame = particles.batches(plan, at: 2.7)
        XCTAssertGreaterThan(frame.painted, 3000)
        XCTAssertLessThan(frame.batches.count, 300, "les particules se peignent en lots, jamais une à une")
        XCTAssertEqual(particles.batches(plan, at: 2.7, stride: 2).painted, (frame.painted + 1) / 2, accuracy: 60,
                       "sous la charge, un fil sur deux")
    }

    // MARK: - La conduite : vibrations, refus, passage, fondu

    func test_eachBlowVibrates_theLastTheStrongest() {
        let gold = GameMintCeremony.plan(edition: .gold, mode: .normal)
        let blows = MintCeremonyRun.blows(of: gold, afterMs: 0)
        XCTAssertEqual(blows.map(\.isFinal), [false, false, true])
        XCTAssertEqual(blows[0].delay, Double(gold.strikes[0].impactMs) / 1000, accuracy: 1e-9)
        XCTAssertTrue(MintCeremonyRun.blows(of: gold, afterMs: Double(gold.strikes[0].impactMs) + 400).allSatisfy { $0.delay >= 0 })
        XCTAssertEqual(MintCeremonyRun.blows(of: gold, afterMs: Double(gold.strikes[0].impactMs) + 400).count, 2, "un coup passé ne vibre plus")
        let final = GameHapticPattern.ceremonyBlow(final: true)
        let light = GameHapticPattern.ceremonyBlow(final: false)
        XCTAssertGreaterThan(final.map(\.intensity).max() ?? 0, light.map(\.intensity).max() ?? 1)
    }

    func test_aConfirmation_fixesTheCoinTheGatewayNumbered() {
        let clock = Clock()
        let (run, _, finishes) = makeRun(clock: clock)
        clock.now += 6.3
        run.receive(.confirmed(number: 93))
        XCTAssertEqual(run.number, 93)
        XCTAssertEqual(run.answeredAtMs ?? 0, 6300, accuracy: 0.5)
        XCTAssertEqual(run.plan(atMs: 6400).strikes.first?.atMs, 6300, "le marteau tombe dès la réponse")
        XCTAssertEqual(finishes(), 0)
    }

    func test_aRefusal_turnsTheSceneBack_andMeeSaysWhy() {
        let clock = Clock()
        let (run, _, _) = makeRun(clock: clock)
        clock.now += 2
        run.receive(.refused(code: "TREASURY_LOCKED"))
        XCTAssertEqual(run.mode, .refused)
        XCTAssertEqual(run.refusal, .locked)
        XCTAssertNotNil(run.plan(atMs: 2500).refusal)
    }

    func test_reducedMotion_isAFade_andARefusalClosesIt() {
        let (run, _, finishes) = makeRun(reduced: true)
        XCTAssertEqual(run.particles.count, 0, "ni particules ni tremblement")
        let plan = run.plan(atMs: 0)
        XCTAssertEqual(plan.mode, .reduced)
        XCTAssertEqual(MintCeremonyChoreography.frame(plan, at: 0.1).shake, .zero)
        run.receive(.refused(code: nil))
        XCTAssertEqual(finishes(), 1, "l'écran dit le refus : la scène se ferme")
    }

    func test_aTouchSkipsTheScene_once() {
        let (run, _, finishes) = makeRun()
        run.skip()
        run.skip()
        run.receive(.confirmed(number: 93))
        XCTAssertTrue(run.isFinished)
        XCTAssertEqual(finishes(), 1)
        XCTAssertEqual(run.number, 92, "passée, la scène n'écoute plus")
    }

    func test_theCeremony_saysItsLinesInTheCatalogsWords() {
        XCTAssertFalse(MintCeremonyCopy.say(.silver, number: 92).isEmpty)
        for reason in MintRefusalReason.allCases { XCTAssertFalse(MintCeremonyCopy.refused(reason).isEmpty) }
        XCTAssertNotEqual(MintCeremonyCopy.ancestorsLine(.gold), MintCeremonyCopy.ancestorsLine(.prism))
    }
}

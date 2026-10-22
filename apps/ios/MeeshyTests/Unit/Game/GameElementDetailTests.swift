import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

/// **Chaque famille d'élément a SES précisions** (#9564, amendement n° 2) — un modèle (`GameElementDetail`), une
/// fonction pure par famille (`GameElementDetails`), lue dans le bloc `game` et la progression servie. Ces témoins
/// interrogent la loi sans aucune vue, puis la feuille pour un badge obtenu et un badge verrouillé.
@MainActor
final class GameElementDetailTests: XCTestCase {

    private var ecran: RenderedScreen?

    override func tearDown() async throws {
        ecran?.dismount()
        ecran = nil
        try await super.tearDown()
    }

    private let game = GameWave2Fixture.game()

    /// Une ligne du classement : un autre joueur, tel que la page de la ligue le montre.
    private static let rival = LeagueWeekEntry(rank: 3, displayName: "Colibri-0042", weekPoints: 380, zone: .promotion, cup: nil, isMe: false)

    private func progress(_ game: GameBlock? = GameWave2Fixture.game(), count: Int = 12) -> EngagementProgress {
        guard let game else {
            return EngagementProgressResolver.resolve(APIEngagementProgress(
                counters: [.init(axisKey: "content.text_message", count: count)], milestones: [],
                streak: .init(currentStreakDays: 4, longestStreakDays: 9), level: .init(engagementScore: 36)
            ))
        }
        return EngagementProgressResolver.resolve(GameFixture.snapshot(game))
    }

    private func item(lit: Bool) -> GameBadgeItem {
        GameBadgeItem(axis: .textMessage, threshold: 10, material: GameBadges.material(forThreshold: 10), lit: lit,
                      missing: lit ? 0 : 4, value: lit ? 12 : 6, nextThreshold: 50)
    }

    // MARK: - Une famille, un modèle

    func test_everyFamily_hasItsDetail_readFromWhatIsServed() throws {
        let served = progress()
        let league = try XCTUnwrap(game.league)
        let season = try XCTUnwrap(game.season)
        let prestige = try XCTUnwrap(game.prestige)
        let trophies = try XCTUnwrap(game.trophies)
        let atlas = try XCTUnwrap(game.atlas)
        let entry = try XCTUnwrap(served.achievementSections.first?.entries.first, "le témoin veut un palier de défi")
        let named = try XCTUnwrap(served.achievements.first)

        let details: [GameElementDetail?] = [
            GameElementDetails.badge(item(lit: true), progress: served),
            GameElementDetails.achievement(named),
            GameElementDetails.challenge(entry),
            trophies.items.first.flatMap { GameElementDetails.trophy($0) },
            atlas.stamps.first.map { GameElementDetails.stamp($0) },
            GameElementDetails.seasonStep(1, in: season),
            GameElementDetails.seal(season),
            GameElementDetails.leagueGem(league),
            GameElementDetails.prestigeStar(1, in: prestige),
            GameElementDetails.rank(game.glory),
            GameElementDetails.flameForm(game.flame),
            GameElementDetails.freeze(game.flame),
            game.missions.items.first.map { GameElementDetails.mission($0) },
            GameElementDetails.chest(game.chest, missions: game.missions),
            GameElementDetails.coin(game.mint),
            GameElementDetails.levelRing(game.level),
            GameElementDetails.treasuryTier(game.treasury),
            GameElementDetails.elanFamily(.content, elan: served.elan),
            GameElementDetails.levelStep(GameLevelStep(level: 10, kind: .mint, target: 1, current: 0, met: false, rank: nil)),
            GameElementDetails.fact(ProgressionConceptFact(label: "Record", value: "12"), of: .level),
            GameElementDetails.player(Self.rival),
        ]

        let built = details.compactMap { $0 }
        XCTAssertEqual(built.count, details.count, "une famille n'a rien su dire de ce que la passerelle sert")
        XCTAssertEqual(Set(built.map(\.kind)), Set(GameElementKind.allCases), "chaque famille d'élément a son modèle de précisions")
        XCTAssertEqual(Set(built.map(\.id)).count, built.count, "deux éléments partagent une identité")
        for detail in built {
            XCTAssertFalse(detail.name.isEmpty, "\(detail.kind.rawValue) : pas de nom")
            XCTAssertFalse(detail.what.isEmpty, "\(detail.kind.rawValue) : pas de « c'est quoi »")
            XCTAssertEqual(detail.how == nil, detail.kind == .fact || detail.kind == .player,
                           "\(detail.kind.rawValue) : une famille a ses deux phrases, une donnée ou une ligne de classement la sienne")
            XCTAssertFalse(detail.how?.isEmpty ?? false, "\(detail.kind.rawValue) : un « comment » vide")
            XCTAssertFalse(detail.howTitle.isEmpty)
            XCTAssertFalse(detail.statusLine.isEmpty, "\(detail.kind.rawValue) : pas d'état")
            XCTAssertTrue(detail.announcement.contains(detail.name))
            XCTAssertFalse(detail.facts.contains { $0.label.isEmpty || $0.value.isEmpty }, "\(detail.kind.rawValue) : une ligne vide")
            if let gauge = detail.progress { XCTAssertTrue((0...1).contains(gauge), "\(detail.kind.rawValue) : jauge hors de 0…1") }
            if let concept = detail.kind.concept { XCTAssertEqual(detail.concept, concept, "\(detail.kind.rawValue) : mauvais concept") }
        }
    }

    /// Les familles et les données sont la liste FERMÉE du partagé (`apps/web/src/lib/game/detail-families.ts`) :
    /// mêmes clés sur le web et sur iOS, donc mêmes phrases.
    func test_theFamiliesAndTheFacts_areTheClosedListOfTheSharedCatalog() {
        XCTAssertEqual(GameElementKind.families.map(\.rawValue), [
            "badge", "succes", "defi", "trophy", "stamp", "step", "seal", "gem", "star", "rank", "flame", "freeze",
            "mission", "chest", "coin", "ring", "treasury", "elan", "levelstep",
        ])
        XCTAssertEqual(GameElementKind.families.filter { $0.how == .gives }.map(\.rawValue), ["flame", "mission", "chest", "elan"])
        XCTAssertEqual(GameDetailFactKey.allCases.map(\.rawValue), [
            "tier", "score", "convertible", "level_next", "level_record", "tailwind", "mint_price", "mint_missing", "can_mint", "factor",
            "mint_next", "mint_glory", "minted", "glory", "glory_missing", "streak", "streak_record", "flame_state",
            "missions_done", "league_place", "week_points", "league_zone", "league_missing", "league_closes",
            "league_friends", "season", "season_week", "season_steps", "season_stars", "prestige_glory", "elan_families",
            "badges_earned", "defis_earned", "succes_earned", "trophies", "showcase_visibility", "atlas_stamps", "atlas_pending",
            "spend_held", "spend_cost", "spend_after", "spend_missing", "level_now", "level_required",
        ])
        XCTAssertEqual(GameElementKind.families.count, 19)
        for kind in GameElementKind.families {
            XCTAssertFalse((GameDetailText.what(kind) ?? "").isEmpty, "\(kind.rawValue) : pas de « c'est quoi »")
            XCTAssertFalse((GameDetailText.how(kind) ?? "").isEmpty, "\(kind.rawValue) : pas de « comment »")
            XCTAssertNotEqual(GameDetailText.what(kind), GameDetailText.how(kind), "\(kind.rawValue) : deux phrases, pas une répétée")
        }
        XCTAssertEqual(Set(GameDetailFactKey.allCases.map { GameDetailText.fact($0) }).count, GameDetailFactKey.allCases.count,
                       "chaque donnée a SA phrase")
        for key in GameDetailFactKey.allCases {
            XCTAssertFalse(GameDetailText.fact(key).isEmpty, "\(key.rawValue) : pas de phrase")
        }
    }

    /// Une ligne de donnée porte SA phrase quand le catalogue en a une ; sinon celle de son concept.
    func test_aDataLine_saysItsOwnSentence_orTheOneOfItsConcept() {
        let served = progress()
        let facts = ProgressionConceptFiche.rows(.glory, progress: served, game: game)
        let glory = facts.first { $0.detail == .glory }
        XCTAssertNotNil(glory, "la ligne de la Gloire porte sa clé")
        XCTAssertEqual(glory.map { GameElementDetails.fact($0, of: .glory).what }, GameDetailText.fact(.glory))

        let plain = GameElementDetails.fact(ProgressionConceptFact(label: "x", value: "1"), of: .flame)
        XCTAssertEqual(plain.what, ConceptText.why(.flame))
        XCTAssertNil(plain.how, "une donnée n'a qu'une phrase")
    }

    // MARK: - Obtenu, verrouillé, ce qu'il manque

    func test_aLitBadge_isObtained_andAnExtinguishedOne_saysWhatIsMissing() {
        let lit = GameElementDetails.badge(item(lit: true))
        XCTAssertTrue(lit.isObtained)
        XCTAssertNil(lit.progress, "un badge obtenu n'a pas de jauge")

        let out = GameElementDetails.badge(item(lit: false))
        XCTAssertEqual(out.status, .locked(missing: GameBadgeGuideText.imprint(missing: "4"), progress: item(lit: false).progress),
                       "un badge éteint dit ce qu'il manque POUR LE RALLUMER (#10540)")
        XCTAssertTrue(out.statusLine.contains(GameDetailText.locked))
        XCTAssertNotEqual(lit.id, GameElementDetails.badge(GameBadgeItem(
            axis: .textMessage, threshold: 50, material: GameBadges.material(forThreshold: 50), lit: true, missing: 0, value: 60, nextThreshold: nil
        )).id, "deux paliers d'un même axe ont chacun leurs précisions")
    }

    func test_anAxisWithNoBadgeYet_showsTheFirstOneToEarn_locked() throws {
        let fresh = progress(nil, count: 0)
        let axis = try XCTUnwrap(fresh.axes.first { $0.axis == .textMessage })

        let detail = GameElementDetails.badge(for: axis, progress: fresh)

        XCTAssertFalse(detail.isObtained, "aucun palier atteint : le badge est à décrocher")
        XCTAssertEqual(detail.kind, .badge)
        XCTAssertNotNil(detail.progress, "ce qu'il manque a sa jauge")
        let missing = try XCTUnwrap(axis.scale.remainingToNext)
        XCTAssertEqual(detail.status, .locked(missing: GameDetailText.badgeMissing(missing: GameCopy.formatCount(missing)), progress: axis.scale.progress),
                       "le manque nomme sa cible : la première étoile (#10540)")
    }

    func test_theDateOfAnElement_isOnlyTheOneServed() {
        XCTAssertEqual(GameElementDetails.badge(item(lit: true)).status, .obtained(since: nil),
                       "sans date servie, aucune date ne s'invente")
        let stamp = GameAtlasBlock.Stamp(language: "ja", stampedOn: "2026-10-13")
        XCTAssertEqual(GameElementDetails.stamp(stamp).status,
                       .obtained(since: GameText.atlasStampedOn(date: GameWave2Format.day("2026-10-13"))))
        let dated = GameTrophyItem(key: "trophy.flame.100", awardedAt: "2026-10-01T10:00:00.000Z")
        XCTAssertNotEqual(GameElementDetails.trophy(dated)?.status, .obtained(since: nil), "la date servie d'un trophée se dit")
    }

    func test_aMission_saysItsProgress_andACompletedOne_isObtained() {
        let open = GameElementDetails.mission(GameFixture.mission(target: 5, progress: 2))
        XCTAssertEqual(open.status, .locked(missing: ConceptText.ratio("2", "5"), progress: 0.4))
        XCTAssertTrue(GameElementDetails.mission(GameFixture.mission(completed: true)).isObtained)
    }

    func test_theChest_followsItsServedStatus() {
        func status(_ chest: GameBlock.Chest.Status) -> GameElementStatus {
            let block = GameFixture.game(chestStatus: chest)
            return GameElementDetails.chest(block.chest, missions: block.missions).status
        }
        XCTAssertEqual(status(.claimed), .obtained(since: nil))
        XCTAssertEqual(status(.ready), .value(ConceptText.chipChestReady, progress: 1))
        XCTAssertEqual(status(.locked), .locked(missing: ConceptText.ratio("0", "3"), progress: 0))
    }

    /// Le coffre garde son contenu secret (#10567) : ni borne, ni chance, ni montant dans ses précisions.
    func test_theChest_keepsItsContentsSecret() {
        for status in [GameBlock.Chest.Status.locked, .ready, .claimed] {
            let block = GameFixture.game(chestStatus: status)
            XCTAssertTrue(GameElementDetails.chest(block.chest, missions: block.missions).facts.isEmpty)
        }
    }

    func test_theLeagueGem_saysNothingWithoutAGroup_andNeverMoreThanThePage() throws {
        XCTAssertNil(GameElementDetails.leagueGem(GameWave2Fixture.league(access: .locked, current: nil)))

        let detail = try XCTUnwrap(GameElementDetails.leagueGem(GameWave2Fixture.league()))
        let said = ([detail.name, detail.statusLine] + detail.facts.flatMap { [$0.label, $0.value] }).joined(separator: " ")
        XCTAssertFalse(said.contains("2026-10-12:jade:1"), "l'identifiant du groupe ne se dit pas")
    }

    /// Une ligne du classement ne dit rien de plus que la page : pseudonyme, place, zone, points de la semaine.
    func test_aStandingRow_saysOnlyWhatThePageAlreadyShows() {
        let detail = GameElementDetails.player(Self.rival)

        XCTAssertEqual(detail.name, "Colibri-0042")
        XCTAssertEqual(detail.status, .value(GameCopy.points(380), progress: nil))
        XCTAssertEqual(detail.what, GameDetailText.playerWhat)
        XCTAssertNil(detail.how)
        XCTAssertEqual(detail.facts.map(\.label), [ConceptText.factRank, ConceptText.factZone], "ni présence, ni identifiant, ni date")
    }

    /// Les emblèmes dessinés sont ceux du partagé, forme pour forme (`concept-emblems.ts`) ; celui du Tableau de bord
    /// est parti avec lui (amendement n° 4).
    func test_theDrawnEmblems_mirrorTheSharedTable() {
        XCTAssertEqual(ConceptEmblemDesign.Kind.allCases.map(\.rawValue), ["points", "elans"])
        let points = ConceptEmblemDesign.of(.points)
        XCTAssertEqual(points.paint, .indigo)
        XCTAssertEqual(points.body, .circle(center: CGPoint(x: 34, y: 38), radius: 28))
        XCTAssertEqual(points.signature, .init(center: CGPoint(x: 34, y: 38), size: 38, strokeWidth: 100))
        let elans = ConceptEmblemDesign.of(.elans)
        XCTAssertEqual(elans.paint, .flame)
        XCTAssertEqual(elans.body, .rect(CGRect(x: 8, y: 8, width: 56, height: 56), radius: 18))
        XCTAssertEqual(elans.accents, [.chevron([CGPoint(x: 23, y: 30), CGPoint(x: 36, y: 17), CGPoint(x: 49, y: 30)], lineWidth: 6)])
        for kind in ConceptEmblemDesign.Kind.allCases {
            let frame = ConceptEmblemDesign.of(kind).body.frame
            XCTAssertTrue(CGRect(x: 0, y: 0, width: ConceptEmblemDesign.box, height: ConceptEmblemDesign.box).contains(frame),
                          "\(kind.rawValue) : le corps sort du carré de 72")
        }
    }

    func test_anUnreadableTrophy_orChallenge_hasNoDetail() {
        XCTAssertNil(GameElementDetails.trophy(GameTrophyItem(key: "trophy.unknown.kind", awardedAt: "2026-10-01T10:00:00.000Z")),
                     "un trophée que ce client ne sait pas lire ne s'invente pas")
    }

    func test_theHeroOfASheet_opensTheMainElementOfItsConcept() {
        let served = progress()
        func kind(_ concept: ProgressionConcept) -> GameElementKind { GameElementDetails.hero(of: concept, progress: served, game: game).kind }

        XCTAssertEqual(kind(.level), .levelRing)
        XCTAssertEqual(kind(.meesh), .coin)
        XCTAssertEqual(kind(.glory), .rank)
        XCTAssertEqual(kind(.flame), .flameForm)
        XCTAssertEqual(kind(.missions), .chest)
        XCTAssertEqual(kind(.league), .leagueGem)
        XCTAssertEqual(kind(.prestige), .prestigeStar)
        XCTAssertEqual(kind(.badges), .fact, "un concept sans élément principal dit sa valeur")
        for concept in ProgressionConcept.allCases {
            XCTAssertEqual(GameElementDetails.hero(of: concept, progress: progress(nil), game: nil).concept, concept,
                           "\(concept.rawValue) : devant un ancien serveur, le héros dit sa valeur, dans SON concept")
        }
    }

    // MARK: - Le rebond : une courbe, déclarée une fois

    func test_theBounce_sinksOnContact_andBecomesAFadeUnderReducedMotion() {
        XCTAssertEqual(GameMotion.scale(pressed: true, reduceMotion: false), GameMotion.pressScale)
        XCTAssertEqual(GameMotion.scale(pressed: false, reduceMotion: false), 1)
        XCTAssertEqual(GameMotion.opacity(pressed: true, reduceMotion: false), 1, "un ressort, jamais une simple opacité")
        XCTAssertLessThan(GameMotion.pressScale, 1)

        XCTAssertEqual(GameMotion.scale(pressed: true, reduceMotion: true), 1, "« réduire les animations » : aucun mouvement")
        XCTAssertEqual(GameMotion.opacity(pressed: true, reduceMotion: true), GameMotion.reducedPressOpacity)
        XCTAssertEqual(GameMotion.animation(pressed: true, reduceMotion: true), GameMotion.reduced)
        XCTAssertEqual(GameMotion.animation(pressed: true, reduceMotion: false), GameMotion.press)
        XCTAssertEqual(GameMotion.animation(pressed: false, reduceMotion: false), GameMotion.release)
        XCTAssertEqual(GameStaggeredEntrance.delay(for: 0), 0)
        XCTAssertLessThanOrEqual(GameStaggeredEntrance.delay(for: 40), 0.4, "la dernière carte n'attend pas une seconde")
    }

    // MARK: - La feuille : un badge obtenu, un badge verrouillé

    func test_theSheetOfAnObtainedBadge_saysItsNameAndThatItIsObtained() {
        let detail = GameElementDetails.badge(item(lit: true))
        let rendu = RenderedScreen(GameElementSheet(detail: detail, onOpenConcept: { _ in }), size: CGSize(width: 402, height: 1600))
        ecran = rendu

        let identifiants = rendu.identifiers
        XCTAssertTrue(identifiants.contains("game.detail.name"), "le nom de l'élément n'est pas dans la feuille. Vus : \(identifiants)")
        XCTAssertTrue(identifiants.contains("game.detail.obtained"), "« obtenu » n'est pas dit. Vus : \(identifiants)")
        XCTAssertFalse(identifiants.contains("game.detail.locked"))
        XCTAssertTrue(identifiants.contains("game.detail.sheet"), "hors de la fiche du concept, la feuille offre « Voir la fiche »")
        XCTAssertEqual(rendu.node("game.detail.name")?.label, detail.name)
    }

    func test_theSheetOfALockedBadge_saysWhatIsMissing_andOffersNoSheetLinkInsideItsOwnSheet() {
        let detail = GameElementDetails.badge(item(lit: false))
        let rendu = RenderedScreen(GameElementSheet(detail: detail, onOpenConcept: nil), size: CGSize(width: 402, height: 1600))
        ecran = rendu

        let identifiants = rendu.identifiers
        XCTAssertTrue(identifiants.contains("game.detail.locked"), "« verrouillé » n'est pas dit. Vus : \(identifiants)")
        XCTAssertFalse(identifiants.contains("game.detail.obtained"))
        XCTAssertFalse(identifiants.contains("game.detail.sheet"), "dans la fiche du concept, pas de « Voir la fiche »")
        XCTAssertTrue(rendu.node("game.detail.locked")?.label?.contains(GameBadgeGuideText.imprint(missing: "4")) ?? false,
                      "ce qu'il manque n'est pas dit : « \(rendu.node("game.detail.locked")?.label ?? "") »")
    }

    /// Un élément ne se touche que si la page présente des précisions : hors d'une page de Progression, il se lit.
    func test_anElement_isTouchableOnlyWhereAPagePresentsItsDetails() {
        let detail = GameElementDetails.freeze(GameFixture.game().flame)
        var opened: [GameElementDetail] = []
        let hosted = GameElementTile(detail: detail).environment(\.gameOpenDetail, { opened.append($0) })
        let rendu = RenderedScreen(hosted, size: CGSize(width: 402, height: 400))
        ecran = rendu

        XCTAssertTrue(rendu.identifiers.contains("game.element." + detail.id), "l'élément n'est pas un bouton de précisions : \(rendu.identifiers)")
        XCTAssertTrue(opened.isEmpty, "rien ne s'ouvre sans toucher")
    }

    // MARK: - Le rang (#9636)

    func test_rank_readsTheFiveDivisions_andTheServedMythSeat() {
        let voixV = GameBlock.Glory(glory: 6000, rank: .voix, division: .iii, division5: .v,
                                    next: GloryStep(rank: .voix, division: .iii, division5: .iv, minGlory: 7800),
                                    gloryMissing: 1800, progress: 0)
        let detail = GameElementDetails.rank(voixV)
        XCTAssertEqual(detail.name, "\(GameCopy.rankName(.voix)) V")
        XCTAssertEqual(detail.emblem, .rank(.voix, .v, nil))
        XCTAssertEqual(detail.key, "voix.5")

        let seat = MythicSeatRef(number: 42, edition: 57)
        let myth = GameElementDetails.rank(GameBlock.Glory(glory: 1_000_000, rank: .mythe, division: nil, next: nil,
                                                           gloryMissing: nil, progress: 1, mythic: seat))
        XCTAssertEqual(myth.name, GameCopy.mythicSeatLabel(seat: 42))
        XCTAssertEqual(myth.emblem, .rank(.mythe, nil, seat))
    }

    // MARK: - Le niveau ouvert par le rang (#9688)

    func test_levelRing_beyond100_readsTheLadder_notYesterdaysFields() {
        let game = GameFixture.game(score: GameLevels.threshold(of: 345) + 12)
        let detail = GameElementDetails.levelRing(game.level)
        XCTAssertEqual(game.level.level, GameLevels.legacyMaxLevel)
        XCTAssertEqual(detail.key, "345")
        XCTAssertEqual(detail.emblem, .tier(.quasar))
        XCTAssertTrue(detail.name.contains(GameCopy.formatCount(345)), detail.name)
    }

    /// L'anneau dit ce qu'il reste AVEC le niveau visé, et nomme les points en poche (#10540).
    func test_levelRing_saysWhatRemainsForWhichLevel_andNamesThePocket() {
        let game = GameFixture.game(score: 77_099, levelRecord: 27, minted: 78, debitable: 5_823, held: 3)
        let detail = GameElementDetails.levelRing(game.level)

        XCTAssertEqual(detail.status, .value(GameCopy.levelToNext(remaining: 1_301, nextLevel: 28), progress: game.level.shown.progress))
        // La poche (#10846) : sans étincelles servies (fixture d'un serveur antérieur), elle se lit sur `score`.
        XCTAssertEqual(detail.facts.first, ProgressionConceptFact(label: GameSparksCopy.pocketLabel, value: GameCopy.points(77_099)))
        XCTAssertFalse(detail.facts.contains { $0.label == ConceptText.factNextLevel }, "hors plafond, le reste est dans la valeur")
    }

    /// La pièce, le rang, la ligue et le trésor : chaque manque porte sa cible.
    func test_theMissingAmounts_ofTheCoinTheRankTheLeagueAndTheTreasury_nameTheirTarget() throws {
        let poor = GameFixture.game(score: 77_099, levelRecord: 27, minted: 78, debitable: 5_823, held: 3)
        XCTAssertEqual(GameElementDetails.coin(poor.mint).status, .locked(
            missing: ConceptText.spendMissingMint(missing: GameCopy.convertiblePoints(1_839), number: GameCopy.formatCount(79)),
            progress: Double(5_823) / Double(7_662)
        ))

        let glory = GameBlock.Glory(glory: 6000, rank: .voix, division: .iii, division5: .v,
                                    next: GloryStep(rank: .voix, division: .iii, division5: .iv, minGlory: 7800),
                                    gloryMissing: 1800, progress: 0)
        let next = GameCopy.rankLabel(.voix, division5: .iv)
        XCTAssertEqual(GameElementDetails.rank(glory).facts, [
            ProgressionConceptFact(label: ConceptText.factNextRank, value: next),
            ProgressionConceptFact(label: ConceptText.missingForRank(rank: next), value: GameCopy.gloryAmount(GameCopy.formatCount(1800))),
        ])

        let chasing = GameWave2Fixture.league(current: .init(league: .jade, groupId: "g", groupSize: 30, rank: 12, weekPoints: 410,
                                                             zone: .safe, cup: nil, pointsToPromotion: 120))
        let gem = try XCTUnwrap(GameElementDetails.leagueGem(chasing))
        XCTAssertEqual(gem.facts.last, ProgressionConceptFact(label: ConceptText.missingForPromotion, value: GameCopy.points(120)))

        let treasury = GameTreasury.standing(held: 3)
        let step = try XCTUnwrap(treasury.next)
        XCTAssertEqual(GameElementDetails.treasuryTier(treasury).facts.first?.value,
                       GameCopy.treasuryNext(missing: GameCopy.formatCount(step.missing), tier: GameCopy.treasuryName(step.key)))
    }

    func test_levelRing_atTheRankCap_saysWhichRankOpensTheNextLevels() {
        let game = GameFixture.game(score: GameLevels.threshold(of: 700), glory: 100_000)
        XCTAssertTrue(game.level.shown.isMax)
        let detail = GameElementDetails.levelRing(game.level)
        XCTAssertEqual(detail.key, "499")
        let next = detail.facts.first { $0.label == ConceptText.factNextLevel }
        XCTAssertEqual(next?.value, GameCopy.levelTopShort(cap: GameLevels.capBase))
        XCTAssertNotEqual(next?.value, GameText.bannerTop, "au plafond du rang, on n'est pas « au sommet »")
    }

    func test_levelRing_beforeAServerThatSendsTheLadder_readsYesterdaysFields() {
        let game = GameFixture.game(score: GameLevels.threshold(of: 100) + 3, servesLadder: false)
        XCTAssertNil(game.level.ladder)
        let detail = GameElementDetails.levelRing(game.level)
        XCTAssertEqual(detail.key, "100")
        let next = detail.facts.first { $0.label == ConceptText.factNextLevel }
        XCTAssertEqual(next?.value, GameText.bannerTop)
    }

    // MARK: - Ce qu'un geste dépense ou exige, avant le geste (#9705)

    /// Aucun calcul sur une fiche (épopée § 3.3, #11180) : la rangée dit ce qu'on a et ce qu'il faut, jamais ce qui
    /// RESTERA — la soustraction vit dans les règles.
    func test_theSpendRow_saysWhatIsHeld_andWhatItCosts_neverWhatWillRemain() {
        let items = GameSpendRows.spend(GameSpend.preview(held: 5, cost: 3), format: GameCopy.meeshes,
                                        missing: { ConceptText.spendMissingFreeze(missing: $0) })
        XCTAssertEqual(items.map(\.label), [ConceptText.factBalance, ConceptText.factCost])
        XCTAssertFalse(items.contains { $0.sentence != nil }, "rien ne manque : aucune phrase de manque")
        XCTAssertEqual(items.map(\.value), [GameCopy.meeshes(5), GameCopy.meeshes(3)])
        XCTAssertFalse(items.contains { $0.detail == .spendAfter || $0.label == ConceptText.factAfter }, "« Restera » est un calcul")
        XCTAssertFalse(items.contains { $0.short })
    }

    func test_theSpendRow_saysWhatIsMissing_insteadOfWhatRemains() {
        let items = GameSpendRows.spend(GameSpend.preview(held: 4, cost: 10), format: GameCopy.meeshes,
                                        missing: { ConceptText.spendMissingFreeze(missing: $0) })
        // Le manque est une PHRASE qui nomme son but (#10540) : « Il manque 6 Meeshes pour acheter un gel. »
        XCTAssertEqual(items.last?.sentence, ConceptText.spendMissingFreeze(missing: GameCopy.meeshes(6)))
        XCTAssertEqual(items.last?.value, GameCopy.meeshes(6))
        XCTAssertEqual(items.last?.short, true)
        XCTAssertEqual(items.last?.detail, .spendMissing)
        XCTAssertFalse(items.contains { $0.label == ConceptText.factAfter })
        XCTAssertEqual(items.filter { $0.sentence != nil }.count, 1, "seul le manque est une phrase")
    }

    /// Les cinq gestes qui dépensent ont chacun LEUR phrase de manque, et chacune dit autre chose que le montant seul.
    func test_everySpendingGesture_namesWhatTheMissingAmountIsFor() {
        let amount = GameCopy.meeshes(2)
        let sentences = [
            ConceptText.spendMissingFreeze(missing: amount), ConceptText.spendMissingRelight(missing: amount),
            ConceptText.spendMissingReroll(missing: amount), ConceptText.spendMissingSeal(missing: amount),
            ConceptText.spendMissingUnlock(missing: amount), ConceptText.spendMissingMint(missing: amount, number: "79"),
        ]
        XCTAssertEqual(Set(sentences).count, sentences.count, "deux gestes partagent leur phrase de manque")
        for sentence in sentences {
            XCTAssertTrue(sentence.contains(amount), sentence)
            XCTAssertGreaterThan(sentence.count, amount.count + 8, "« \(sentence) » : un manque sans cible")
        }
        XCTAssertTrue(sentences[5].contains("79"), "le manque d'une frappe nomme la pièce : \(sentences[5])")
    }

    /// Le compte du porteur (#10540) : la Meesh n° 79 à 7 662, il en manque 1 839. Le cadre de la frappe dit le prix UNE
    /// fois, dans la phrase, et le manque nomme sa pièce (#11180).
    func test_theMintFrame_saysThePriceOnce_andTheMissingAmountNamesTheCoin() {
        let game = GameFixture.game(score: 77_099, levelRecord: 27, minted: 78, debitable: 5_823, held: 3)
        XCTAssertEqual(game.mint.number, 79)
        XCTAssertEqual(game.mint.price, 7_662)
        XCTAssertEqual(game.mint.missingPoints, 1_839)

        let frame = GameMintPreviewView(game: game, online: true, minting: false, error: nil, celebration: nil, onMint: {}).model

        XCTAssertEqual(frame.sentence.text, GameFicheCopy.mintSentence(price: GameCopy.points(7_662), held: GameCopy.formatCount(game.level.sparkFacts.pocket)))
        XCTAssertEqual(frame.missing?.text, GameFicheCopy.mintMissing(GameCopy.formatCount(1_839)))
        XCTAssertNil(frame.glory, "frappe impossible : pas de bouton, donc pas de gloire promise")
        XCTAssertEqual(frame.texts.filter { $0.contains(GameCopy.formatCount(7_662)) }.count, 1, "le prix paraît UNE fois")
    }

    func test_theRequirementRow_saysTheGap_andFallsSilentOnceMet() {
        let below = GameSpendRows.requirement(GameSpend.requirement(current: 3, required: GameMissions.minLevel))
        XCTAssertEqual(below.prefix(2).map(\.label), [ConceptText.name(.level), ConceptText.factRequired])
        XCTAssertEqual(below.last?.value, GameCopy.levels(GameMissions.minLevel - 3))
        XCTAssertEqual(below.last?.sentence, ConceptText.spendMissingUnlock(missing: GameCopy.levels(GameMissions.minLevel - 3)),
                       "ce qu'il manque dit pour quoi : l'ouvrir (#10540)")

        let met = GameSpendRows.requirement(GameSpend.requirement(current: 40, required: GameDuo.minLevel), record: true)
        XCTAssertEqual(met.map(\.label), [ConceptText.factRecord, ConceptText.factRequired])
    }

    /// Le Voyage compte des PAS et la Renaissance des RENAISSANCES : « étoile » n'appartient qu'au ciel des aïeux
    /// (épopée § 4). La clé `game.concept.fact.stars` servait les deux, et disait « Étoiles » aux deux (#11173).
    ///
    /// Le français se lit dans la table `fr` du bundle, jamais dans la langue de l'HÔTE : le simulateur de la CI
    /// n'a aucune langue configurée et rend l'anglais (« Strides »), comme `ProgressionStreakPluralTests` l'a payé.
    func test_theVoyageCountsStrides_andTheRebirthCountsRebirths_neverStars() throws {
        let season = try XCTUnwrap(game.season)
        let prestige = try XCTUnwrap(game.prestige)
        let frPath = try XCTUnwrap(Bundle.main.path(forResource: "fr", ofType: "lproj"),
                                   "localisation « fr » absente du bundle — régression de packaging")
        let french = try XCTUnwrap(Bundle(path: frPath))
        XCTAssertEqual(french.localizedString(forKey: "game.fact.strides", value: nil, table: nil), "Pas")
        XCTAssertEqual(french.localizedString(forKey: "game.fact.rebirths", value: nil, table: nil), "Renaissances")
        XCTAssertEqual(ConceptText.factStrides, Bundle.main.localizedString(forKey: "game.fact.strides", value: nil, table: nil))
        XCTAssertEqual(ConceptText.factRebirths, Bundle.main.localizedString(forKey: "game.fact.rebirths", value: nil, table: nil))
        XCTAssertTrue(GameElementDetails.seasonStep(1, in: season).facts.map(\.label).contains(ConceptText.factStrides))
        XCTAssertTrue(GameElementDetails.prestigeStar(1, in: prestige).facts.map(\.label).contains(ConceptText.factRebirths))
        let labels = GameElementDetails.seasonStep(1, in: season).facts.map(\.label) + GameElementDetails.prestigeStar(1, in: prestige).facts.map(\.label)
        XCTAssertFalse(labels.contains { $0.localizedCaseInsensitiveContains("étoile") }, "\(labels)")
    }

    func test_thePrestigeConfirmation_givesTheValuesBeforeAndAfter() throws {
        let game = GameWave2Fixture.atLevel100(prestige: 1)
        let values = GamePrestigeScreen.passValues(game: game)
        XCTAssertEqual(values.map(\.label), [
            GameSparksCopy.pocketLabel, ConceptText.name(.level), ConceptText.factRecord, ConceptText.factRebirths, ConceptText.name(.glory),
        ])
        XCTAssertEqual(values.first?.value, "\(GameCopy.points(game.level.score)) → \(GameCopy.points(0))")
        XCTAssertEqual(values[3].value, "\(GameCopy.formatCount(1)) → \(GameCopy.formatCount(2))")
        XCTAssertNotNil(values[3].element, "l'étoile ouvre les précisions de l'étoile posée")
        XCTAssertTrue(GamePrestigeScreen.passValues(game: GameFixture.game(score: 400)).isEmpty, "sous le niveau 100, rien à confirmer")
    }

    // MARK: - Les étapes des niveaux (#9706)

    private static let noStep = GameLevelStepCounts(minted: 0, missionsDone: 0, flameRecord: 0)

    /// Les points du niveau 15, aucune Meesh frappée : le niveau attend à 9, l'étape du niveau 10 manque.
    private func heldGame() -> GameBlock {
        GameFixture.game(score: GameLevels.threshold(of: 15), glory: 0, steps: Self.noStep)
    }

    func test_aStepToDo_saysWhatItAsks_howFarItIs_andTheTenSteps() throws {
        let game = heldGame()
        let step = try XCTUnwrap(game.level.shown.step, "le niveau retenu sert la prochaine étape")
        XCTAssertEqual(step.level, 10)
        XCTAssertEqual(step.kind, .mint)
        XCTAssertFalse(step.met)

        let detail = GameElementDetails.levelStep(step, facts: game.levelStepFacts)

        XCTAssertEqual(detail.kind, .levelStep)
        XCTAssertEqual(detail.name, GameCopy.levelStepLine(step))
        XCTAssertTrue(detail.name.contains(GameCopy.levelStepGoal(step)), detail.name)
        XCTAssertEqual(detail.status, .locked(
            missing: GameDetailText.levelStepProgress(progress: ConceptText.ratio(GameCopy.formatCount(0), GameCopy.formatCount(1))), progress: 0
        ))
        XCTAssertEqual(detail.what, GameDetailText.what(.levelStep))
        XCTAssertEqual(detail.how, GameDetailText.how(.levelStep))
        XCTAssertEqual(detail.facts.count, GameLevelSteps.rules.count, "les dix étapes, chacune faite ou à faire")
        XCTAssertEqual(detail.facts.first?.label, GameText.bannerLevel(level: GameCopy.formatCount(10)))
        XCTAssertNil(GameElementDetails.levelStep(step).facts.first, "sans faits servis, aucune ligne ne s'invente")
    }

    func test_aStepDone_isObtained_andSaysSo() {
        let step = GameLevelStep(level: 20, kind: .missions, target: 1, current: 3, met: true, rank: nil)
        let detail = GameElementDetails.levelStep(step)

        XCTAssertTrue(detail.isObtained)
        XCTAssertNil(detail.progress, "une étape faite n'a plus de jauge")
        XCTAssertEqual(GameCopy.levelStepState(step), GameCopy.levelStepDone)
    }

    func test_aRankStep_namesTheRank_andCountsTheGlory() {
        let step = GameLevelStep(level: 30, kind: .rank, target: 2000, current: 1200, met: false, rank: .echo)
        let detail = GameElementDetails.levelStep(step)

        XCTAssertTrue(detail.name.contains(GameCopy.rankName(.echo)), detail.name)
        XCTAssertTrue(detail.statusLine.contains(GameCopy.formatCount(1200)) && detail.statusLine.contains(GameCopy.formatCount(2000)),
                      detail.statusLine)
        XCTAssertEqual(detail.progress ?? 0, 0.6, accuracy: 0.0001)
    }

    /// « Voir la fiche » mène au GESTE qui fait l'étape : la frappe, les missions du jour, la Flamme, la Gloire.
    func test_theSheetOfAStep_opensTheConceptOfItsGesture() {
        let concepts: [LevelStepKind: ProgressionConcept] = [.mint: .meesh, .missions: .missions, .flame: .flame, .rank: .glory]
        for rule in GameLevelSteps.rules {
            let step = GameLevelStep(level: rule.level, kind: rule.kind, target: rule.target, current: 0, met: false, rank: rule.rank)
            XCTAssertEqual(GameElementDetails.levelStep(step).concept, concepts[rule.kind], "étape du niveau \(rule.level)")
        }

        let detail = GameElementDetails.levelStep(GameLevelStep(level: 40, kind: .flame, target: 7, current: 3, met: false, rank: nil))
        let rendu = RenderedScreen(GameElementSheet(detail: detail, onOpenConcept: { _ in }), size: CGSize(width: 402, height: 1600))
        ecran = rendu
        let identifiants = rendu.identifiers
        XCTAssertTrue(identifiants.contains("game.detail.locked"), "« à faire » n'est pas dit. Vus : \(identifiants)")
        XCTAssertTrue(identifiants.contains("game.detail.sheet"), "la feuille offre le chemin vers le geste. Vus : \(identifiants)")
    }

    /// Retenu par une étape, le héros dit POURQUOI le niveau attend — jamais « encore 0 point ».
    func test_aHeldLevel_saysWhyItWaits_andShowsTheStepToDo() throws {
        let game = heldGame()
        XCTAssertTrue(game.level.shown.held)
        XCTAssertEqual(game.level.shown.level, 9)
        let step = try XCTUnwrap(game.level.shown.step)
        let why = GameCopy.levelHeld(step)
        XCTAssertTrue(why.contains(GameCopy.levelStepGoal(step)) && why.contains(GameCopy.formatCount(10)), why)

        let rendu = RenderedScreen(GameHeroView(game: game, onOpenGuide: {}), size: CGSize(width: 402, height: 1400))
        ecran = rendu
        XCTAssertTrue(rendu.says(why), "le héros ne dit pas pourquoi le niveau attend. Vus : \(rendu.labels)")
        XCTAssertEqual(rendu.node("game.hero.level.step")?.label, GameCopy.levelStepAccessibility(step))
    }

    func test_aStepAlreadyDone_isShownDone_aboveTheLevel() throws {
        let game = GameFixture.game(score: GameLevels.threshold(of: 15), glory: 0,
                                    steps: GameLevelStepCounts(minted: 1, missionsDone: 1, flameRecord: 0))
        XCTAssertFalse(game.level.shown.held)
        let step = try XCTUnwrap(game.level.shown.step)
        XCTAssertEqual(step.level, 20)
        XCTAssertTrue(step.met)

        let rendu = RenderedScreen(GameHeroView(game: game, onOpenGuide: {}), size: CGSize(width: 402, height: 1400))
        ecran = rendu
        XCTAssertEqual(rendu.node("game.hero.level.step")?.label, GameCopy.levelStepAccessibility(step))
        XCTAssertTrue(GameCopy.levelStepAccessibility(step).hasSuffix(GameCopy.levelStepDone))
    }

    func test_noStep_beyond100_orBeforeAServerThatServesThem() {
        let beyond = GameFixture.game(score: GameLevels.threshold(of: 150), glory: 40_000,
                                      steps: GameLevelStepCounts(minted: 5, missionsDone: 10, flameRecord: 30))
        XCTAssertEqual(beyond.level.shown.level, 150)
        XCTAssertNil(beyond.level.shown.step, "au-delà de 100, plus d'étape")
        let old = GameFixture.game(score: GameLevels.threshold(of: 15))
        XCTAssertNil(old.level.shown.step, "un serveur d'avant les étapes n'en sert pas")

        let rendu = RenderedScreen(GameHeroView(game: beyond, onOpenGuide: {}), size: CGSize(width: 402, height: 1400))
        ecran = rendu
        XCTAssertFalse(rendu.identifiers.contains("game.hero.level.step"))
    }
}

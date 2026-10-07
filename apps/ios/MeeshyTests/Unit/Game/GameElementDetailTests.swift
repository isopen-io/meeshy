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

    override func tearDown() {
        ecran?.dismount()
        ecran = nil
        super.tearDown()
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
            "mission", "chest", "coin", "ring", "treasury", "elan",
        ])
        XCTAssertEqual(GameElementKind.families.filter { $0.how == .gives }.map(\.rawValue), ["flame", "mission", "chest", "elan"])
        XCTAssertEqual(GameDetailFactKey.allCases.map(\.rawValue), [
            "tier", "score", "level_next", "level_record", "tailwind", "mint_price", "mint_missing", "can_mint", "factor",
            "mint_next", "mint_glory", "minted", "glory", "glory_missing", "streak", "streak_record", "flame_state",
            "missions_done", "league_place", "week_points", "league_zone", "league_missing", "league_closes",
            "league_friends", "season", "season_week", "season_steps", "season_stars", "prestige_glory", "elan_families",
            "badges_earned", "defis_earned", "succes_earned", "trophies", "showcase_visibility", "atlas_stamps", "atlas_pending",
        ])
        XCTAssertEqual(GameElementKind.families.count, 18)
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
        let facts = ProgressionConceptModel.facts(.level, progress: served, game: game)
        let tier = facts.first { $0.detail == .tier }
        XCTAssertNotNil(tier, "la ligne du palier porte sa clé")
        XCTAssertEqual(tier.map { GameElementDetails.fact($0, of: .level).what }, GameDetailText.fact(.tier))

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
        XCTAssertEqual(out.status, .locked(missing: GameDetailText.missing("4"), progress: item(lit: false).progress))
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

    /// Les trois emblèmes dessinés sont ceux du partagé, forme pour forme (`concept-emblems.ts`).
    func test_theThreeDrawnEmblems_mirrorTheSharedTable() {
        XCTAssertEqual(ConceptEmblemDesign.Kind.allCases.map(\.rawValue), ["points", "elans", "dashboard"])
        let points = ConceptEmblemDesign.of(.points)
        XCTAssertEqual(points.paint, .indigo)
        XCTAssertEqual(points.body, .circle(center: CGPoint(x: 34, y: 38), radius: 28))
        XCTAssertEqual(points.signature, .init(center: CGPoint(x: 34, y: 38), size: 38, strokeWidth: 100))
        let elans = ConceptEmblemDesign.of(.elans)
        XCTAssertEqual(elans.paint, .flame)
        XCTAssertEqual(elans.body, .rect(CGRect(x: 8, y: 8, width: 56, height: 56), radius: 18))
        XCTAssertEqual(elans.accents, [.chevron([CGPoint(x: 23, y: 30), CGPoint(x: 36, y: 17), CGPoint(x: 49, y: 30)], lineWidth: 6)])
        let dashboard = ConceptEmblemDesign.of(.dashboard)
        XCTAssertEqual(dashboard.paint, .silver)
        XCTAssertEqual(dashboard.accents.count, 3, "trois barres qui grandissent")
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
        XCTAssertTrue(rendu.node("game.detail.locked")?.label?.contains(GameDetailText.missing("4")) ?? false,
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
}

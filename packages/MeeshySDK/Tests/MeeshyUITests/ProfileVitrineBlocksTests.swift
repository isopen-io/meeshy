import Testing
import Foundation
import MeeshySDK
@testable import MeeshyUI

/// La Vitrine d'un autre (#19416, planches `Autre-Vitrine`, `Etat-HorsLigne`) : « En direct » n'existe que dès Proche
/// et ne dit que ce qui est servi, « Son jeu » complète sa rangée de trophées, et le fuseau se lit en heure locale.
@Suite("La Vitrine d'un autre : avec lui, en direct, son jeu")
struct ProfileVitrineBlocksTests {

    private static let place = ProfileLiveBoard.Place(name: "Alfama", detail: "Quartier · encore 42 min")
    private static let battery = ProfileLiveBoard.Battery(level: 64, isCharging: false)
    private static let since = Date(timeIntervalSince1970: 1_800_000_000)

    private static func board(level: RelationLevel = .close,
                              place: ProfileLiveBoard.Place? = Self.place,
                              battery: ProfileLiveBoard.Battery? = Self.battery,
                              unreachableSince: Date? = nil,
                              isOnline: Bool = true,
                              staleAge: TimeInterval? = nil) -> ProfileLiveBoard? {
        ProfileLiveBoard.resolve(level: level, place: place, battery: battery, unreachableSince: unreachableSince,
                                 isOnline: isOnline, staleAge: staleAge)
    }

    // MARK: En direct

    @Test("sous Proche, rien : ni le lieu, ni la batterie, ni le téléphone", arguments: [
        RelationLevel.public, .community, .acquaintance, .friend
    ])
    func live_belowClose_isAbsent(level: RelationLevel) {
        #expect(Self.board(level: level) == nil)
    }

    @Test("dès Proche et au Sang, le bloc porte ce qui est servi", arguments: [RelationLevel.close, .blood])
    func live_fromClose_carriesWhatIsServed(level: RelationLevel) throws {
        let board = try #require(Self.board(level: level))
        #expect(board.place == Self.place)
        #expect(board.battery == Self.battery)
        #expect(board.phone == .reachable)
        #expect(!board.isStale)
    }

    @Test("dès Proche, sans rien de servi ni présence, le bloc ne se pose pas")
    func live_nothingServed_isAbsent() {
        #expect(Self.board(place: nil, battery: nil, isOnline: false) == nil)
    }

    @Test("un épisode d'injoignabilité se dit, daté, même en ligne")
    func live_unreachable_winsOverPresence() throws {
        let board = try #require(Self.board(unreachableSince: Self.since))
        #expect(board.phone == .unreachable(since: Self.since))
    }

    @Test("hors ligne, « Joignable » ne s'affirme plus, le reste se lit comme dernières infos")
    func live_stale_neverClaimsReachable() throws {
        let board = try #require(Self.board(staleAge: 3 * 3600))
        #expect(board.isStale)
        #expect(board.staleAge == TimeInterval(3 * 3600))
        #expect(board.phone == nil)
        #expect(board.place == Self.place)
    }

    @Test("hors ligne, l'humeur rejoint les dernières infos ; en direct, elle reste sous le nom")
    func live_mood_onlyWhenStale() throws {
        let stale = try #require(ProfileLiveBoard.resolve(level: .close, place: nil, battery: Self.battery,
                                                          unreachableSince: nil, isOnline: false,
                                                          staleAge: 3 * 3600, mood: "🧭"))
        #expect(stale.mood == "🧭")
        let live = try #require(ProfileLiveBoard.resolve(level: .close, place: nil, battery: Self.battery,
                                                         unreachableSince: nil, isOnline: true,
                                                         staleAge: nil, mood: "🧭"))
        #expect(live.mood == nil)
    }

    @Test("hors ligne, l'humeur seule suffit à poser les dernières infos, mais jamais sous Proche")
    func live_moodAlone_respectsTheCircle() {
        let close = ProfileLiveBoard.resolve(level: .close, place: nil, battery: nil, unreachableSince: nil,
                                             isOnline: false, staleAge: 60, mood: "🧭")
        #expect(close?.mood == "🧭")
        let friend = ProfileLiveBoard.resolve(level: .friend, place: nil, battery: nil, unreachableSince: nil,
                                              isOnline: false, staleAge: 60, mood: "🧭")
        #expect(friend == nil)
        let empty = ProfileLiveBoard.resolve(level: .close, place: nil, battery: nil, unreachableSince: nil,
                                             isOnline: false, staleAge: 60, mood: "")
        #expect(empty == nil)
    }

    @Test("la batterie reste entre 0 et 100")
    func battery_isClamped() {
        #expect(ProfileLiveBoard.Battery(level: 140, isCharging: true).level == 100)
        #expect(ProfileLiveBoard.Battery(level: -3, isCharging: false).level == 0)
    }

    // MARK: Son jeu

    private static func trophy(_ id: String) -> ProfileGameBoard.Trophy {
        ProfileGameBoard.Trophy(id: id, systemImage: "trophy.fill", kind: .warn, title: id)
    }

    @Test("trois trophées : trois gagnés et deux places verrouillées, « sur 5 »")
    func game_threeTrophies_completeTheRow() {
        let board = ProfileGameBoard(level: 31, rankName: "Platine I", levelProgress: 0.74, sparks: "2 410",
                                     trophies: ["a", "b", "c"].map(Self.trophy))
        #expect(board.shownTrophies.count == 3)
        #expect(board.lockedSlots == 2)
        #expect(board.trophyTotal == 5)
    }

    @Test("sans trophée, aucune place verrouillée : la rangée ne se pose pas")
    func game_noTrophy_noLockedSlot() {
        let board = ProfileGameBoard(level: 3, rankName: "Murmure V", levelProgress: 0.2, sparks: nil, trophies: [])
        #expect(board.lockedSlots == 0)
    }

    @Test("au-delà de cinq trophées, la rangée en montre cinq et le total les compte tous")
    func game_manyTrophies_showFive() {
        let board = ProfileGameBoard(level: 40, rankName: "Mythe", levelProgress: 2,
                                     sparks: nil, trophies: (1...7).map { Self.trophy("t\($0)") })
        #expect(board.shownTrophies.count == 5)
        #expect(board.lockedSlots == 0)
        #expect(board.trophyTotal == 7)
        #expect(board.levelProgress == 1)
    }

    @Test("#19854 : sous « Niveau N », le total d'étincelles — jamais le mot « rang »")
    @MainActor func game_caption_saysTheLevelAndItsSparks() {
        let board = ProfileGameBoard(level: 6, rankName: "Murmure V", levelProgress: 0.4, sparks: "3 748", trophies: [])
        #expect(board.caption == ProfileVitrineCopy.levelAndSparks(6, sparks: "3 748"))
        #expect(board.caption.contains("3 748"))
        #expect(board.caption != ProfileVitrineCopy.levelAndRank(6))
    }

    @Test("#19854 : sans étincelles servies, la légende ne dit que le niveau")
    @MainActor func game_caption_withoutSparks_isTheLevel() {
        let board = ProfileGameBoard(level: 6, rankName: "Murmure V", levelProgress: 0.4, sparks: nil, trophies: [])
        #expect(board.caption == ProfileVitrineCopy.level(6))
    }

    @Test("#19854 : le palier, le blason du rang et la Gloire voyagent avec la carte")
    func game_board_carriesTierCrestAndGlory() {
        let crest = ProfileGameBoard.Crest(rank: .murmure, division5: .v, mythic: nil)
        let board = ProfileGameBoard(level: 6, rankName: "Murmure V", levelProgress: 0.4, sparks: "3 748", trophies: [],
                                     tier: .etincelle, crest: crest, glory: "♛ 0", gloryLabel: "0 de gloire")
        #expect(board.tier == .etincelle)
        #expect(board.crest == crest)
        #expect(board.glory == "♛ 0")
    }

    // MARK: Les mots

    @Test("le prénom nomme la personne dans un titre court")
    func firstName_isTheFirstWord() {
        #expect(ProfileVitrineCopy.firstName("  Léo Marchetti ") == "Léo")
        #expect(ProfileVitrineCopy.firstName("leo.m") == "leo.m")
    }

    @Test("le décalage se dit en heures, et en minutes quand il y en a")
    func utcOffset_readsHoursAndMinutes() {
        #expect(ProfileVitrineCopy.utcOffset(0) == "UTC+0")
        #expect(ProfileVitrineCopy.utcOffset(19_800) == "UTC+5:30")
        #expect(ProfileVitrineCopy.utcOffset(-10_800) == "UTC-3")
    }

    @MainActor
    @Test("le fuseau se lit « UTC+0 · 16:42 chez Léo », l'heure calculée chez lui")
    func localTime_isComputedInTheirZone() {
        let now = Date(timeIntervalSince1970: 1_794_933_720)
        let french = Locale(identifier: "fr_FR")
        let text = ProfileVitrineCopy.localTime(timezone: "Europe/Lisbon", name: "Léo Marchetti", now: now, locale: french)
        #expect(text.hasPrefix("UTC+0 · "), "\(text)")
        #expect(text.contains(ProfileVitrineCopy.clock(now, in: TimeZone(identifier: "Europe/Lisbon")!, locale: french)),
                "\(text)")
        #expect(text.hasSuffix("Léo"), "\(text)")
        #expect(!text.contains("Marchetti"), "\(text)")
    }

    @MainActor
    @Test("un fuseau inconnu garde la chaîne servie")
    func localTime_unknownZone_keepsTheServedString() {
        #expect(ProfileVitrineCopy.localTime(timezone: "Mars/Olympus", name: "Léo", now: Date()) == "Mars/Olympus")
    }

    @MainActor
    @Test("« Avec Léo » ne porte que le prénom")
    func withThemTitle_usesTheFirstName() {
        let title = ProfileVitrineCopy.withThemTitle("Léo Marchetti")
        #expect(title.contains("Léo"))
        #expect(!title.contains("Marchetti"))
    }

    @MainActor
    @Test("un trophée ne se dit pas comme plusieurs")
    func trophies_singularDiffersFromPlural() {
        let one = ProfileVitrineCopy.trophies(earned: 1, total: 5)
        let many = ProfileVitrineCopy.trophies(earned: 2, total: 5)
        #expect(one != many.replacingOccurrences(of: "2", with: "1"))
    }

    @Test("l'heure d'un fuseau se calcule dans ce fuseau")
    func clock_usesTheZone() {
        let now = Date(timeIntervalSince1970: 0)
        let posix = Locale(identifier: "en_US_POSIX")
        let utc = ProfileVitrineCopy.clock(now, in: TimeZone(identifier: "UTC")!, locale: posix)
        let tokyo = ProfileVitrineCopy.clock(now, in: TimeZone(identifier: "Asia/Tokyo")!, locale: posix)
        #expect(utc != tokyo)
    }
}

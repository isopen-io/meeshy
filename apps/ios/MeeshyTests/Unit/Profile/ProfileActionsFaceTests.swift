import XCTest
import MeeshySDK
@testable import Meeshy

/// Ma face Actions (#19469, planche `Moi-Actions`) : « Montrer » rejoue Mon QR, Scanner et Sans contact ; « Ma
/// position » dit son état ; le fantôme global s'applique aussitôt et se défait sur un refus ; « Mes contenus » montre
/// ses nombres dès qu'ils sont servis.
@MainActor
final class ProfileActionsFaceTests: XCTestCase {

    final class FakeGhostService: LocationGhostProviding, @unchecked Sendable {
        var answer: Result<LocationGhostState, Error> = .success(LocationGhostState(ghost: true))
        var asked: [Bool] = []

        func setGhost(_ ghost: Bool) async throws -> LocationGhostState {
            asked.append(ghost)
            return try answer.get()
        }
    }

    final class GhostMemory: BloodGhostStoring {
        var isGhost = false
        nonisolated deinit {}
    }

    private func served(_ key: String) -> String { Bundle.main.localizedString(forKey: key, value: nil, table: nil) }

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    // MARK: - Ma position

    func test_positionSubtitle_notShared_saysNobodySeesMe_andOffersToShare() {
        XCTAssertEqual(ProfileActionsCopy.positionSubtitle(recipients: 0, isGhost: false), served("profile.actions.position.off"))
        XCTAssertTrue(ProfileActionsCopy.positionOffersShare(recipients: 0, isGhost: false))
    }

    func test_positionSubtitle_shared_saysHowManySeeMe_andLeadsToTheMapWithoutShare() {
        let subtitle = ProfileActionsCopy.positionSubtitle(recipients: 3, isGhost: false)
        XCTAssertTrue(subtitle.contains("3"), "le nombre de personnes qui me voient")
        XCTAssertNotEqual(subtitle, served("profile.actions.position.off"))
        XCTAssertFalse(ProfileActionsCopy.positionOffersShare(recipients: 3, isGhost: false))
    }

    func test_positionSubtitle_underTheGhost_isPaused_evenWhenShared_andNeverOffersToShare() {
        let paused = served("profile.actions.position.ghost")
        XCTAssertEqual(ProfileActionsCopy.positionSubtitle(recipients: 0, isGhost: true), paused)
        XCTAssertEqual(ProfileActionsCopy.positionSubtitle(recipients: 2, isGhost: true), paused)
        XCTAssertFalse(ProfileActionsCopy.positionOffersShare(recipients: 0, isGhost: true))
    }

    // MARK: - Le fantôme global

    func test_ghost_startsFromTheRememberedValue() {
        let memory = GhostMemory()
        memory.isGhost = true

        let model = LocationGhostModel(service: FakeGhostService(), store: memory)

        XCTAssertTrue(model.isGhost)
    }

    func test_ghost_appliesAtOnce_thenRemembersWhatTheServerSet() async {
        let service = FakeGhostService()
        let memory = GhostMemory()
        let model = LocationGhostModel(service: service, store: memory)

        let accepted = await model.toggle()

        XCTAssertTrue(accepted)
        XCTAssertEqual(service.asked, [true])
        XCTAssertTrue(model.isGhost)
        XCTAssertTrue(memory.isGhost, "la mémoire que l'enregistreur Sang lit dit le même fantôme")
        XCTAssertFalse(model.isBusy)
    }

    func test_ghost_aRefusalUndoesTheGesture_andLeavesTheMemoryUntouched() async {
        let service = FakeGhostService()
        service.answer = .failure(URLError(.notConnectedToInternet))
        let memory = GhostMemory()
        let model = LocationGhostModel(service: service, store: memory)

        let accepted = await model.toggle()

        XCTAssertFalse(accepted)
        XCTAssertFalse(model.isGhost)
        XCTAssertFalse(memory.isGhost)
    }

    func test_ghost_leaving_putsFalse_andForgetsTheGhost() async {
        let service = FakeGhostService()
        service.answer = .success(LocationGhostState(ghost: false))
        let memory = GhostMemory()
        memory.isGhost = true
        let model = LocationGhostModel(service: service, store: memory)

        let accepted = await model.toggle()

        XCTAssertTrue(accepted)
        XCTAssertEqual(service.asked, [false])
        XCTAssertFalse(model.isGhost)
        XCTAssertFalse(memory.isGhost)
    }

    // MARK: - Mes contenus

    func test_savedContentCounts_areTheServedOnes_eachOnItsDoor() {
        let stats = UserStats(starredMessagesCount: 48, bookmarksCount: 112, packsCount: 6)
        XCTAssertEqual(ProfileSavedContentRows.count(of: .starredMessages, in: stats), 48)
        XCTAssertEqual(ProfileSavedContentRows.count(of: .bookmarks, in: stats), 112)
        XCTAssertEqual(ProfileSavedContentRows.count(of: .myPacks, in: stats), 6)
        XCTAssertNil(ProfileSavedContentRows.count(of: .circles, in: stats))
    }

    func test_savedContentCounts_notServed_areAbsent_neverAnInventedZero() {
        XCTAssertNil(ProfileSavedContentRows.count(of: .starredMessages, in: UserStats()))
        XCTAssertNil(ProfileSavedContentRows.count(of: .bookmarks, in: nil))
    }

    func test_savedContentCount_isWrittenByTheLocale() {
        XCTAssertEqual(ProfileSavedContentRows.formatted(12_480, locale: Locale(identifier: "en_US")), "12,480")
    }

    // MARK: - Fait du kit, rejoué depuis la face Liens

    func test_showSection_replaysMyQR_scanner_andContactless_byTheLinksPresentations() throws {
        let face = try code("Meeshy/Features/Profile/Faces/ProfileActionsFace.swift")
        XCTAssertTrue(face.contains("presented = .card(.qr)"), "Mon QR ouvre la carte de profil de la face Liens")
        XCTAssertTrue(face.contains("presented = .scanner"), "Scanner ouvre le lecteur de la face Liens")
        XCTAssertTrue(face.contains("presented = .card(.contactless)"), "Sans contact ouvre la carte sans contact")
        XCTAssertTrue(face.contains("ProfileLinksPresentations("), "les mêmes présentations, jamais redessinées")
        XCTAssertTrue(face.contains("ProfileActionsCopy.myMap"), "Ma carte ouvre la carte de mes proches")
    }

    func test_sharingSection_hasMyPosition_andTheGlobalGhost_asRowsOfTheKit() throws {
        let face = try code("Meeshy/Features/Profile/Faces/ProfileActionsFace.swift")
        XCTAssertTrue(face.contains("ProfileActionsCopy.positionTitle"))
        XCTAssertTrue(face.contains("accessory: .toggle(isOn: ghost.isGhost)"))
        XCTAssertTrue(face.contains("ProfileActionsCopy.ghostSubtitle"))
        XCTAssertFalse(face.contains("LocationMapCopy.nearbyOpen"), "la rangée sans état a laissé la place à « Ma position »")
    }

    func test_sharingSection_ghostLivesUnderMyPosition_inTheSameCard() throws {
        let face = try code("Meeshy/Features/Profile/Faces/ProfileActionsFace.swift")
        let position = try XCTUnwrap(face.range(of: "            positionRow\n"), "#20028 : « Ma position » ouvre sa carte")
        let ghost = try XCTUnwrap(face.range(of: "ProfileNoveltyReader(feature: .ghostMode"))
        let battery = try XCTUnwrap(face.range(of: "BatterySharingSettingsSection("))
        XCTAssertLessThan(position.lowerBound, ghost.lowerBound)
        XCTAssertLessThan(ghost.lowerBound, battery.lowerBound,
                          "#20028 : le fantôme masque ma position — il se range sous elle, pas après l'appel")
    }

    func test_savedContent_isMadeOfTheKit_neverTheOldChrome() throws {
        let rows = try code("Meeshy/Features/Profile/Views/ProfileSavedContentRows.swift")
        XCTAssertTrue(rows.contains("MeeshySectionHeader(title: Self.title)"), "l'en-tête K44")
        XCTAssertTrue(rows.contains("MeeshyToggleRow("), "une rangée K06 par contenu")
        XCTAssertFalse(rows.contains("ProfileSectionHeader("))
        XCTAssertFalse(rows.contains("ProfileNavigationRow("))
    }
}

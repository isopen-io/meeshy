import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// L'étiquette « Nouveau » (#19619, planche `Sys-Boutons` § 10) : une fonction apportée par la planche la porte une
/// seule fois, à sa première apparition, et par compte — Mon lien de profil, Mes adresses, Mode fantôme, Aperçu de ma
/// vitrine, Carte de mes proches.
@MainActor
final class ProfileNoveltyTests: XCTestCase {

    private final class MockProfileNoveltyStorage: ProfileNoveltyStorageProviding {
        var stored: [String: Set<ProfileNovelty>] = [:]
        var saveCount = 0

        func seen(accountId: String) -> Set<ProfileNovelty> { stored[accountId] ?? [] }

        func save(_ seen: Set<ProfileNovelty>, accountId: String) {
            saveCount += 1
            stored[accountId] = seen
        }
    }

    private func makeDefaults() -> UserDefaults {
        let name = "ProfileNoveltyTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name) ?? .standard
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    // MARK: - La loi

    func test_claim_firstAppearance_showsTheLabel_andMarksTheFeatureSeen() {
        let claim = ProfileNoveltyLaw.claim(.myAddresses, accountId: "aissa", seen: [])
        XCTAssertTrue(claim.showsLabel)
        XCTAssertEqual(claim.seen, [.myAddresses])
    }

    func test_claim_onceSeen_showsNothing_andWritesNothing() {
        let claim = ProfileNoveltyLaw.claim(.myAddresses, accountId: "aissa", seen: [.myAddresses, .ghostMode])
        XCTAssertFalse(claim.showsLabel)
        XCTAssertNil(claim.seen)
    }

    func test_claim_keepsWhatWasAlreadySeen_whenAnotherFeatureAppears() {
        let claim = ProfileNoveltyLaw.claim(.profileLink, accountId: "aissa", seen: [.ghostMode])
        XCTAssertTrue(claim.showsLabel)
        XCTAssertEqual(claim.seen, [.ghostMode, .profileLink])
    }

    func test_claim_withoutAKnownAccount_showsNothing_andWritesNothing() {
        for account in [nil, ""] as [String?] {
            let claim = ProfileNoveltyLaw.claim(.vitrinePreview, accountId: account, seen: [])
            XCTAssertFalse(claim.showsLabel)
            XCTAssertNil(claim.seen)
        }
    }

    func test_features_areTheFiveThePlancheBrings() {
        XCTAssertEqual(Set(ProfileNovelty.allCases),
                       [.profileLink, .myAddresses, .ghostMode, .vitrinePreview, .closeOnesMap])
    }

    // MARK: - Le registre

    func test_ledger_showsTheLabelOnce_perFeature() {
        let storage = MockProfileNoveltyStorage()
        let ledger = ProfileNoveltyLedger(storage: storage)
        XCTAssertTrue(ledger.claim(.ghostMode, accountId: "aissa"))
        XCTAssertFalse(ledger.claim(.ghostMode, accountId: "aissa"))
        XCTAssertTrue(ledger.claim(.closeOnesMap, accountId: "aissa"))
        XCTAssertEqual(storage.saveCount, 2)
    }

    func test_ledger_remembersPerAccount_soAnotherAccountStillSeesTheLabel() {
        let ledger = ProfileNoveltyLedger(storage: MockProfileNoveltyStorage())
        XCTAssertTrue(ledger.claim(.profileLink, accountId: "aissa"))
        XCTAssertTrue(ledger.claim(.profileLink, accountId: "leo"))
        XCTAssertFalse(ledger.claim(.profileLink, accountId: "aissa"))
    }

    func test_ledger_withoutAccount_neverWrites() {
        let storage = MockProfileNoveltyStorage()
        let ledger = ProfileNoveltyLedger(storage: storage)
        XCTAssertFalse(ledger.claim(.myAddresses, accountId: nil))
        XCTAssertEqual(storage.saveCount, 0)
    }

    // MARK: - Le stockage local

    func test_userDefaultsStorage_survivesANewLedger_forTheSameAccount() {
        let defaults = makeDefaults()
        XCTAssertTrue(ProfileNoveltyLedger(storage: UserDefaultsProfileNoveltyStorage(defaults: defaults))
            .claim(.vitrinePreview, accountId: "aissa"))
        let reopened = ProfileNoveltyLedger(storage: UserDefaultsProfileNoveltyStorage(defaults: defaults))
        XCTAssertFalse(reopened.claim(.vitrinePreview, accountId: "aissa"))
        XCTAssertTrue(reopened.claim(.vitrinePreview, accountId: "leo"))
    }

    func test_userDefaultsStorage_aDeviceThatAlreadyOpenedTheCloseOnesMap_doesNotSeeItNewAgain() {
        let defaults = makeDefaults()
        defaults.set(true, forKey: UserDefaultsProfileNoveltyStorage.legacyCloseOnesMapKey)
        let ledger = ProfileNoveltyLedger(storage: UserDefaultsProfileNoveltyStorage(defaults: defaults))
        XCTAssertFalse(ledger.claim(.closeOnesMap, accountId: "aissa"))
        XCTAssertTrue(ledger.claim(.ghostMode, accountId: "aissa"))
    }

    func test_userDefaultsStorage_keysAreScopedByAccount() {
        XCTAssertNotEqual(UserDefaultsProfileNoveltyStorage.key(accountId: "aissa"),
                          UserDefaultsProfileNoveltyStorage.key(accountId: "leo"))
    }

    // MARK: - Le libellé

    func test_label_isTheLocalizedNew() {
        XCTAssertFalse(ProfileNoveltyCopy.label.isEmpty)
        XCTAssertNotEqual(ProfileNoveltyCopy.label, "profile.novelty.new")
    }

    // MARK: - Les cinq sites, faits du kit

    func test_theFiveSites_readTheLaw_andPoseTheKitBadge() throws {
        let sites: [(String, String)] = [
            ("Meeshy/Features/Profile/Faces/ProfileLinksFace.swift", ".profileLink"),
            ("Meeshy/Features/Profile/Faces/ProfileLinksFaceSections.swift", ".myAddresses"),
            ("Meeshy/Features/Profile/Links/MyAddressesView.swift", ".myAddresses"),
            ("Meeshy/Features/Profile/Faces/ProfileActionsFace.swift", ".ghostMode"),
            ("Meeshy/Features/Profile/Faces/VitrineSeenAsView.swift", ".vitrinePreview"),
            ("Meeshy/Features/SharedLocation/Map/NearbyMapScreen.swift", ".closeOnesMap")
        ]
        for (path, feature) in sites {
            let source = try code(path)
            XCTAssertTrue(source.contains("ProfileNoveltyReader(feature: \(feature)"), "\(path) lit la loi pour \(feature)")
            XCTAssertFalse(source.contains("LocationMapCopy.isNew"), "\(path) : plus d'étiquette permanente")
        }
    }

    func test_closeOnesMap_noLongerKeepsItsOwnDeviceFlag() throws {
        let source = try code("Meeshy/Features/SharedLocation/Map/NearbyMapScreen.swift")
        XCTAssertFalse(source.contains("@AppStorage(\"locationMap.nearby.opened\")"))
        XCTAssertFalse(source.contains("showsNew"))
    }

    func test_reader_fadesTheLabelAway_withK26_whenTheScreenLeaves() throws {
        let source = try code("Meeshy/Features/Profile/Faces/ProfileNovelty.swift")
        XCTAssertTrue(source.contains(".meeshyMotion(.rise, value: isShown)"), "le fondu suit la table K26")
        XCTAssertTrue(source.contains(".onDisappear"), "l'étiquette part au départ de l'écran")
        XCTAssertTrue(source.contains("MeeshyBadge(.label("), "la pastille du kit (K41), jamais redessinée")
    }
}

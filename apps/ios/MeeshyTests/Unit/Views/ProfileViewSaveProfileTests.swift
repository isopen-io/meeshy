import XCTest
import MeeshySDK
@testable import Meeshy

/// Verrouille les trois mécanismes purs de `saveProfile` :
///
/// 1. `ProfileView.changedOrNil` — distingue « champ inchangé » (nil → omis du
///    PATCH) de « champ effacé intentionnellement » ("" → envoyé verbatim).
///    Depuis 2026-07-24 il route aussi `regionalLanguage` : effacer la langue
///    secondaire doit propager "" au serveur (qui le mappe à null), pas être
///    avalé en nil comme avant.
/// 2. `MeeshyUser.applyingProfileEdits` — l'apply OPTIMISTE doit reporter tout
///    ce que l'éditeur ne montre pas ; un argument omis prend le `= nil` par
///    défaut de `MeeshyUser.init` et EFFACE le champ au lieu de le porter.
/// 3. `ProfileView.mergingServerUser` — la réponse serveur d'une route
///    self-only ne porte pas `voicePublic` ; l'assigner en bloc à
///    `authManager.currentUser` éteindrait la voix publique en silence.
@MainActor
final class ProfileViewSaveProfileTests: XCTestCase {

    /// Fixture COMPLÈTE : chaque champ que l'éditeur de profil ne montre pas est
    /// non-nil, sans quoi un report manquant serait indiscernable d'un report
    /// réussi (nil == nil).
    private func makeFullUser(
        displayName: String = "Alice",
        voicePublic: Bool? = true
    ) -> MeeshyUser {
        MeeshyUser(
            id: "u1", username: "alice", email: "a@b.com",
            firstName: "Alice", lastName: "Smith",
            displayName: displayName, bio: "Hello world",
            avatar: "https://cdn/avatar.jpg", avatarThumbHash: "avatar_thumb_hash",
            banner: "https://cdn/banner.jpg", bannerThumbHash: "banner_thumb_hash",
            role: "USER",
            systemLanguage: "fr", regionalLanguage: "en",
            isOnline: true, lastActiveAt: "2026-08-25T10:00:00Z",
            createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-08-25T10:00:00Z",
            blockedUserIds: ["u999"],
            isActive: true, deactivatedAt: nil,
            isAnonymous: false, isMeeshyer: true,
            phoneNumber: "+33612345678",
            emailVerifiedAt: "2026-01-01T00:00:00Z", phoneVerifiedAt: nil,
            customDestinationLanguage: "es",
            autoTranslateEnabled: true,
            deviceLocale: "fr_FR",
            timezone: "Europe/Paris",
            registrationCountry: "FR",
            profileCompletionRate: 85,
            signalIdentityKeyPublic: "signal_key_123",
            voicePublic: voicePublic,
            voiceSampleUrl: "https://cdn/voice.m4a",
            voiceSampleDurationMs: 4200,
            voiceQuality: 0.87
        )
    }

    func test_changedOrNil_unchangedValue_returnsNil() {
        XCTAssertNil(ProfileView.changedOrNil("en", original: "en"))
    }

    func test_changedOrNil_alreadyEmpty_returnsNil() {
        XCTAssertNil(ProfileView.changedOrNil("", original: nil))
        XCTAssertNil(ProfileView.changedOrNil("", original: ""))
    }

    func test_changedOrNil_clearedRegionalLanguage_returnsEmptyStringNotNil() {
        // "en" → "" : effacement intentionnel de la langue régionale.
        XCTAssertEqual(ProfileView.changedOrNil("", original: "en"), "")
    }

    func test_changedOrNil_changedValue_returnsNewValue() {
        XCTAssertEqual(ProfileView.changedOrNil("es", original: "en"), "es")
    }

    // MARK: - applyingProfileEdits (apply optimiste)

    /// Miroir de `MeeshyUserProfileMutationTests.test_withProfileChanges_allNil_returnsEquivalentUser`
    /// pour l'apply optimiste : éditer UN champ ne doit toucher que lui. Les
    /// sept champs listés en tête étaient absents de l'appel `MeeshyUser(...)`
    /// et repartaient donc à `nil` à chaque enregistrement de la bio.
    func test_applyingProfileEdits_editsBioOnly_carriesOverFieldsTheEditorNeverShows() {
        let user = makeFullUser()

        let updated = user.applyingProfileEdits(bio: "Nouvelle bio")

        XCTAssertEqual(updated.bio, "Nouvelle bio")

        XCTAssertEqual(updated.avatarThumbHash, user.avatarThumbHash)
        XCTAssertEqual(updated.bannerThumbHash, user.bannerThumbHash)
        XCTAssertEqual(updated.deviceLocale, user.deviceLocale)
        XCTAssertEqual(updated.voicePublic, user.voicePublic)
        XCTAssertEqual(updated.voiceSampleUrl, user.voiceSampleUrl)
        XCTAssertEqual(updated.voiceSampleDurationMs, user.voiceSampleDurationMs)
        XCTAssertEqual(updated.voiceQuality, user.voiceQuality)

        XCTAssertEqual(updated.id, user.id)
        XCTAssertEqual(updated.username, user.username)
        XCTAssertEqual(updated.email, user.email)
        XCTAssertEqual(updated.firstName, user.firstName)
        XCTAssertEqual(updated.lastName, user.lastName)
        XCTAssertEqual(updated.displayName, user.displayName)
        XCTAssertEqual(updated.avatar, user.avatar)
        XCTAssertEqual(updated.banner, user.banner)
        XCTAssertEqual(updated.role, user.role)
        XCTAssertEqual(updated.systemLanguage, user.systemLanguage)
        XCTAssertEqual(updated.regionalLanguage, user.regionalLanguage)
        XCTAssertEqual(updated.customDestinationLanguage, user.customDestinationLanguage)
        XCTAssertEqual(updated.blockedUserIds, user.blockedUserIds)
        XCTAssertEqual(updated.isAnonymous, user.isAnonymous)
        XCTAssertEqual(updated.isMeeshyer, user.isMeeshyer)
        XCTAssertEqual(updated.autoTranslateEnabled, user.autoTranslateEnabled)
        XCTAssertEqual(updated.timezone, user.timezone)
        XCTAssertEqual(updated.registrationCountry, user.registrationCountry)
        XCTAssertEqual(updated.profileCompletionRate, user.profileCompletionRate)
        XCTAssertEqual(updated.signalIdentityKeyPublic, user.signalIdentityKeyPublic)
    }

    // MARK: - mergingServerUser (réponse serveur → currentUser)

    func test_saveProfile_serverResponseWithoutVoicePublic_keepsLocalVoicePublic() {
        let local = makeFullUser(voicePublic: true)
        let server = makeFullUser(displayName: "Alice B", voicePublic: nil)

        let merged = ProfileView.mergingServerUser(server, onto: local)

        XCTAssertEqual(
            merged.voicePublic, true,
            "aucune route self-only ne porte voicePublic — la valeur locale doit survivre"
        )
        XCTAssertEqual(
            merged.displayName, "Alice B",
            "la réponse serveur reste canonique pour les champs qu'elle porte"
        )
    }

    func test_mergingServerUser_localVoicePublicIsFalse_carriesFalseOver() {
        let local = makeFullUser(voicePublic: false)
        let server = makeFullUser(voicePublic: nil)

        XCTAssertEqual(ProfileView.mergingServerUser(server, onto: local).voicePublic, false)
    }

    func test_mergingServerUser_serverCarriesVoicePublic_serverWins() {
        let local = makeFullUser(voicePublic: true)
        let server = makeFullUser(voicePublic: false)

        XCTAssertEqual(ProfileView.mergingServerUser(server, onto: local).voicePublic, false)
    }

    func test_mergingServerUser_noLocalUser_returnsServerUnchanged() {
        let server = makeFullUser(voicePublic: nil)

        let merged = ProfileView.mergingServerUser(server, onto: nil)

        XCTAssertNil(merged.voicePublic)
        XCTAssertEqual(merged.id, server.id)
        XCTAssertEqual(merged.displayName, server.displayName)
    }

    // MARK: - Garde de source : les trois sites passent par la fusion

    /// `mergingServerUser` est pur et testable, mais rien ne prouve qu'il soit
    /// BRANCHÉ : les trois écritures de `authManager.currentUser` vivent dans
    /// des `Task` de la vue, hors de portée d'un test unitaire. Cette garde vise
    /// les trois BLOCS (jamais le fichier entier) et porte sa contre-épreuve :
    /// réintroduire l'affectation en bloc `= updatedUser` la fait rougir.
    private func profileViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ProfileView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func body(of declaration: String, in source: String) throws -> String {
        let start = try XCTUnwrap(
            source.range(of: declaration),
            "ProfileView.swift doit déclarer \(declaration)"
        )
        let rest = source[start.upperBound...]
        guard let end = rest.range(of: "\n    private func ") else { return String(rest) }
        return String(rest[..<end.lowerBound])
    }

    func test_serverUserAssignments_inTheThreeUploadPaths_goThroughMergingServerUser() throws {
        let source = try profileViewSource()

        for declaration in [
            "private func saveProfile()",
            "private func uploadAvatar(",
            "private func uploadBanner("
        ] {
            let block = try body(of: declaration, in: source)
            XCTAssertTrue(
                block.contains("Self.mergingServerUser(updatedUser, onto: authManager.currentUser)"),
                "\(declaration) doit fusionner la réponse serveur au lieu de l'assigner en bloc"
            )
            XCTAssertFalse(
                block.contains("authManager.currentUser = updatedUser"),
                "\(declaration) réassigne currentUser en bloc — voicePublic repart à nil"
            )
        }
    }
}

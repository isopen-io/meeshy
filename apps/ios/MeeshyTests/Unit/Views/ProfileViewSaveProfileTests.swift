import XCTest
import MeeshySDK
import MeeshyUI
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

    // MARK: - Bornes d'identité (#13825)

    func test_identityValueToSend_isTrimmed() {
        XCTAssertEqual(ProfileView.identityValueToSend("  Al ", original: nil), "Al")
        XCTAssertEqual(ProfileView.identityValueToSend("Alice", original: "Alicia"), "Alice")
    }

    func test_identityValueToSend_emptyOrUnchanged_isOmitted() {
        XCTAssertNil(ProfileView.identityValueToSend("   ", original: nil))
        XCTAssertNil(ProfileView.identityValueToSend("", original: "Alice"))
        XCTAssertNil(ProfileView.identityValueToSend("Alice", original: "Alice"))
        XCTAssertNil(ProfileView.identityValueToSend(" Alice ", original: "Alice"))
    }

    /// Un prénom hérité d'un caractère, que l'utilisateur ne touche pas, ne
    /// doit pas empêcher d'enregistrer une autre modification.
    func test_identityValueToSend_aLegacyOneCharacterValueLeftAlone_isOmitted() {
        XCTAssertNil(ProfileView.identityValueToSend("A", original: "A"))
        XCTAssertEqual(ProfileView.identityValueToSend("B", original: "A"), "B")
    }

    func test_identityRefusalMessage_aOneCharacterName_namesTheFieldAndTheMinimum() {
        let message = ProfileView.identityRefusalMessage(firstName: "A", lastName: nil, displayName: nil)

        XCTAssertEqual(
            message,
            "\(String(localized: "profile.first_name", bundle: .main)) : \(SignupViewModel.minimumLengthMessage(for: .firstName))"
        )
        XCTAssertTrue(message?.contains("2") ?? false)
    }

    func test_identityRefusalMessage_pointsAtEachFieldInTurn() {
        XCTAssertTrue(
            ProfileView.identityRefusalMessage(firstName: nil, lastName: "B", displayName: nil)?
                .hasPrefix(String(localized: "profile.last_name", bundle: .main)) ?? false
        )
        XCTAssertTrue(
            ProfileView.identityRefusalMessage(firstName: nil, lastName: nil, displayName: "C")?
                .hasPrefix(String(localized: "profile.display_name", bundle: .main)) ?? false
        )
    }

    func test_identityRefusalMessage_twoCharactersOrNothing_isNil() {
        XCTAssertNil(ProfileView.identityRefusalMessage(firstName: "Al", lastName: "Li", displayName: "Sy"))
        XCTAssertNil(ProfileView.identityRefusalMessage(firstName: nil, lastName: nil, displayName: nil))
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
            .appendingPathComponent("Meeshy/Features/Profile/Views/ProfileView.swift")
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

    /// La photo et la bannière partagent un seul envoi (`upload(_:as:)`) : la garde vise ce bloc, et vérifie que les
    /// deux portes y mènent bien, chacune avec son emplacement — une porte qui contournerait l'envoi commun rougit ici.
    func test_bothImageUploads_goThroughTheSharedUpload_withTheirOwnSlot() throws {
        let source = try profileViewSource()

        for (declaration, call) in [
            ("private func uploadAvatar(", "upload(image, as: .avatar)"),
            ("private func uploadBanner(", "upload(image, as: .banner)")
        ] {
            let block = try body(of: declaration, in: source)
            XCTAssertTrue(block.contains(call), "\(declaration) doit passer par l'envoi commun : \(call)")
            XCTAssertFalse(block.contains("authManager.currentUser ="), "\(declaration) écrit currentUser hors de l'envoi commun")
        }
    }

    func test_serverUserAssignments_inTheThreeUploadPaths_goThroughMergingServerUser() throws {
        let source = try profileViewSource()

        for declaration in [
            "private func saveProfile()",
            "private func upload("
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

    // MARK: - La ville déclarée (#19388)

    private func makeUserInDakar() -> MeeshyUser {
        makeFullUser().withDeclaredCity("Dakar", circle: .friend)
    }

    func test_cityEditToSend_untouchedCityAndCircle_sendsNothing() {
        let edit = ProfileView.cityEditToSend(typed: " Dakar ", circle: .friend, original: makeUserInDakar())
        XCTAssertNil(edit.city)
        XCTAssertNil(edit.circle)
    }

    func test_cityEditToSend_aNewCityAndCircle_areSent() {
        let edit = ProfileView.cityEditToSend(typed: "Lisbonne", circle: .close, original: makeUserInDakar())
        XCTAssertEqual(edit.city, "Lisbonne")
        XCTAssertEqual(edit.circle, .close)
    }

    func test_cityEditToSend_aClearedCity_isSentEmptyNotOmitted() {
        let edit = ProfileView.cityEditToSend(typed: "   ", circle: .friend, original: makeUserInDakar())
        XCTAssertEqual(edit.city, "")
        XCTAssertNil(edit.circle)
    }

    func test_applyingProfileEdits_carriesTheDeclaredCity() {
        let updated = makeUserInDakar().applyingProfileEdits(bio: "Nouvelle bio")
        XCTAssertEqual(updated.declaredCity, "Dakar")
        XCTAssertEqual(updated.declaredCityCircle, .friend)
    }

    func test_mergingServerUser_aResponseWithoutTheCity_keepsTheOptimisticCity() {
        let local = makeUserInDakar()
        let merged = ProfileView.mergingServerUser(makeFullUser(displayName: "Alice B"), onto: local)
        XCTAssertEqual(merged.declaredCity, "Dakar")
        XCTAssertEqual(merged.declaredCityCircle, .friend)
    }

    func test_mergingServerUser_aResponseWithTheCity_serverWins() {
        let server = makeFullUser().withDeclaredCity("Porto", circle: .public)
        let merged = ProfileView.mergingServerUser(server, onto: makeUserInDakar())
        XCTAssertEqual(merged.declaredCity, "Porto")
        XCTAssertEqual(merged.declaredCityCircle, .public)
    }

    // MARK: - L'accent de ma vitrine (#19391)

    private func tone(_ key: String) throws -> ProfileAccent.Tone {
        try XCTUnwrap(ProfileAccent.tones.first { $0.key == key })
    }

    func test_accentEditToSend_theAccentIHold_sendsNothing() throws {
        let user = makeFullUser().withProfileAccent("#A855F7")
        let violet = try tone("violet")
        XCTAssertNil(ProfileView.accentEditToSend(.tone(violet), original: user))
        XCTAssertNil(ProfileView.accentEditToSend(.automatic, original: makeFullUser()))
    }

    func test_accentEditToSend_aNewToneOrAutomatic_isSent() throws {
        let user = makeFullUser().withProfileAccent("#A855F7")
        let green = try tone("green")
        XCTAssertEqual(ProfileView.accentEditToSend(.tone(green), original: user), .tone(green))
        XCTAssertEqual(ProfileView.accentEditToSend(.automatic, original: user), .automatic)
    }

    func test_vitrineAccentHex_whileChoosing_paintsTheChoiceLive() throws {
        let user = makeFullUser().withProfileAccent("#A855F7")
        XCTAssertEqual(ProfileView.vitrineAccentHex(of: user, choosing: nil), "A855F7", "au repos, l'accent tenu")
        let coral = try tone("coral")
        XCTAssertEqual(ProfileView.vitrineAccentHex(of: user, choosing: .tone(coral)), "FF6B6B")
        let computed = DynamicColorGenerator.profileAccentHex(userId: "u1", name: "Alice")
        XCTAssertEqual(ProfileView.vitrineAccentHex(of: user, choosing: .automatic), computed)
        XCTAssertNil(ProfileView.vitrineAccentHex(of: nil, choosing: .automatic))
    }

    func test_applyingProfileEdits_carriesTheChosenAccent() {
        let updated = makeFullUser().withProfileAccent("#3498DB").applyingProfileEdits(bio: "Nouvelle bio")
        XCTAssertEqual(updated.profileAccentColor, "#3498DB")
    }

    func test_mergingServerUser_aResponseWithoutTheAccent_keepsTheOptimisticOne() {
        let merged = ProfileView.mergingServerUser(makeFullUser(), onto: makeFullUser().withProfileAccent("#F8B500"))
        XCTAssertEqual(merged.profileAccentColor, "#F8B500")
    }

    func test_mergingServerUser_aResponseWithTheAccent_serverWins() {
        let server = makeFullUser().withProfileAccent("#FF2E63")
        let merged = ProfileView.mergingServerUser(server, onto: makeFullUser().withProfileAccent("#F8B500"))
        XCTAssertEqual(merged.profileAccentColor, "#FF2E63")
    }

    func test_accentDots_areTheSevenTonesThenAutomatic_eachNamed() {
        let dots = ProfileAccentCopy.dots
        XCTAssertEqual(dots.map(\.id), ProfileAccent.tones.map(\.key) + [ProfileAccentCopy.automaticDot])
        XCTAssertTrue(dots.allSatisfy { !($0.name ?? "").isEmpty }, "VoiceOver dit le nom de chaque teinte, jamais son code")
        XCTAssertEqual(Set(dots.compactMap(\.name)).count, dots.count, "deux pastilles ne portent pas le même nom")
    }

    func test_accentDot_roundTripsWithTheChoice() throws {
        let violet = try tone("violet")
        XCTAssertEqual(ProfileAccentCopy.dotId(of: .tone(violet)), "violet")
        XCTAssertEqual(ProfileAccentCopy.choice(forDot: "violet"), .tone(violet))
        XCTAssertEqual(ProfileAccentCopy.dotId(of: .automatic), ProfileAccentCopy.automaticDot)
        XCTAssertEqual(ProfileAccentCopy.choice(forDot: ProfileAccentCopy.automaticDot), .automatic)
        XCTAssertEqual(ProfileAccentCopy.choice(forDot: "inconnue"), .automatic, "jamais une teinte hors liste")
    }

    func test_accentPreview_saysTheToneTheBannerTakes() throws {
        let violet = try tone("violet")
        let format = Bundle.main.localizedString(forKey: "profile.accent.preview", value: nil, table: nil)
        XCTAssertEqual(ProfileAccentCopy.preview(of: .tone(violet)), String(format: format, ProfileAccentCopy.name(of: violet)))
        XCTAssertNotEqual(ProfileAccentCopy.preview(of: .automatic), ProfileAccentCopy.preview(of: .tone(violet)))
    }

    func test_profileView_mountsTheAccentSection_andPaintsTheBannerWithIt() throws {
        let profile = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Profile/Views/ProfileView.swift"))
        XCTAssertTrue(profile.contains("ProfileAccentSection(choice: $accentChoice"), "« Couleur d'accent » vit dans l'édition de ma vitrine")
        XCTAssertTrue(profile.contains("ProfileOwnBanner(user: user, accentColor: shownAccentHex"), "la bannière prend l'aperçu en direct")
    }

    // MARK: - Ma voix, la traduction automatique et le chiffrement (#19512)

    func test_editSettings_startFromWhatIHold() {
        let settings = ProfileEditSettings.make(user: makeFullUser(voicePublic: false))
        XCTAssertEqual(settings, ProfileEditSettings(voicePublic: false, autoTranslate: true))
    }

    func test_editSettings_withoutServedAutoTranslate_offerNoSwitch() {
        let bare = MeeshyUser(id: "u1", username: "alice")
        XCTAssertNil(ProfileEditSettings.make(user: bare).autoTranslate, "champ absent : l'interrupteur ne paraît pas")
        XCTAssertNil(ProfileEditSettings.make(user: nil).autoTranslate)
    }

    func test_editSettings_untouched_sendNothing() {
        let user = makeFullUser(voicePublic: true)
        let settings = ProfileEditSettings.make(user: user)
        XCTAssertNil(settings.voicePublicToSend(original: user))
        XCTAssertNil(settings.autoTranslateToSend(original: user))
    }

    func test_editSettings_switched_sendTheNewValues() {
        let user = makeFullUser(voicePublic: true)
        let settings = ProfileEditSettings(voicePublic: false, autoTranslate: false)
        XCTAssertEqual(settings.voicePublicToSend(original: user), false)
        XCTAssertEqual(settings.autoTranslateToSend(original: user), false)
    }

    func test_editSettings_voiceNeverServedAndStillPrivate_sendNothing() {
        let user = makeFullUser(voicePublic: nil)
        XCTAssertNil(ProfileEditSettings(voicePublic: false, autoTranslate: nil).voicePublicToSend(original: user))
        XCTAssertEqual(ProfileEditSettings(voicePublic: true, autoTranslate: nil).voicePublicToSend(original: user), true)
    }

    func test_applyingProfileEdits_appliesTheVoiceAndTheTranslationSwitches() {
        let updated = makeFullUser(voicePublic: true).applyingProfileEdits(autoTranslateEnabled: false, voicePublic: false)
        XCTAssertEqual(updated.voicePublic, false)
        XCTAssertEqual(updated.autoTranslateEnabled, false)
        let untouched = makeFullUser(voicePublic: true).applyingProfileEdits(bio: "x")
        XCTAssertEqual(untouched.voicePublic, true)
        XCTAssertEqual(untouched.autoTranslateEnabled, true)
    }

    func test_applyingProfileEdits_carriesWhetherIAcceptFriendRequests() {
        let user = MeeshyUser(id: "u1", username: "alice", acceptsFriendRequests: false)
        XCTAssertEqual(user.applyingProfileEdits(bio: "x").acceptsFriendRequests, false)
    }

    func test_voiceBlock_atRest_listensOnlyToAServedSample() {
        let sample = ProfileVoiceSample.make(user: makeFullUser())
        XCTAssertEqual(ProfileVoiceBlock.resolve(sample: sample, isEditing: false), .listen)
        XCTAssertEqual(ProfileVoiceBlock.resolve(sample: nil, isEditing: false), .none)
    }

    func test_voiceBlock_inEdition_setsTheSampleOrOffersToRecordOne() {
        let sample = ProfileVoiceSample.make(user: makeFullUser())
        XCTAssertEqual(ProfileVoiceBlock.resolve(sample: sample, isEditing: true), .edit)
        XCTAssertEqual(ProfileVoiceBlock.resolve(sample: nil, isEditing: true), .record)
    }

    func test_encryptionBadge_saysOnlyWhatTheKeysProve() {
        XCTAssertTrue(ProfileView.showsEncryptionBadge(isEditing: false, hasSignalKeys: true))
        XCTAssertFalse(ProfileView.showsEncryptionBadge(isEditing: false, hasSignalKeys: false))
        XCTAssertFalse(ProfileView.showsEncryptionBadge(isEditing: false, hasSignalKeys: nil), "non servi : rien n'est affirmé")
        XCTAssertFalse(ProfileView.showsEncryptionBadge(isEditing: true, hasSignalKeys: true), "l'édition ne la montre pas")
    }

    func test_encryptionMemory_servesTheLastKnownStateFirst_perAccount() throws {
        let suite = "ProfileOwnEncryptionMemoryTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let memory = ProfileOwnEncryptionMemory(defaults: defaults)
        XCTAssertNil(memory.remembered(userId: "u1"))
        memory.remember(true, userId: "u1")
        memory.remember(nil, userId: "u1")
        XCTAssertEqual(memory.remembered(userId: "u1"), true, "une réponse sans résumé n'efface pas ce qu'on sait")
        XCTAssertNil(memory.remembered(userId: "u2"))
    }

    func test_offlineBand_saysTheChangesLeaveWithTheNetwork() {
        XCTAssertTrue(ProfileEditOfflineBand.isShown(isEditing: true, isOffline: true))
        XCTAssertFalse(ProfileEditOfflineBand.isShown(isEditing: true, isOffline: false))
        XCTAssertFalse(ProfileEditOfflineBand.isShown(isEditing: false, isOffline: true))
        XCTAssertTrue(ProfileEditOfflineBand.text.contains(ProfileEditOfflineBand.emphasis))
    }

    func test_profileView_mountsTheBadgeTheSwitchesAndTheBand() throws {
        let profile = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Profile/Views/ProfileView.swift"))
        XCTAssertTrue(profile.contains("ProfileE2EEBadge()"), "ma vitrine pose le même badge que la fiche d'un autre")
        XCTAssertTrue(profile.contains("ProfileEditOfflineBand(isEditing: isEditing)"), "la bande hors ligne vit dans l'édition")
        XCTAssertTrue(profile.contains("ProfileEditSettingsCopy.autoTranslate"), "« Traduire automatiquement » vit sous mes langues")
        XCTAssertTrue(profile.contains("autoTranslateEnabled: autoTranslateEdit"), "l'interrupteur part dans le PATCH")
        XCTAssertTrue(profile.contains("voicePublic: voicePublicEdit"), "ma voix publique part dans le PATCH")
    }
}

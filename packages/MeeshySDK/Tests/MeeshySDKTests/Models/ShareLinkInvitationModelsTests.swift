import XCTest
@testable import MeeshySDK

/// La page d'invitation (#7795) et la fiche du propriétaire (#7797) lisent les
/// MÊMES réponses : droits des invités, places, validité, langues, adresse.
final class ShareLinkInvitationModelsTests: XCTestCase {

    private func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: raw) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: raw) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: raw)
        }
        return decoder
    }

    private func linkInfoJSON(extra: String = "", conversationExtra: String = "") -> Data {
        """
        {
          "id": "sl1", "linkId": "mshy_Kq7Rb2Xn", "name": null, "description": "Viens !",
          "expiresAt": null, "maxUses": 50, "currentUses": 37,
          "maxConcurrentUsers": null, "currentConcurrentUsers": 0,
          "requireAccount": false, "requireNickname": true, "requireEmail": true, "requireBirthday": false,
          "allowedLanguages": []\(extra),
          "conversation": {
            "id": "c1", "title": "Nova Club", "description": "Le club", "type": "group",
            "createdAt": "2025-09-02T10:00:00.000Z"\(conversationExtra)
          },
          "creator": { "id": "u1", "username": "priya.n", "firstName": "Priya", "lastName": "N",
                       "displayName": null, "avatar": null },
          "stats": { "totalParticipants": 248, "memberCount": 200, "anonymousCount": 48,
                     "languageCount": 3, "spokenLanguages": ["fr", "es", "ko"] }
        }
        """.data(using: .utf8)!
    }

    // MARK: - Decoding

    func test_shareLinkInfo_decodesGuestRightsAndGroupImages() throws {
        let info = try decoder().decode(ShareLinkInfo.self, from: linkInfoJSON(
            extra: """
            , "allowAnonymousMessages": true, "allowAnonymousImages": false,
              "allowAnonymousFiles": true, "allowViewHistory": false
            """,
            conversationExtra: #", "avatar": "https://img.test/logo.png", "banner": "https://img.test/banner.png""#
        ))

        XCTAssertEqual(info.guestRights, ShareLinkGuestRights(messages: true, images: false, files: true, history: false))
        XCTAssertEqual(info.conversation.avatar, "https://img.test/logo.png")
        XCTAssertEqual(info.conversation.banner, "https://img.test/banner.png")
    }

    func test_shareLinkInfo_withoutGuestRightsOrImages_fallsBackToSchemaDefaults() throws {
        let info = try decoder().decode(ShareLinkInfo.self, from: linkInfoJSON())

        XCTAssertEqual(info.guestRights, .schemaDefaults)
        XCTAssertEqual(info.guestRights, ShareLinkGuestRights(messages: true, images: true, files: false, history: true))
        XCTAssertNil(info.conversation.avatar)
        XCTAssertNil(info.conversation.banner)
    }

    func test_myShareLink_withPolicy_resolvesItsSettings() throws {
        let json = """
        {
          "id": "l1", "linkId": "mshy_x", "identifier": "mshy_slug", "name": "Discord",
          "isActive": true, "currentUses": 412, "maxUses": null, "expiresAt": null,
          "createdAt": "2025-09-02T10:00:00.000Z", "conversationTitle": "Nova Club",
          "description": "Viens", "maxConcurrentUsers": 50, "currentConcurrentUsers": 3,
          "allowAnonymousMessages": true, "allowAnonymousFiles": false, "allowAnonymousImages": true,
          "allowViewHistory": true, "requireAccount": false, "requireNickname": true,
          "requireEmail": false, "requireBirthday": false, "allowedLanguages": ["fr"],
          "conversation": { "id": "c1", "title": "Nova Club", "type": "group", "description": null }
        }
        """.data(using: .utf8)!

        let link = try decoder().decode(MyShareLink.self, from: json)

        XCTAssertEqual(link.settings.description, "Viens")
        XCTAssertEqual(link.settings.maxConcurrentUsers, 50)
        XCTAssertEqual(link.settings.allowedLanguages, ["fr"])
        XCTAssertEqual(link.conversation?.id, "c1")
        XCTAssertNil(link.remainingPlaces, "no maxUses = unlimited places")
    }

    func test_myShareLink_fromAnOldCache_resolvesSchemaDefaults() {
        let link = MyShareLink(
            id: "l1", linkId: "mshy_x", identifier: nil, name: nil, isActive: true,
            currentUses: 0, maxUses: nil, expiresAt: nil, createdAt: Date(), conversationTitle: nil
        )

        XCTAssertTrue(link.settings.requireNickname)
        XCTAssertFalse(link.settings.requireAccount)
        XCTAssertEqual(link.settings.guestRights, .schemaDefaults)
        XCTAssertEqual(link.settings.name, "")
    }

    func test_arrivalStats_decodesDefensively() throws {
        let json = """
        { "visits": 1284, "recentArrivals": [
            { "participantId": "p1", "displayName": "Priya", "isAnonymous": true, "country": "IN",
              "joinedAt": "2026-09-24T10:00:00.000Z" }
        ] }
        """.data(using: .utf8)!

        let stats = try decoder().decode(ShareLinkArrivalStats.self, from: json)

        XCTAssertEqual(stats.visits, 1284)
        XCTAssertEqual(stats.arrivals, 0)
        XCTAssertEqual(stats.anonymousArrivals, 0)
        XCTAssertEqual(stats.arrivalsByLanguage, [])
        XCTAssertEqual(stats.recentArrivals.first?.country, "IN")
        XCTAssertTrue(stats.recentArrivals.first?.isAnonymous == true)
    }

    func test_arrivalStats_languageShares_areWeightedAndSorted() {
        let stats = ShareLinkArrivalStats(
            visits: 0, arrivals: 10, anonymousArrivals: 0,
            arrivalsByLanguage: [.init(language: "es", count: 1), .init(language: "fr", count: 3), .init(language: "ko", count: 0)]
        )

        XCTAssertEqual(stats.languageShares.map(\.code), ["fr", "es"])
        XCTAssertEqual(stats.languageShares.map(\.percent), [75, 25])
        XCTAssertTrue(stats.languageShares.allSatisfy(\.isMeasured))
    }

    // MARK: - Address

    func test_address_isTheChatFormOfTheLinkId_neverTheSlugNorATrackingLink() {
        XCTAssertEqual(ShareLinkAddress.absolute(origin: "https://meeshy.me", linkId: "mshy_Kq7"), "https://meeshy.me/chat/mshy_Kq7")
        XCTAssertEqual(ShareLinkAddress.display(origin: "https://meeshy.me", linkId: "mshy_Kq7"), "meeshy.me/chat/mshy_Kq7")
    }

    // MARK: - Dates (Gregorian in every locale)

    func test_dates_stayGregorianEvenWhereTheLocaleDefaultsToAnotherCalendar() {
        let date = Date(timeIntervalSince1970: 1_756_807_200) // 2 sept. 2025, 10:00 UTC
        let utc = TimeZone(identifier: "UTC")!

        let arabic = ShareLinkDateFormat.day(date, locale: Locale(identifier: "ar_SA"), timeZone: utc)
        let french = ShareLinkDateFormat.day(date, locale: Locale(identifier: "fr_FR"), timeZone: utc)

        XCTAssertFalse(arabic.contains("هـ"), "no Hijri era marker: \(arabic)")
        XCTAssertTrue(arabic.contains("٢٠٢٥") || arabic.contains("2025"), arabic)
        XCTAssertTrue(french.contains("2025") && french.contains("sept"), french)
    }

    // MARK: - Choice matrix (session × requireAccount × open)

    func test_choices_signedOut_anonymousFirst_thenAccountEntries() {
        XCTAssertEqual(ShareLinkInvitationTerms.choices(isSignedIn: false, requireAccount: false), [.joinAnonymously, .signIn, .signUp])
    }

    func test_choices_signedOut_accountRequired_hidesAnonymous() {
        XCTAssertEqual(ShareLinkInvitationTerms.choices(isSignedIn: false, requireAccount: true), [.signIn, .signUp])
    }

    func test_choices_signedIn_accountFirst_anonymousSecond() {
        XCTAssertEqual(ShareLinkInvitationTerms.choices(isSignedIn: true, requireAccount: false), [.joinWithAccount, .joinAnonymously])
    }

    func test_choices_signedIn_accountRequired_accountOnly() {
        XCTAssertEqual(ShareLinkInvitationTerms.choices(isSignedIn: true, requireAccount: true), [.joinWithAccount])
    }

    func test_choices_closedLink_offersNothing() {
        for signedIn in [true, false] {
            for required in [true, false] {
                XCTAssertEqual(ShareLinkInvitationTerms.choices(isSignedIn: signedIn, requireAccount: required, isOpen: false), [])
            }
        }
    }

    // MARK: - Places & validity

    func test_remainingPlaces() {
        XCTAssertEqual(ShareLinkInvitationTerms.remainingPlaces(maxUses: 50, currentUses: 37), 13)
        XCTAssertEqual(ShareLinkInvitationTerms.remainingPlaces(maxUses: 5, currentUses: 9), 0)
        XCTAssertNil(ShareLinkInvitationTerms.remainingPlaces(maxUses: nil, currentUses: 9))
    }

    func test_daysLeft_roundsUp_andZeroWhenExpired() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertNil(ShareLinkInvitationTerms.daysLeft(until: nil, now: now))
        XCTAssertEqual(ShareLinkInvitationTerms.daysLeft(until: now.addingTimeInterval(5 * 3600), now: now), 1)
        XCTAssertEqual(ShareLinkInvitationTerms.daysLeft(until: now.addingTimeInterval(2 * 86_400), now: now), 2)
        XCTAssertEqual(ShareLinkInvitationTerms.daysLeft(until: now.addingTimeInterval(2 * 86_400 + 60), now: now), 3)
        XCTAssertEqual(ShareLinkInvitationTerms.daysLeft(until: now.addingTimeInterval(-60), now: now), 0)
    }

    func test_isOpen_closesWhenFullOrExpired() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertTrue(ShareLinkInvitationTerms.isOpen(maxUses: nil, currentUses: 3, expiresAt: nil, now: now))
        XCTAssertFalse(ShareLinkInvitationTerms.isOpen(maxUses: 3, currentUses: 3, expiresAt: nil, now: now))
        XCTAssertFalse(ShareLinkInvitationTerms.isOpen(maxUses: nil, currentUses: 0, expiresAt: now.addingTimeInterval(-1), now: now))
    }

    func test_requestedFields_alwaysAskTheName() {
        XCTAssertEqual(ShareLinkInvitationTerms.requestedFields(requireNickname: false, requireEmail: false, requireBirthday: false), [.name])
        XCTAssertEqual(
            ShareLinkInvitationTerms.requestedFields(requireNickname: true, requireEmail: true, requireBirthday: true),
            [.name, .nickname, .email, .birthday]
        )
    }

    func test_spokenLanguageShares_areEvenAndUnmeasured() throws {
        let info = try decoder().decode(ShareLinkInfo.self, from: linkInfoJSON())

        XCTAssertEqual(info.spokenLanguageShares.map(\.code), ["fr", "es", "ko"])
        XCTAssertTrue(info.spokenLanguageShares.allSatisfy { !$0.isMeasured })
        XCTAssertEqual(info.remainingPlaces, 13)
        XCTAssertEqual(info.requestedFields, [.name, .nickname, .email])
    }

    // MARK: - Settings round trip

    func test_applyingSettings_isTheOptimisticLink() {
        let link = MyShareLink(
            id: "l1", linkId: "mshy_x", identifier: nil, name: "Old", isActive: true,
            currentUses: 4, maxUses: 10, expiresAt: nil, createdAt: Date(), conversationTitle: "Nova"
        )
        var edited = link.settings
        edited.name = ""
        edited.maxUses = nil
        edited.guestRights.files = true

        let applied = link.applying(edited)

        XCTAssertNil(applied.name, "an emptied name falls back to the identifier")
        XCTAssertNil(applied.maxUses)
        XCTAssertEqual(applied.settings.guestRights.files, true)
        XCTAssertEqual(applied.currentUses, 4)
        XCTAssertEqual(applied.conversationTitle, "Nova")
    }

    func test_settings_rejectNonPositiveLimits() {
        var settings = MyShareLink(
            id: "l1", linkId: "mshy_x", identifier: nil, name: nil, isActive: true,
            currentUses: 0, maxUses: nil, expiresAt: nil, createdAt: Date(), conversationTitle: nil
        ).settings
        XCTAssertTrue(settings.isValid)
        settings.maxUses = 0
        XCTAssertFalse(settings.isValid)
    }
}

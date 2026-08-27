import XCTest
@testable import MeeshySDK

/// La fiche d'un participant, et les deux cercles que le gateway y a tranchés.
///
/// Les CAPACITÉS (ce que la personne peut faire) arrivent à tout membre ; les
/// RÉGLAGES DU LIEN n'arrivent qu'aux administrateurs et modérateurs. Le client
/// ne refait jamais cet arbitrage — il décode ce qu'on lui sert, et l'absence
/// d'un bloc EST la réponse.
///
/// Les deux sont donc facultatifs au décodage, et pour deux raisons distinctes
/// qu'il ne faut pas confondre : `entryCapabilities` manque pour un participant
/// QUI A UN COMPTE (il n'est entré par aucun lien), `entryLink` manque quand le
/// LECTEUR n'est pas hôte. Un décodeur qui exigerait l'un ou l'autre ferait
/// échouer la fiche entière sur un cas parfaitement normal.
final class ConversationParticipantProfileTests: XCTestCase {

    private func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: dateString) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: dateString) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateString)")
        }
        return decoder
    }

    private func decode(_ json: String) throws -> ConversationParticipantProfile {
        try makeDecoder().decode(ConversationParticipantProfile.self, from: Data(json.utf8))
    }

    /// Fiche telle qu'un HÔTE la reçoit : les deux cercles.
    private let hostPayload = """
    {
        "participantId": "p1",
        "conversationId": "c1",
        "isAnonymous": true,
        "userId": null,
        "username": "ano_bob_sm123",
        "displayName": "ano_bob_sm123",
        "firstName": "Bob",
        "lastName": "Smith",
        "avatar": null,
        "language": "fr",
        "country": "FR",
        "conversationRole": "member",
        "joinedAt": "2026-08-18T09:00:00.000Z",
        "isOnline": true,
        "lastActiveAt": "2026-08-18T10:00:00.000Z",
        "shareLinkName": "Invitation publique",
        "hasEmail": true,
        "hasBirthday": false,
        "email": "bob@example.com",
        "birthday": null,
        "entryCapabilities": {
            "canSendMessages": true,
            "canSendFiles": false,
            "canSendImages": true,
            "canSendVideos": false,
            "canSendAudios": false,
            "canSendLocations": false,
            "canSendLinks": false,
            "canViewHistory": false
        },
        "entryLink": {
            "name": "Invitation publique",
            "isActive": true,
            "expiresAt": "2026-12-31T00:00:00.000Z",
            "maxUses": 50,
            "currentUses": 12,
            "requireNickname": true,
            "requireEmail": true,
            "requireBirthday": false,
            "allowedCountries": ["FR", "BE"],
            "allowedLanguages": ["fr"]
        }
    }
    """

    /// Même visiteur, vu par un MEMBRE ORDINAIRE : capacités servies, réglages
    /// du lien absents, coordonnées retenues.
    private let memberPayload = """
    {
        "participantId": "p1",
        "conversationId": "c1",
        "isAnonymous": true,
        "userId": null,
        "username": "ano_bob_sm123",
        "displayName": "ano_bob_sm123",
        "firstName": "Bob",
        "lastName": "Smith",
        "avatar": null,
        "language": "fr",
        "country": "FR",
        "conversationRole": "member",
        "joinedAt": "2026-08-18T09:00:00.000Z",
        "isOnline": true,
        "lastActiveAt": "2026-08-18T10:00:00.000Z",
        "shareLinkName": "Invitation publique",
        "hasEmail": true,
        "hasBirthday": false,
        "email": null,
        "birthday": null,
        "entryCapabilities": {
            "canSendMessages": true,
            "canSendFiles": false,
            "canSendImages": true,
            "canSendVideos": false,
            "canSendAudios": false,
            "canSendLocations": false,
            "canSendLinks": false,
            "canViewHistory": false
        },
        "entryLink": null
    }
    """

    // MARK: - Capacités

    func test_entryCapabilities_decodesWhatTheVisitorMayDo() throws {
        let profile = try decode(hostPayload)

        XCTAssertEqual(profile.entryCapabilities?.canSendMessages, true)
        XCTAssertEqual(profile.entryCapabilities?.canSendFiles, false)
        XCTAssertEqual(profile.entryCapabilities?.canViewHistory, false)
    }

    func test_entryCapabilities_areServedToAnOrdinaryMember() throws {
        let profile = try decode(memberPayload)

        XCTAssertNotNil(profile.entryCapabilities)
    }

    /// `deniedCapabilities` porte la règle d'affichage — n'énoncer que les
    /// REFUS — au niveau du modèle, pour que la feuille iOS et la carte web
    /// disent la même chose sans la réécrire chacune.
    func test_deniedCapabilities_listsOnlyWhatIsRefused() throws {
        let profile = try decode(hostPayload)

        let denied = profile.entryCapabilities?.denied ?? []
        XCTAssertTrue(denied.contains(.canSendFiles))
        XCTAssertTrue(denied.contains(.canViewHistory))
        XCTAssertFalse(denied.contains(.canSendMessages))
        XCTAssertFalse(denied.contains(.canSendImages))
    }

    func test_deniedCapabilities_isEmptyWhenNothingIsRefused() {
        let capabilities = ParticipantEntryCapabilities(
            canSendMessages: true,
            canSendFiles: true,
            canSendImages: true,
            canSendVideos: true,
            canSendAudios: true,
            canSendLocations: true,
            canSendLinks: true,
            canViewHistory: true
        )

        XCTAssertTrue(capabilities.denied.isEmpty)
    }

    // MARK: - Réglages du lien

    func test_entryLink_decodesQuotasAndRequirements() throws {
        let profile = try decode(hostPayload)

        XCTAssertEqual(profile.entryLink?.currentUses, 12)
        XCTAssertEqual(profile.entryLink?.maxUses, 50)
        XCTAssertEqual(profile.entryLink?.requireEmail, true)
        XCTAssertEqual(profile.entryLink?.allowedCountries, ["FR", "BE"])
    }

    func test_entryLink_isAbsentForAnOrdinaryMember() throws {
        let profile = try decode(memberPayload)

        XCTAssertNil(profile.entryLink)
    }

    // MARK: - Absence des deux blocs

    /// Une réponse d'un gateway plus ancien ne porte AUCUN des deux blocs. La
    /// fiche doit rester décodable : l'identité, elle, n'a pas changé.
    func test_profile_decodesWhenNeitherBlockIsPresent() throws {
        let json = """
        {
            "participantId": "p1",
            "conversationId": "c1",
            "isAnonymous": false,
            "userId": "u1",
            "username": "alice",
            "displayName": "Alice",
            "firstName": null,
            "lastName": null,
            "avatar": null,
            "language": "fr",
            "country": null,
            "conversationRole": "member",
            "joinedAt": "2026-08-18T09:00:00.000Z",
            "isOnline": true,
            "lastActiveAt": null,
            "shareLinkName": null,
            "hasEmail": false,
            "hasBirthday": false,
            "email": null,
            "birthday": null
        }
        """

        let profile = try decode(json)

        XCTAssertNil(profile.entryCapabilities)
        XCTAssertNil(profile.entryLink)
        XCTAssertEqual(profile.username, "alice")
        XCTAssertNil(profile.historyVisibleFrom)
        XCTAssertNil(profile.canGrantHistory)
    }

    // MARK: - Octroi d'historique par date (#3877)

    /// Vaut pour TOUT participant, contrairement à `entryCapabilities` /
    /// `entryLink` — d'où un payload d'INSCRIT dédié, où les deux blocs
    /// ci-dessus sont absents mais l'octroi peut quand même être servi.
    private func registeredHostPayload(historyVisibleFrom: String?, canGrantHistory: Bool) -> String {
        """
        {
            "participantId": "p2",
            "conversationId": "c1",
            "isAnonymous": false,
            "userId": "u1",
            "username": "alice",
            "displayName": "Alice",
            "firstName": null,
            "lastName": null,
            "avatar": null,
            "language": "fr",
            "country": null,
            "conversationRole": "member",
            "joinedAt": "2026-08-18T09:00:00.000Z",
            "isOnline": true,
            "lastActiveAt": null,
            "shareLinkName": null,
            "hasEmail": false,
            "hasBirthday": false,
            "email": null,
            "birthday": null,
            "historyVisibleFrom": \(historyVisibleFrom.map { "\"\($0)\"" } ?? "null"),
            "canGrantHistory": \(canGrantHistory)
        }
        """
    }

    func test_historyVisibleFrom_decodesForAnyParticipant_notJustAnonymous() throws {
        let profile = try decode(registeredHostPayload(historyVisibleFrom: "2026-01-15T00:00:00.000Z", canGrantHistory: true))

        XCTAssertNotNil(profile.historyVisibleFrom)
        XCTAssertEqual(profile.canGrantHistory, true)
    }

    /// `canGrantHistory` répond à « ce lecteur peut-il écrire ? » — distinct de
    /// « quel est l'octroi ? ». Un modérateur lit l'octroi mais ne peut pas
    /// l'écrire : les deux valeurs doivent pouvoir varier indépendamment.
    func test_canGrantHistory_canBeFalseWhileHistoryVisibleFromIsSet() throws {
        let profile = try decode(registeredHostPayload(historyVisibleFrom: "2026-01-15T00:00:00.000Z", canGrantHistory: false))

        XCTAssertNotNil(profile.historyVisibleFrom)
        XCTAssertEqual(profile.canGrantHistory, false)
    }

    func test_historyVisibleFrom_decodesNullAsNoGrant() throws {
        let profile = try decode(registeredHostPayload(historyVisibleFrom: nil, canGrantHistory: true))

        XCTAssertNil(profile.historyVisibleFrom)
        XCTAssertEqual(profile.canGrantHistory, true)
    }

    // MARK: - `participant:rights-updated` — `null` EFFACE, une clé ABSENTE non

    /// `Date?` seul ne sait dire qu'une chose ; le fil en dit DEUX. Le
    /// consommateur (`ParticipantProfileSheet`) recopie l'octroi seulement quand
    /// la charge le PORTE — sans ce discriminant, un producteur antérieur au
    /// champ ferait disparaître un octroi affiché à chaque basculement de
    /// capacité ordinaire, alors qu'il n'affirme rien à son sujet.
    private func rightsUpdatedEvent(_ json: String) throws -> ParticipantRightsUpdatedEvent {
        try makeDecoder().decode(ParticipantRightsUpdatedEvent.self, from: Data(json.utf8))
    }

    private let rightsBlock = """
    "rights": {
        "canSendMessages": true, "canSendFiles": true, "canSendImages": true,
        "canSendVideos": true, "canSendAudios": true, "canSendLocations": true,
        "canSendLinks": true, "canViewHistory": true
    }
    """

    func test_rightsUpdated_carriesTheGrant_whenTheKeyHoldsADate() throws {
        let event = try rightsUpdatedEvent("""
        { "conversationId": "c1", "participantId": "p1", "updatedBy": "u1",
          \(rightsBlock), "historyVisibleFrom": "2026-01-15T00:00:00.000Z" }
        """)

        XCTAssertTrue(event.carriesHistoryGrant)
        XCTAssertNotNil(event.historyVisibleFrom)
    }

    /// `null` est une AFFIRMATION — « j'ai calculé, il n'y a pas d'octroi ».
    /// Le consommateur doit donc effacer, et non garder : la charge la PORTE.
    func test_rightsUpdated_carriesTheGrant_whenTheKeyIsExplicitNull() throws {
        let event = try rightsUpdatedEvent("""
        { "conversationId": "c1", "participantId": "p1", "updatedBy": "u1",
          \(rightsBlock), "historyVisibleFrom": null }
        """)

        XCTAssertTrue(event.carriesHistoryGrant, "an explicit null is an assertion, not a silence — it must erase")
        XCTAssertNil(event.historyVisibleFrom)
    }

    /// La clé ABSENTE est un SILENCE — un producteur plus ancien. Elle rend la
    /// même valeur que `null` (`nil`), et c'est exactement pourquoi le
    /// discriminant ne peut pas être cette valeur.
    func test_rightsUpdated_doesNotCarryTheGrant_whenTheKeyIsAbsent() throws {
        let event = try rightsUpdatedEvent("""
        { "conversationId": "c1", "participantId": "p1", "updatedBy": "u1", \(rightsBlock) }
        """)

        XCTAssertFalse(event.carriesHistoryGrant, "an absent key asserts nothing — the reader keeps what it has")
        XCTAssertNil(event.historyVisibleFrom)
    }
}

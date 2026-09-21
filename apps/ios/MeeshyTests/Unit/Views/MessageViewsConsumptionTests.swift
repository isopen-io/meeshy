import XCTest
import MeeshySDK
@testable import Meeshy

/// **Les ouvertures d'une image ou d'un document s'affichent dans « Vu par »,
/// comme celles d'un audio** (#7228).
///
/// Chaque témoin exerce la RÈGLE — `MessageViewsConsumption`, le site unique
/// que la vue appelle — sur des `mimeType` réels et sur la charge RÉELLE de
/// `GET /api/v1/attachments/:id/status-details`
/// (`services/gateway/src/routes/messages-reads.ts:577`, composée par
/// `MessageReadStatusService.getAttachmentStatusDetails`).
///
/// La charge est DÉCODÉE, jamais fabriquée par un initialiseur de test : c'est
/// le décodeur qui jetait `viewCount` en silence, et un faux objet construit à
/// la main n'aurait rien vu — la même mécanique avait déjà vidé les onglets
/// « Écouté » / « Vu » quand la struct disait `userId` au lieu de
/// `participantId`.
final class MessageViewsConsumptionTests: XCTestCase {

    // MARK: - Fixtures

    private func attachment(id: String, mimeType: String, duration: Int? = nil) -> MessageAttachment {
        MessageAttachment(
            id: id,
            mimeType: mimeType,
            fileSize: 1_024,
            fileUrl: "https://cdn.meeshy.me/\(id)",
            duration: duration
        )
    }

    /// Une ligne telle que la passerelle la sert — tous les champs, y compris
    /// ceux qu'aucune famille ne lit.
    private func statusUser(
        viewedAt: String? = nil,
        downloadedAt: String? = nil,
        listenedAt: String? = nil,
        viewCount: Int? = nil,
        listenCount: Int? = nil,
        listenedComplete: Bool? = nil,
        lastPlayPositionMs: Int? = nil
    ) throws -> AttachmentStatusUser {
        var payload: [String: Any] = [
            "participantId": "participant-1",
            "username": "Alice",
            "avatar": NSNull(),
            "viewedAt": viewedAt as Any? ?? NSNull(),
            "downloadedAt": downloadedAt as Any? ?? NSNull(),
            "listenedAt": listenedAt as Any? ?? NSNull(),
            "watchedAt": NSNull(),
            "watchCount": 0,
            "watchedComplete": false,
            "lastWatchPositionMs": NSNull(),
            "viewedLanguages": ["fr"]
        ]
        payload["viewCount"] = viewCount ?? 0
        payload["listenCount"] = listenCount ?? 0
        payload["listenedComplete"] = listenedComplete ?? false
        payload["lastPlayPositionMs"] = lastPlayPositionMs as Any? ?? NSNull()

        let data = try JSONSerialization.data(withJSONObject: payload)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(AttachmentStatusUser.self, from: data)
    }

    // MARK: - La partition des familles

    /// Le défaut d'origine tenait en une ligne : le filtre énumérait `.image`
    /// et `.document`. `AttachmentKind` compte ONZE cases, et le document le
    /// plus courant du produit — un PDF — rend `.pdf`. Il n'apparaissait donc
    /// dans AUCUN onglet.
    func test_family_everyTracklessKind_isOpened() {
        let trackless = [
            "image/jpeg", "image/png",
            "application/pdf",
            "application/msword",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/zip",
            "text/plain",
            "application/json",
            "application/octet-stream"
        ]
        for mimeType in trackless {
            XCTAssertEqual(
                MediaConsumptionFamily(mimeType: mimeType), .opened,
                "\(mimeType) s'OUVRE — il doit peupler l'onglet « Ouvert »"
            )
        }
    }

    func test_family_audioAndVideo_keepTheirOwnFamilies() {
        XCTAssertEqual(MediaConsumptionFamily(mimeType: "audio/m4a"), .listened)
        XCTAssertEqual(MediaConsumptionFamily(mimeType: "video/mp4"), .watched)
    }

    /// La barre de progression est la seule chose que le lot RETIRE : une image
    /// ouverte n'est ni « à 40 % » ni « complète ».
    func test_showsProgress_onlyForTimebasedFamilies() {
        XCTAssertTrue(MediaConsumptionFamily.listened.showsProgress)
        XCTAssertTrue(MediaConsumptionFamily.watched.showsProgress)
        XCTAssertFalse(MediaConsumptionFamily.opened.showsProgress)
    }

    // MARK: - Ce que la fiche charge

    /// `loadAttachmentStatuses()` ne filtre plus sur `hasTimebasedTrack` :
    /// l'image et le PDF partent chercher leurs statuts comme le vocal.
    func test_statusTargets_includesImagesAndDocuments() {
        let attachments = [
            attachment(id: "a-image", mimeType: "image/jpeg"),
            attachment(id: "a-pdf", mimeType: "application/pdf"),
            attachment(id: "a-audio", mimeType: "audio/m4a", duration: 5_000)
        ]

        XCTAssertEqual(
            MessageViewsConsumption.statusTargets(in: attachments).map(\.id),
            ["a-image", "a-pdf", "a-audio"]
        )
    }

    /// Un onglet par famille PRÉSENTE — et un PDF seul en ouvre un.
    func test_families_onePerPresentFamily_andPdfAloneOpensOne() {
        XCTAssertEqual(
            MessageViewsConsumption.families(in: [attachment(id: "a-pdf", mimeType: "application/pdf")]),
            [.opened]
        )
        XCTAssertEqual(
            MessageViewsConsumption.families(in: [
                attachment(id: "a-audio", mimeType: "audio/m4a"),
                attachment(id: "a-image", mimeType: "image/png")
            ]),
            [.listened, .opened]
        )
        XCTAssertEqual(
            MessageViewsConsumption.families(in: [attachment(id: "a-audio", mimeType: "audio/m4a")]),
            [.listened],
            "aucune image, aucun document ⇒ pas d'onglet « Ouvert » vide"
        )
    }

    func test_attachments_inFamily_partitionsWithoutLoss() {
        let attachments = [
            attachment(id: "a-image", mimeType: "image/jpeg"),
            attachment(id: "a-pdf", mimeType: "application/pdf"),
            attachment(id: "a-audio", mimeType: "audio/m4a"),
            attachment(id: "a-video", mimeType: "video/mp4")
        ]
        XCTAssertEqual(MessageViewsConsumption.attachments(attachments, in: .opened).map(\.id), ["a-image", "a-pdf"])
        XCTAssertEqual(MessageViewsConsumption.attachments(attachments, in: .listened).map(\.id), ["a-audio"])
        XCTAssertEqual(MessageViewsConsumption.attachments(attachments, in: .watched).map(\.id), ["a-video"])
    }

    // MARK: - Ce que la ligne d'un participant MONTRE

    /// Le critère du lot, ligne à ligne : vues, téléchargements, « Nx ».
    func test_reading_opened_carriesViewDate_downloadDate_andCount() throws {
        let user = try statusUser(
            viewedAt: "2026-09-21T09:00:00Z",
            downloadedAt: "2026-09-21T09:05:00Z",
            viewCount: 3
        )

        let reading = MessageViewsConsumption.reading(for: user, in: .opened)

        XCTAssertNotNil(reading.consumedAt, "l'ouverture d'une image porte sa date")
        XCTAssertNotNil(reading.downloadedAt, "le téléchargement est servi et doit être lu")
        XCTAssertEqual(reading.count, 3, "« 3x » — le compteur d'ouvertures de la passerelle")
        XCTAssertNil(reading.positionMs)
        XCTAssertFalse(reading.isComplete)
    }

    /// `viewCount` VOYAGE sur le fil (`viewCount: s.viewCount ?? 0`,
    /// `MessageReadStatusService.getAttachmentStatusDetails`) et n'était pas
    /// déclaré par `AttachmentStatusUser` : le décodeur le jetait, et aucun
    /// « Nx » ne pouvait s'afficher pour une image, quelle que soit la vue.
    func test_attachmentStatusUser_decodesViewCountFromTheGatewayPayload() throws {
        let user = try statusUser(viewedAt: "2026-09-21T09:00:00Z", viewCount: 7)
        XCTAssertEqual(user.viewCount, 7)
    }

    func test_reading_listened_keepsPositionCountAndCompletion() throws {
        let user = try statusUser(
            downloadedAt: "2026-09-21T08:00:00Z",
            listenedAt: "2026-09-21T09:00:00Z",
            viewCount: 99,
            listenCount: 2,
            listenedComplete: false,
            lastPlayPositionMs: 2_500
        )

        let reading = MessageViewsConsumption.reading(for: user, in: .listened)

        XCTAssertEqual(reading.count, 2, "un audio compte ses ÉCOUTES, jamais les ouvertures")
        XCTAssertEqual(reading.positionMs, 2_500)
        XCTAssertFalse(reading.isComplete)
        XCTAssertNotNil(reading.downloadedAt)
    }

    /// Le téléchargement est servi pour TOUTES les familles — il ne disparaît
    /// pas parce qu'un média a une piste.
    func test_reading_everyFamily_readsDownloadDate() throws {
        let user = try statusUser(downloadedAt: "2026-09-21T09:05:00Z")
        for family in MediaConsumptionFamily.allCases {
            XCTAssertNotNil(
                MessageViewsConsumption.reading(for: user, in: family).downloadedAt,
                "famille \(family.rawValue)"
            )
        }
    }
}

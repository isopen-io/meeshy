import XCTest
@testable import MeeshySDK

/// The message-info sheet must show EXACTLY who consumed each attachment, with
/// WhatsApp-style all-or-nothing "by all" only when every recipient completed
/// the media-appropriate action (view / download / listen / watch).
final class AttachmentConsumptionResolverTests: XCTestCase {

    // MARK: - primaryAction by media type

    func test_primaryAction_image_isViewed() {
        XCTAssertEqual(AttachmentConsumptionResolver.primaryAction(forMimeType: "image/jpeg"), .viewed)
    }

    func test_primaryAction_audio_isListened() {
        XCTAssertEqual(AttachmentConsumptionResolver.primaryAction(forMimeType: "audio/mp4"), .listened)
    }

    func test_primaryAction_video_isWatched() {
        XCTAssertEqual(AttachmentConsumptionResolver.primaryAction(forMimeType: "video/quicktime"), .watched)
    }

    func test_primaryAction_document_isDownloaded() {
        XCTAssertEqual(AttachmentConsumptionResolver.primaryAction(forMimeType: "application/pdf"), .downloaded)
    }

    // MARK: - resolve picks the action-matching count + marker

    func test_resolve_image_usesViewedCountAndMarker() {
        let s = AttachmentConsumptionResolver.resolve(
            mimeType: "image/png", recipientCount: 3,
            viewedCount: 2, downloadedCount: 9, consumedCount: 9,
            viewedByAllAt: nil, downloadedByAllAt: Date(),
            listenedByAllAt: nil, watchedByAllAt: nil)
        XCTAssertEqual(s.action, .viewed)
        XCTAssertEqual(s.count, 2, "image status reflects viewedCount, not downloadedCount")
        XCTAssertFalse(s.isCompleteByAll, "2 of 3 viewers is not all")
    }

    func test_resolve_audio_usesConsumedCountAndListenedMarker() {
        let at = Date()
        let s = AttachmentConsumptionResolver.resolve(
            mimeType: "audio/mpeg", recipientCount: 2,
            viewedCount: 0, downloadedCount: 0, consumedCount: 2,
            viewedByAllAt: nil, downloadedByAllAt: nil,
            listenedByAllAt: at, watchedByAllAt: nil)
        XCTAssertEqual(s.action, .listened)
        XCTAssertEqual(s.count, 2)
        XCTAssertEqual(s.byAllAt, at)
        XCTAssertTrue(s.isCompleteByAll, "listenedByAllAt marker means everyone listened")
    }

    func test_resolve_video_usesConsumedCountAndWatchedMarker() {
        let s = AttachmentConsumptionResolver.resolve(
            mimeType: "video/mp4", recipientCount: 4,
            viewedCount: 0, downloadedCount: 0, consumedCount: 4,
            viewedByAllAt: nil, downloadedByAllAt: nil,
            listenedByAllAt: nil, watchedByAllAt: nil)
        XCTAssertEqual(s.action, .watched)
        XCTAssertTrue(s.isCompleteByAll, "4 of 4 watchers reaches the denominator")
    }

    // MARK: - all-or-nothing soundness

    func test_isCompleteByAll_partialGroup_isFalse() {
        let s = AttachmentConsumptionResolver.resolve(
            mimeType: "image/jpeg", recipientCount: 10,
            viewedCount: 1, downloadedCount: 0, consumedCount: 0,
            viewedByAllAt: nil, downloadedByAllAt: nil,
            listenedByAllAt: nil, watchedByAllAt: nil)
        XCTAssertFalse(s.isCompleteByAll, "one viewer out of ten is not by-all")
    }

    func test_isCompleteByAll_unknownDenominator_neverClaimsByAllFromCounts() {
        let s = AttachmentConsumptionResolver.resolve(
            mimeType: "application/zip", recipientCount: 0,
            viewedCount: 0, downloadedCount: 5, consumedCount: 0,
            viewedByAllAt: nil, downloadedByAllAt: nil,
            listenedByAllAt: nil, watchedByAllAt: nil)
        XCTAssertEqual(s.action, .downloaded)
        XCTAssertEqual(s.count, 5)
        XCTAssertFalse(s.isCompleteByAll,
            "unknown denominator must never claim by-all from a count alone")
    }

    func test_isCompleteByAll_markerWinsOverUnknownDenominator() {
        let at = Date()
        let s = AttachmentConsumptionResolver.resolve(
            mimeType: "application/pdf", recipientCount: 0,
            viewedCount: 0, downloadedCount: 3, consumedCount: 0,
            viewedByAllAt: nil, downloadedByAllAt: at,
            listenedByAllAt: nil, watchedByAllAt: nil)
        XCTAssertTrue(s.isCompleteByAll, "the server's downloadedByAllAt marker is authoritative")
    }
    // MARK: - userConsumption : la LIGNE d'un participant

    private func status(
        viewedAt: Date? = nil,
        downloadedAt: Date? = nil,
        listenedAt: Date? = nil,
        watchedAt: Date? = nil,
        listenCount: Int? = nil,
        watchCount: Int? = nil,
        listenedComplete: Bool? = nil,
        watchedComplete: Bool? = nil,
        lastPlayPositionMs: Int? = nil,
        lastWatchPositionMs: Int? = nil,
        viewCount: Int? = nil
    ) -> AttachmentStatusUser {
        AttachmentStatusUser(
            participantId: "p1",
            username: "Alice",
            avatar: nil,
            viewedAt: viewedAt,
            downloadedAt: downloadedAt,
            listenedAt: listenedAt,
            watchedAt: watchedAt,
            listenCount: listenCount,
            watchCount: watchCount,
            listenedComplete: listenedComplete,
            watchedComplete: watchedComplete,
            lastPlayPositionMs: lastPlayPositionMs,
            lastWatchPositionMs: lastWatchPositionMs,
            viewCount: viewCount
        )
    }

    /// Le défaut corrigé : une image lue par les colonnes de la VIDÉO rend une
    /// ligne muette — le serveur ne pose `watchedAt` / `watchCount` que depuis
    /// `markVideoAsWatched`.
    func test_userConsumption_image_readsViewedClockAndOpeningCount() {
        let at = Date(timeIntervalSince1970: 1_700_000_000)
        let row = AttachmentConsumptionResolver.userConsumption(
            mimeType: "image/jpeg",
            status: status(viewedAt: at, watchCount: 7, viewCount: 3)
        )
        XCTAssertEqual(row.action, .viewed)
        XCTAssertEqual(row.date, at)
        XCTAssertEqual(row.count, 3, "le « Nx » d'une image est viewCount, jamais watchCount")
    }

    func test_userConsumption_image_fallsBackOnDownloadClock() {
        let at = Date(timeIntervalSince1970: 1_700_000_500)
        let row = AttachmentConsumptionResolver.userConsumption(
            mimeType: "image/png",
            status: status(downloadedAt: at)
        )
        XCTAssertEqual(row.date, at, "enregistrer sans ouvrir reste une consommation datée")
        XCTAssertTrue(row.wasDownloaded)
    }

    /// Un PDF est un DOCUMENT : `DocumentViewerView` ne rapporte que
    /// `downloaded`, et c'est cette horloge qui doit s'afficher.
    func test_userConsumption_pdf_readsDownloadClock() {
        let at = Date(timeIntervalSince1970: 1_700_001_000)
        let row = AttachmentConsumptionResolver.userConsumption(
            mimeType: "application/pdf",
            status: status(downloadedAt: at, watchCount: 4)
        )
        XCTAssertEqual(row.action, .downloaded)
        XCTAssertEqual(row.date, at)
        XCTAssertNil(row.count, "aucune ouverture rapportée : pas de « Nx » inventé")
    }

    func test_userConsumption_imageAndDocument_neverShowPlaybackProgress() {
        for mime in ["image/jpeg", "application/pdf", "application/zip", "text/plain"] {
            let row = AttachmentConsumptionResolver.userConsumption(
                mimeType: mime,
                status: status(watchedComplete: true, lastWatchPositionMs: 4_200)
            )
            XCTAssertFalse(row.showsPlaybackProgress, "\(mime) n'a pas de piste à parcourir")
            XCTAssertNil(row.positionMs, "\(mime) n'a pas de position de lecture")
            XCTAssertFalse(row.isComplete, "« terminé » n'a pas de sens hors piste : \(mime)")
        }
    }

    func test_userConsumption_audio_keepsListeningTrack() {
        let at = Date(timeIntervalSince1970: 1_700_002_000)
        let row = AttachmentConsumptionResolver.userConsumption(
            mimeType: "audio/mp4",
            status: status(
                listenedAt: at,
                listenCount: 2,
                listenedComplete: false,
                lastPlayPositionMs: 3_500,
                viewCount: 9
            )
        )
        XCTAssertEqual(row.action, .listened)
        XCTAssertEqual(row.date, at)
        XCTAssertEqual(row.count, 2)
        XCTAssertEqual(row.positionMs, 3_500)
        XCTAssertTrue(row.showsPlaybackProgress)
    }

    func test_userConsumption_video_keepsWatchingTrack() {
        let at = Date(timeIntervalSince1970: 1_700_003_000)
        let row = AttachmentConsumptionResolver.userConsumption(
            mimeType: "video/mp4",
            status: status(
                watchedAt: at,
                watchCount: 5,
                watchedComplete: true,
                lastWatchPositionMs: 9_000
            )
        )
        XCTAssertEqual(row.action, .watched)
        XCTAssertEqual(row.date, at)
        XCTAssertEqual(row.count, 5)
        XCTAssertTrue(row.isComplete)
        XCTAssertTrue(row.showsPlaybackProgress)
    }

    /// `viewCount` est servi par `getAttachmentStatusDetails` ; absent du
    /// modèle, il tombait au décodage et le « Nx » d'une image était
    /// inatteignable.
    func test_attachmentStatusUser_decodesViewCountFromTheWire() throws {
        let json = "{\"participantId\":\"p1\",\"username\":\"Alice\",\"viewCount\":4}"
        let decoded = try JSONDecoder().decode(AttachmentStatusUser.self, from: Data(json.utf8))
        XCTAssertEqual(decoded.viewCount, 4)
    }
}

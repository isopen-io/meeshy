import XCTest

final class NSEEnrichmentPlanTests: XCTestCase {

    private let apiBase = "https://gate.meeshy.me"
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func budget(elapsed: TimeInterval) -> NSEBudget {
        NSEBudget(start: now.addingTimeInterval(-elapsed))
    }

    private func makeRequest(_ userInfo: [AnyHashable: Any], elapsed: TimeInterval = 0) -> NSEEnrichmentRequest {
        NSEEnrichmentRequest.make(userInfo: userInfo, apiBaseURL: apiBase, budget: budget(elapsed: elapsed), now: now)
    }

    private func mediaPayload(_ extra: [String: Any] = [:]) -> [AnyHashable: Any] {
        ["attachmentUrl": "https://gate.meeshy.me/api/v1/attachments/file/x.jpg", "attachmentMimeType": "image/jpeg"]
            .merging(extra) { _, new in new }
    }

    private func file(_ name: String) -> NSEAttachmentFile {
        let url = URL(fileURLWithPath: "/tmp/\(name)")
        return NSEAttachmentFile(fileURL: url, originalURL: url, mimeType: "image/png")
    }

    func test_protectedMessage_neverPlansTheMedia() {
        XCTAssertNil(makeRequest(mediaPayload(["effectFlags": "4"])).media)
        XCTAssertNil(makeRequest(mediaPayload(["notificationLocKey": "notification.view_once_message"])).media)
        XCTAssertNotNil(makeRequest(mediaPayload()).media)
    }

    func test_declaredSizeAboveTheCap_skipsTheMedia() {
        let tooBig = "\(NSEAttachmentPolicy.maxAttachmentBytes + 1)"

        XCTAssertNil(makeRequest(mediaPayload(["attachmentFileSize": tooBig])).media)
    }

    func test_relativeMediaURL_isResolvedAgainstTheTrustedOrigin() {
        let request = makeRequest(mediaPayload(["attachmentUrl": "/api/v1/attachments/file/x.jpg"]))

        XCTAssertEqual(request.media?.url.host, "gate.meeshy.me")
        XCTAssertEqual(request.media?.url.path, "/api/v1/attachments/file/x.jpg")
    }

    func test_avatarURL_isPlannedFromImageURL_andNeverAsMedia() {
        let request = makeRequest(["imageURL": "/api/v1/attachments/file/avatar.png"])

        XCTAssertEqual(request.avatarURL?.host, "gate.meeshy.me")
        XCTAssertNil(request.media)
    }

    func test_locationDetail_dependsOnTheRemainingBudget() {
        let location: [AnyHashable: Any] = ["locationLat": "48.8584", "locationLon": "2.2945", "locationName": "Tour Eiffel"]

        XCTAssertNil(makeRequest(location, elapsed: NSEBudget.total - 1).detail)
        let expected = NotificationDetailPolicy.snapshotTimeout(
            budgetRemaining: NSEBudget.total, minimum: NSEBudget.minimumDownload
        )
        XCTAssertEqual(
            makeRequest(location).detail,
            .location(latitude: 48.8584, longitude: 2.2945, timeout: expected ?? 0)
        )
    }

    func test_videoThumbnail_isPlannedWithItsMimeType() {
        let request = makeRequest([
            "attachmentMimeType": "video/mp4",
            "attachmentUrl": "https://gate.meeshy.me/v.mp4",
            "thumbnailUrl": "/t/thumb.png",
        ])

        XCTAssertNil(request.media)
        guard case .videoThumbnail(let source) = request.detail else { return XCTFail("vignette attendue") }
        XCTAssertEqual(source.mimeType, "image/png")
    }

    func test_budget_downloadTimeout_mirrorsTheCurrentRule() {
        XCTAssertEqual(budget(elapsed: 5).downloadTimeout(at: now), 12)
        XCTAssertEqual(budget(elapsed: 20).downloadTimeout(at: now) ?? 0, 7, accuracy: 0.001)
        XCTAssertNil(budget(elapsed: 25).downloadTimeout(at: now))
        XCTAssertNil(budget(elapsed: 26).downloadTimeout(at: now))
    }

    func test_folding_prefersTheMessageMediaOverTheDetail() {
        let avatar = Data([1, 2, 3])

        let folded = NSEEnrichmentResult.folding([.detail(file("f2")), .media(file("f1")), .avatar(avatar)])

        XCTAssertEqual(folded.attachment, file("f1"))
        XCTAssertEqual(folded.avatarData, avatar)
    }

    func test_folding_fallsBackToTheDetailWhenTheMediaFailed() {
        let folded = NSEEnrichmentResult.folding([.media(nil), .detail(file("f2")), .replacementSettled])

        XCTAssertEqual(folded.attachment, file("f2"))
        XCTAssertNil(folded.avatarData)
    }
}

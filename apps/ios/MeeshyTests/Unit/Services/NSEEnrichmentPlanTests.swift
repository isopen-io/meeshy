import AVFoundation
import MeeshySDK
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

    private func talkieVoice(_ url: String) -> [AnyHashable: Any] {
        ["type": "talkie_incoming", "talkieId": "t", "fromUserId": "bob", "attachmentUrl": url, "attachmentMimeType": "audio/mp4"]
    }

    func test_talkieVoiceFromTheGateway_isDownloadedWithTheSessionToken() {
        XCTAssertEqual(makeRequest(talkieVoice("https://gate.meeshy.me/api/v1/attachments/file/v.m4a")).media?.authenticated, true)
        XCTAssertEqual(makeRequest(talkieVoice("/api/v1/attachments/file/v.m4a")).media?.authenticated, true)
    }

    func test_talkieVoiceFromAnotherOrigin_isNeverDownloaded_soTheTokenNeverLeaves() {
        ["https://evil.example/v.m4a", "https://gate.meeshy.me.evil.example/v.m4a", "http://gate.meeshy.me/v.m4a",
         "https://gate.meeshy.me:8443/v.m4a", "meeshy://talkie/v.m4a"].forEach { url in
            XCTAssertNil(makeRequest(talkieVoice(url)).media, url)
        }
    }

    func test_anOrdinaryMedia_isNeverDownloadedWithTheToken() {
        XCTAssertEqual(makeRequest(mediaPayload()).media?.authenticated, false)
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

    /// #11328 — la NSE descend l'URL d'ORIGINE que porte la charge, jamais un
    /// rendu : une clé de rendu inconnue sur le fil ne change rien au plan.
    func test_unknownRenditionKeys_neverReplaceTheOriginalURL() {
        let request = makeRequest(mediaPayload([
            "avifVariants": "{\"medium\":\"https://gate.meeshy.me/x_medium.avif\"}",
            "renditions": "[{\"codec\":\"heic\"}]",
        ]))

        XCTAssertEqual(request.media?.url.absoluteString, "https://gate.meeshy.me/api/v1/attachments/file/x.jpg")
        XCTAssertEqual(request.media?.mimeType, "image/jpeg")
    }

    /// #11328 — un AVIF ne se planifie pas : le télécharger pour le refuser
    /// ensuite coûterait le budget de l'extension sans rien afficher.
    func test_avifMediaOrThumbnail_isNeverPlanned() {
        XCTAssertNil(makeRequest(mediaPayload([
            "attachmentUrl": "https://gate.meeshy.me/x.avif", "attachmentMimeType": "image/avif",
        ])).media)

        let video = makeRequest([
            "attachmentMimeType": "video/mp4",
            "attachmentUrl": "https://gate.meeshy.me/v.mp4",
            "thumbnailUrl": "/t/thumb.avif",
        ])
        XCTAssertNil(video.detail)
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

    // MARK: - #17255 — la voix d'un talkie, trames ADTS brutes, devient une pièce jointe lisible

    /// Une tonalité encodée comme le micro du talkie la rend : AAC-LC mono, une trame ADTS par paquet.
    private static func adtsTone(seconds: Double, sampleRate: Double) throws -> Data {
        let pcm = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1))
        var description = AudioStreamBasicDescription(
            mSampleRate: sampleRate, mFormatID: kAudioFormatMPEG4AAC, mFormatFlags: UInt32(MPEG4ObjectID.AAC_LC.rawValue),
            mBytesPerPacket: 0, mFramesPerPacket: 1024, mBytesPerFrame: 0, mChannelsPerFrame: 1, mBitsPerChannel: 0, mReserved: 0
        )
        let aac = try XCTUnwrap(AVAudioFormat(streamDescription: &description))
        let converter = try XCTUnwrap(AVAudioConverter(from: pcm, to: aac))
        let frameCount = AVAudioFrameCount(seconds * sampleRate)
        let input = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: pcm, frameCapacity: frameCount))
        input.frameLength = frameCount
        let samples = try XCTUnwrap(input.floatChannelData?[0])
        (0..<Int(frameCount)).forEach { samples[$0] = Float(sin(2 * Double.pi * 440 * Double($0) / sampleRate) * 0.4) }
        var fed = false
        var stream = Data()
        while true {
            let out = AVAudioCompressedBuffer(format: aac, packetCapacity: 8, maximumPacketSize: max(converter.maximumOutputPacketSize, 1))
            var error: NSError?
            let status = converter.convert(to: out, error: &error) { _, inputStatus in
                guard !fed else {
                    inputStatus.pointee = .endOfStream
                    return nil
                }
                fed = true
                inputStatus.pointee = .haveData
                return input
            }
            let descriptions = out.packetDescriptions
            (0..<Int(out.packetCount)).forEach { index in
                guard let packet = descriptions?[index] else { return }
                let bytes = Data(bytes: out.data.advanced(by: Int(packet.mStartOffset)), count: Int(packet.mDataByteSize))
                stream += TalkieAdts.frame(bytes, sampleRate: sampleRate, channels: 1) ?? Data()
            }
            guard status == .haveData, error == nil else { break }
        }
        return stream
    }

    func test_talkieAdtsVoice_isRemuxedIntoAPlayableM4a() async throws {
        let adts = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Self.adtsTone(seconds: 2, sampleRate: 24_000).write(to: adts)

        let remuxed = await NSEAdtsRemux.m4a(from: adts)

        let m4a = try XCTUnwrap(remuxed, "la voix ADTS doit devenir un .m4a attachable")
        defer { try? FileManager.default.removeItem(at: m4a) }
        let file = try AVAudioFile(forReading: m4a)
        XCTAssertEqual(Double(file.length) / file.fileFormat.sampleRate, 2, accuracy: 0.25)
        XCTAssertFalse(FileManager.default.fileExists(atPath: adts.path))
    }
}

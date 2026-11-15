import XCTest
@testable import Meeshy

// #8063 — le format que l'extension de diffusion écrit et que l'app lit.
// `ScreenShareWire.swift` est compilé dans les DEUX cibles : ce bundle est le
// seul endroit où l'aller-retour se prouve.
final class ScreenShareWireTests: XCTestCase {

    private func makeFrameBytes(width: UInt32 = 1280, height: UInt32 = 720, orientation: UInt32 = 1, timestampNs: UInt64 = 42, payload: Data = Data([0xFF, 0xD8, 0x01, 0x02])) -> Data {
        ScreenShareFrameCodec.encode(width: width, height: height, orientation: orientation, timestampNs: timestampNs, payload: payload)
    }

    func test_decoder_wholeFrame_roundTripsHeaderAndPayload() throws {
        var decoder = ScreenShareFrameDecoder()
        let payload = Data([9, 8, 7])

        let frames = try decoder.append(makeFrameBytes(width: 886, height: 1920, orientation: 6, timestampNs: 1_234_567_890_123, payload: payload))

        XCTAssertEqual(frames, [ScreenShareFrame(
            header: ScreenShareFrameHeader(width: 886, height: 1920, orientation: 6, timestampNs: 1_234_567_890_123, payloadLength: 3),
            payload: payload
        )])
        XCTAssertEqual(decoder.bufferedByteCount, 0)
    }

    func test_decoder_frameSplitAcrossReads_waitsThenDelivers() throws {
        var decoder = ScreenShareFrameDecoder()
        let bytes = makeFrameBytes()

        let first = try decoder.append(bytes.prefix(10))
        let second = try decoder.append(bytes.dropFirst(10).prefix(20))
        let third = try decoder.append(bytes.dropFirst(30))

        XCTAssertTrue(first.isEmpty)
        XCTAssertTrue(second.isEmpty)
        XCTAssertEqual(third.count, 1)
    }

    func test_decoder_twoFramesInOneRead_deliversBothInOrder() throws {
        var decoder = ScreenShareFrameDecoder()
        let bytes = makeFrameBytes(timestampNs: 1) + makeFrameBytes(timestampNs: 2)

        let frames = try decoder.append(bytes)

        XCTAssertEqual(frames.map(\.header.timestampNs), [1, 2])
    }

    func test_decoder_badMagic_throwsAndDropsBuffer() {
        var decoder = ScreenShareFrameDecoder()
        var bytes = makeFrameBytes()
        bytes[0] = 0x00

        XCTAssertThrowsError(try decoder.append(bytes)) { error in
            XCTAssertEqual(error as? ScreenShareFrameDecoder.Failure, .badMagic)
        }
        XCTAssertEqual(decoder.bufferedByteCount, 0)
    }

    func test_decoder_oversizedPayloadLength_throwsBeforeBuffering() {
        var decoder = ScreenShareFrameDecoder()
        var bytes = makeFrameBytes().prefix(ScreenShareFrameCodec.headerLength)
        bytes.replaceSubrange((bytes.startIndex + 24)..<(bytes.startIndex + 28), with: [0xFF, 0xFF, 0xFF, 0xFF])

        XCTAssertThrowsError(try decoder.append(Data(bytes))) { error in
            XCTAssertEqual(error as? ScreenShareFrameDecoder.Failure, .payloadTooLarge)
        }
    }

    func test_rotationDegrees_mapsReplayKitOrientations() {
        XCTAssertEqual(ScreenShareFrameCodec.rotationDegrees(forOrientation: 1), 0)
        XCTAssertEqual(ScreenShareFrameCodec.rotationDegrees(forOrientation: 3), 180)
        XCTAssertEqual(ScreenShareFrameCodec.rotationDegrees(forOrientation: 8), 90)
        XCTAssertEqual(ScreenShareFrameCodec.rotationDegrees(forOrientation: 6), 270)
        XCTAssertEqual(ScreenShareFrameCodec.rotationDegrees(forOrientation: 0), 0)
    }

    func test_throttle_dropsFramesInsideTheInterval() {
        var throttle = ScreenShareFrameThrottle(maxFramesPerSecond: 10)

        let accepted = [0, 50_000_000, 100_000_000, 120_000_000, 250_000_000].map { throttle.shouldAccept(timestampNs: UInt64($0)) }

        XCTAssertEqual(accepted, [true, false, true, false, true])
    }

    func test_throttle_clockGoingBackwards_acceptsAndRearms() {
        var throttle = ScreenShareFrameThrottle(maxFramesPerSecond: 10)
        _ = throttle.shouldAccept(timestampNs: 5_000_000_000)

        XCTAssertTrue(throttle.shouldAccept(timestampNs: 1_000_000_000))
        XCTAssertFalse(throttle.shouldAccept(timestampNs: 1_050_000_000))
    }

    func test_scaling_capsTheLongSideOnly() {
        XCTAssertEqual(ScreenShareScaling.scale(width: 1179, height: 2556, maxLongSide: 1280), 1280.0 / 2556.0, accuracy: 0.0001)
        XCTAssertEqual(ScreenShareScaling.scale(width: 800, height: 600, maxLongSide: 1280), 1)
    }

    func test_unixSocketPath_refusesPathsLongerThanSunPath() {
        XCTAssertTrue(ScreenShareUnixSocket.isUsablePath("/private/var/mobile/Containers/Shared/AppGroup/0F0B2A7E-6B8C-4C55-9A4E-6B0C3D6E9A11/screen-share.sock"))
        XCTAssertFalse(ScreenShareUnixSocket.isUsablePath(String(repeating: "a", count: 104)))
        XCTAssertFalse(ScreenShareUnixSocket.isUsablePath(""))
    }

    func test_unixSocket_loopback_deliversEncodedFrame() throws {
        // `/tmp` et non `NSTemporaryDirectory()` : le conteneur du simulateur
        // dépasse les 103 octets de `sun_path`.
        let path = "/tmp/mssf-\(UUID().uuidString.prefix(8)).sock"
        let server = try XCTUnwrap(ScreenShareUnixSocket.makeStreamSocket())
        defer { close(server); unlink(path) }
        XCTAssertTrue(ScreenShareUnixSocket.bindAndListen(server, path: path))
        let client = try XCTUnwrap(ScreenShareUnixSocket.makeStreamSocket())
        defer { close(client) }
        XCTAssertTrue(ScreenShareUnixSocket.connect(client, path: path))
        let accepted = accept(server, nil, nil)
        defer { close(accepted) }
        let bytes = makeFrameBytes(timestampNs: 77)

        XCTAssertTrue(ScreenShareUnixSocket.writeAll(client, data: bytes))
        var buffer = [UInt8](repeating: 0, count: bytes.count)
        let read = recv(accepted, &buffer, buffer.count, MSG_WAITALL)
        var decoder = ScreenShareFrameDecoder()
        let frames = try decoder.append(Data(buffer.prefix(max(0, read))))

        XCTAssertEqual(frames.first?.header.timestampNs, 77)
    }
}

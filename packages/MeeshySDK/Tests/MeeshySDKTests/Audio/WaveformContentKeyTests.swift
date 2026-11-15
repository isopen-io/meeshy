import XCTest
@testable import MeeshySDK

/// La clé d'un relevé est l'empreinte du CONTENU : deux fichiers de même nom ne
/// se confondent plus, un même contenu sous deux noms ne se calcule qu'une fois.
final class WaveformContentKeyTests: XCTestCase {

    private func bytes(_ count: Int, seed: UInt8 = 1) -> Data {
        Data((0..<count).map { UInt8(truncatingIfNeeded: $0 &* 31 &+ Int(seed)) })
    }

    private func write(_ data: Data, as name: String) throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("wk-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(name)
        try data.write(to: url)
        return url
    }

    func test_sameBytes_underTwoNamesAndTwoFolders_shareOneKey() throws {
        let content = bytes(300_000)
        let a = try write(content, as: "voice.m4a")
        let b = try write(content, as: "copie-de-voice.caf")
        defer { [a, b].forEach { try? FileManager.default.removeItem(at: $0.deletingLastPathComponent()) } }

        XCTAssertEqual(WaveformContentKey.identity(of: a), WaveformContentKey.identity(of: b))
    }

    func test_sameName_differentBytes_neverShareAKey() throws {
        let a = try write(bytes(300_000, seed: 1), as: "recording.m4a")
        let b = try write(bytes(300_000, seed: 2), as: "recording.m4a")
        defer { [a, b].forEach { try? FileManager.default.removeItem(at: $0.deletingLastPathComponent()) } }

        XCTAssertNotEqual(WaveformContentKey.identity(of: a), WaveformContentKey.identity(of: b),
                          "deux `recording.m4a` ne sont pas le même son")
    }

    func test_dataAndFile_ofTheSameBytes_shareOneKey() throws {
        for size in [10, 65_536, 65_537, 131_072, 400_000] {
            let content = bytes(size)
            let url = try write(content, as: "x.caf")
            defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }

            XCTAssertEqual(WaveformContentKey.identity(of: content), WaveformContentKey.identity(of: url),
                           "taille \(size) : la voie Data et la voie URL doivent s'accorder")
        }
    }

    func test_aDifferenceInTheTail_changesTheKey() {
        var other = bytes(400_000)
        other[399_999] = other[399_999] &+ 1

        XCTAssertNotEqual(WaveformContentKey.identity(of: bytes(400_000)), WaveformContentKey.identity(of: other))
    }

    func test_aDifferentLength_changesTheKey() {
        XCTAssertNotEqual(WaveformContentKey.identity(of: bytes(1000)), WaveformContentKey.identity(of: bytes(1001)))
    }

    func test_remoteURL_isKeyedByItsAddress_notRead() {
        let a = URL(string: "https://media.meeshy.me/u/a.m4a")!
        let b = URL(string: "https://media.meeshy.me/u/b.m4a")!

        XCTAssertNotEqual(WaveformContentKey.identity(of: a), WaveformContentKey.identity(of: b))
        XCTAssertEqual(WaveformContentKey.identity(of: a), WaveformContentKey.identity(of: a))
    }
}

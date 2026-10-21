import XCTest
@testable import MeeshyUI

/// **Les sites qui DÉPLACENT la tête de lecture passent par la loi (#10354).**
///
/// Le `seek` d'un vrai `AVPlayer` n'est pas atteignable sans moteur réel : ces
/// gardes lisent la source pour prouver que le recyclage, la reprise et le
/// pool appellent `PlaybackResumeLaw` / `PlayerPoolEviction` — les témoins de
/// valeur sont dans `PlaybackResumeLawTests`.
final class ReelResumeWiringGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func body(of signature: String, in text: String) throws -> String {
        let start = try XCTUnwrap(text.range(of: signature), "\(signature) introuvable")
        let rest = text[start.upperBound...]
        let end = rest.range(of: "\n    }\n")?.lowerBound ?? rest.endIndex
        return String(rest[..<end])
    }

    func test_recycle_keepsTheHeadByTheLaw_neverRewindsUnconditionally() throws {
        let recycle = try body(of: "func recycle(",
                               in: source("Sources/MeeshyUI/Media/SharedAVPlayerManager+Preroll.swift"))
        XCTAssertTrue(recycle.contains("PlaybackResumeLaw.recycledHead("),
                      "le lecteur rendu au pool garde sa position quand elle est reprenable")
        XCTAssertFalse(recycle.contains("seek(to: .zero"),
                       "ramené à zéro, le retour jouait depuis le début puis sautait")
    }

    func test_resume_isATolerantSeekDecidedByTheLaw() throws {
        let resume = try body(of: "private func applyResumePositionIfAvailable(",
                              in: source("Sources/MeeshyUI/Media/SharedAVPlayerManager.swift"))
        XCTAssertTrue(resume.contains("PlaybackResumeLaw.action("))
        XCTAssertTrue(resume.contains("precise: false"),
                      "un seek précis décodait depuis l'image-clé précédente")
        XCTAssertFalse(resume.contains("seek(to: saved)"))
    }

    func test_play_waitsForTheResume() throws {
        let play = try body(of: "public func play() {",
                            in: source("Sources/MeeshyUI/Media/SharedAVPlayerManager.swift"))
        XCTAssertTrue(play.contains("applyResumePositionIfAvailable()"),
                      "la reprise se pose avant la lecture, jamais après un départ de zéro")
        XCTAssertTrue(play.contains("playsWhenResumed = true"))
    }

    /// Le voisin préparé arrive à sa reprise : la tête se pose AVANT le
    /// préroulage, par une tolérance de la loi, jamais par un seek précis.
    func test_preroll_placesTheHeadOnTheResumeBeforePrerolling() throws {
        let text = try source("Sources/MeeshyUI/Story/StoryMediaLoader.swift")
        let resume = try XCTUnwrap(text.range(of: "resume?(")?.lowerBound)
        let preroll = try XCTUnwrap(text.range(of: "player.preroll(atRate: 1.0)", range: resume..<text.endIndex)?.lowerBound,
                                    "le préroulage suit la pose de la tête")
        XCTAssertLessThan(resume, preroll)
        XCTAssertTrue(text.contains("PlaybackResumeLaw.tolerance"))
    }

    func test_pool_overflowsByTheFarthest() throws {
        let loader = try source("Sources/MeeshyUI/Story/StoryMediaLoader.swift")
        let insert = try body(of: "private func insert(", in: loader)
        let trim = try body(of: "private func trimToCapacity(", in: loader)
        XCTAssertTrue(insert.contains("trimToCapacity()"), "toute insertion rend le pool à sa taille")
        XCTAssertTrue(trim.contains("PlayerPoolEviction.victim("),
                      "le pool rend le plus loin du réel affiché, pas le plus ancien")
        XCTAssertFalse(trim.contains("removeFirst()"))
    }
}

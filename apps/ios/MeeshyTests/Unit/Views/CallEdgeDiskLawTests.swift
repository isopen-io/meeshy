import XCTest
@testable import Meeshy

/// **L'appel réduit est un disque rogné, aimanté au bord** (#18458) : où il se
/// pose, ce que ses cercles disent, quand le réseau s'y montre, de quel côté
/// la durée continue.
final class CallEdgeDiskLawTests: XCTestCase {

    func test_theDisk_overflowsTheScreen_byItsHiddenFraction() {
        let width: CGFloat = 402
        let d = CallEdgeDiskLaw.diameter
        XCTAssertEqual(CallEdgeDiskLaw.centerX(edge: .trailing, screenWidth: width), width - d / 2 + d * CallEdgeDiskLaw.hiddenFraction, accuracy: 0.001)
        XCTAssertEqual(CallEdgeDiskLaw.centerX(edge: .leading, screenWidth: width), d / 2 - d * CallEdgeDiskLaw.hiddenFraction, accuracy: 0.001)
        XCTAssertEqual(CallEdgeDiskLaw.visibleWidth(), d * (1 - CallEdgeDiskLaw.hiddenFraction), accuracy: 0.001)
        XCTAssertGreaterThan(CallEdgeDiskLaw.visibleWidth(), d / 2, "le visage reste reconnaissable : plus de la moitié du disque se voit")
    }

    func test_theVisibleSide_isOppositeToTheAnchoredEdge() {
        XCTAssertEqual(CallEdgeDiskLaw.visibleSide(edge: .trailing), .leading)
        XCTAssertEqual(CallEdgeDiskLaw.visibleSide(edge: .leading), .trailing)
    }

    func test_rings_areConcentric_andGrowOutward() {
        let r0 = CallEdgeDiskLaw.ringRadius(index: 0)
        let r1 = CallEdgeDiskLaw.ringRadius(index: 1)
        XCTAssertGreaterThan(r0, CallEdgeDiskLaw.diameter / 2)
        XCTAssertEqual(r1 - r0, CallEdgeDiskLaw.ringSpacing, accuracy: 0.001)
        XCTAssertEqual(CallEdgeDiskLaw.ringCount, 2)
    }

    func test_ringTone_degradedNetworkWins_overSpeech() {
        XCTAssertEqual(CallEdgeDiskLaw.ringTone(isSpeaking: false, strength: .excellent), .resting)
        XCTAssertEqual(CallEdgeDiskLaw.ringTone(isSpeaking: true, strength: .good), .speaking)
        XCTAssertEqual(CallEdgeDiskLaw.ringTone(isSpeaking: true, strength: .fair), .degraded, "une ligne qui faiblit se dit avant une voix qui porte")
        XCTAssertEqual(CallEdgeDiskLaw.ringTone(isSpeaking: false, strength: .poor), .poor)
        XCTAssertEqual(CallEdgeDiskLaw.ringTone(isSpeaking: false, strength: .lost), .poor)
        XCTAssertEqual(CallEdgeDiskLaw.ringTone(isSpeaking: false, strength: .connecting), .resting)
    }

    func test_ringOpacity_restingIsDiscreet_outerRingIsFainter() {
        XCTAssertLessThan(CallEdgeDiskLaw.ringOpacity(tone: .resting, index: 0), CallEdgeDiskLaw.ringOpacity(tone: .speaking, index: 0))
        XCTAssertLessThan(CallEdgeDiskLaw.ringOpacity(tone: .speaking, index: 1), CallEdgeDiskLaw.ringOpacity(tone: .speaking, index: 0))
        XCTAssertEqual(CallEdgeDiskLaw.ringOpacity(tone: .degraded, index: 0), CallEdgeDiskLaw.ringOpacity(tone: .poor, index: 0))
    }

    func test_signal_showsOnlyWhenTheLinkDegrades() {
        XCTAssertFalse(CallEdgeDiskLaw.showsSignal(strength: .excellent))
        XCTAssertFalse(CallEdgeDiskLaw.showsSignal(strength: .good))
        XCTAssertFalse(CallEdgeDiskLaw.showsSignal(strength: .connecting))
        XCTAssertTrue(CallEdgeDiskLaw.showsSignal(strength: .fair))
        XCTAssertTrue(CallEdgeDiskLaw.showsSignal(strength: .poor))
        XCTAssertTrue(CallEdgeDiskLaw.showsSignal(strength: .lost))
    }

    func test_theBubble_mountsTheDisk_atTheCircleTier() throws {
        let iosRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let bubble = try String(contentsOf: iosRoot.appendingPathComponent("Meeshy/Features/Call/Views/CallBubbleView.swift"), encoding: .utf8)
        XCTAssertTrue(bubble.contains("CallEdgeDisk("), "le palier cercle est le disque rogné du kit d'appel")
        XCTAssertTrue(bubble.contains("CallEdgeDiskLaw.centerX("), "le disque se pose selon la loi, pas selon la marge de la bulle rectangle")
    }
}

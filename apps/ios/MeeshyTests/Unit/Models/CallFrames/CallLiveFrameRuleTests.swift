import CoreGraphics
import MeeshySDK
import XCTest
@testable import Meeshy

/// LE CADRE EN DIRECT D'UN APPEL À DEUX (#9214, doc frames 06 § 4) — quels cadres se proposent,
/// quand un cadre choisi se montre (duo, appareil libre, animations permises), qui s'y nomme,
/// et à quelle taille ses couches se peignent.
final class CallLiveFrameRuleTests: XCTestCase {
    private let texts = CallFrameTexts(groupName: nil, isGroup: false, date: "3 oct. 2026", accentHex: nil)

    private func makeDesign(
        id: String = "test.live.duo",
        bucket: CallFrameBucket = .duo,
        motion: CallFrameOrnamentMotion = .still,
        scene: [CallFrameSceneLayer] = [],
        surfaces: [CallFrameSurface] = [.capture],
        cost: CallFrameCost? = nil
    ) -> CallFrameDesign {
        CallFrameDesign(
            id: id,
            motif: "test.live",
            mood: .jovial,
            name: "Direct",
            bucket: bucket,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.05, gap: 0.02, top: 0.1, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .solid(color: "#000000"),
                pattern: nil,
                border: nil,
                ornaments: [CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: motion)],
                names: CallFrameNames(show: .name, style: .caption, font: .bubble, color: "#FFFFFF", fill: nil),
                title: CallFrameTitle(source: .names, font: .bubble, color: "#FFFFFF", place: .top, size: .m, effect: nil, letterCase: nil),
                subtitle: nil,
                scene: scene
            ),
            surfaces: surfaces,
            cost: cost
        )
    }

    private func display(
        _ design: CallFrameDesign,
        frameId: String? = nil,
        participants: Int = 2,
        constrained: Bool = false,
        reduceMotion: Bool = false
    ) -> CallLiveFrameDisplay {
        CallLiveFrameRule.display(
            frameId: frameId ?? design.id,
            participants: participants,
            isDeviceConstrained: constrained,
            reduceMotion: reduceMotion,
            in: [design]
        )
    }

    // MARK: - Ce qui se propose

    func test_isEligible_duoWithoutDeclaredCost_isOffered() {
        XCTAssertTrue(CallLiveFrameRule.isEligible(makeDesign()))
    }

    func test_isEligible_lightCost_isOffered() {
        XCTAssertTrue(CallLiveFrameRule.isEligible(makeDesign(cost: .light)))
    }

    func test_isEligible_richCostWithoutLiveSurface_isNotOffered() {
        XCTAssertFalse(CallLiveFrameRule.isEligible(makeDesign(cost: .rich)))
    }

    func test_isEligible_richCostDeclaringLive_isOffered() {
        XCTAssertTrue(CallLiveFrameRule.isEligible(makeDesign(surfaces: [.capture, .live], cost: .rich)))
    }

    func test_isEligible_groupFrame_isNotOffered() {
        XCTAssertFalse(CallLiveFrameRule.isEligible(makeDesign(bucket: .trio)))
    }

    func test_frames_catalogue_offersAtLeastOneDuoFrame() {
        XCTAssertFalse(CallLiveFrameRule.frames().isEmpty)
        XCTAssertTrue(CallLiveFrameRule.frames().allSatisfy { $0.serves(people: 2) })
        XCTAssertFalse(CallLiveFrameRule.moods().isEmpty)
    }

    func test_mayOffer_onlyAVideoDuo() {
        XCTAssertTrue(CallLiveFrameRule.mayOffer(participants: 2, showsVideo: true))
        XCTAssertFalse(CallLiveFrameRule.mayOffer(participants: 2, showsVideo: false))
        XCTAssertFalse(CallLiveFrameRule.mayOffer(participants: 3, showsVideo: true))
    }

    // MARK: - Ce qui se montre

    func test_display_duo_showsTheFrame() {
        let design = makeDesign()
        XCTAssertEqual(display(design), .frame(design))
    }

    func test_display_noChoice_showsNothing() {
        XCTAssertEqual(CallLiveFrameRule.display(frameId: nil, participants: 2, isDeviceConstrained: false, reduceMotion: false, in: [makeDesign()]), CallLiveFrameDisplay.none)
    }

    func test_display_moreThanTwo_showsNothing() {
        XCTAssertEqual(display(makeDesign(), participants: 3), CallLiveFrameDisplay.none)
    }

    func test_display_unknownFrame_showsNothing() {
        XCTAssertEqual(display(makeDesign(), frameId: "inconnu.motif.duo"), CallLiveFrameDisplay.none)
    }

    func test_display_constrainedDevice_suspendsEvenAStaticFrame() {
        let design = makeDesign()
        XCTAssertEqual(display(design, constrained: true), .suspended(design, .deviceConstrained))
    }

    func test_display_reduceMotion_suspendsAnAnimatedFrame() {
        let design = makeDesign(motion: .loop)
        XCTAssertEqual(display(design, reduceMotion: true), .suspended(design, .reduceMotion))
    }

    func test_display_reduceMotion_keepsAStaticFrame() {
        let design = makeDesign()
        XCTAssertEqual(display(design, reduceMotion: true), .frame(design))
    }

    func test_animates_sceneLayer_countsAsMotion() {
        let layer = CallFrameSceneLayer(id: "glow", kind: .light, depth: .back, src: nil, preset: nil, color: "#FFFFFF", amount: 0.5, maxParticles: nil)
        XCTAssertTrue(CallLiveFrameRule.animates(makeDesign(scene: [layer])))
        XCTAssertFalse(CallLiveFrameRule.animates(makeDesign()))
    }

    // MARK: - Identifiants reçus

    func test_isFrameId_catalogueShape_isAccepted() {
        XCTAssertTrue(CallLiveFrameRule.isFrameId("corporate.conseil.duo"))
        XCTAssertTrue(CallLiveFrameRule.isFrameId("hors-norme.pop-art"))
    }

    func test_isFrameId_foreignShape_isRejected() {
        XCTAssertFalse(CallLiveFrameRule.isFrameId(""))
        XCTAssertFalse(CallLiveFrameRule.isFrameId("Corporate.Duo"))
        XCTAssertFalse(CallLiveFrameRule.isFrameId("solo"))
        XCTAssertFalse(CallLiveFrameRule.isFrameId("a..b"))
        XCTAssertFalse(CallLiveFrameRule.isFrameId("../etc/passwd"))
        XCTAssertFalse(CallLiveFrameRule.isFrameId("a." + String(repeating: "b", count: 96)))
    }

    // MARK: - Qui se nomme

    func test_people_remoteSharedName_replacesOnlyThePeer() {
        let people = [
            CallFramePerson(id: "me", name: "Awa", handle: "awa", isSelf: true),
            CallFramePerson(id: "you", name: "karim42", handle: "karim42", isSelf: false),
        ]

        let named = CallLiveFrameRule.people(people, remoteSharedName: "  Karim ")

        XCTAssertEqual(named.map(\.name), ["Awa", "Karim"])
        XCTAssertEqual(named.map(\.id), ["me", "you"])
    }

    func test_people_emptySharedName_keepsWhatWeKnew() {
        let people = [CallFramePerson(id: "you", name: "Karim", handle: nil, isSelf: false)]
        XCTAssertEqual(CallLiveFrameRule.people(people, remoteSharedName: "   "), people)
    }

    // MARK: - Peindre

    func test_paintSize_isThePixelSizeOfTheScreen() {
        XCTAssertEqual(CallLiveFrameRule.paintSize(viewSize: CGSize(width: 390, height: 844), scale: 2), CGSize(width: 780, height: 1688))
    }

    func test_paintSize_capsTheLongestSide() {
        let size = CallLiveFrameRule.paintSize(viewSize: CGSize(width: 430, height: 932), scale: 3)
        XCTAssertEqual(max(size.width, size.height), CallLiveFrameRule.paintLongestSide)
        XCTAssertEqual(size.width / size.height, 430 / 932, accuracy: 0.002)
    }

    func test_paintSize_emptyView_paintsNothing() {
        XCTAssertEqual(CallLiveFrameRule.paintSize(viewSize: .zero, scale: 3), .zero)
    }

    func test_needsRepaint_onlyWhenAnInputChanges() {
        let people = [CallFramePerson(id: "me", name: "Awa", handle: nil, isSelf: true)]
        let inputs = CallLiveFrameLayerInputs(frameId: "a.b", people: people, texts: texts, size: CGSize(width: 10, height: 20))
        XCTAssertTrue(CallLiveFrameRule.needsRepaint(current: nil, next: inputs))
        XCTAssertFalse(CallLiveFrameRule.needsRepaint(current: inputs, next: inputs))
        let rotated = CallLiveFrameLayerInputs(frameId: "a.b", people: people, texts: texts, size: CGSize(width: 20, height: 10))
        XCTAssertTrue(CallLiveFrameRule.needsRepaint(current: inputs, next: rotated))
        let nextDay = CallLiveFrameLayerInputs(frameId: "a.b", people: people, texts: CallFrameTexts(groupName: nil, isGroup: false, date: "4 oct. 2026", accentHex: nil), size: inputs.size)
        XCTAssertTrue(CallLiveFrameRule.needsRepaint(current: inputs, next: nextDay))
    }
}

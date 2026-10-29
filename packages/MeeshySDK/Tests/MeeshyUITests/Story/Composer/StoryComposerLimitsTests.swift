import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Les plafonds LARGES d'une story / d'une scène (#13590, décision porteur
/// 2026-10-28) : texte 1 000 caractères, 50 objets par famille et par scène,
/// 2 h pour la story entière.
@MainActor
final class StoryComposerLimitsTests: XCTestCase {

    private func makeSubject() -> (vm: StoryComposerViewModel, refused: () -> [StoryComposerLimit]) {
        let vm = StoryComposerViewModel()
        var seen: [StoryComposerLimit] = []
        vm.onLimitReached = { seen.append($0) }
        return (vm, { seen })
    }

    // MARK: - Constantes

    func test_limits_matchTheDecision() {
        XCTAssertEqual(StoryComposerLimits.maxTextCharacters, 1_000)
        XCTAssertEqual(StoryComposerLimits.maxStickersPerScene, 50)
        XCTAssertEqual(StoryComposerLimits.maxImagesPerScene, 50)
        XCTAssertEqual(StoryComposerLimits.maxTextsPerScene, 50)
        XCTAssertEqual(StoryComposerLimits.maxAudiosPerScene, 50)
        XCTAssertEqual(StoryComposerLimits.maxVideosPerScene, 50)
        XCTAssertEqual(StoryComposerLimits.maxStoryDurationSeconds, 7_200)
    }

    func test_clampedText_overTheCap_cutsAtOneThousandCharacters() {
        let long = String(repeating: "é", count: 1_500)
        XCTAssertEqual(StoryComposerLimits.clampedText(long).count, 1_000)
        XCTAssertEqual(StoryComposerLimits.clampedText("court"), "court")
    }

    func test_fittedReplacement_keepsTheHeadThatFits() {
        let current = String(repeating: "a", count: 990)
        let full = current.startIndex..<current.endIndex
        let tail = current.index(current.endIndex, offsetBy: 0)..<current.endIndex
        XCTAssertEqual(StoryComposerLimits.fittedReplacement(current: current, replacing: tail, with: "0123456789ABC"),
                       "0123456789")
        XCTAssertEqual(StoryComposerLimits.fittedReplacement(current: current, replacing: full, with: "x"), "x")
    }

    // MARK: - Contenu existant au-delà des plafonds

    /// iOS publiait sans plafond de stickers : une story existante peut porter
    /// plus que les cinquante d'aujourd'hui. Elle s'ouvre ENTIÈRE ; seul l'ajout
    /// est refusé, et le refus se dit.
    func test_editingAStoryBeyondTheCaps_opensWhole_andOnlyAdditionsAreRefused() {
        var effects = StoryEffects()
        effects.stickerObjects = (0..<60).map { StorySticker(id: "s\($0)", emoji: "🎉") }
        effects.textObjects = [
            StoryTextObject(id: "t1", text: String(repeating: "x", count: 1_500), x: 0.5, y: 0.5,
                            scale: 1, rotation: 0, fontSize: 22, textStyle: "bold",
                            textColor: "FFFFFF", textAlign: "center", textBg: nil)
        ]
        let story = StoryItem(id: "post-old", content: nil, media: [], storyEffects: effects,
                              createdAt: Date(), expiresAt: nil, visibility: "PUBLIC", isViewed: false)
        let vm = StoryComposerViewModel(editing: story)
        var seen: [StoryComposerLimit] = []
        vm.onLimitReached = { seen.append($0) }

        XCTAssertEqual(vm.currentEffects.stickerObjects?.count, 60)
        XCTAssertEqual(vm.currentEffects.textObjects.first?.text.count, 1_500,
                       "un texte stocké n'est pas recoupé à l'ouverture")
        XCTAssertNil(vm.addSticker(emoji: "🔥"))
        XCTAssertEqual(vm.currentEffects.stickerObjects?.count, 60)
        XCTAssertEqual(seen, [.sticker])
    }

    // MARK: - Frappe sur la scène

    private func type(_ replacement: String, at location: Int, into text: String) -> (accepted: Bool, field: UITextView, posted: Int) {
        let canvas = StoryCanvasUIView(slide: StorySlide(), mode: .edit)
        let field = UITextView()
        field.text = text
        var posted = 0
        let token = NotificationCenter.default.addObserver(forName: StoryInlineTextLengthGate.limitReached,
                                                           object: field, queue: nil) { _ in posted += 1 }
        defer { NotificationCenter.default.removeObserver(token) }
        let accepted = canvas.textView(field, shouldChangeTextIn: NSRange(location: location, length: 0),
                                       replacementText: replacement)
        return (accepted, field, posted)
    }

    func test_typingAtTheCap_isRefusedAndSaysWhy() {
        let typed = type("b", at: 1_000, into: String(repeating: "a", count: 1_000))

        XCTAssertFalse(typed.accepted)
        XCTAssertEqual(typed.field.text.count, 1_000)
        XCTAssertEqual(typed.posted, 1)
    }

    func test_pastingPastTheCap_keepsTheHeadThatFitsAndSaysWhy() {
        let head = String(repeating: "a", count: 995)
        let typed = type("👨‍👩‍👧🇫🇷é0123456789", at: 995, into: head)

        XCTAssertFalse(typed.accepted)
        XCTAssertEqual(typed.field.text, head + "👨‍👩‍👧🇫🇷é01")
        XCTAssertEqual(typed.field.text.count, 1_000)
        XCTAssertEqual(typed.posted, 1)
    }

    func test_clamped_aLongValueIsCutAndSaysWhy_aShortOneIsSilent() {
        var posted = 0
        let token = NotificationCenter.default.addObserver(forName: StoryInlineTextLengthGate.limitReached,
                                                           object: nil, queue: nil) { _ in posted += 1 }
        defer { NotificationCenter.default.removeObserver(token) }

        XCTAssertEqual(StoryInlineTextLengthGate.clamped(String(repeating: "x", count: 1_200)).count, 1_000)
        XCTAssertEqual(StoryInlineTextLengthGate.clamped("court"), "court")
        XCTAssertEqual(posted, 1)
    }

    func test_typingBelowTheCap_passesSilently() {
        let typed = type("!", at: 5, into: "court")

        XCTAssertTrue(typed.accepted)
        XCTAssertEqual(typed.posted, 0)
    }

    // MARK: - Stickers

    func test_addSticker_atFifty_isRefusedAndSaysWhy() {
        let (vm, refused) = makeSubject()
        for _ in 0..<StoryComposerLimits.maxStickersPerScene { XCTAssertNotNil(vm.addSticker(emoji: "🎉")) }

        XCTAssertNil(vm.addSticker(emoji: "🔥"))
        XCTAssertEqual(vm.currentEffects.stickerObjects?.count, 50)
        XCTAssertFalse(vm.canAddSticker)
        XCTAssertEqual(refused(), [.sticker])
    }

    func test_addSticker_belowFifty_isAccepted() {
        let (vm, refused) = makeSubject()
        for _ in 0..<49 { _ = vm.addSticker(emoji: "🎉") }
        XCTAssertNotNil(vm.addSticker(emoji: "🔥"))
        XCTAssertTrue(refused().isEmpty)
    }

    // MARK: - Textes

    func test_addText_atFifty_isRefused_andBeyondFiveIsAllowed() {
        let (vm, refused) = makeSubject()
        for _ in 0..<StoryComposerLimits.maxTextsPerScene { XCTAssertNotNil(vm.addText()) }

        XCTAssertNil(vm.addText())
        XCTAssertEqual(vm.currentEffects.textObjects.count, 50)
        XCTAssertEqual(refused(), [.text])
    }

    func test_updateTextContent_overOneThousand_isCutAndRefused() throws {
        let (vm, refused) = makeSubject()
        let text = try XCTUnwrap(vm.addText())

        vm.updateTextContent(id: text.id, text: String(repeating: "x", count: 1_400))

        XCTAssertEqual(vm.currentEffects.textObjects.first?.text.count, 1_000)
        XCTAssertEqual(refused(), [.textLength])
    }

    func test_updateTextContent_atOneThousand_isKeptWhole() throws {
        let (vm, refused) = makeSubject()
        let text = try XCTUnwrap(vm.addText())

        vm.updateTextContent(id: text.id, text: String(repeating: "x", count: 1_000))

        XCTAssertEqual(vm.currentEffects.textObjects.first?.text.count, 1_000)
        XCTAssertTrue(refused().isEmpty)
    }

    // MARK: - Médias

    func test_addMediaObject_perFamily_eachFamilyHasItsOwnFifty() {
        let (vm, refused) = makeSubject()
        for _ in 0..<StoryComposerLimits.maxImagesPerScene { XCTAssertNotNil(vm.addMediaObject(kind: .image)) }

        XCTAssertNil(vm.addMediaObject(kind: .image))
        XCTAssertNotNil(vm.addMediaObject(kind: .video), "les vidéos ont leur propre plafond")
        XCTAssertEqual(refused(), [.image])
    }

    func test_addAudioObject_atFifty_isRefused() {
        let (vm, refused) = makeSubject()
        for _ in 0..<StoryComposerLimits.maxAudiosPerScene { XCTAssertNotNil(vm.addAudioObject(role: nil)) }

        XCTAssertNil(vm.addAudioObject(role: nil))
        XCTAssertEqual(refused(), [.audio])
    }

    func test_canAddMedia_staysTrueWhileAnyFamilyHasRoom() {
        let (vm, _) = makeSubject()
        for _ in 0..<StoryComposerLimits.maxImagesPerScene { _ = vm.addMediaObject(kind: .image) }
        XCTAssertFalse(vm.canAddImage)
        XCTAssertTrue(vm.canAddMedia)
    }

    // MARK: - Durée

    func test_currentSlideDuration_cannotExceedTheRemainingTwoHours() {
        let (vm, refused) = makeSubject()
        vm.currentSlideDuration = 5_000
        XCTAssertEqual(vm.currentSlideDuration, 5_000)

        vm.addSlide()
        vm.currentSlideDuration = 4_000

        XCTAssertEqual(vm.currentSlideDuration, 2_200, accuracy: 0.01,
                       "7 200 s moins les 5 000 s déjà prises par la première scène")
        XCTAssertEqual(refused(), [.duration])
    }

    func test_currentSlideDuration_aSingleSceneMayTakeTheWholeTwoHours() {
        let (vm, _) = makeSubject()
        vm.currentSlideDuration = 9_999
        XCTAssertEqual(vm.currentSlideDuration, 7_200, accuracy: 0.01)
    }
}

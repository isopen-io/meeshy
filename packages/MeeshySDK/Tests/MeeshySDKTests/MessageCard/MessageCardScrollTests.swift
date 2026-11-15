import Foundation
import Testing
@testable import MeeshySDK

/// Un message long devient une vidéo qui DÉFILE (#18671) : la carte garde son
/// texte à sa taille naturelle, et la vidéo le fait passer sous le format choisi.
struct MessageCardScrollTests {

    private static func measure(_ text: String, _ font: MessageCardFont) -> Double { Double(text.count) * font.size * 0.5 }

    private static func input(_ text: String, aspect: MessageCardAspect = .story, backdrop: MessageCardBackdrop? = nil) -> MessageCardInput {
        var input = MessageCardInput(
            quoted: MessageCardPart(author: "Awa", text: "On en parle ?"),
            reply: MessageCardPart(author: "Jacques", text: text),
            template: MessageCardTemplates.defaultID,
            handle: "jacques",
            disposition: MessageCardDisposition(aspect: aspect)
        )
        input.backdrop = backdrop
        return input
    }

    private static let long = Array(repeating: "Une phrase assez longue pour remplir plusieurs lignes de la carte.", count: 60).joined(separator: " ")

    private static func texts(_ layout: MessageCardLayout) -> [MessageCardTextOp] {
        layout.ops.compactMap { if case let .text(text) = $0 { return text } else { return nil } }
    }

    // MARK: - Vitesses

    @Test func theNineSpeedsAreOfferedInOrder() {
        #expect(MessageCardScrollSpeed.allCases.map(\.factor) == [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3])
        #expect(MessageCardScrollSpeed.standard == .x1)
    }

    @Test func aSpeedReadsWithTheDecimalOfTheLocale() {
        #expect(MessageCardScrollSpeed.x0_75.label(locale: Locale(identifier: "fr_FR")) == "×0,75")
        #expect(MessageCardScrollSpeed.x2.label(locale: Locale(identifier: "en_US")) == "×2")
        #expect(MessageCardScrollSpeed.x2_5.label(locale: Locale(identifier: "en_US")) == "×2.5")
    }

    // MARK: - Carte sans plafond

    @Test func anUnboundedCardKeepsTheTextAtItsNaturalSize() {
        let bounded = MessageCardLayout.make(Self.input(Self.long), measure: Self.measure)
        var tall = Self.input(Self.long)
        tall.unbounded = true
        let unbounded = MessageCardLayout.make(tall, measure: Self.measure)
        #expect(bounded.truncated)
        #expect(!unbounded.truncated)
        #expect(unbounded.height > 1920)
        let replySizes = Self.texts(unbounded).map(\.font.size)
        #expect(replySizes.max() == MessageCardMetrics.replyStart)
    }

    @Test func anUnboundedShortCardStaysAtTheFormatHeight() {
        var short = Self.input("Chez Lina, à 20 h !", aspect: .square)
        short.unbounded = true
        let layout = MessageCardLayout.make(short, measure: Self.measure)
        #expect(layout.height == 1080)
        #expect(layout.viewportHeight == 1080)
    }

    @Test func anUnboundedInputSurvivesAMomentAndAClip() {
        var tall = Self.input(Self.long)
        tall.unbounded = true
        #expect(tall.at(time: 2).unbounded)
        #expect(tall.clipped(to: MessageCardClip(start: 0, duration: 3)).unbounded)
    }

    // MARK: - Plan

    @Test func aCardThatFitsDoesNotScroll() {
        #expect(MessageCardScrollPlan.of(contentHeight: 1900, viewportHeight: 1920, speed: .x1) == nil)
    }

    @Test func theScrollHoldsThenTravelsThenHolds() throws {
        let plan = try #require(MessageCardScrollPlan.of(contentHeight: 1920 + 540, viewportHeight: 1920, speed: .x1))
        let travel = 540 / MessageCardScrollPlan.pixelsPerSecond
        #expect(plan.travel == 540)
        #expect(plan.duration == MessageCardScrollPlan.leadIn + travel + MessageCardScrollPlan.leadOut)
        #expect(plan.offset(at: 0) == 0)
        #expect(plan.offset(at: MessageCardScrollPlan.leadIn) == 0)
        #expect(plan.offset(at: plan.duration) == 540)
        #expect(plan.offset(at: MessageCardScrollPlan.leadIn + travel / 2) == 270)
        #expect(plan.frameCount == Int((plan.duration * MessageCardScrollPlan.fps).rounded(.up)))
    }

    @Test func doublingTheSpeedHalvesTheTravelTime() throws {
        let slow = try #require(MessageCardScrollPlan.of(contentHeight: 6000, viewportHeight: 1920, speed: .x1))
        let fast = try #require(MessageCardScrollPlan.of(contentHeight: 6000, viewportHeight: 1920, speed: .x2))
        let lead = MessageCardScrollPlan.leadIn + MessageCardScrollPlan.leadOut
        #expect(abs((slow.duration - lead) - 2 * (fast.duration - lead)) < 0.0001)
    }

    @Test func aVeryLongTextIsCappedAtTheLongestVideo() throws {
        let plan = try #require(MessageCardScrollPlan.of(contentHeight: 400_000, viewportHeight: 1920, speed: .x0_5))
        #expect(plan.duration == MessageCardScrollPlan.maxDuration)
        #expect(plan.offset(at: plan.duration) == plan.travel)
    }

    // MARK: - Fond choisi

    @Test func aChosenBackdropIsPaintedUnderItsVeil() throws {
        let media = MessageCardMedia(id: MessageCardBackdrop.mediaID, kind: .image, aspect: 0.75)
        let layout = MessageCardLayout.make(Self.input("Bonjour", backdrop: MessageCardBackdrop(media: media, veil: 0.4)), measure: Self.measure)
        guard case let .media(painted) = try #require(layout.backdrop.first) else {
            Issue.record("le fond choisi n'est pas peint en premier")
            return
        }
        #expect(painted.mediaID == MessageCardBackdrop.mediaID)
        #expect(painted.width == layout.width && painted.height == layout.height)
        guard case let .panel(veil) = try #require(layout.backdrop.last) else {
            Issue.record("le voile manque")
            return
        }
        #expect(abs(veil.color.alpha - 0.4) < 0.0001)
    }

    @Test func theVeilStaysWithinItsRange() {
        let media = MessageCardMedia(id: MessageCardBackdrop.mediaID, kind: .image)
        #expect(MessageCardBackdrop(media: media, veil: 2).veil == MessageCardBackdrop.veilRange.upperBound)
        #expect(MessageCardBackdrop(media: media, veil: -1).veil == MessageCardBackdrop.veilRange.lowerBound)
    }

    @Test func anUnboundedBackdropCoversTheViewportOnly() throws {
        let media = MessageCardMedia(id: MessageCardBackdrop.mediaID, kind: .video, aspect: 0.5625)
        var tall = Self.input(Self.long, backdrop: MessageCardBackdrop(media: media, veil: 0.5))
        tall.unbounded = true
        let layout = MessageCardLayout.make(tall, measure: Self.measure)
        guard case let .media(painted) = try #require(layout.backdrop.first) else {
            Issue.record("le fond choisi n'est pas peint")
            return
        }
        #expect(painted.height == 1920)
        #expect(layout.height > 1920)
    }

    @Test func aBackdropVideoMakesTheCardMove() {
        let media = MessageCardMedia(id: MessageCardBackdrop.mediaID, kind: .video, duration: 8)
        #expect(MessageCardOutput.offered(for: [], backdrop: media.kind, scrolls: false) == [.image, .gif, .video])
        #expect(MessageCardOutput.offered(for: [], backdrop: .image, scrolls: false) == [.image])
    }

    @Test func aLongTextOffersTheVideo() {
        #expect(MessageCardOutput.offered(for: [], backdrop: nil, scrolls: true) == [.image, .video])
        #expect(MessageCardOutput.offered(for: [.audio], backdrop: nil, scrolls: true) == [.image, .video])
    }
}

extension MessageCardScrollTests {
    @Test func aFramePaintsOnlyWhatItsWindowShows() {
        var tall = Self.input(Self.long)
        tall.unbounded = true
        let layout = MessageCardLayout.make(tall, measure: Self.measure)
        let window = layout.ops(between: 0, and: 1920)
        let later = layout.ops(between: layout.height - 1920, and: layout.height)
        #expect(window.count < layout.ops.count)
        #expect(later.count < layout.ops.count)
        #expect(!later.isEmpty)
    }
}

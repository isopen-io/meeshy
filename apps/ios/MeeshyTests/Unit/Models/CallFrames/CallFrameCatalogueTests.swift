import MeeshySDK
import XCTest
@testable import Meeshy

/// LE CATALOGUE DES CADRES (#8741, spec § 2 et § 6) — cent cadres au moins, identifiants
/// stables, chaque ambiance servant chaque nombre de 2 à 6, et la règle de filtrage du web
/// (`frame-filter.ts`, témoins « la règle de filtrage » de `frame-catalogue.test.ts`).
final class CallFrameCatalogueTests: XCTestCase {
    private let productPeople = Array(2 ... 6)

    // MARK: - Le catalogue généré

    func test_all_holdsAtLeastAHundredFrames() {
        XCTAssertGreaterThanOrEqual(CallFrameCatalogue.all.count, 100)
    }

    func test_all_identifiersAreUniqueAndStable() {
        let ids = CallFrameCatalogue.all.map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count)
        let pattern = try? NSRegularExpression(pattern: "^[a-z-]+\\.[a-z0-9-]+\\.(duo|comite|groupe|tablee)$")
        let malformed = ids.filter { id in
            pattern?.firstMatch(in: id, range: NSRange(id.startIndex..., in: id)) == nil
        }
        XCTAssertEqual(malformed, [])
        CallFrameCatalogue.all.forEach { frame in
            XCTAssertEqual(frame.id, "\(frame.motif).\(frame.bucket.rawValue)")
            XCTAssertTrue(frame.motif.hasPrefix("\(frame.mood.rawValue)."), frame.id)
        }
    }

    func test_all_isOrderedByMood() {
        let ranks = CallFrameCatalogue.all.map { frame in CallFrameMood.allCases.firstIndex(of: frame.mood) ?? -1 }
        XCTAssertEqual(ranks, ranks.sorted())
    }

    func test_everyMood_holdsThreeMotifsAndServesEveryCountFromTwoToSix() {
        let frames = CallFrameCatalogue.all
        let gaps = CallFrameMood.allCases.flatMap { mood -> [String] in
            let motifs = Set(frames.filter { $0.mood == mood }.map(\.motif))
            let missing = productPeople
                .filter { CallFrameCatalogue.frames(forPeople: $0, mood: mood).isEmpty }
                .map { "\(mood.rawValue)@\($0)" }
            return motifs.count < 3 ? ["\(mood.rawValue): \(motifs.count) motif(s)"] + missing : missing
        }
        XCTAssertEqual(gaps, [])
    }

    func test_splitAndDiagonal_serveOnlyTheDuo() {
        let misplaced = CallFrameCatalogue.all.filter { $0.look.layout.arrangement.isDuoOnly && $0.bucket != .duo }.map(\.id)
        XCTAssertEqual(misplaced, [])
    }

    func test_groupTitle_livesOnlyInGroupVariants() {
        let duoWithGroupTitle = CallFrameCatalogue.all.filter { $0.bucket == .duo && $0.look.title.source == .group }.map(\.id)
        XCTAssertEqual(duoWithGroupTitle, [])
    }

    func test_everyFrame_isSignedAndUsesEveryMark() {
        let marks = Set(CallFrameCatalogue.all.map(\.look.brand.mark.rawValue))
        XCTAssertEqual(marks.sorted(), ["both", "logo", "wordmark"])
        let handles = CallFrameCatalogue.all.filter { $0.look.names.show == .handle || $0.look.names.show == .both }
        XCTAssertGreaterThanOrEqual(handles.count, 15)
    }

    func test_everyColor_isAValidHex() {
        let invalid = CallFrameCatalogue.all.flatMap { frame in colors(of: frame.look).filter { CallFrameColor.parse($0) == nil }.map { "\(frame.id): \($0)" } }
        XCTAssertEqual(invalid, [])
    }

    func test_contentZone_staysHabitable() {
        let cramped = CallFrameCatalogue.all.filter { $0.look.layout.top + $0.look.layout.bottom > 0.5 || $0.look.layout.margin > 0.2 }.map(\.id)
        XCTAssertEqual(cramped, [])
    }

    // MARK: - La règle de filtrage (miroir de `frame-catalogue.test.ts`)

    func test_bucket_ofAPeopleCount() {
        XCTAssertEqual(
            [1, 2, 3, 4, 5, 6, 7, 12, 13].map { CallFrameCatalogue.bucket(for: $0)?.rawValue },
            [nil, "duo", "comite", "comite", "groupe", "groupe", "tablee", "tablee", nil]
        )
    }

    func test_frames_atFour_offersNeitherDuoNorGroup_atFive_noDuo() {
        let frames = Self.sampleFrames()
        XCTAssertEqual(CallFrameCatalogue.frames(forPeople: 4, in: frames).map(\.id), ["elegant.other.comite", "jovial.fete.comite"])
        XCTAssertTrue(CallFrameCatalogue.frames(forPeople: 5, in: frames).allSatisfy { $0.bucket == .groupe })
    }

    func test_moods_areThoseThatServeTheCount() {
        let frames = Self.sampleFrames()
        XCTAssertEqual(CallFrameCatalogue.moods(forPeople: 2, in: frames), [.elegant])
        XCTAssertEqual(CallFrameCatalogue.moods(forPeople: 3, in: frames), [.elegant, .jovial])
    }

    func test_reconcile_keepsTheMotifInItsNewVariant_elseTheMood_elseNil() {
        let frames = Self.sampleFrames()
        XCTAssertEqual(CallFrameCatalogue.reconcile(selectedId: "elegant.test.duo", people: 5, in: frames)?.id, "elegant.test.groupe")
        XCTAssertEqual(CallFrameCatalogue.reconcile(selectedId: "elegant.test.duo", people: 3, in: frames)?.id, "elegant.other.comite")
        XCTAssertNil(CallFrameCatalogue.reconcile(selectedId: "jovial.fete.comite", people: 2, in: frames))
        XCTAssertEqual(CallFrameCatalogue.reconcile(selectedId: "elegant.test.groupe", people: 6, in: frames)?.id, "elegant.test.groupe")
    }

    func test_people_isTheBucketRange() {
        let frame = Self.frame(motif: "elegant.test", mood: .elegant, bucket: .groupe)
        XCTAssertEqual(frame.people, 5 ... 6)
        XCTAssertTrue(frame.serves(people: 6))
        XCTAssertFalse(frame.serves(people: 4))
    }

    func test_parse_readsShortLongAndAlphaHex() {
        XCTAssertEqual(CallFrameColor.parse("#FFF"), CallFrameColor(red: 1, green: 1, blue: 1, alpha: 1))
        XCTAssertEqual(CallFrameColor.parse("#000000")?.alpha, 1)
        XCTAssertEqual(CallFrameColor.parse("#FF000080")?.alpha ?? 0, 128.0 / 255, accuracy: 0.0001)
        XCTAssertNil(CallFrameColor.parse("FFFFFF"))
        XCTAssertNil(CallFrameColor.parse("#GGG"))
        XCTAssertNil(CallFrameColor.parse("#FFFF"))
    }

    // MARK: - Fabriques

    private func colors(of look: CallFrameLook) -> [String] {
        let background: [String]
        switch look.background {
        case let .solid(color): background = [color]
        case let .linear(colors, _): background = colors
        case let .radial(colors): background = colors
        case .accent: background = []
        }
        let slot = [look.slot.stroke?.color, look.slot.glow, look.slot.card?.color, look.slot.duotone?.shadow, look.slot.duotone?.light].compactMap { $0 }
        let decor = [look.pattern?.color, look.border?.color].compactMap { $0 } + look.ornaments.map(\.color)
        let texts = [look.brand.color, look.names.color, look.names.fill, look.title.color, look.subtitle?.color].compactMap { $0 }
        return background + slot + decor + texts
    }

    static func makeLook(arrangement: CallFrameArrangement = .grid) -> CallFrameLook {
        CallFrameLook(
            layout: CallFrameLayout(arrangement: arrangement, margin: 0.05, gap: 0.02, top: 0.1, bottom: 0.1),
            slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
            background: .solid(color: "#000000"),
            pattern: nil,
            border: nil,
            ornaments: [],
            brand: CallFrameBrand(mark: .logo, place: .bottom, color: "#ffffff", size: .m, font: nil),
            names: CallFrameNames(show: .none, style: .caption, font: .elegant, color: "#ffffff", fill: nil),
            title: CallFrameTitle(source: .none, font: .elegant, color: "#ffffff", place: .top, size: .m, effect: nil, letterCase: nil),
            subtitle: nil
        )
    }

    static func frame(motif: String, mood: CallFrameMood, bucket: CallFrameBucket, look: CallFrameLook = makeLook()) -> CallFrameDesign {
        CallFrameDesign(id: "\(motif).\(bucket.rawValue)", motif: motif, mood: mood, name: "Test", bucket: bucket, look: look)
    }

    /// Les trois motifs du témoin web : `elegant.test` (duo en `split` + groupe), `elegant.other` (comité), `jovial.fete` (comité + groupe).
    static func sampleFrames() -> [CallFrameDesign] {
        [
            frame(motif: "elegant.test", mood: .elegant, bucket: .duo, look: makeLook(arrangement: .split)),
            frame(motif: "elegant.test", mood: .elegant, bucket: .groupe),
            frame(motif: "elegant.other", mood: .elegant, bucket: .comite),
            frame(motif: "jovial.fete", mood: .jovial, bucket: .comite),
            frame(motif: "jovial.fete", mood: .jovial, bucket: .groupe),
        ]
    }
}

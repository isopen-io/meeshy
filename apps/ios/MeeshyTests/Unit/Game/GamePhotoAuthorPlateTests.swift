import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// LA PLAQUE D'AUTEUR (#10816) — miroir de `apps/web/src/lib/game-photo/author-plate.test.ts` : la même table
/// (rareté → fini et métal, rang → métal du blason, mission grattée), le même pseudo, la même place dans l'image.
@MainActor
final class GamePhotoAuthorPlateTests: XCTestCase {

    private let atabeth = PhotoAuthor(handle: "atabeth", avatar: "https://cdn.example/a.jpg")

    // MARK: - La loi : quel fini, quel métal

    func test_style_anAchievement_takesTheFinishAndMetalOfItsVisibleRarity() {
        let expected: [(GameGlory.AchievementRarity, PlateFinish, PlateMetal)] = [
            (.common, .engrave, .bronze), (.rare, .engrave, .silver), (.epic, .emboss, .platinum),
            (.legendary, .emboss, .gold), (.mythic, .emboss, .prism),
        ]
        for (rarity, finish, metal) in expected {
            XCTAssertEqual(GamePhotoAuthorPlate.style(of: .achievement(rarity: rarity)),
                           PlateStyle(family: .achievement, finish: finish, metal: metal), "\(rarity)")
        }
    }

    func test_style_anAchievementWithoutServedRarity_isTheNeutralIndigoEngraving() {
        XCTAssertEqual(GamePhotoAuthorPlate.style(of: .achievement(rarity: nil)),
                       PlateStyle(family: .achievement, finish: .engrave, metal: .indigo))
    }

    func test_style_aRank_embossesInTheMetalOfItsBlason_forEveryRank() {
        for rank in GloryRank.allCases {
            let style = GamePhotoAuthorPlate.style(of: .rank(rank, nil))
            XCTAssertEqual(style?.family, .rank)
            XCTAssertEqual(style?.finish, .emboss)
            XCTAssertEqual(style?.metal.rawValue, rank.material.rawValue, "la plaque d'un rang a le métal de son écu (\(rank))")
        }
    }

    func test_style_aMission_isScratchedObsidian() {
        XCTAssertEqual(GamePhotoAuthorPlate.style(of: .mission(templateKey: "send_messages", target: 5)),
                       PlateStyle(family: .mission, finish: .scratch, metal: .obsidian))
    }

    func test_style_anyOtherMoment_hasNoPlate() {
        let others: [PhotoEmblem] = [
            .start, .tier(.lueur, level: 20), .levelHundred(prestige: 0), .meesh(number: 1, edition: .silver),
            .treasury(TreasuryTierKey.allCases[0]), .flame(.braise, days: 7), .trophy(key: "x"), .season(3), .prestige(number: 1),
        ]
        for emblem in others { XCTAssertNil(GamePhotoAuthorPlate.style(of: emblem), "\(emblem)") }
    }

    // MARK: - Le pseudo

    func test_engravedHandle_trimsNormalizesAndPrefixesOneAt() {
        XCTAssertEqual(GamePhotoAuthorPlate.engravedHandle("  @@atabeth "), "@atabeth")
        XCTAssertEqual(GamePhotoAuthorPlate.engravedHandle("jose\u{301}"), "@jos\u{E9}", "NFC : la lettre et son accent font une lettre")
    }

    func test_engravedHandle_cutsAtSixteenGraphemes_ellipsisIncluded() {
        let long = "abcdefghijklmnopqrstuvwxyz"
        let engraved = GamePhotoAuthorPlate.engravedHandle(long)
        XCTAssertEqual(engraved, "@abcdefghijklmno…")
        XCTAssertEqual(engraved.dropFirst().count, 16)
        XCTAssertEqual(GamePhotoAuthorPlate.engravedHandle("abcdefghijklmnop"), "@abcdefghijklmnop", "16 graphèmes tiennent")
        XCTAssertEqual(GamePhotoAuthorPlate.engravedHandle(String(repeating: "👩‍👩‍👧", count: 20)).dropFirst().count, 16,
                       "un emoji composé est UN graphème")
    }

    func test_monogram_isTheFirstTwoLettersOrDigits_inCapitals() {
        XCTAssertEqual(GamePhotoAuthorPlate.monogram("atabeth"), "AT")
        XCTAssertEqual(GamePhotoAuthorPlate.monogram("@_x9z"), "X9")
        XCTAssertEqual(GamePhotoAuthorPlate.monogram("élise"), "ÉL")
    }

    // MARK: - La plaque

    func test_plate_readsTheFamilyCaption_andSaysItselfInOneSentence() throws {
        let plate = try XCTUnwrap(GamePhotoAuthorPlate.plate(for: .achievement(rarity: .epic), author: atabeth))
        XCTAssertEqual(plate.name, "@atabeth")
        XCTAssertEqual(plate.monogram, "AT")
        XCTAssertEqual(plate.avatar, "https://cdn.example/a.jpg")
        XCTAssertFalse(plate.caption.isEmpty)
        XCTAssertTrue(plate.label.contains("@atabeth"), "VoiceOver lit le pseudo : \(plate.label)")
    }

    func test_plate_aGuestOrABlankHandleOrAMomentWithoutPlate_hasNone() {
        XCTAssertNil(GamePhotoAuthorPlate.plate(for: .achievement(rarity: nil), author: nil))
        XCTAssertNil(GamePhotoAuthorPlate.plate(for: .achievement(rarity: nil), author: PhotoAuthor(handle: " @ ", avatar: nil)))
        XCTAssertNil(GamePhotoAuthorPlate.plate(for: .start, author: atabeth))
    }

    func test_author_anAnonymousAccount_hasNoPublicHandle() {
        XCTAssertNil(GamePhotoAuthorPlate.author(username: "guest_42", isAnonymous: true, avatar: nil))
        XCTAssertNil(GamePhotoAuthorPlate.author(username: nil, isAnonymous: false, avatar: nil))
        XCTAssertEqual(GamePhotoAuthorPlate.author(username: "atabeth", isAnonymous: false, avatar: " "),
                       PhotoAuthor(handle: "atabeth", avatar: nil))
    }

    // MARK: - Les moments

    func test_missionMoment_isIdentifiedByTheMission_andLandsOnTheMissionsSheet() {
        let moment = GamePhotoMoments.mission(id: "m42", templateKey: "send_messages", target: 5)
        XCTAssertEqual(moment.id, "mission:m42")
        XCTAssertEqual(moment.emblem, .mission(templateKey: "send_messages", target: 5))
        XCTAssertFalse(moment.title.isEmpty)
        XCTAssertEqual(ProgressionConceptModel.concept(for: moment.emblem), .missions)
    }

    func test_achievementMoment_carriesTheVisibleRarity() {
        XCTAssertEqual(GamePhotoMoments.achievement(id: "a", title: "A", rarity: .legendary).emblem, .achievement(rarity: .legendary))
        XCTAssertEqual(GamePhotoMoments.achievement(id: "a", title: "A").emblem, .achievement(rarity: nil))
    }

    func test_aNotebookEntryWrittenBeforeThePlate_stillReadsAsANeutralAchievement() throws {
        let old = Data(#"{"achievement":{}}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(PhotoEmblem.self, from: old), .achievement(rarity: nil))
        for emblem: PhotoEmblem in [.achievement(rarity: .mythic), .mission(templateKey: "t", target: 3)] {
            XCTAssertEqual(try JSONDecoder().decode(PhotoEmblem.self, from: JSONEncoder().encode(emblem)), emblem)
        }
    }

    // MARK: - La place dans l'image

    func test_layout_story_putsThePlateUnderTheDate_atSeventyPercentWidth() {
        let l = GamePhotoLayout.layout(.story)
        XCTAssertEqual(l.author.width, 1080 * 0.7, accuracy: 0.01)
        XCTAssertEqual(l.author.width / l.author.height, 3.6, accuracy: 0.001)
        XCTAssertEqual(l.author.midX, 540, accuracy: 0.01)
        XCTAssertEqual(l.author.minY, 1920 * 0.5 + 1080 * 0.05, accuracy: 0.01)
        XCTAssertLessThan(l.author.maxY, l.mee.minY, "la plaque ne touche pas les oiseaux")
    }

    func test_layout_square_holdsThePlateBetweenTheBirds_withAndWithoutBanner() {
        for referral in [false, true] {
            let l = GamePhotoLayout.layout(.square, referral: referral)
            XCTAssertEqual(l.author.width, 1080 * 0.44, accuracy: 0.01)
            XCTAssertGreaterThan(l.author.minX, l.mee.maxX)
            XCTAssertLessThan(l.author.maxX, l.meo.minX)
            XCTAssertGreaterThan(l.author.minY, l.date.y, "sous la date")
            if referral {
                XCTAssertEqual(l.author.midY, l.mee.midY, accuracy: 0.01, "dans la rangée des oiseaux")
            } else {
                XCTAssertLessThanOrEqual(l.author.maxY, l.signature.minY, "au-dessus de la Signature")
            }
        }
    }

    // MARK: - L'animation

    func test_motion_isTheWebDocument_360x100_60fps_72frames_andLottieReadsIt() throws {
        let expectedLayers: [PlateFinish: Int] = [.engrave: 2, .emboss: 5, .scratch: 7]
        for finish in PlateFinish.allCases {
            let document = GamePhotoAuthorPlateMotion.document(finish)
            XCTAssertEqual(document["w"] as? Int, 360)
            XCTAssertEqual(document["h"] as? Int, 100)
            XCTAssertEqual(document["fr"] as? Int, 60)
            XCTAssertEqual(document["op"] as? Int, 72)
            XCTAssertEqual((document["layers"] as? [Any])?.count, expectedLayers[finish])
            let film = try XCTUnwrap(LottieLayerSource.film(data: GamePhotoAuthorPlateMotion.data(finish)), "\(finish)")
            XCTAssertEqual(film.duration, 1.2, accuracy: 0.001)
        }
    }

    // MARK: - La session et l'image

    func test_session_composesTheImageWithItsAuthor() async {
        let composer = MockGamePhotoComposer()
        let sut = GamePhotoSession(
            moment: GamePhotoMoments.achievement(id: "first", title: "Premier"), camera: MockGamePhotoCamera(), composer: composer,
            notebook: MockGamePhotoNotebook(), library: MockGamePhotoLibrary(), haptics: MockGameHaptics(),
            strikeDuration: 0, referralLinks: MockReferralLink(link: nil, createdLink: nil), author: atabeth
        )
        await sut.chooseCard()
        XCTAssertEqual(composer.authors.first ?? nil, atabeth)
    }

    func test_render_theExportedStory_engravesThePlate_whereTheLayoutPutsIt() throws {
        let moment = GamePhotoMoments.achievement(id: "first", title: "Premier message", rarity: .legendary)
        let bare = try XCTUnwrap(render(moment, author: nil))
        let signed = try XCTUnwrap(render(moment, author: atabeth))
        let rect = GamePhotoLayout.layout(.story, rightToLeft: false).author
        XCTAssertGreaterThan(differingPixels(bare, signed, in: rect), 2_000, "la plaque est peinte dans sa place")
        XCTAssertEqual(differingPixels(bare, signed, in: CGRect(x: 0, y: 0, width: 1080, height: 600)), 0, "et nulle part ailleurs")
        save(signed, "author-plate-story-legendary")
        for finish in [GamePhotoMoments.rank(.passeur, division: .ii), GamePhotoMoments.mission(id: "m", templateKey: "send_messages", target: 5)] {
            save(try XCTUnwrap(render(finish, author: atabeth)), "author-plate-story-\(finish.id.replacingOccurrences(of: ":", with: "-"))")
        }
    }

    func test_render_thePosedCard_isBoundedAndNamesTheAuthor() throws {
        let moment = GamePhotoMoments.achievement(id: "first", title: "Premier message", rarity: .rare)
        let plate = try XCTUnwrap(GamePhotoAuthorPlate.plate(for: moment.emblem, author: PhotoAuthor(handle: "atabeth", avatar: nil)))
        // Sous « Réduire les animations », la couche Lottie ne monte pas : `ImageRenderer` ne rend pas une vue UIKit.
        let renderer = ImageRenderer(content: GameAuthorCardView(moment: moment, plate: plate, dateLabel: "16 oct. 2026")
            .padding(40).environment(\.meeshyForceReduceMotion, true))
        renderer.scale = 2
        let image = try XCTUnwrap(renderer.uiImage)
        XCTAssertLessThanOrEqual(image.size.width, GameAuthorCardView.maxWidth + 80 + 1, "la carte est bornée, jamais plein écran")
        save(image, "author-card-rare")
    }

    func test_render_theCelebrationOfAnAchievement_isAPosedCardWithItsAuthor() throws {
        let view = AchievementRevealView(
            reveal: .achievement(.firstContent), onContinue: {}, onVoirProgression: {}, onPhoto: { _ in },
            rarity: GameRarityEntry(rarity: .epic, holders: 40, population: 2_000),
            author: PhotoAuthor(handle: "atabeth", avatar: nil)
        )
        // Une vraie fenêtre : `ImageRenderer` ne rend pas un `ScrollView`.
        let host = UIHostingController(rootView: view.environment(\.meeshyForceReduceMotion, true))
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        window.backgroundColor = UIColor(red: 0.93, green: 0.94, blue: 1, alpha: 1)
        host.view.backgroundColor = .clear
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(1.5))
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        window.isHidden = true
        save(image, "reveal-card-epic")
    }

    // MARK: - Garde : la célébration n'est plus un plein écran

    func test_theCelebration_isAPosedCardThatNamesItsAuthor() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let view = try String(contentsOf: root.appendingPathComponent("Meeshy/Features/Main/Views/AchievementRevealView.swift"), encoding: .utf8)
        XCTAssertTrue(view.contains(".clearCoverBackground()"), "l'écran couvert reste visible sous la carte")
        XCTAssertTrue(view.contains(".frame(maxWidth: Self.cardWidth)"), "la carte est bornée")
        XCTAssertTrue(view.contains("GameAuthorPlateLive("), "la carte nomme son auteur")
        XCTAssertFalse(view.contains("MeeshyColors.backgroundPrimary(isDark: isDark).ignoresSafeArea()"), "plus de fond plein écran")
    }

    // MARK: - Outils

    private func render(_ moment: PhotoMoment, author: PhotoAuthor?) -> UIImage? {
        let renderer = ImageRenderer(content: GamePhotoCanvasView(
            moment: moment, dateLabel: "16 oct. 2026", format: .story, background: .card, rightToLeft: false, author: author
        ))
        renderer.scale = 1
        renderer.proposedSize = ProposedViewSize(width: 1080, height: 1920)
        return renderer.uiImage
    }

    private func differingPixels(_ a: UIImage, _ b: UIImage, in rect: CGRect) -> Int {
        guard let pa = pixels(a), let pb = pixels(b) else { return -1 }
        var count = 0
        let minX = max(0, Int(rect.minX)), maxX = min(1080, Int(rect.maxX))
        let minY = max(0, Int(rect.minY)), maxY = min(1920, Int(rect.maxY))
        for y in stride(from: minY, to: maxY, by: 2) {
            for x in stride(from: minX, to: maxX, by: 2) {
                let i = (y * 1080 + x) * 4
                if abs(Int(pa[i]) - Int(pb[i])) + abs(Int(pa[i + 1]) - Int(pb[i + 1])) + abs(Int(pa[i + 2]) - Int(pb[i + 2])) > 24 { count += 1 }
            }
        }
        return count
    }

    private func pixels(_ image: UIImage) -> [UInt8]? {
        guard let cg = image.cgImage else { return nil }
        var buffer = [UInt8](repeating: 0, count: 1080 * 1920 * 4)
        let drawn: Bool = buffer.withUnsafeMutableBytes { raw in
            guard let context = CGContext(data: raw.baseAddress, width: 1080, height: 1920, bitsPerComponent: 8, bytesPerRow: 1080 * 4,
                                          space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(cg, in: CGRect(x: 0, y: 0, width: 1080, height: 1920))
            return true
        }
        return drawn ? buffer : nil
    }

    /// La recette : `TEST_RUNNER_MEESHY_RENDER_DIR=<dossier>` dépose les rendus pour les regarder ; sans lui, rien n'est écrit.
    private func save(_ image: UIImage, _ name: String) {
        guard let directory = ProcessInfo.processInfo.environment["MEESHY_RENDER_DIR"],
              FileManager.default.fileExists(atPath: directory), let data = image.pngData() else { return }
        try? data.write(to: URL(fileURLWithPath: directory).appendingPathComponent("\(name).png"))
    }
}

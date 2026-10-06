import XCTest
import CoreImage
import UIKit
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// Le lien de parrainage de la carte partagée (#7742) : la règle de choix du jeton (miroir de
/// `loadShareableReferralLink` du web), la carte qui le porte en carré QR (#9554), et le service cache-first.
@MainActor
final class GameReferralCardTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_790_000_000)

    private func token(
        _ code: String = "AMANI7", link: String? = "https://meeshy.me/signup/affiliate/AMANI7",
        maxUses: Int? = nil, uses: Int = 0, active: Bool = true, expiresAt: String? = nil
    ) -> AffiliateToken {
        AffiliateToken(
            id: "id-\(code)", token: code, name: "Invitation Meeshy", affiliateLink: link,
            maxUses: maxUses, currentUses: uses, isActive: active, expiresAt: expiresAt,
            createdAt: "2026-10-01T00:00:00.000Z", _count: nil, clickCount: 0
        )
    }

    // MARK: - La carte

    func test_qrLink_isTheWholeLink_schemeIncluded() {
        XCTAssertEqual(ReferralCard(link: "https://meeshy.me/signup/affiliate/AMANI7", flame: nil).qrLink,
                       "https://meeshy.me/signup/affiliate/AMANI7")
        XCTAssertNil(ReferralCard(link: "", flame: nil).qrLink, "pas de lien, pas de carré")
    }

    func test_thePlaceholder_isNamedAsSuch_andEncodesNoLink() {
        let placeholder = ReferralCard.placeholder(flame: nil)
        XCTAssertTrue(placeholder.isPlaceholder)
        XCTAssertNil(placeholder.qrLink, "jamais le QR d'un lien qui n'existe pas")
        XCTAssertEqual(placeholder.link, "", "rien qui ressemble à un lien ne voyage avec l'emplacement")
        XCTAssertFalse(ReferralCard(link: "https://meeshy.me/signup/affiliate/AMANI7", flame: nil).isPlaceholder)
        XCTAssertTrue(placeholder.withFlame(.init(form: .braise, days: 3)).isPlaceholder, "la Flamme ne change pas la nature du lien")
    }

    func test_aFlameThatIsOutOrWithoutStreak_isNotShown() {
        func flame(days: Int, status: FlameStatus, form: FlameFormKey? = .braise) -> GameBlock.Flame {
            GameBlock.Flame(days: days, form: form, bonusPercent: 0, freezes: 0, maxFreezes: 2,
                            freezePrice: 50, relightPrice: 100, status: status, canRelight: false)
        }
        XCTAssertNotNil(ReferralCard.Flame(game: flame(days: 23, status: .lit)))
        XCTAssertNil(ReferralCard.Flame(game: flame(days: 0, status: .lit)))
        XCTAssertNil(ReferralCard.Flame(game: flame(days: 23, status: .out)))
        XCTAssertNil(ReferralCard.Flame(game: flame(days: 23, status: .lit, form: nil)))
    }

    // MARK: - L'image exportée porte le carré QR (#9554)

    private static let link = "https://meeshy.me/signup/affiliate/AMANI7"

    private func rgba(_ image: UIImage) throws -> (width: Int, height: Int, bytes: [UInt8]) {
        let cgImage = try XCTUnwrap(image.cgImage)
        let width = cgImage.width
        let height = cgImage.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = bytes.withUnsafeMutableBytes { raw -> Bool in
            guard let context = CGContext(
                data: raw.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        XCTAssertTrue(drawn)
        return (width, height, bytes)
    }

    /// Les modules relus au CENTRE de chacun, dans la place du carré : `true` = sombre.
    private func paintedModules(_ image: UIImage, slot: CGRect, square: GameReferralQRSquare) throws -> [[Bool]] {
        let pixels = try rgba(image)
        return (0..<square.size).map { y in
            (0..<square.size).map { x in
                let px = Int(slot.minX) + square.origin + x * square.module + square.module / 2
                let py = Int(slot.minY) + square.origin + y * square.module + square.module / 2
                return pixels.bytes[(py * pixels.width + px) * 4] < 128
            }
        }
    }

    private func compose(_ referral: ReferralCard?) throws -> ComposedPhoto {
        try XCTUnwrap(GamePhotoComposer().compose(
            moment: GamePhotoMoments.rank(.voix, division: .ii), source: nil, mode: .card, date: now, referral: referral
        ))
    }

    func test_compose_withALink_paintsTheMatrixOfTheWholeLink_inBothFormats() throws {
        let composed = try compose(ReferralCard(link: Self.link, flame: .init(form: .braise, days: 23)))
        let matrix = try XCTUnwrap(GameQRCode.encode(Self.link))
        for (format, image) in [(PhotoFormat.story, composed.story), (PhotoFormat.square, composed.square)] {
            let slot = try XCTUnwrap(GamePhotoLayout.layout(format, referral: true).qr)
            let square = try XCTUnwrap(GameReferralQRSquare.make(link: Self.link, side: Int(slot.width)))
            XCTAssertGreaterThanOrEqual(square.module, 2, "\(format)")
            XCTAssertEqual(try paintedModules(image, slot: slot, square: square), matrix.modules, "\(format) : le carré peint n'est pas celui du lien")
        }
    }

    func test_compose_theJPEGThatLeavesTheApp_stillCarriesTheMatrix() throws {
        let composed = try compose(ReferralCard(link: Self.link, flame: nil))
        let matrix = try XCTUnwrap(GameQRCode.encode(Self.link))
        for (format, data) in [(PhotoFormat.story, composed.storyData), (PhotoFormat.square, composed.squareData)] {
            let image = try XCTUnwrap(UIImage(data: data))
            let slot = try XCTUnwrap(GamePhotoLayout.layout(format, referral: true).qr)
            let square = try XCTUnwrap(GameReferralQRSquare.make(link: Self.link, side: Int(slot.width)))
            XCTAssertEqual(try paintedModules(image, slot: slot, square: square), matrix.modules, "\(format)")
        }
    }

    func test_compose_theExportedStory_isReadByAnIndependentDecoder_asTheLink() throws {
        let composed = try compose(ReferralCard(link: Self.link, flame: .init(form: .braise, days: 23)))
        let image = try XCTUnwrap(CIImage(data: composed.storyData))
        let detector = try XCTUnwrap(CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]))
        let messages = detector.features(in: image).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
        XCTAssertEqual(messages, [Self.link])
    }

    func test_compose_withThePlaceholder_paintsNoLightSquare_andNoModule() throws {
        let composed = try compose(.placeholder(flame: nil))
        let slot = try XCTUnwrap(GamePhotoLayout.layout(.story, referral: true).qr)
        let pixels = try rgba(composed.story)
        let inside = slot.insetBy(dx: 12, dy: 12)
        var light = 0
        var colors = Set<[UInt8]>()
        for y in Int(slot.minY)..<Int(slot.maxY) {
            for x in Int(slot.minX)..<Int(slot.maxX) {
                let index = (y * pixels.width + x) * 4
                let pixel = Array(pixels.bytes[index..<(index + 3)])
                if pixel.allSatisfy({ $0 > 245 }) { light += 1 }
                if inside.contains(CGPoint(x: x, y: y)) { colors.insert(pixel) }
            }
        }
        XCTAssertEqual(light, 0, "aucun fond clair sans lien")
        let blues = colors.map { Int($0[2]) }
        XCTAssertLessThanOrEqual((blues.max() ?? 0) - (blues.min() ?? 0), 24,
                                 "l'emplacement est VIDE : ni module, ni texte, seulement le fond du bandeau")
    }

    // MARK: - La règle

    func test_theFirstUsableTokenWins() {
        let tokens = [token("OLD", link: "https://meeshy.me/signup/affiliate/OLD", active: false), token()]
        XCTAssertEqual(ReferralLinkRule.link(in: tokens, now: now), "https://meeshy.me/signup/affiliate/AMANI7")
    }

    func test_anExpiredToken_isNeverShared_andAnUnreadableDateIsNotAnOpenEnd() {
        XCTAssertFalse(ReferralLinkRule.isUsable(token(expiresAt: "2026-01-01T00:00:00.000Z"), now: now))
        XCTAssertFalse(ReferralLinkRule.isUsable(token(expiresAt: "pas une date"), now: now))
        XCTAssertTrue(ReferralLinkRule.isUsable(token(expiresAt: "2099-01-01T00:00:00.000Z"), now: now))
    }

    func test_anExhaustedToken_isNeverShared_andZeroMeansUnlimited() {
        XCTAssertFalse(ReferralLinkRule.isUsable(token(maxUses: 5, uses: 5), now: now))
        XCTAssertTrue(ReferralLinkRule.isUsable(token(maxUses: 5, uses: 4), now: now))
        XCTAssertTrue(ReferralLinkRule.isUsable(token(maxUses: 0, uses: 99), now: now))
        XCTAssertTrue(ReferralLinkRule.isUsable(token(maxUses: nil, uses: 99), now: now))
    }

    func test_aTokenWithoutALink_isNeverShared() {
        XCTAssertFalse(ReferralLinkRule.isUsable(token(link: nil), now: now))
        XCTAssertFalse(ReferralLinkRule.isUsable(token(link: ""), now: now))
    }

    // MARK: - Le service : cache d'abord, réseau ensuite, création en dernier

    private func makeService(_ gateway: MockReferralTokenGateway) -> ReferralLinkService {
        ReferralLinkService(gateway: gateway, now: { self.now })
    }

    func test_aUsableCachedToken_answersWithoutTheNetwork() async {
        let gateway = MockReferralTokenGateway()
        gateway.cached = [token()]
        let link = await makeService(gateway).shareableLink()
        XCTAssertEqual(link, "https://meeshy.me/signup/affiliate/AMANI7")
        XCTAssertEqual(gateway.listCalls, 0)
    }

    func test_withNothingCached_theListIsReadAndStored() async {
        let gateway = MockReferralTokenGateway()
        gateway.listed = .success([token()])
        let link = await makeService(gateway).shareableLink()
        XCTAssertEqual(link, "https://meeshy.me/signup/affiliate/AMANI7")
        XCTAssertEqual(gateway.stored.count, 1)
        XCTAssertTrue(gateway.createdNames.isEmpty)
    }

    func test_withNoUsableToken_theFirstShareCreatesOne() async {
        let gateway = MockReferralTokenGateway()
        gateway.listed = .success([])
        gateway.created = .success(token("NEW", link: "https://meeshy.me/signup/affiliate/NEW"))
        let link = await makeService(gateway).shareableLink()
        XCTAssertEqual(link, "https://meeshy.me/signup/affiliate/NEW")
        XCTAssertEqual(gateway.createdNames, [ReferralLinkRule.tokenName])
    }

    // MARK: - Lire n'est pas créer (#7742)

    func test_existingLink_withNoUsableToken_createsNothing() async {
        let gateway = MockReferralTokenGateway()
        gateway.listed = .success([])
        gateway.created = .success(token("NEW", link: "https://meeshy.me/signup/affiliate/NEW"))
        let link = await makeService(gateway).existingLink()
        XCTAssertNil(link)
        XCTAssertEqual(gateway.listCalls, 1)
        XCTAssertTrue(gateway.createdNames.isEmpty, "ouvrir le déroulé ne crée aucun jeton")
    }

    func test_existingLink_answersFromTheCacheOrTheList() async {
        let cachedGateway = MockReferralTokenGateway()
        cachedGateway.cached = [token()]
        let cached = await makeService(cachedGateway).existingLink()
        XCTAssertEqual(cached, "https://meeshy.me/signup/affiliate/AMANI7")
        XCTAssertEqual(cachedGateway.listCalls, 0)

        let listedGateway = MockReferralTokenGateway()
        listedGateway.listed = .success([token("LISTED", link: "https://meeshy.me/signup/affiliate/LISTED")])
        let listed = await makeService(listedGateway).existingLink()
        XCTAssertEqual(listed, "https://meeshy.me/signup/affiliate/LISTED")
        XCTAssertTrue(listedGateway.createdNames.isEmpty)
    }

    func test_existingLink_afterAFailedRead_givesNoLink_andCreatesNothing() async {
        let gateway = MockReferralTokenGateway()
        gateway.listed = .failure(MockReferralError.refused)
        gateway.created = .success(token("NEW"))
        let link = await makeService(gateway).existingLink()
        XCTAssertNil(link)
        XCTAssertTrue(gateway.createdNames.isEmpty)
    }

    func test_aFailedRead_createsNothingAtRandom_andGivesNoLink() async {
        let gateway = MockReferralTokenGateway()
        gateway.listed = .failure(MockReferralError.refused)
        let link = await makeService(gateway).shareableLink()
        XCTAssertNil(link)
        XCTAssertTrue(gateway.createdNames.isEmpty)
    }

    func test_aRefusedCreation_givesNoLink() async {
        let gateway = MockReferralTokenGateway()
        gateway.listed = .success([])
        let link = await makeService(gateway).shareableLink()
        XCTAssertNil(link)
    }

    func test_aCreatedTokenTheServerCallsUnusable_isNotShared() async {
        let gateway = MockReferralTokenGateway()
        gateway.listed = .success([])
        gateway.created = .success(token("NEW", active: false))
        let link = await makeService(gateway).shareableLink()
        XCTAssertNil(link)
    }
}

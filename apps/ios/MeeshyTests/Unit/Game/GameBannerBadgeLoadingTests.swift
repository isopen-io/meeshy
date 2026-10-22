import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// #10093 — le niveau et le rang d'un membre se LISENT dès que la bannière de sa fiche s'affiche, cache vide compris.
///
/// Le badge était un `Group { if let model … }.task { charger }` : un `Group` n'est pas une vue, il distribue ses
/// modificateurs à ses enfants. Tant que rien n'est chargé il n'a AUCUN enfant, donc la tâche qui devait charger ne
/// démarre jamais — le badge attendait le modèle que seule son apparition pouvait lui donner. Sur un appareil neuf, il
/// ne se montrait sur aucune fiche, la sienne comprise. La bande de la carte de contact portait le même cercle.
@MainActor
final class GameBannerBadgeLoadingTests: XCTestCase {

    @MainActor
    private final class MemoryCache: GameWave2Caching {
        private var store: [String: Data] = [:]
        nonisolated deinit {}
        func load<T: Decodable & Sendable>(_ type: T.Type, name: String) async -> T? {
            store[name].flatMap { try? JSONDecoder().decode(T.self, from: $0) }
        }
        func save<T: Encodable & Sendable>(_ value: T, name: String) async { store[name] = try? JSONEncoder().encode(value) }
        func remove(name: String) async { store[name] = nil }
    }

    private var ecran: RenderedScreen?

    override func tearDown() async throws {
        ecran?.dismount()
        ecran = nil
        try await super.tearDown()
    }

    /// La réponse que le serveur de recette sert à un compte neuf (`GET /users/:id/game`, mesurée le 2026-10-11).
    private static func servedStanding() -> UserGameProfileResponse {
        UserGameProfileResponse(
            visible: true,
            standing: GameStanding(level: 1, tier: .etincelle, prestige: 0, flame: .braise, rank: .murmure,
                                   division: .iii, division5: .v, ladder: GameStandingLadder(level: 1, tier: .etincelle)),
            treasury: GameShownTreasury(tier: nil)
        )
    }

    private func integration() -> MockGameIntegrationService {
        let service = MockGameIntegrationService()
        service.userGameResult = .success(Self.servedStanding())
        return service
    }

    func test_bannerBadge_nothingCached_readsTheServedGameAndShowsTheLevelAndRank() {
        let service = integration()
        let userId = "badge-\(UUID().uuidString)"
        let loader = GameUserGameLoader(service: service, cache: MemoryCache(), currentUserId: "me")

        ecran = RenderedScreen(VStack {
            Text(verbatim: "fiche")
            GameBannerBadge(userId: userId, loader: loader)
        })

        XCTAssertNotNil(ecran?.frame(of: "profile.banner.game.level", borne: 5), "le badge ne s'est jamais posé sur la bannière")
        XCTAssertNotNil(ecran?.frame(of: "profile.banner.game.rank", borne: 5), "le rang ne s'est jamais posé sur la bannière")
        XCTAssertEqual(service.userGameIds, [userId])
    }

    func test_contactStrip_nothingCached_readsTheServedGameAndShowsIt() {
        let service = integration()
        let userId = "strip-\(UUID().uuidString)"
        let cache = MemoryCache()

        ecran = RenderedScreen(VStack {
            Text(verbatim: "carte")
            GameContactStrip(
                userId: userId,
                loader: GameShowcaseLoader(service: MockGameWave2Service(), cache: cache, currentUserId: "me"),
                standingLoader: GameUserGameLoader(service: service, cache: cache, currentUserId: "me")
            )
        })

        XCTAssertNotNil(ecran?.frame(of: "game.contact.strip", borne: 5), "la bande du jeu ne s'est jamais posée")
        XCTAssertEqual(service.userGameIds, [userId])
    }

    // MARK: - #10231 — le niveau et ses points au DÉBUT de la bannière, le rang à la FIN

    private func badge(points: Int?) -> GameBannerBadgeView {
        let served = GameStanding(level: 3, tier: .etincelle, prestige: 0, flame: nil, rank: .murmure, division: .iii,
                                  division5: .v, ladder: GameStandingLadder(level: 3, tier: .etincelle), points: points)
        return GameBannerBadgeView(model: GameBannerBadgeModel.of(GameStandingContent(standing: served, treasuryTier: nil), userId: "u1")!)
    }

    func test_badge_leftToRight_levelAtTheStart_rankAtTheEnd() throws {
        ecran = RenderedScreen(badge(points: 976).frame(width: 360), size: CGSize(width: 360, height: 200))

        let level = try XCTUnwrap(ecran?.frame(of: "profile.banner.game.level", borne: 5))
        let rank = try XCTUnwrap(ecran?.frame(of: "profile.banner.game.rank", borne: 5))
        XCTAssertLessThan(level.maxX, 180, "le niveau et ses points se posent à GAUCHE de la bannière")
        XCTAssertGreaterThan(rank.minX, 180, "le rang se pose à DROITE de la bannière")
    }

    func test_badge_rightToLeft_mirrorsTheTwoGroups() throws {
        ecran = RenderedScreen(
            badge(points: 976).frame(width: 360).environment(\.layoutDirection, .rightToLeft),
            size: CGSize(width: 360, height: 200)
        )

        let level = try XCTUnwrap(ecran?.frame(of: "profile.banner.game.level", borne: 5))
        let rank = try XCTUnwrap(ecran?.frame(of: "profile.banner.game.rank", borne: 5))
        XCTAssertGreaterThan(level.minX, 180)
        XCTAssertLessThan(rank.maxX, 180)
    }

    func test_badge_levelGroupSaysItsPoints() throws {
        ecran = RenderedScreen(badge(points: 976).frame(width: 360), size: CGSize(width: 360, height: 200))

        XCTAssertNotNil(ecran?.frame(of: "profile.banner.game.level", borne: 5))
        let label = try XCTUnwrap(ecran?.node("profile.banner.game.level")?.label)
        XCTAssertTrue(label.contains(GameCopy.points(976)), label)
    }

    // MARK: - #10601 — les deux cadres aux angles BAS, coins bas carrés posés sur le bord bas

    private static let banner = CGSize(width: 360, height: 130)

    /// La bannière d'essai, nommée pour que ses bords se lisent dans l'arbre rendu, posée au milieu d'un écran plus grand
    /// qu'elle : aucune marge de sûreté de la fenêtre ne la touche.
    private func onBanner(_ direction: LayoutDirection = .leftToRight) -> some View {
        Color.white
            .frame(width: Self.banner.width, height: Self.banner.height)
            .accessibilityElement()
            .accessibilityLabel(Text(verbatim: "bannière"))
            .accessibilityIdentifier("test.banner")
            .overlay { badge(points: 976) }
            .environment(\.layoutDirection, direction)
    }

    private func mount(_ direction: LayoutDirection = .leftToRight) throws -> (banner: CGRect, level: CGRect, rank: CGRect) {
        ecran = RenderedScreen(onBanner(direction), size: CGSize(width: Self.banner.width, height: 400))
        return (
            try XCTUnwrap(ecran?.frame(of: "test.banner", borne: 5)),
            try XCTUnwrap(ecran?.frame(of: "profile.banner.game.level", borne: 5)),
            try XCTUnwrap(ecran?.frame(of: "profile.banner.game.rank", borne: 5))
        )
    }

    func test_badge_leftToRight_levelAtTheBottomStartCorner_rankAtTheBottomEndCorner() throws {
        let (banner, level, rank) = try mount()

        XCTAssertEqual(level.minX, banner.minX, accuracy: 0.5, "le niveau s'ancre à l'angle bas GAUCHE")
        XCTAssertEqual(level.maxY, banner.maxY, accuracy: 0.5, "le cadre du niveau se pose sur le bord bas")
        XCTAssertEqual(rank.maxX, banner.maxX, accuracy: 0.5, "le rang s'ancre à l'angle bas DROIT")
        XCTAssertEqual(rank.maxY, banner.maxY, accuracy: 0.5, "le cadre du rang se pose sur le bord bas")
        let side = (banner.width - GameBannerBadgeView.avatarClearance) / 2
        XCTAssertLessThanOrEqual(level.maxX, banner.minX + side + 0.5, "le niveau s'arrête avant l'avatar posé au milieu du bas")
        XCTAssertGreaterThanOrEqual(rank.minX, banner.maxX - side - 0.5, "le rang s'arrête avant l'avatar")
    }

    func test_badge_rightToLeft_levelAtTheBottomRightCorner_rankAtTheBottomLeftCorner() throws {
        let (banner, level, rank) = try mount(.rightToLeft)

        XCTAssertEqual(level.maxX, banner.maxX, accuracy: 0.5)
        XCTAssertEqual(level.maxY, banner.maxY, accuracy: 0.5)
        XCTAssertEqual(rank.minX, banner.minX, accuracy: 0.5)
        XCTAssertEqual(rank.maxY, banner.maxY, accuracy: 0.5)
    }

    /// Le cadre se lit au PIXEL sur une bannière blanche : ses angles bas sont voilés jusqu'au coin (coins carrés) ; en
    /// haut, seul le coin tourné vers le MILIEU laisse passer le blanc (arrondi) — aucun arrondi au bord de DÉBUT des
    /// étincelles ni au bord de FIN du rang (décision porteur 2026-10-16) ; le voile reste léger.
    func test_badge_frames_squareBottomCorners_roundedTopCorners_lightVeil() throws {
        let (banner, levelOnScreen, rankOnScreen) = try mount()
        let level = levelOnScreen.offsetBy(dx: -banner.minX, dy: -banner.minY)
        let rank = rankOnScreen.offsetBy(dx: -banner.minX, dy: -banner.minY)

        let pixels = try XCTUnwrap(Self.render(onBanner()))
        let white = 255.0
        XCTAssertEqual(pixels.size.height, Self.banner.height * pixels.scale, accuracy: 1)
        XCTAssertLessThan(pixels.luma(level.minX + 0.5, Self.banner.height - 0.5), white - 20, "coin bas du DÉBUT carré : voilé jusqu'au bord")
        XCTAssertLessThan(pixels.luma(rank.maxX - 0.5, Self.banner.height - 0.5), white - 20, "coin bas de la FIN carré : voilé jusqu'au bord")
        XCTAssertLessThan(pixels.luma(level.minX + 0.5, level.minY + 0.5), white - 20, "coin haut du DÉBUT des étincelles carré")
        XCTAssertGreaterThan(pixels.luma(level.maxX - 0.5, level.minY + 0.5), white - 8, "coin haut vers le milieu arrondi")
        XCTAssertLessThan(pixels.luma(rank.maxX - 0.5, rank.minY + 0.5), white - 20, "coin haut de la FIN du rang carré")
        XCTAssertGreaterThan(pixels.luma(rank.minX + 0.5, rank.minY + 0.5), white - 8, "coin haut vers le milieu arrondi")
        XCTAssertGreaterThan(pixels.luma(level.minX + 2, Self.banner.height - 2), white * 0.66, "le voile reste léger : la bannière se voit")
    }

    func test_banner_captures_whenADirectoryIsGiven() throws {
        guard let directory = ProcessInfo.processInfo.environment["BANNER_CAPTURE_DIR"] else { return }
        let scenes: [(String, LayoutDirection, [Color])] = [
            ("ios-banniere-sombre", .leftToRight, [Color(red: 0.16, green: 0.12, blue: 0.42), Color(red: 0.55, green: 0.2, blue: 0.5)]),
            ("ios-banniere-claire", .leftToRight, [Color(red: 0.98, green: 0.96, blue: 0.9), Color(red: 0.85, green: 0.93, blue: 1)]),
            ("ios-banniere-rtl", .rightToLeft, [Color(red: 0.95, green: 0.6, blue: 0.3), Color(red: 0.3, green: 0.6, blue: 0.9)]),
        ]
        for (name, direction, colors) in scenes {
            let card = VStack(spacing: 0) {
                ZStack {
                    LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
                    Circle().stroke(Color.white.opacity(0.7), lineWidth: 6).frame(width: 140).offset(x: -110, y: 30)
                    Circle().fill(Color.black.opacity(0.25)).frame(width: 90).offset(x: 120, y: 35)
                    Rectangle().fill(Color.red.opacity(0.5)).frame(width: 360, height: 6).offset(y: 48)
                }
                .frame(width: 345, height: 120)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
                .overlay {
                    badge(points: 976)
                        .environment(\.layoutDirection, direction)
                        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
                }
                Circle().fill(Color.gray).frame(width: 90, height: 90)
                    .overlay(Circle().stroke(Color.white, lineWidth: 4))
                    .offset(y: -45).padding(.bottom, -45)
            }
            .padding(16)
            .background(Color(white: 0.96))
            let renderer = ImageRenderer(content: card)
            renderer.scale = 3
            let data = try XCTUnwrap(renderer.uiImage?.pngData())
            try data.write(to: URL(fileURLWithPath: directory).appendingPathComponent("\(name).png"))
        }
    }

    private struct Pixels {
        let image: CGImage
        let bytes: [UInt8]
        let scale: CGFloat
        var size: CGSize { CGSize(width: image.width, height: image.height) }

        func luma(_ x: CGFloat, _ y: CGFloat) -> Double {
            let px = min(image.width - 1, max(0, Int(x * scale)))
            let py = min(image.height - 1, max(0, Int(y * scale)))
            let index = (py * image.width + px) * 4
            return 0.299 * Double(bytes[index]) + 0.587 * Double(bytes[index + 1]) + 0.114 * Double(bytes[index + 2])
        }
    }

    private static func render(_ view: some View) -> Pixels? {
        let renderer = ImageRenderer(content: view)
        renderer.scale = 2
        guard let image = renderer.cgImage else { return nil }
        var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
        guard let context = CGContext(
            data: &bytes, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: image.width * 4,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return Pixels(image: image, bytes: bytes, scale: 2)
    }
}

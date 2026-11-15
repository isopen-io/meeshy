import XCTest
import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Un bouton posé sur un média se voit sur une image claire comme sur une image
/// sombre** (#6693).
///
/// ## Le défaut, mesuré à la recette du 2026-09-15
///
/// Trois surfaces peignaient leurs contrôles d'un glyphe BLANC fixe, sans regarder ce
/// qu'il y avait dessous : colonne de la galerie (1,83:1 sur une vidéo violette),
/// « … » de la carte Réel (1,45:1 sur une mire cyan), rail du lecteur de Réels
/// (J'aime 2,00:1, Enregistrer 2,37:1 sur la même mire). Le lecteur de story tenait
/// 8,85:1 parce qu'il tire sa teinte de `CanvasChromeScheme`. WCAG 1.4.11 demande
/// 3:1 à un composant d'interface.
///
/// ## Ce que ces témoins mesurent
///
/// La DÉCISION de chaque surface, de bout en bout : le média qu'elle affiche
/// réellement → sa luminance échantillonnée par la loi du SDK → le schéma → le
/// contraste du glyphe qu'il fait peindre. Les fonds sont de vrais ThumbHash, encodés
/// depuis des aplats : c'est la matière que les surfaces ont sous la main avant
/// tout chargement.
///
/// L'oracle de contraste nomme les deux glyphes que `glassControlForeground()`
/// peint — blanc en sombre, `indigo950` (#1E1B4B) en clair. Il ne décide rien : il
/// mesure ce que la décision fait voir.
@MainActor
final class MediaChromeSchemeTests: XCTestCase {

    // MARK: - Les fonds de la recette

    private enum Fond: String, CaseIterable {
        case mireCyan = "00FFFF"
        case feuillageClair = "9ED36A"
        case videoViolette = "C39BF0"
        case grisMoyen = "808080"
        case nuit = "1A1A2E"

        var estClair: Bool { self == .mireCyan || self == .feuillageClair || self == .videoViolette }
    }

    private func empreinte(_ fond: Fond) throws -> String {
        let valeur = try XCTUnwrap(UInt32(fond.rawValue, radix: 16))
        let couleur = UIColor(red: CGFloat((valeur >> 16) & 0xFF) / 255,
                              green: CGFloat((valeur >> 8) & 0xFF) / 255,
                              blue: CGFloat(valeur & 0xFF) / 255, alpha: 1)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: 16, height: 16), format: format).image { contexte in
            couleur.setFill()
            contexte.fill(CGRect(x: 0, y: 0, width: 16, height: 16))
        }
        return try XCTUnwrap(image.toThumbHash(), "fabrique : l'aplat \(fond) doit s'encoder")
    }

    private func id(_ nom: String) -> String { "\(nom)-\(UUID().uuidString)" }

    private func contraste(_ schema: ColorScheme, surLuminance fond: Double) throws -> Double {
        let glyphe = schema == .dark ? 1.0 : try XCTUnwrap(CanvasChromeScheme.relativeLuminance(hex: "1E1B4B"))
        return (max(glyphe, fond) + 0.05) / (min(glyphe, fond) + 0.05)
    }

    /// Le schéma que la surface peindra une fois la luminance connue, et la
    /// luminance sur laquelle il se lit.
    private func decision(_ backdrop: MediaChromeBackdrop?) async throws -> (ColorScheme, Double) {
        let mesure = await MediaLuminanceSampler.sample(backdrop)
        let echantillon = try XCTUnwrap(mesure, "un média porteur d'une empreinte doit être échantillonné")
        return (MediaChromeScheme.scheme(for: backdrop, sample: echantillon), echantillon.luminance)
    }

    private func assertLisible(_ backdrop: MediaChromeBackdrop?, fond: Fond, surface: String,
                               file: StaticString = #filePath, line: UInt = #line) async throws {
        let (schema, luminance) = try await decision(backdrop)
        let ratio = try contraste(schema, surLuminance: luminance)
        XCTAssertGreaterThanOrEqual(ratio, 3, "\(surface) sur \(fond) : \(String(format: "%.2f", ratio)):1",
                                    file: file, line: line)
        XCTAssertEqual(schema, fond.estClair ? .light : .dark,
                       "\(surface) sur \(fond) : le glyphe doit \(fond.estClair ? "s'assombrir" : "rester blanc")",
                       file: file, line: line)
    }

    // MARK: - Fabriques de surfaces

    private func pieceJointe(_ fond: Fond, video: Bool = false) throws -> MessageAttachment {
        MessageAttachment(id: id("att"), mimeType: video ? "video/mp4" : "image/jpeg",
                          fileUrl: "https://staging.meeshy.me/u/\(UUID().uuidString)",
                          thumbHash: try empreinte(fond))
    }

    private func media(_ fond: Fond, _ type: FeedMediaType) throws -> FeedMedia {
        FeedMedia(id: id("media"), type: type, url: "https://staging.meeshy.me/p/\(UUID().uuidString)",
                  thumbHash: try empreinte(fond))
    }

    // MARK: - 1 · Colonne de la galerie

    func test_colonneDeLaGalerie_seLitSurTousLesFonds() async throws {
        for fond in Fond.allCases {
            try await assertLisible(.attachment(try pieceJointe(fond, video: true)),
                                    fond: fond, surface: "colonne de la galerie")
        }
    }

    // MARK: - 2 · Carte Réel du fil

    func test_carteReel_sonMenuSeLitSurTousLesFonds() async throws {
        for fond in Fond.allCases {
            let post = FeedPost(id: id("reel"), author: "Demo", content: "", media: [try media(fond, .image)])
            try await assertLisible(.feedCard(post), fond: fond, surface: "« … » de la carte Réel")
        }
    }

    // MARK: - 3 · Lecteur de Réels plein écran

    func test_lecteurDeReels_sonRailSeLitSurTousLesFonds() async throws {
        for fond in Fond.allCases {
            let post = FeedPost(id: id("reel"), author: "Demo", content: "", media: [try media(fond, .video)])
            try await assertLisible(.reel(post, visibleMediaId: nil), fond: fond, surface: "rail du lecteur de Réels")
        }
    }

    /// **Le média AFFICHÉ, pas le premier.** Un carrousel feuilleté jusqu'à sa
    /// seconde image, claire, se lit sur elle — pas sur la première, sombre.
    func test_lecteurDeReels_seLitSurLImageQueLeCarrouselMontre() async throws {
        let sombre = try media(.nuit, .image)
        let claire = try media(.mireCyan, .image)
        let post = FeedPost(id: id("reel"), author: "Demo", content: "", media: [sombre, claire])

        let (surLaSeconde, _) = try await decision(.reel(post, visibleMediaId: claire.id))
        let (surLaPremiere, _) = try await decision(.reel(post, visibleMediaId: nil))
        XCTAssertEqual(surLaSeconde, .light)
        XCTAssertEqual(surLaPremiere, .dark)
    }

    // MARK: - Tant que la luminance n'est pas connue

    /// **Le défaut est celui de la loi**, pas une teinte choisie ici : sans mesure,
    /// le chrome garde la convention plein écran.
    func test_sansMesure_leSchemaEstLeDefautDeLaLoi() throws {
        let backdrop = MediaChromeBackdrop.attachment(try pieceJointe(.mireCyan))

        XCTAssertEqual(MediaChromeScheme.scheme(for: backdrop, sample: nil),
                       CanvasChromeScheme.scheme(background: nil, hasMediaBackground: true, mediaLuminance: nil))
    }

    /// Une mesure faite pour UN AUTRE média ne teinte jamais celui-ci : pendant un
    /// feuilletage, la page qui arrive ne peint pas avec la luminance de la
    /// précédente.
    func test_laMesureDUnAutreMedia_neTeintePasCeluiCi() throws {
        let backdrop = MediaChromeBackdrop.attachment(try pieceJointe(.nuit))
        let ailleurs = MediaChromeSample(key: id("autre"), luminance: 0.9)

        XCTAssertEqual(MediaChromeScheme.scheme(for: backdrop, sample: ailleurs), .dark)
    }

    /// Rien à échantillonner — ni empreinte, ni bitmap en mémoire : aucune mesure, et
    /// jamais une luminance inventée.
    func test_unMediaSansEmpreinteNiBitmap_nEstPasMesure() async {
        let nu = MessageAttachment(id: id("nu"), mimeType: "image/jpeg",
                                   fileUrl: "https://staging.meeshy.me/absent/\(UUID().uuidString)")
        let echantillon = await MediaLuminanceSampler.sample(.attachment(nu))
        XCTAssertNil(echantillon)
    }

    // MARK: - Une fois par média

    /// **Une fois par média, jamais par image.** La première mesure se fait hors du
    /// fil principal ; la suivante se sert SYNCHRONEMENT — c'est ce qui permet à une
    /// carte recyclée par la liste de naître avec sa teinte, sans repasser par le
    /// défaut.
    func test_uneMesure_seSertEnsuiteSansRecalcul() async throws {
        let backdrop = MediaChromeBackdrop.attachment(try pieceJointe(.feuillageClair))

        XCTAssertNil(MediaLuminanceSampler.memoized(backdrop), "garde de fabrique : média jamais vu")
        let premiere = await MediaLuminanceSampler.sample(backdrop)
        XCTAssertNotNil(premiere)
        XCTAssertEqual(MediaLuminanceSampler.memoized(backdrop), premiere)
    }
}

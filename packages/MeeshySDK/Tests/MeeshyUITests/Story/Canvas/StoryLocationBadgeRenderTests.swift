import XCTest
import CoreMedia
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 19 — la pastille de lieu doit être peinte par `StoryRenderer.render`,
/// la source UNIQUE du premier plan (canvas live, backdrop, compositor
/// d'export). Une pastille dessinée ailleurs (vue SwiftUI par ex.) sortirait
/// invisible de la vidéo exportée — voir doc `StoryRenderer.render`.
@MainActor
final class StoryLocationBadgeRenderTests: XCTestCase {

    /// Rend le layer dans un bitmap alpha-only à ses propres bounds et
    /// retourne l'alpha au point donné — même technique que
    /// `StoryTextLayerInkClippingTests.inkColumns`, seule assertion de
    /// non-vacuité réellement présente dans ce harnais (`isUniformlyTransparent`
    /// n'existe nulle part dans le dépôt).
    private func alpha(of layer: CALayer, at point: CGPoint) throws -> UInt8 {
        let size = layer.bounds.size
        let width = Int(ceil(size.width)), height = Int(ceil(size.height))
        XCTAssertGreaterThan(width, 0); XCTAssertGreaterThan(height, 0)
        var pixels = [UInt8](repeating: 0, count: width * height)
        let ctx = try XCTUnwrap(CGContext(
            data: &pixels, width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: width,
            space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGImageAlphaInfo.alphaOnly.rawValue))
        layer.render(in: ctx)
        let x = min(max(0, Int(point.x)), width - 1)
        let y = min(max(0, Int(point.y)), height - 1)
        return pixels[y * width + x]
    }

    /// Le point crucial de la tâche : la pastille doit sortir de
    /// `StoryRenderer.render` — la seule source du premier plan (canvas
    /// live, backdrop, compositor d'export lui délèguent tous). On rend une
    /// slide complète (pas juste `StoryLocationLayer` en isolation), on
    /// retrouve le sublayer par son id, puis on prouve qu'un pixel a
    /// réellement été peint en son centre.
    func test_renderer_drawsLocationBadge_soItSurvivesExport() throws {
        var slide = StorySlide(id: "s1")
        slide.locationObjects = [
            StoryLocationObject(id: "loc-1",
                                place: SharedPlace(latitude: 48.8566, longitude: 2.3522,
                                                   name: "Tour Eiffel"))
        ]
        let geometry = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))

        let root = StoryRenderer.render(slide: slide, into: geometry, at: .zero, mode: .edit)

        let badgeLayer = try XCTUnwrap(
            (root.sublayers ?? []).first { $0.name == "loc-1" },
            "StoryRenderer.render doit produire une layer nommée par l'id de la pastille"
        )
        let center = CGPoint(x: badgeLayer.bounds.midX, y: badgeLayer.bounds.midY)
        let value = try alpha(of: badgeLayer, at: center)
        XCTAssertGreaterThan(value, 8,
                             "Une pastille dessinee hors de StoryRenderer sort invisible de la video exportee.")
    }

    /// « Le point crucial est OU la dessiner » : x/y normalisés + anchor
    /// doivent traverser le MÊME pipeline design→render que `textObjects`
    /// (`geometry.designLength/designHeightLength` puis `geometry.render`) —
    /// sinon la pastille dérive du canvas live à l'export.
    func test_renderer_positionsLocationBadge_atNormalizedCoordinates_likeTextObjects() {
        var slide = StorySlide(id: "s1")
        slide.locationObjects = [
            StoryLocationObject(id: "loc-1",
                                place: SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Tour Eiffel"),
                                x: 0.25, y: 0.75)
        ]
        let geometry = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))

        let root = StoryRenderer.render(slide: slide, into: geometry, at: .zero, mode: .edit)
        let badgeLayer = (root.sublayers ?? []).first { $0.name == "loc-1" }

        let expectedX = geometry.designLength(forNormalized: 0.25)
        let expectedY = geometry.designHeightLength(forNormalized: 0.75)
        let expectedPosition = geometry.render(CGPoint(x: expectedX, y: expectedY))

        XCTAssertEqual(badgeLayer?.position.x ?? -1, expectedPosition.x, accuracy: 0.01)
        XCTAssertEqual(badgeLayer?.position.y ?? -1, expectedPosition.y, accuracy: 0.01)
        XCTAssertEqual(badgeLayer?.zPosition, 0)
    }

    /// zIndex ordonne les pastilles comme les autres items de premier plan
    /// (`render` trie `allItems` par `zIndex` avant de peindre).
    func test_renderer_sortsLocationBadgesByZIndex() {
        var slide = StorySlide(id: "s1")
        slide.locationObjects = [
            StoryLocationObject(id: "back",
                                place: SharedPlace(latitude: 0, longitude: 0, name: "Back"),
                                zIndex: 0),
            StoryLocationObject(id: "front",
                                place: SharedPlace(latitude: 0, longitude: 0, name: "Front"),
                                zIndex: 5)
        ]
        let geometry = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))

        let root = StoryRenderer.render(slide: slide, into: geometry, at: .zero, mode: .edit)
        let names = (root.sublayers ?? []).map { $0.name }

        XCTAssertEqual(names, ["back", "front"])
    }

    // MARK: - Label fallback (place.name → place.address → "Ici" localisé)

    func test_resolvedLabel_prefersName() {
        let place = SharedPlace(latitude: 0, longitude: 0, name: "Tour Eiffel", address: "Champ de Mars")
        XCTAssertEqual(StoryLocationLayer.resolvedLabel(for: place), "Tour Eiffel")
    }

    func test_resolvedLabel_fallsBackToAddressWhenNameMissing() {
        let place = SharedPlace(latitude: 0, longitude: 0, name: nil, address: "Champ de Mars")
        XCTAssertEqual(StoryLocationLayer.resolvedLabel(for: place), "Champ de Mars")
    }

    func test_resolvedLabel_fallsBackToLocalizedHereWhenBothMissing() {
        let place = SharedPlace(latitude: 0, longitude: 0, name: nil, address: nil)
        let expected = String(localized: "story.location.here", defaultValue: "Ici", bundle: .module)
        XCTAssertEqual(StoryLocationLayer.resolvedLabel(for: place), expected)
    }

    // MARK: - Palette de marque (pas de couleur système en dur)

    /// Le glyphe d'épingle doit suivre `MeeshyColors.error` (#F87171), pas
    /// `.systemRed` (#FF3B30) — deux rouges visuellement distincts.
    func test_pinTintColor_matchesBrandErrorRed_notSystemRed() {
        assertColor(StoryLocationLayer.pinTintColor, hex: "F87171")
        XCTAssertNotEqual(StoryLocationLayer.pinTintColor, .systemRed)
    }

    /// Le libellé doit suivre `MeeshyColors.indigo900` (#312E81), pas un
    /// noir pur hors charte.
    func test_labelTextColor_matchesBrandIndigo900_notPureBlack() {
        assertColor(StoryLocationLayer.labelTextColor, hex: "312E81")
        XCTAssertNotEqual(StoryLocationLayer.labelTextColor, .black)
    }

    /// Le fond de la pastille doit rester un fond clair (glass, jamais
    /// retiré) mais teinté Indigo (`indigo50`), pas un blanc système pur.
    func test_pillBackgroundColor_isIndigoTinted_notPureSystemWhite() {
        assertColor(StoryLocationLayer.pillBackgroundColor, hex: "EEF2FF", alpha: 0.94)
        XCTAssertNotEqual(StoryLocationLayer.pillBackgroundColor, UIColor.white.withAlphaComponent(0.94))
    }

    // MARK: - badgeFrame (hit-test reader)

    /// Anti-dérive : le cadre annoncé au hit-test du reader doit être EXACTEMENT
    /// celui que `configure` pose sur la layer (mêmes constantes, même mesure,
    /// mêmes projections). À rotation nulle, `CALayer.frame` intègre déjà
    /// position + anchor + bounds — c'est la référence.
    func test_badgeFrame_matchesTheConfiguredLayerFrame() {
        let location = StoryLocationObject(
            id: "loc-hit",
            place: SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Tour Eiffel"),
            x: 0.42, y: 0.73)
        let canvasSize = CGSize(width: 402, height: 715)
        let layer = StoryLocationLayer()
        layer.configure(with: location,
                        geometry: CanvasGeometry(renderSize: canvasSize),
                        mode: .play,
                        renderScale: 2)

        let frame = StoryLocationLayer.badgeFrame(for: location, canvasSize: canvasSize)

        XCTAssertEqual(frame.minX, layer.frame.minX, accuracy: 0.5)
        XCTAssertEqual(frame.minY, layer.frame.minY, accuracy: 0.5)
        XCTAssertEqual(frame.width, layer.frame.width, accuracy: 0.5)
        XCTAssertEqual(frame.height, layer.frame.height, accuracy: 0.5)
    }

    /// Le scale de l'auteur agrandit la zone touchable comme le rendu.
    func test_badgeFrame_growsWithTheAuthorScale() {
        var small = StoryLocationObject(
            id: "loc-s",
            place: SharedPlace(latitude: 1, longitude: 1, name: "Ici même"))
        var big = small
        small.scale = 1.0
        big.scale = 1.8
        let canvasSize = CGSize(width: 402, height: 715)

        let smallFrame = StoryLocationLayer.badgeFrame(for: small, canvasSize: canvasSize)
        let bigFrame = StoryLocationLayer.badgeFrame(for: big, canvasSize: canvasSize)

        XCTAssertGreaterThan(bigFrame.width, smallFrame.width)
        XCTAssertGreaterThan(bigFrame.height, smallFrame.height)
    }

    private func assertColor(_ color: UIColor, hex: String, alpha: CGFloat = 1,
                             file: StaticString = #filePath, line: UInt = #line) {
        let scanner = Scanner(string: hex)
        var rgb: UInt64 = 0
        XCTAssertTrue(scanner.scanHexInt64(&rgb), file: file, line: line)
        let expectedR = CGFloat((rgb & 0xFF0000) >> 16) / 255
        let expectedG = CGFloat((rgb & 0x00FF00) >> 8) / 255
        let expectedB = CGFloat(rgb & 0x0000FF) / 255

        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)

        XCTAssertEqual(r, expectedR, accuracy: 0.01, file: file, line: line)
        XCTAssertEqual(g, expectedG, accuracy: 0.01, file: file, line: line)
        XCTAssertEqual(b, expectedB, accuracy: 0.01, file: file, line: line)
        XCTAssertEqual(a, alpha, accuracy: 0.01, file: file, line: line)
    }

    // MARK: - La fenêtre de la pastille atteint le PIXEL

    /// **Une pastille de lieu APPARAÎT et DISPARAÎT quand elle veut** —
    /// directive porteur 2026-08-31 (#4591). Ce témoin est celui qui manquait :
    /// il n'interroge ni le modèle ni la timeline, mais **ce que le rendu
    /// PEINT**, à trois instants.
    ///
    /// > Il aurait rougi tant que `MeeshyUI` déclarait
    /// > `extension StoryLocationObject: RenderableItem { var startTime: Double? { nil } }`.
    /// > Ces quatre calculées OMBRAIENT les propriétés stockées dans tout le
    /// > module — la fenêtre posée au modèle n'aurait gouverné AUCUN pixel, et
    /// > les témoins du modèle seraient restés verts. **Un repli qui rend `nil`
    /// > sans condition satisfait le contrat qu'il vide.**
    func test_renderer_honoursTheLocationWindow_inPlayMode() {
        var lieu = StoryLocationObject(id: "loc-1",
                                       place: SharedPlace(latitude: 48.8566, longitude: 2.3522,
                                                          name: "Tour Eiffel"))
        lieu.startTime = 2
        lieu.duration = 3
        var slide = StorySlide(id: "s1")
        slide.locationObjects = [lieu]
        let geometry = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))

        func peinte(at seconds: Double) -> Bool {
            let root = StoryRenderer.render(slide: slide, into: geometry,
                                            at: CMTime(seconds: seconds, preferredTimescale: 600),
                                            mode: .play)
            return (root.sublayers ?? []).contains { $0.name == "loc-1" }
        }

        XCTAssertFalse(peinte(at: 1), "Avant sa fenêtre, la pastille ne doit pas être peinte")
        XCTAssertTrue(peinte(at: 3), "Dans sa fenêtre, la pastille doit être peinte")
        XCTAssertFalse(peinte(at: 6), "Après sa fenêtre, la pastille ne doit plus être peinte")
    }

    /// Et une pastille SANS fenêtre reste visible tout du long : `nil` signifie
    /// « aucune fenêtre posée », pour les cinq familles — pas « cette famille
    /// n'a pas de temps ». C'est ce qui garantit qu'aucune publication déjà
    /// composée ne change de comportement.
    func test_renderer_keepsAWindowlessLocationVisible_throughout() {
        var slide = StorySlide(id: "s1")
        slide.locationObjects = [
            StoryLocationObject(id: "loc-1",
                                place: SharedPlace(latitude: 48.8566, longitude: 2.3522,
                                                   name: "Tour Eiffel"))
        ]
        let geometry = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))

        for seconds in [0.0, 5.0, 30.0] {
            let root = StoryRenderer.render(slide: slide, into: geometry,
                                            at: CMTime(seconds: seconds, preferredTimescale: 600),
                                            mode: .play)
            XCTAssertTrue((root.sublayers ?? []).contains { $0.name == "loc-1" },
                          "Sans fenêtre posée, la pastille vit toute la slide (t=\(seconds))")
        }
    }
}

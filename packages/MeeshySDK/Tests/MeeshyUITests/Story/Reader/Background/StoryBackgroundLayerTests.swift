// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerTests.swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryBackgroundLayerTests: XCTestCase {
    func test_configure_solidColor_setsBackgroundColor() {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        layer.configure(kind: .solidColor(.red), transform: .identity,
                        geometry: geom, resolver: nil, imageCache: nil)
        XCTAssertEqual(layer.backgroundColor, UIColor.red.cgColor)
    }

    // MARK: - P3 — directURLIfAny normalizes relative media URLs

    /// A server-relative background URL (getAttachmentPath / forward / repost)
    /// must resolve to an absolute URL via the SSRF-guarded resolver instead of
    /// returning nil — otherwise the background drops to the solid-color
    /// fallback (black bg on another user's story). Was nil before the fix.
    func test_directURLIfAny_relativePath_resolvesToAbsoluteURL() {
        let resolved = StoryBackgroundLayer.directURLIfAny(from: "/api/v1/attachments/file/bg.jpg")
        XCTAssertNotNil(resolved, "A relative media path must be normalized to an absolute URL")
        XCTAssertFalse(resolved?.isFileURL ?? true)
        XCTAssertTrue(["http", "https"].contains(resolved?.scheme ?? ""),
                      "A resolved relative media URL must carry a network scheme")
    }

    func test_directURLIfAny_fileURL_returnedVerbatim() {
        let resolved = StoryBackgroundLayer.directURLIfAny(from: "file:///tmp/ABC.jpg")
        XCTAssertEqual(resolved?.isFileURL, true)
    }

    func test_directURLIfAny_schemelessToken_staysNil() {
        XCTAssertNil(StoryBackgroundLayer.directURLIfAny(from: "not-a-url-token"))
        XCTAssertNil(StoryBackgroundLayer.directURLIfAny(from: ""))
    }

    func test_configure_gradient_addsGradientSublayer() {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        layer.configure(kind: .gradient(colors: [.red, .blue], direction: .topToBottom),
                        transform: .identity, geometry: geom, resolver: nil, imageCache: nil)
        let gradient = layer.sublayers?.first { $0 is CAGradientLayer } as? CAGradientLayer
        XCTAssertNotNil(gradient)
        XCTAssertEqual(gradient?.colors?.count, 2)
    }

    func test_configure_appliesTransform() {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        layer.configure(kind: .solidColor(.black),
                        transform: BackgroundTransform(scale: 2.0),
                        geometry: geom, resolver: nil, imageCache: nil)
        XCTAssertEqual(layer.transform.m11, 2.0, accuracy: 1e-9)
    }

    /// Régression « saut au release » : déplacer/zoomer le fond pendant un
    /// drag puis relâcher ne doit PAS faire revenir le fond à sa position
    /// initiale sur le canvas. Pendant le drag, `updateManipulatedItemLayer`
    /// appelle `applyContentTransform` qui pose un transform non-identité sur
    /// `contentLayer` SANS toucher `transform3D`. Au `.ended`,
    /// `rebuildLayers → configure` arrive dans le chemin `canReuseContent` :
    /// s'il assigne `contentLayer.frame` alors que le layer est encore
    /// transformé, le frame setter de CoreAnimation corrompt bounds/position
    /// (le `frame` est indéfini sous un transform non-identité) → le fond saute
    /// même si le modèle (mini-preview) est correct. Le sublayer de contenu doit
    /// conserver des bounds canoniques (== render size du canvas) ; l'offset et
    /// le scale sont portés UNIQUEMENT par le transform.
    func test_configure_reuseContent_afterLiveDragTransform_keepsCanonicalContentBounds() throws {
        let layer = StoryBackgroundLayer()
        let size = CGSize(width: 412, height: 732)
        let geom = CanvasGeometry(renderSize: size)

        // Peinture initiale — le gradient crée un `contentLayer` réutilisable
        // synchrone (pas d'async image), idéal pour exercer `canReuseContent`.
        layer.configure(kind: .gradient(colors: [.red, .blue], direction: .topToBottom),
                        transform: .identity, geometry: geom, resolver: nil, imageCache: nil)

        // Drag live : zoom 2x + pan, appliqué directement au sublayer de contenu
        // exactement comme `updateManipulatedItemLayer` le fait en cours de geste.
        // Ne touche PAS `transform3D` — miroir fidèle du chemin runtime.
        let dragged = BackgroundTransform(scale: 2.0, offsetX: 100, offsetY: 60)
        layer.applyContentTransform(dragged.caTransform())

        // Geste `.ended` → `rebuildLayers → configure` avec le transform commité
        // (même identité gradient → chemin `canReuseContent`).
        layer.configure(kind: .gradient(colors: [.red, .blue], direction: .topToBottom),
                        transform: dragged, geometry: geom, resolver: nil, imageCache: nil)

        let content = try XCTUnwrap(layer.contentLayer)
        XCTAssertEqual(content.bounds.size.width, size.width, accuracy: 0.5,
                       "Les bounds du contenu doivent rester canoniques (== canvas), pas être corrompus par un frame posé sur un layer transformé")
        XCTAssertEqual(content.bounds.size.height, size.height, accuracy: 0.5,
                       "Les bounds du contenu doivent rester canoniques (== canvas), pas être corrompus par un frame posé sur un layer transformé")
        // Le transform résolu reste porté par le sublayer (offset + scale).
        XCTAssertEqual(content.transform.m11, 2.0, accuracy: 1e-9)
    }

    func test_configure_sameSolidColorTwice_isNoOp() throws {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        layer.configure(kind: .solidColor(.red), transform: .identity,
                        geometry: geom, resolver: nil, imageCache: nil)
        let sublayerCountBefore = layer.sublayers?.count ?? 0

        // Capture color components (not CGColor identity — UIColor caches its
        // .cgColor but the cache isn't a guaranteed invariant; comparing RGBA
        // via getRed() is the robust check the user-facing pixel sees).
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
        if let cg = layer.backgroundColor {
            UIColor(cgColor: cg).getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        }

        layer.configure(kind: .solidColor(.red), transform: .identity,
                        geometry: geom, resolver: nil, imageCache: nil)
        let sublayerCountAfter = layer.sublayers?.count ?? 0
        XCTAssertEqual(sublayerCountBefore, sublayerCountAfter)

        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        if let cg = layer.backgroundColor {
            UIColor(cgColor: cg).getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        }
        XCTAssertEqual(r1, r2, accuracy: 1e-9)
        XCTAssertEqual(g1, g2, accuracy: 1e-9)
        XCTAssertEqual(b1, b2, accuracy: 1e-9)
        XCTAssertEqual(a1, a2, accuracy: 1e-9)
    }

    // MARK: - Filter baking + in-place edit (2026-06-03 pivot)

    /// Pivot : the story filter is BAKED into the background bitmap at stamp time
    /// (no overlay). configure with a filter must stamp a DIFFERENT (filtered)
    /// bitmap; without a filter it stamps the raw bitmap untouched. The composer
    /// cache is keyed by the media id derived from the temp filename (ABC.jpg → ABC).
    func test_configure_imageWithFilter_bakesFilteredBitmap() throws {
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        let raw = Self.solidImage(.red)
        let url = "file:///tmp/ABC.jpg"

        let noFilterLayer = StoryBackgroundLayer()
        noFilterLayer.configure(kind: .image(postMediaId: url, thumbHash: nil), transform: .identity,
                                geometry: geom, resolver: nil,
                                imageCache: ComposerImageCacheReader(images: ["ABC": raw], version: 1),
                                filter: nil, filterIntensity: 1.0, contentVersion: 1)
        let unfiltered = try XCTUnwrap(noFilterLayer.contentLayer?.contents) as! CGImage
        XCTAssertTrue(unfiltered === raw.cgImage!, "no filter → raw bitmap stamped as-is")

        let filteredLayer = StoryBackgroundLayer()
        filteredLayer.configure(kind: .image(postMediaId: url, thumbHash: nil), transform: .identity,
                                geometry: geom, resolver: nil,
                                imageCache: ComposerImageCacheReader(images: ["ABC": raw], version: 1),
                                filter: .bw, filterIntensity: 1.0, contentVersion: 1)
        let filtered = try XCTUnwrap(filteredLayer.contentLayer?.contents) as! CGImage
        XCTAssertFalse(filtered === raw.cgImage!, "filter must be baked into the bitmap (B&W ≠ raw red)")
    }

    /// An in-place image edit (same media id, new bytes, bumped contentVersion)
    /// must re-stamp the edited bitmap even though the media identity is unchanged
    /// — the canvas was frozen on the original before the fix.
    func test_configure_inPlaceEdit_reStampsEditedBitmap() throws {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        let original = Self.solidImage(.red)
        let edited = Self.solidImage(.green)
        let url = "file:///tmp/ABC.jpg"

        layer.configure(kind: .image(postMediaId: url, thumbHash: nil), transform: .identity,
                        geometry: geom, resolver: nil,
                        imageCache: ComposerImageCacheReader(images: ["ABC": original], version: 1),
                        contentVersion: 1)
        XCTAssertTrue((try XCTUnwrap(layer.contentLayer?.contents) as! CGImage) === original.cgImage!)

        layer.configure(kind: .image(postMediaId: url, thumbHash: nil), transform: .identity,
                        geometry: geom, resolver: nil,
                        imageCache: ComposerImageCacheReader(images: ["ABC": edited], version: 2),
                        contentVersion: 2)
        XCTAssertTrue((try XCTUnwrap(layer.contentLayer?.contents) as! CGImage) === edited.cgImage!,
                      "in-place edit (bumped contentVersion) must re-stamp the edited bitmap")
    }

    private static func solidImage(_ color: UIColor, size: CGSize = CGSize(width: 32, height: 32)) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill(); ctx.fill(CGRect(origin: .zero, size: size))
        }
    }
}

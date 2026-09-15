import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Ce que le lecteur PEINT d'une story qui n'est qu'une image** (#6636).
///
/// Les témoins de loi et de montage disent qu'une forme est ÉCRITE ; celui-ci
/// dit ce qui atteint l'écran. Il monte, dans une vraie fenêtre, la pile du
/// lecteur — fond plein écran, canvas réel (`StoryReaderRepresentable` →
/// `StoryCanvasUIView`), carte (`readerCard`), légende — sur une photo locale,
/// sans compte ni réseau.
///
/// Deux usages :
/// - **le témoin de pixels**, toujours joué : sur un fond SENTINELLE, le point
///   au milieu de la bande haute porte la carte AVANT et le fond APRÈS, pendant
///   que le centre de l'image est peint dans les deux cas (le fusible) ;
/// - **les captures** du compte rendu, jouées seulement quand
///   `MEESHY_CAPTURE_DIR` est posé (`TEST_RUNNER_MEESHY_CAPTURE_DIR` à
///   `xcodebuild`) : photo paysage puis portrait, avant puis après, écrites en
///   PNG à l'échelle de l'écran.
///
/// « Avant » est la pile d'`origin/dev` à l'identique : `readerCard` sans
/// rectangle rogne le canvas entier au rayon compensé, et la bande est servie.
@MainActor
final class StoryImageOnlyCaptureTests: XCTestCase {

    enum Orientation: String, CaseIterable { case paysage, portrait }
    enum Moment: String, CaseIterable { case avant, apres }

    private static let sentinelle = Color(.sRGB, red: 1, green: 0, blue: 1, opacity: 1)
    private static let indigo = UIColor(red: 0.310, green: 0.275, blue: 0.898, alpha: 1)

    // MARK: - Le témoin de pixels

    func test_laBandeHaute_montreLaCarteAvant_etLeFondPleinEcranApres() throws {
        let photo = Self.photo(.paysage, uni: Self.indigo)
        let story = Self.story(.paysage)

        let avant = try mount(story: story, photo: photo, moment: .avant, fondSentinelle: true)
        defer { avant.pixels.dismount() }
        XCTAssertTrue(avant.pixels.pixel(avant.centreImage.x, avant.centreImage.y,
                                         matches: Color(Self.indigo), tolerance: 12),
                      "fusible : l'image est peinte (\(avant.pixels.hex(x: avant.centreImage.x, y: avant.centreImage.y)))")
        XCTAssertFalse(avant.pixels.pixel(avant.bandeHaute.x, avant.bandeHaute.y, matches: Self.sentinelle),
                       "AVANT, la carte couvre la bande : le fond ne s'y voit pas")
        avant.pixels.dismount()

        let apres = try mount(story: story, photo: photo, moment: .apres, fondSentinelle: true)
        defer { apres.pixels.dismount() }
        XCTAssertTrue(apres.pixels.pixel(apres.centreImage.x, apres.centreImage.y,
                                         matches: Color(Self.indigo), tolerance: 12),
                      "fusible : l'image est toujours peinte")
        XCTAssertTrue(apres.pixels.pixel(apres.bandeHaute.x, apres.bandeHaute.y, matches: Self.sentinelle),
                      "APRÈS, la bande laisse voir le fond plein écran (\(apres.pixels.hex(x: apres.bandeHaute.x, y: apres.bandeHaute.y)))")
    }

    // MARK: - Les captures du compte rendu

    func test_ecritLesCapturesAvantApres() throws {
        guard let dossier = ProcessInfo.processInfo.environment["MEESHY_CAPTURE_DIR"], !dossier.isEmpty else {
            throw XCTSkip("captures non demandées — poser TEST_RUNNER_MEESHY_CAPTURE_DIR")
        }
        try FileManager.default.createDirectory(atPath: dossier, withIntermediateDirectories: true)
        let appareil = UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "iphone"
        for orientation in Orientation.allCases {
            for moment in Moment.allCases {
                let monte = try mount(story: Self.story(orientation), photo: Self.photo(orientation),
                                      moment: moment, fondSentinelle: false)
                let format = UIGraphicsImageRendererFormat.default()
                format.opaque = true
                let racine = monte.pixels.root
                let image = UIGraphicsImageRenderer(bounds: racine.bounds, format: format).image { _ in
                    racine.drawHierarchy(in: racine.bounds, afterScreenUpdates: true)
                }
                let chemin = (dossier as NSString)
                    .appendingPathComponent("\(appareil)-\(orientation.rawValue)-\(moment.rawValue).png")
                try XCTUnwrap(image.pngData()).write(to: URL(fileURLWithPath: chemin))
                monte.pixels.dismount()
            }
        }
    }

    // MARK: - Le montage

    private struct Monte {
        let pixels: RenderedPixels
        let bandeHaute: (x: Int, y: Int)
        let centreImage: (x: Int, y: Int)
    }

    private final class Pret { var valeur = false }

    private func mount(story: StoryItem, photo: UIImage, moment: Moment,
                       fondSentinelle: Bool) throws -> Monte {
        let pret = Pret()
        let taille = UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.screen.bounds.size }.first
            ?? CGSize(width: 402, height: 874)
        let cadrage = Self.cadrage(viewport: taille)
        let canvas = CanvasGeometry.aspectFitSize(in: taille, ratio: CanvasGeometry.portraitRatio)
        guard case .imageOnly(let imageDansCanvas) = StoryImageOnlyVerdictCache()
            .verdict(for: story, chain: ["fr"], canvasSize: canvas)
        else { throw XCTSkip("la story de la capture doit n'être qu'une image — le verdict l'a refusée") }
        let rect: CGRect? = moment == .apres ? imageDansCanvas : nil

        let vue = LecteurHarnais(story: story, photo: photo, imageRect: rect, cadrage: cadrage,
                                 canvas: canvas, fondSentinelle: fondSentinelle,
                                 onContentReady: { pret.valeur = true })
        let pixels = try RenderedPixels(vue)
        pixels.attendre(borne: 8) { pret.valeur }
        pixels.settle(borne: 2) { true }
        RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        pixels.capture()

        func ecran(_ p: CGPoint) -> (x: Int, y: Int) {
            let x = taille.width / 2 + (p.x - canvas.width / 2) * cadrage.scale
            let y = taille.height / 2 + (p.y - canvas.height / 2) * cadrage.scale + cadrage.offset.height
            return (Int(x.rounded()), Int(y.rounded()))
        }
        return Monte(pixels: pixels,
                     bandeHaute: ecran(CGPoint(x: canvas.width / 2, y: imageDansCanvas.minY / 2)),
                     centreImage: ecran(CGPoint(x: imageDansCanvas.midX, y: imageDansCanvas.midY)))
    }

    /// Le cadrage du lecteur (`StoryCardView.readerCanvasFraming`), à l'identique.
    private static func cadrage(viewport: CGSize) -> StoryCanvasFraming.Result {
        StoryCanvasFraming.resolve(.init(viewport: viewport,
                                         headerInset: 59 + 72,
                                         bottomInset: 64,
                                         sideInset: 8,
                                         state: .carded,
                                         cardedCornerRadius: 22,
                                         verticalAlignment: .top,
                                         canvasRatio: CanvasGeometry.portraitRatio))
    }

    private struct LecteurHarnais: View {
        let story: StoryItem
        let photo: UIImage
        let imageRect: CGRect?
        let cadrage: StoryCanvasFraming.Result
        let canvas: CGSize
        let fondSentinelle: Bool
        let onContentReady: () -> Void

        var body: some View {
            GeometryReader { geo in
                ZStack {
                    fond
                    StoryReaderRepresentable(story: story,
                                             preferredContentLanguages: ["fr"],
                                             preloadedImages: ["pm-photo": photo],
                                             isPaused: true,
                                             servesLetterboxFill: imageRect == nil,
                                             onContentReady: onContentReady)
                        .frame(width: canvas.width, height: canvas.height)
                        .clipped()
                        .readerCard(framing: cadrage, imageRect: imageRect)
                        .shadow(color: .black.opacity(fondSentinelle ? 0 : 0.4), radius: 20, y: 8)
                    if !fondSentinelle, let legende = story.content {
                        VStack(spacing: 0) {
                            Spacer(minLength: 0)
                            MediaCaptionOverlay(caption: legende, isExpanded: false,
                                                horizontalInset: 20,
                                                dimsBackgroundWhenExpanded: false,
                                                onToggle: {})
                        }
                        .frame(width: StoryCanvasFraming.captionColumnWidth(
                            viewport: geo.size, ratio: CanvasGeometry.portraitRatio, scale: cadrage.scale))
                        .padding(.bottom, 59 + 130)
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }
            .ignoresSafeArea()
        }

        @ViewBuilder
        private var fond: some View {
            if fondSentinelle {
                StoryImageOnlyCaptureTests.sentinelle.ignoresSafeArea()
            } else {
                ZStack {
                    Image(uiImage: photo).resizable().scaledToFill().blur(radius: 40)
                    Color.black.opacity(0.18)
                }
                .ignoresSafeArea()
            }
        }
    }

    // MARK: - Les fixtures

    private static func story(_ orientation: Orientation) -> StoryItem {
        let taille = photoSize(orientation)
        var effets = StoryEffects()
        effets.mediaObjects = [StoryMediaObject(id: "fond", postMediaId: "pm-photo", kind: .image,
                                                aspectRatio: nil, isBackground: true)]
        effets.backgroundTransform = StoryBackgroundTransform(videoFitMode: StoryBackgroundFraming.fit)
        return StoryItem(id: "capture-\(orientation.rawValue)",
                         content: "Coucher de soleil sur la baie de Dakar",
                         media: [FeedMedia(id: "pm-photo", type: .image,
                                           width: Int(taille.width), height: Int(taille.height))],
                         storyEffects: effets,
                         createdAt: Date(timeIntervalSince1970: 0))
    }

    private static func photoSize(_ orientation: Orientation) -> CGSize {
        orientation == .paysage ? CGSize(width: 1600, height: 900) : CGSize(width: 1200, height: 1600)
    }

    /// Une « photo » dessinée : ciel en dégradé, soleil, mer — assez de matière
    /// pour que le flou du fond et celui des bandes se distinguent à l'œil.
    private static func photo(_ orientation: Orientation, uni: UIColor? = nil) -> UIImage {
        let taille = photoSize(orientation)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: taille, format: format).image { ctx in
            let cg = ctx.cgContext
            if let uni {
                uni.setFill()
                cg.fill(CGRect(origin: .zero, size: taille))
                return
            }
            let ciel = [UIColor(red: 0.98, green: 0.55, blue: 0.25, alpha: 1).cgColor,
                        UIColor(red: 0.55, green: 0.20, blue: 0.55, alpha: 1).cgColor] as CFArray
            if let degrade = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: ciel,
                                        locations: [0, 1]) {
                cg.drawLinearGradient(degrade, start: CGPoint(x: 0, y: taille.height * 0.65),
                                      end: .zero, options: [])
            }
            UIColor(red: 1, green: 0.85, blue: 0.4, alpha: 1).setFill()
            let rayon = min(taille.width, taille.height) * 0.12
            cg.fillEllipse(in: CGRect(x: taille.width * 0.62 - rayon, y: taille.height * 0.5 - rayon,
                                      width: 2 * rayon, height: 2 * rayon))
            UIColor(red: 0.08, green: 0.25, blue: 0.45, alpha: 1).setFill()
            cg.fill(CGRect(x: 0, y: taille.height * 0.62, width: taille.width, height: taille.height * 0.38))
        }
    }
}

import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Ce que le lecteur PEINT d'une story — la carte 9:16 et son fond**
/// (décision porteur du 2026-09-17 sur #6896, lot #6904 ; remplace le témoin de
/// #6636, dont la carte rognée au rectangle de l'image est supplantée).
///
/// Les témoins de loi et de montage disent qu'une forme est ÉCRITE ; celui-ci
/// dit ce qui atteint l'écran. Il monte, dans une vraie fenêtre, la pile du
/// lecteur — fond plein écran, canvas réel (`StoryReaderRepresentable` →
/// `StoryCanvasUIView`), carte (`readerCard`), légende — sur une photo locale,
/// sans compte ni réseau.
///
/// Ce qu'il prouve, sur une photo PAYSAGE posée AJUSTÉE dans une scène 9:16
/// (la forme du repère F6, un panorama dans une story) :
///
/// - **la carte couvre la bande** : au milieu de la bande haute, le fond plein
///   écran SENTINELLE ne se voit pas — la scène est 9:16 entière, pas rognée au
///   rectangle de l'image ;
/// - **un seul peintre l'habille**, et c'est le fond de la CARTE, pas le canvas :
///   la bande porte la couleur plate du plateau (noir sans empreinte), jamais le
///   flou du fond plein écran (#6797) ;
/// - **le fusible** : le centre de l'image est peint dans les deux cas — sans
///   lui, une carte vide passerait les deux assertions.
///
/// Les captures du compte rendu sont jouées seulement quand
/// `MEESHY_CAPTURE_DIR` est posé (`TEST_RUNNER_MEESHY_CAPTURE_DIR` à
/// `xcodebuild`) : photo paysage puis portrait, écrites en PNG à l'échelle de
/// l'écran.
@MainActor
final class StoryReaderCardPixelTests: XCTestCase {

    enum Orientation: String, CaseIterable { case paysage, portrait }

    /// **Ce que le harnais peint AUTOUR de la carte.** La sentinelle sert aux
    /// témoins qui mesurent ce que la CARTE couvre ; le sol de production sert à
    /// ceux qui mesurent le sol lui-même — et c'est la même vue que le lecteur
    /// monte, jamais un double.
    enum Sol { case sentinelle, solDeProduction }

    private static let sentinelle = Color(.sRGB, red: 1, green: 0, blue: 1, opacity: 1)
    private static let indigo = UIColor(red: 0.310, green: 0.275, blue: 0.898, alpha: 1)

    /// **Le point de mesure du SOL** — celui que la recette au simulateur lit.
    /// Le bord haut de la carte est à 131 pt (encart du chrome) : (30, 30) est
    /// hors carte sur tout appareil que cette suite vise.
    private static let horsCarte = (x: 30, y: 30)

    /// L'empreinte d'un APLAT indigo, ENCODÉE par le SDK plutôt qu'écrite à la
    /// main : la teinte du sol est alors prévisible, et l'assertion peut dire
    /// quelle couleur elle a lue.
    private static let empreinteIndigo: String = {
        let taille = CGSize(width: 64, height: 64)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let aplat = UIGraphicsImageRenderer(size: taille, format: format).image { ctx in
            StoryReaderCardPixelTests.indigo.setFill()
            ctx.cgContext.fill(CGRect(origin: .zero, size: taille))
        }
        return aplat.toThumbHash() ?? ""
    }()

    // MARK: - Le témoin de pixels

    func test_laBandeHaute_porteLaCarte_etNonLeFondPleinEcran() throws {
        let photo = Self.photo(.paysage, uni: Self.indigo)
        let story = Self.story(.paysage)

        let monte = try mount(story: story, photo: photo, sol: .sentinelle)
        defer { monte.pixels.dismount() }

        XCTAssertTrue(monte.pixels.pixel(monte.centreImage.x, monte.centreImage.y,
                                         matches: Color(Self.indigo), tolerance: 12),
                      "fusible : l'image est peinte (\(monte.pixels.hex(x: monte.centreImage.x, y: monte.centreImage.y)))")
        XCTAssertFalse(monte.pixels.pixel(monte.bandeHaute.x, monte.bandeHaute.y, matches: Self.sentinelle),
                       "la carte 9:16 couvre la bande : le fond plein écran ne s'y voit pas " +
                       "(\(monte.pixels.hex(x: monte.bandeHaute.x, y: monte.bandeHaute.y)))")
        XCTAssertTrue(monte.pixels.pixel(monte.bandeHaute.x, monte.bandeHaute.y,
                                         matches: .black, tolerance: 16),
                      "la bande est peinte par le fond PLAT de la carte — un seul peintre, " +
                      "et sans empreinte ce fond est noir (\(monte.pixels.hex(x: monte.bandeHaute.x, y: monte.bandeHaute.y)))")
    }


    /// **LE SOL — ce que le lecteur peint AUTOUR de sa carte** (tour 4 du lot
    /// #6904, directive porteur du 2026-09-17 : « On préserve le même fond que
    /// pour la story ! »).
    ///
    /// Le témoin ci-dessus mesure ce que la carte COUVRE ; celui-ci mesure ce qui
    /// reste de l'écran — et c'est là que la recette du tour 3 ter a trouvé le
    /// dernier écart entre le lecteur de stories et la galerie de post : une
    /// teinte sombre dérivée du ThumbHash ici, du NOIR PUR là-bas.
    ///
    /// La mesure se fait au point que la recette au simulateur lit — (30, 30),
    /// bien au-dessus du bord haut de la carte, que l'encart du chrome pousse à
    /// 131 pt. Elle est donc du SOL et de rien d'autre.
    ///
    /// Le FUSIBLE est la seconde moitié : une story SANS empreinte laisse voir le
    /// noir que le lecteur pose dessous. Sans lui, un sol qui peindrait n'importe
    /// quoi d'opaque passerait pour un sol qui peint la bonne matière — et le
    /// témoin ne pourrait pas tomber si le sol redevenait noir.
    func test_leSol_horsCarte_porteLaMatiereDuHachage_jamaisDuNoir() throws {
        let photo = Self.photo(.paysage, uni: Self.indigo)

        let avec = try mount(story: Self.story(.paysage, empreinte: Self.empreinteIndigo),
                             photo: photo, sol: .solDeProduction)
        let teinte = avec.pixels.rgb(x: Self.horsCarte.x, y: Self.horsCarte.y)
        let hexAvec = avec.pixels.hex(x: Self.horsCarte.x, y: Self.horsCarte.y)
        let noirAvec = avec.pixels.pixel(Self.horsCarte.x, Self.horsCarte.y,
                                         matches: .black, tolerance: 24)
        avec.pixels.dismount()

        let sans = try mount(story: Self.story(.paysage), photo: photo, sol: .solDeProduction)
        let hexSans = sans.pixels.hex(x: Self.horsCarte.x, y: Self.horsCarte.y)
        let noirSans = sans.pixels.pixel(Self.horsCarte.x, Self.horsCarte.y,
                                         matches: .black, tolerance: 8)
        sans.pixels.dismount()

        XCTAssertFalse(noirAvec,
                       "le sol du lecteur porte la matière de l'empreinte, jamais du noir plat " +
                       "(\(hexAvec))")
        XCTAssertGreaterThan(teinte.b, teinte.r + 24,
                            "et c'est bien l'EMPREINTE : l'aplat encodé est indigo (\(hexAvec))")
        XCTAssertTrue(noirSans,
                      "fusible : sans empreinte, le sol laisse voir le noir de l'hôte — c'est ce " +
                      "qui rend la première assertion capable de tomber (\(hexSans))")
    }

    // MARK: - Les captures du compte rendu

    func test_ecritLesCaptures() throws {
        guard let dossier = ProcessInfo.processInfo.environment["MEESHY_CAPTURE_DIR"], !dossier.isEmpty else {
            throw XCTSkip("captures non demandées — poser TEST_RUNNER_MEESHY_CAPTURE_DIR")
        }
        try FileManager.default.createDirectory(atPath: dossier, withIntermediateDirectories: true)
        let appareil = UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "iphone"
        for orientation in Orientation.allCases {
            do {
                let monte = try mount(story: Self.story(orientation, empreinte: Self.empreinteIndigo),
                                      photo: Self.photo(orientation),
                                      sol: .solDeProduction)
                let format = UIGraphicsImageRendererFormat.default()
                format.opaque = true
                let racine = monte.pixels.root
                let image = UIGraphicsImageRenderer(bounds: racine.bounds, format: format).image { _ in
                    racine.drawHierarchy(in: racine.bounds, afterScreenUpdates: true)
                }
                let chemin = (dossier as NSString)
                    .appendingPathComponent("\(appareil)-\(orientation.rawValue).png")
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

    private func mount(story: StoryItem, photo: UIImage, sol: Sol) throws -> Monte {
        let pret = Pret()
        let taille = UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.screen.bounds.size }.first
            ?? CGSize(width: 402, height: 874)
        let cadrage = Self.cadrage(viewport: taille)
        // Les cotes de la SCÈNE viennent de la loi, comme dans le lecteur — et
        // c'est la forme ENTIÈRE qui va à la carte, fond et rayon compris.
        let forme = SceneShape.layout(in: taille, immersive: false)
        let canvas = forme.sceneFrame.size
        // La zone que le média AJUSTÉ occupe dans le 9:16 — la loi la rend en
        // fractions, et c'est elle qui situe la bande.
        let bande = SceneShape.mediaBand(backgroundAspect: Self.photoSize(.paysage).width
                                            / Self.photoSize(.paysage).height)
        let imageDansCanvas = CGRect(x: bande.minX * canvas.width, y: bande.minY * canvas.height,
                                     width: bande.width * canvas.width, height: bande.height * canvas.height)

        let vue = LecteurHarnais(story: story, photo: photo, cadrage: cadrage,
                                 layout: forme, canvas: canvas, sol: sol,
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
    ///
    /// **Ce double RECOPIE un choix de production**, et c'est sa faiblesse
    /// connue : il ne rougit pas quand le lecteur change d'avis, il DÉRIVE. Son
    /// alignement vient donc de la même loi que le lecteur consulte
    /// (`StageChromeAlignment.verticalAlignment`, #6760) plutôt que d'un
    /// littéral — il portait `.top`, que la directive du 2026-09-15 a
    /// supplanté, et rien ici ne l'aurait signalé.
    private static func cadrage(viewport: CGSize) -> StoryCanvasFraming.Result {
        StoryCanvasFraming.resolve(.init(viewport: viewport,
                                         headerInset: 59 + 72,
                                         bottomInset: 64,
                                         sideInset: 8,
                                         state: .carded,
                                         cardedCornerRadius: SceneShape.cardedCornerRadius,
                                         verticalAlignment: StageChromeAlignment.verticalAlignment(
                                             canvasRatio: CanvasGeometry.portraitRatio),
                                         canvasRatio: CanvasGeometry.portraitRatio))
    }

    private struct LecteurHarnais: View {
        let story: StoryItem
        let photo: UIImage
        let cadrage: StoryCanvasFraming.Result
        /// La FORME que le lecteur remet à sa carte — la même loi, le même
        /// appel (`StoryCardView.readerSceneLayout`).
        let layout: SceneShape.Layout
        let canvas: CGSize
        let sol: Sol
        let onContentReady: () -> Void

        var body: some View {
            GeometryReader { geo in
                ZStack {
                    fond
                    StoryReaderRepresentable(story: story,
                                             preferredContentLanguages: ["fr"],
                                             preloadedImages: ["pm-photo": photo],
                                             isPaused: true,
                                             servesLetterboxFill: false,
                                             onContentReady: onContentReady)
                        .clipped()
                        .readerCard(layout: layout, framing: cadrage, thumbHash: nil)
                        .shadow(color: .black.opacity(sol == .sentinelle ? 0 : 0.4), radius: 20, y: 8)
                    if sol == .solDeProduction, let legende = story.content {
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

        /// **Le fond du harnais : la SENTINELLE, ou le SOL de production.**
        ///
        /// Il recopiait la recette du sol — `blur(radius: 40)` et un voile écrit à
        /// la main — et il avait déjà DÉRIVÉ : la production floutait à 60, pas à
        /// 40. C'est exactement la faiblesse que ce fichier s'avoue pour son
        /// cadrage (« ce double RECOPIE un choix de production »), et le lot #6904
        /// la retire là où il peut : le sol est désormais `SceneFloorView`, la
        /// MÊME vue que le lecteur monte, avec la MÊME empreinte
        /// (`StoryItem.sceneBackdropHash`).
        @ViewBuilder
        private var fond: some View {
            switch sol {
            case .sentinelle:
                StoryReaderCardPixelTests.sentinelle.ignoresSafeArea()
            case .solDeProduction:
                ZStack {
                    // Le noir que le lecteur pose sous son sol pour une slide à
                    // fond média (`storyBackground`) — `SceneFloorView` ne peint
                    // aucun noir inconditionnel, précisément pour laisser voir ce
                    // que l'hôte met dessous.
                    Color.black
                    SceneFloorView(thumbHash: story.sceneBackdropHash,
                                   veil: SceneFloorView.cardedVeil)
                }
                .ignoresSafeArea()
            }
        }
    }

    // MARK: - Les fixtures

    private static func story(_ orientation: Orientation, empreinte: String? = nil) -> StoryItem {
        let taille = photoSize(orientation)
        var effets = StoryEffects()
        effets.thumbHash = empreinte
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

    static func photoSize(_ orientation: Orientation) -> CGSize {
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

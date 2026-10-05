import XCTest
import SwiftUI
@testable import Meeshy

/// #7997 — en Dynamic Type XXXL, la barre d'outils du composer (protections,
/// effets, tonalité, pastille de langue) demandait 493 pt sur un iPhone de
/// 402 pt. Un `HStack` dont les enfants ne se compressent pas rend une largeur
/// PLUS GRANDE que celle qu'on lui propose, et chaque parent non borné la
/// reprend : tout l'écran de conversation était mis en page sur 493 pt puis
/// recentré (bouton joindre à x = −53, ❤️ à x = 419).
///
/// Le témoin mesure la bande par `sizeThatFits` à la largeur de l'appareil :
/// quelle que soit la largeur de son contenu, elle ne doit jamais en rendre
/// davantage.
@MainActor
final class ComposerToolbarStripWidthTests: XCTestCase {

    private let deviceWidth: CGFloat = 402

    private func measuredWidth<V: View>(_ view: V) -> CGFloat {
        let host = UIHostingController(rootView: view)
        return host.sizeThatFits(in: CGSize(width: deviceWidth, height: .greatestFiniteMagnitude)).width
    }

    private func strip(leadingWidth: CGFloat) -> some View {
        ComposerToolbarStrip {
            Color.red.frame(width: leadingWidth, height: 30)
        } pinned: {
            Text("🇫🇷 FR").fixedSize()
        } trailing: {
            Text("480/500")
        }
    }

    /// Fusible : le harnais VOIT un débordement. Sans lui, une mesure qui
    /// rendrait toujours la largeur proposée passerait pour une preuve.
    func test_harness_seesAnUnboundedRowOverflow() {
        let row = HStack(spacing: 6) {
            Color.red.frame(width: 600, height: 30)
            Spacer()
        }
        XCTAssertGreaterThan(measuredWidth(row), deviceWidth)
    }

    func test_strip_widerContent_neverExceedsTheProposedWidth() {
        XCTAssertLessThanOrEqual(measuredWidth(strip(leadingWidth: 600)), deviceWidth)
    }

    func test_strip_narrowContent_stillFillsTheRow() {
        XCTAssertEqual(measuredWidth(strip(leadingWidth: 120)), deviceWidth, accuracy: 0.5)
    }

    /// La barre réelle passe par la bande — sinon le témoin ci-dessus
    /// garderait un composant que personne n'utilise.
    func test_topToolbar_isBuiltOnTheStrip() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/UniversalComposerBar+Toolbar.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        guard let start = code.range(of: "var topToolbar: some View {") else {
            return XCTFail("topToolbar introuvable")
        }
        let body = code[start.upperBound...].prefix(200)
        XCTAssertTrue(body.contains("ComposerToolbarStrip"),
                      "topToolbar doit être posé dans ComposerToolbarStrip (#7997)")
    }
}

/// #9082 — directive porteur 2026-10-02 : la caméra se pose à l'angle droit du
/// verre, juste avant le ⌄ ; le sticker prend la place de l'indicateur de
/// tonalité. Chaque porte n'existe que si l'hôte sait l'ouvrir (loi 4).
final class ComposerGlassDoorsTests: XCTestCase {

    func test_trailing_cameraSitsJustBeforeTheFold() {
        XCTAssertEqual(ComposerGlassDoors.trailing(offersLibrary: false, offersCamera: true, offersFold: true), [.camera, .fold])
    }

    func test_trailing_withoutCameraHost_keepsOnlyTheFold() {
        XCTAssertEqual(ComposerGlassDoors.trailing(offersLibrary: false, offersCamera: false, offersFold: true), [.fold])
        XCTAssertEqual(ComposerGlassDoors.trailing(offersLibrary: false, offersCamera: true, offersFold: false), [.camera])
        XCTAssertEqual(ComposerGlassDoors.trailing(offersLibrary: false, offersCamera: false, offersFold: false), [])
    }

    /// #9120 — la photothèque (images ET vidéos) se pose À CÔTÉ de la caméra.
    func test_trailing_librarySitsJustBeforeTheCamera() {
        XCTAssertEqual(ComposerGlassDoors.trailing(offersLibrary: true, offersCamera: true, offersFold: true), [.library, .camera, .fold])
        XCTAssertEqual(ComposerGlassDoors.trailing(offersLibrary: true, offersCamera: false, offersFold: false), [.library])
    }

    func test_toolbar_libraryDoorOpensThePhotoLibrary() throws {
        let toolbar = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Components/UniversalComposerBar+Toolbar.swift"),
            encoding: .utf8)
        XCTAssertTrue(toolbar.contains("offersLibrary: onPhotoLibrary != nil"), "La porte n'existe que si l'hôte sait ouvrir la photothèque.")
        XCTAssertTrue(toolbar.contains("case .library:"), "La bande rend la porte photothèque.")
    }

    func test_toolbar_stickerReplacesTheMoodIndicator() throws {
        let toolbar = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Components/UniversalComposerBar+Toolbar.swift"),
            encoding: .utf8)
        XCTAssertFalse(toolbar.contains("textAnalyzer.sentiment"), "L'indicateur d'humeur quitte la barre d'outils.")
        XCTAssertTrue(toolbar.contains("onRequestStickerPicker"), "Le sticker ouvre le sélecteur de stickers.")
        XCTAssertTrue(toolbar.contains("ComposerGlassDoors.trailing("), "L'angle droit consulte la loi.")
    }
    private func source(_ name: String) throws -> String {
        try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Components/\(name)"),
            encoding: .utf8)
    }

    func test_glassDoors_glyphWeight_isRegular() {
        XCTAssertEqual(ComposerGlassDoors.glyphWeight, .regular)
    }

    func test_toolbar_doorsDrawWithTheSharedGlyphWeight() throws {
        let toolbar = try source("UniversalComposerBar+Toolbar.swift")
        XCTAssertTrue(toolbar.contains(".font(.callout.weight(ComposerGlassDoors.glyphWeight))"), "Les portes de verre prennent le trait des icônes de gauche.")
        XCTAssertFalse(toolbar.contains(".font(.callout.weight(.semibold))"), "Plus de trait semibold sur les portes de verre.")
    }

    func test_attachCarousel_doesNotRepeatTheGlassDoors() throws {
        let attachments = try source("UniversalComposerBar+Attachments.swift")
        XCTAssertFalse(attachments.contains("id: \"camera\""), "La caméra vit dans la barre, plus dans le (+).")
        XCTAssertFalse(attachments.contains("id: \"sticker\""), "Le sticker vit dans la barre, plus dans le (+).")
    }
}

/// #9254 — **la langue d'écriture se lit ENTIÈRE dans la barre du composeur**,
/// sur un iPhone de 402 pt comme sur un iPhone SE (375 pt).
///
/// Le web a mesuré, à 390 px, une pastille de langue dont on ne voyait que
/// 30 px sur 72 : dernière de la bande d'outils DÉFILANTE, elle passait sous
/// les portes de droite sans que rien ne signale le défilement (#9251, D-164).
/// iOS posait la même pastille au même rang — en dernier dans
/// `ComposerToolbarStrip`.
///
/// Le témoin monte la VRAIE barre, câblée comme la conversation (photothèque,
/// caméra, sticker), dans une fenêtre réelle, et lit ce que VoiceOver lit : le
/// cadre de la pastille et celui de la première porte de droite. Deux mesures
/// font la propriété :
/// - la pastille est AVANT les portes et dans l'écran — rien ne la recouvre ;
/// - elle a la MÊME largeur qu'à 1 024 pt, où tout tient — rien ne la rogne.
///
/// Les protections ACTIVES (flou, vue unique) allongent leurs capsules d'un
/// libellé : c'est l'état où la rangée déborde le plus, et le cas d'usage
/// nominal d'un message protégé.
@MainActor
final class ComposerLanguagePillReachTests: XCTestCase {

    private var screens: [RenderedScreen] = []

    override func tearDown() {
        screens.forEach { $0.dismount() }
        screens = []
        super.tearDown()
    }

    private static var pillLabel: String {
        String(localized: "a11y.composer.language", defaultValue: "Langue du message", bundle: .main)
    }

    private static var photosLabel: String {
        String(localized: "composer.attach.photo", defaultValue: "Photos", bundle: .main)
    }

    private struct Harness: View {
        let width: CGFloat
        let protectionsActive: Bool

        var body: some View {
            VStack {
                Spacer()
                UniversalComposerBar(
                    style: .light,
                    mode: .message,
                    selectedLanguage: "fr",
                    onStartRecording: {},
                    onStopRecordingToAttachment: {},
                    onSendRecording: {},
                    onCancelRecording: {},
                    externalIsRecording: false,
                    externalRecordingDuration: 0,
                    onPhotoLibrary: {},
                    onCamera: {},
                    onRequestStickerPicker: {},
                    isBlurEnabled: .constant(protectionsActive),
                    isViewOnceEnabled: .constant(protectionsActive)
                )
            }
            .frame(width: width, height: 874)
        }
    }

    private struct Reach {
        let pill: CGRect
        let firstDoor: CGRect
    }

    private func measure(width: CGFloat, protectionsActive: Bool) throws -> Reach {
        let screen = RenderedScreen(Harness(width: width, protectionsActive: protectionsActive),
                                    size: CGSize(width: width, height: 874))
        screens.append(screen)
        let pill = try XCTUnwrap(posed(Self.pillLabel, in: screen),
                                 "Pastille de langue introuvable à \(width) pt — libellés : \(screen.labels)")
        let door = try XCTUnwrap(posed(Self.photosLabel, in: screen),
                                 "Porte photothèque introuvable à \(width) pt — libellés : \(screen.labels)")
        return Reach(pill: pill, firstDoor: door)
    }

    /// Le cadre ANNONCÉ du premier nœud posé sous ce libellé, attendu jusqu'à
    /// ce que SwiftUI l'ait posé — une barre fraîchement montée s'anime.
    private func posed(_ label: String, in screen: RenderedScreen, borne: TimeInterval = 10) -> CGRect? {
        let deadline = Date().addingTimeInterval(borne)
        while Date() < deadline {
            if let frame = screen.frame(labeledPrefix: label) { return frame }
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        }
        return screen.frame(labeledPrefix: label)
    }

    private func assertPillReadsWhole(width: CGFloat, protectionsActive: Bool,
                                      file: StaticString = #filePath, line: UInt = #line) throws {
        let wide = try measure(width: 1024, protectionsActive: protectionsActive)
        let reach = try measure(width: width, protectionsActive: protectionsActive)
        let state = protectionsActive ? "flou + vue unique actifs" : "aucune protection"
        let figures = """
        \(Int(width)) pt (\(state)) : pastille x \(reach.pill.minX)→\(reach.pill.maxX) \
        (largeur \(reach.pill.width), entière \(wide.pill.width)), première porte à x \(reach.firstDoor.minX)
        """
        print("MESURE #9254 — \(figures)")

        XCTAssertGreaterThanOrEqual(reach.pill.minX, 0, "La pastille sort de l'écran — \(figures)",
                                    file: file, line: line)
        XCTAssertLessThanOrEqual(reach.pill.maxX, reach.firstDoor.minX + 0.5,
                                 "La pastille passe sous les portes de droite — \(figures)",
                                 file: file, line: line)
        XCTAssertEqual(reach.pill.width, wide.pill.width, accuracy: 0.5,
                       "La pastille est rognée — \(figures)", file: file, line: line)
    }

    func test_pill_readsWhole_at402() throws {
        try assertPillReadsWhole(width: 402, protectionsActive: false)
    }

    func test_pill_readsWhole_at375() throws {
        try assertPillReadsWhole(width: 375, protectionsActive: false)
    }

    func test_pill_readsWhole_at402_withProtectionsActive() throws {
        try assertPillReadsWhole(width: 402, protectionsActive: true)
    }

    func test_pill_readsWhole_at375_withProtectionsActive() throws {
        try assertPillReadsWhole(width: 375, protectionsActive: true)
    }
}

/// #9254 — la loi du fondu de débordement, jumelle de `useScrollsFurtherMark`
/// (web, D-164) : allumé tant qu'un outil reste au-delà du bord de fin, éteint
/// quand tout tient ou que la bande est défilée jusqu'au bout.
final class ComposerToolbarOverflowTests: XCTestCase {

    func test_fade_isOneTarget() {
        XCTAssertEqual(ComposerToolbarOverflow.fadeWidth, 44)
    }

    func test_scrollsFurther_whenToolsRunPastTheEdge() {
        XCTAssertTrue(ComposerToolbarOverflow.scrollsFurther(offset: 0, contentWidth: 250, viewportWidth: 180))
        XCTAssertTrue(ComposerToolbarOverflow.scrollsFurther(offset: 40, contentWidth: 250, viewportWidth: 180))
    }

    func test_scrollsFurther_offOnceScrolledToTheEnd() {
        XCTAssertFalse(ComposerToolbarOverflow.scrollsFurther(offset: 70, contentWidth: 250, viewportWidth: 180))
    }

    /// Une convention de signe miroir (arabe, hébreu) ne rallume pas le fondu
    /// au bout de la bande.
    func test_scrollsFurther_readsTheOffsetMagnitude() {
        XCTAssertFalse(ComposerToolbarOverflow.scrollsFurther(offset: -70, contentWidth: 250, viewportWidth: 180))
    }

    func test_scrollsFurther_offWhenEverythingFits() {
        XCTAssertFalse(ComposerToolbarOverflow.scrollsFurther(offset: 0, contentWidth: 150, viewportWidth: 180))
    }

    func test_scrollsFurther_offBeforeTheViewportIsMeasured() {
        XCTAssertFalse(ComposerToolbarOverflow.scrollsFurther(offset: 0, contentWidth: 250, viewportWidth: 0))
    }
}

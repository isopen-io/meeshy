import XCTest
@testable import Meeshy

/// La galerie plein écran freezait au défilement, et le ralentissement
/// s'AGGRAVAIT avec le nombre de médias traversés.
///
/// Ce que ces tests tiennent, ce sont les deux règles qui bornent son coût —
/// la fenêtre de rendu et la géométrie de la pellicule — plus le contrat de
/// structure sans lequel elles ne servent à rien : de l'état de transformation
/// à la racine re-rend TOUTES les pages réalisées, quelle que soit la fenêtre.
///
/// Une garde de source y est nécessaire pour la partie structurelle : un
/// ralentissement ne se lit sur aucune valeur de retour, et un `@State` remonté
/// à la racine par mégarde recompile, s'exécute et se voit correct.
@MainActor
final class ConversationMediaGalleryScrollTests: XCTestCase {

    // MARK: - Fenêtre de rendu

    func test_renderWindow_keepsTheVisiblePageAndItsTwoNeighboursFullPixel() {
        XCTAssertTrue(GalleryRenderWindow.rendersFullPixels(distance: 0))
        XCTAssertTrue(GalleryRenderWindow.rendersFullPixels(distance: 1))
        XCTAssertTrue(GalleryRenderWindow.rendersFullPixels(distance: -1))
    }

    /// LE test du correctif : au-delà des voisines immédiates, une page ne
    /// décode plus le média plein format. Sans cette borne, chaque swipe
    /// laissait derrière lui une image plein format vivante de plus.
    func test_renderWindow_dropsFullPixelsBeyondTheImmediateNeighbours() {
        XCTAssertFalse(GalleryRenderWindow.rendersFullPixels(distance: 2))
        XCTAssertFalse(GalleryRenderWindow.rendersFullPixels(distance: -2))
        XCTAssertFalse(GalleryRenderWindow.rendersFullPixels(distance: 40))
    }

    /// Le préchauffage ne déborde JAMAIS la fenêtre : préchauffer une page que
    /// la fenêtre refuse de rendre décode pour personne.
    func test_prefetchRange_neverReachesBeyondWhatTheWindowRenders() throws {
        let range = try XCTUnwrap(GalleryRenderWindow.prefetchRange(around: 10, count: 50))
        XCTAssertEqual(range.lowerBound, 9)
        XCTAssertEqual(range.upperBound, 11)

        for index in range {
            XCTAssertTrue(
                GalleryRenderWindow.rendersFullPixels(distance: index - 10),
                "la page \(index) est préchauffée mais hors fenêtre de rendu"
            )
        }
    }

    func test_prefetchRange_clampsAtBothEnds() {
        XCTAssertEqual(GalleryRenderWindow.prefetchRange(around: 0, count: 3)?.lowerBound, 0)
        XCTAssertEqual(GalleryRenderWindow.prefetchRange(around: 0, count: 3)?.upperBound, 1)
        XCTAssertEqual(GalleryRenderWindow.prefetchRange(around: 2, count: 3)?.lowerBound, 1)
        XCTAssertEqual(GalleryRenderWindow.prefetchRange(around: 2, count: 3)?.upperBound, 2)
    }

    func test_prefetchRange_onAnEmptyOrOutOfBoundsGallery_isNil() {
        XCTAssertNil(GalleryRenderWindow.prefetchRange(around: 0, count: 0))
        XCTAssertNil(GalleryRenderWindow.prefetchRange(around: 5, count: 3))
        XCTAssertNil(GalleryRenderWindow.prefetchRange(around: -1, count: 3))
    }

    // MARK: - Géométrie de la pellicule

    private static let widths: [CGFloat] = [320, 375, 390, 430, 744, 1024]

    /// La règle produit : le média le plus à DROITE de la pellicule est celui
    /// affiché en plein écran. Elle ne tient que si la marge de tête laisse le
    /// PREMIER média atteindre ce bord — sinon les premiers médias de la
    /// conversation ne sont jamais sélectionnables par défilement.
    func test_leadingInset_letsTheFirstMediaReachThePlayhead() {
        for width in Self.widths {
            let inset = FilmstripMetrics.leadingInset(containerWidth: width)
            XCTAssertEqual(
                inset + FilmstripMetrics.itemSide + FilmstripMetrics.trailingInset,
                width,
                accuracy: 0.001,
                "à \(width)pt, le premier média ne se pose pas exactement sous la tête de lecture"
            )
        }
    }

    /// L'invariant qui fait tenir les DEUX ancrages ensemble : le décalage qui
    /// pose un média sous la tête de lecture est un multiple exact du pas, donc
    /// un point d'arrêt du `viewAligned`. Sans cela la bande s'immobiliserait
    /// entre deux médias et le « plus à droite » deviendrait ambigu.
    func test_everyPlayheadOffset_isASnapPointOfTheGrid() {
        for index in 0..<25 {
            let offset = FilmstripMetrics.scrollOffset(forIndex: index)
            XCTAssertEqual(
                offset.truncatingRemainder(dividingBy: FilmstripMetrics.stride),
                0,
                accuracy: 0.001
            )
            XCTAssertEqual(
                FilmstripMetrics.indexAtPlayhead(scrollOffset: offset, count: 25),
                index
            )
        }
    }

    /// En BUTÉE de fin, le dernier média doit se trouver sous la tête de
    /// lecture — pas coupé, pas approché. C'est la même arithmétique que
    /// ci-dessus vue depuis l'autre extrémité, et c'est elle qui casserait en
    /// premier si l'on retouchait une marge sans retoucher l'autre.
    func test_maxScrollOffset_landsExactlyOnTheLastMedia() {
        for width in Self.widths {
            for count in [1, 2, 7, 43] {
                XCTAssertEqual(
                    FilmstripMetrics.maxScrollOffset(count: count, containerWidth: width),
                    FilmstripMetrics.scrollOffset(forIndex: count - 1),
                    accuracy: 0.001,
                    "à \(width)pt avec \(count) médias, la fin de bande n'est pas un point d'arrêt"
                )
            }
        }
    }

    func test_indexAtPlayhead_clampsInsideTheGallery() {
        XCTAssertEqual(FilmstripMetrics.indexAtPlayhead(scrollOffset: -500, count: 4), 0)
        XCTAssertEqual(FilmstripMetrics.indexAtPlayhead(scrollOffset: 99_999, count: 4), 3)
        XCTAssertEqual(FilmstripMetrics.indexAtPlayhead(scrollOffset: 0, count: 0), 0)
    }

    // MARK: - Contrat de structure

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private static let gallery = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"
    private static let filmstrip = "Meeshy/Features/Main/Views/ConversationMediaFilmstrip.swift"

    /// La cause première du freeze : `scale` / `offset` vivaient sur la vue
    /// RACINE. Un pincement ou un glissement les réécrit à la fréquence
    /// d'affichage, donc invalidait la racine — donc le pager — donc chaque
    /// page réalisée, à chaque frame. La transformation appartient à la page.
    /// **Cette garde-ci lit le FICHIER, pas l'unité — et c'est délibéré.**
    ///
    /// Ses sœurs ont été repointées sur `AppSourceGuard.unit` au #4014, parce
    /// qu'elles cherchent la PRÉSENCE de quelque chose et qu'une découpe ne doit
    /// pas la leur faire perdre. Celle-ci porte sur le LIEU : « la
    /// transformation n'est pas à la racine ». L'unité concatène la racine et
    /// les pages — donc elle EFFACE exactement la distinction que ce témoin
    /// mesure, et le rend rouge sur un code juste.
    ///
    /// La découpe l'a d'ailleurs simplifié : `ConversationMediaGalleryView.swift`
    /// ne contient plus QUE la racine, si bien que les deux ancres qui bornaient
    /// la région (`struct … View {` → `enum GalleryRenderWindow {`, cette
    /// seconde ayant déménagé) n'ont plus lieu d'être. Le fichier EST la région.
    func test_transformState_livesOnThePage_neverOnTheGalleryRoot() throws {
        let root = AppSourceGuard.stripComments(try source(Self.gallery))
        XCTAssertTrue(root.contains("struct ConversationMediaGalleryView: View {"),
                      "le fichier racine ne porte plus la racine — le témoin doit être repointé")
        XCTAssertFalse(root.contains("struct GalleryImagePage"),
                       "les pages sont revenues dans le fichier racine : la région n'est plus la racine seule")

        for banned in ["@State private var scale", "@State private var offset"] {
            XCTAssertFalse(
                root.contains(banned),
                "`\(banned)` de retour à la racine : un geste y re-rend toutes les pages réalisées."
            )
        }
    }

    /// Une page qui n'est pas comparable est re-rendue à chaque réévaluation de
    /// la racine, fenêtre ou pas. `.equatable()` est ce qui transforme la
    /// comparaison en économie réelle.
    func test_bothPageKinds_areEquatable_andMountedAsSuch() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.gallery))

        XCTAssertTrue(code.contains("struct GalleryImagePage: View, Equatable"))
        XCTAssertTrue(code.contains("struct GalleryVideoPage: View, Equatable"))
        XCTAssertEqual(
            code.components(separatedBy: ".equatable()").count - 1, 2,
            "les deux types de page doivent être montés en .equatable() — et eux seuls."
        )
    }

    /// Hors fenêtre, une page vidéo ne doit RIEN entreprendre : ni résolution
    /// de disponibilité, ni auto-téléchargement. Sans cette porte, traverser
    /// une conversation de vingt vidéos en lançait vingt.
    func test_videoPage_doesNoWorkOutsideTheRenderWindow() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.gallery))
        guard let taskStart = code.range(of: ".task(id: \"\\(attachment.id)#\\(isWindowed)\")") else {
            XCTFail("la tâche de la page vidéo doit être re-jouée quand la page entre dans la fenêtre")
            return
        }
        let tail = code[taskStart.upperBound...].prefix(160)
        XCTAssertTrue(
            tail.contains("guard isWindowed else { return }"),
            "la tâche doit sortir immédiatement hors fenêtre, avant toute résolution ou téléchargement."
        )
    }

    /// La pellicule est montée SOUS les détails de l'auteur, et seulement quand
    /// il y a plus d'un média à parcourir.
    func test_filmstrip_isMountedBelowTheAuthorRow_whenThereIsMoreThanOneMedium() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.gallery))
        guard let start = code.range(of: "private var bottomOverlay") else {
            XCTFail("bottomOverlay introuvable"); return
        }
        let body = String(code[start.lowerBound...].prefix(900))

        guard let author = body.range(of: "bottomMetadataOverlay(att)"),
              let strip = body.range(of: "ConversationMediaFilmstrip(")
        else {
            XCTFail("la pellicule doit être montée dans le bloc bas, sous la rangée auteur"); return
        }
        XCTAssertTrue(
            author.upperBound < strip.lowerBound,
            "la pellicule doit venir APRÈS les détails de l'auteur, pas au-dessus."
        )
        XCTAssertTrue(
            body.contains("if allAttachments.count > 1 {"),
            "un média seul n'a pas de pellicule à parcourir."
        )
    }

    /// La bande lit la fenêtre de l'app, jamais l'affichage : sous Split View
    /// une marge dérivée de l'écran décalerait la tête de lecture hors cadre.
    func test_filmstrip_measuresTheWindow_notTheDisplay() throws {
        let code = AppSourceGuard.stripComments(try source(Self.filmstrip))
        XCTAssertFalse(code.contains("UIScreen.main"))
        XCTAssertTrue(code.contains("DeviceLayout.windowSize"))
    }
}

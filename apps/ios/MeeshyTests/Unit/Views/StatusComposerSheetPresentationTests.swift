import XCTest
@testable import Meeshy

/// The mood composer is presented as a detented sheet from four separate entry
/// points. Two properties have to hold at every one of them, and neither is
/// expressible from inside the composer itself:
///
/// 1. **The sheet can grow.** The composer's labels scale with Dynamic Type while
///    its emoji grid is pinned to fixed 56pt cells, so at accessibility text sizes
///    the content outgrows the `.medium` detent. A `[.medium]`-only sheet has
///    nowhere to grow to, which strands the text field and the mood question below
///    the fold.
/// 2. **The resize gesture is discoverable.** A drag indicator is the only visible
///    affordance telling the user the sheet is resizable at all.
///
/// The composer's own side of the contract — a scroll container, so content is
/// never clipped outright, and interactive keyboard dismissal, so the keyboard
/// cannot permanently cover the sheet — is asserted here too, since the three
/// properties only add up to a usable sheet together.
@MainActor
final class StatusComposerSheetPresentationTests: XCTestCase {

    /// `apps/ios/` — four levels up from `MeeshyTests/Unit/Views/<this file>`.
    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    /// Drops `//` line comments so an assertion about *code* is not satisfied — or
    /// defeated — by a comment that merely names the construct it forbids.
    private func code(_ relativePath: String) throws -> String {
        try source(relativePath)
            .components(separatedBy: "\n")
            .map { line -> Substring in
                guard let comment = line.range(of: "//") else { return line[...] }
                return line[..<comment.lowerBound]
            }
            .joined(separator: "\n")
    }

    /// **RE-VISÉ au lot 4.6.** Les quatre feuilles montaient
    /// `StatusComposerView` ; elles montent désormais `MoodComposerDoor`, qui
    /// ouvre le meuble sur `ComposerMoodSurface`. Les trois propriétés
    /// ci-dessous appartiennent à la vue qui SCROLLE, et c'est elle : le laisser
    /// pointer l'écran historique aurait gardé trois tests verts sur un fichier
    /// que plus aucune feuille ne présente — le mode d'extinction silencieuse
    /// que cette suite existe pour fuir.
    ///
    /// La tâche 4.8 a retiré `StatusComposerView.swift` (vérifié 2026-08-25 :
    /// le fichier n'existe plus). `SheetToolbarSemanticsTests`,
    /// `StatusComposerAccessibilityTests` et `NavigationContainerMigrationTests`
    /// ont été re-visées sur la même surface, `ComposerMoodSurface.swift`.
    private let composerPath = "Meeshy/Features/Main/Composer/ComposerMoodSurface.swift"

    // MARK: - The composer's own side of the contract

    func test_composer_hostsContentInAScrollView() throws {
        let swift = try code(composerPath)
        XCTAssertTrue(
            swift.contains("ScrollView {"),
            "ComposerMoodSurface must host its stack in a ScrollView: the emoji grid uses fixed " +
            "56pt cells while every surrounding label scales with Dynamic Type, so at " +
            "accessibility sizes the content exceeds the .medium detent and would be clipped " +
            "with no gesture left to reach the text field."
        )
    }

    func test_composer_dismissesKeyboardOnScroll() throws {
        let swift = try code(composerPath)
        XCTAssertTrue(
            swift.contains(".scrollDismissesKeyboard(.interactively)"),
            "The composer's text field sits at the bottom of a medium-detent sheet, where the " +
            "keyboard covers most of the content. Interactive dismissal is the native way out " +
            "and is the pattern already used by the onboarding and search scroll views."
        )
    }

    func test_composer_containsNoDeadSpacer() throws {
        // Every stack in this file now lives inside the vertical ScrollView, where a
        // spacer is proposed unbounded height and resolves to zero. Keeping one would
        // express layout intent the container cannot honour — it reads as deliberate
        // bottom padding that does not exist.
        //
        // The literal is `Spacer()` — bare, unbounded — and not the word: the mood
        // surface's header row ends on `Spacer(minLength: 0)`, a HORIZONTAL spacer
        // inside an HStack that pushes the title left. That one has an object; the
        // vertical, unbounded one does not.
        let swift = try code(composerPath)
        XCTAssertFalse(
            swift.contains("Spacer()"),
            "A Spacer() inside the composer's vertical ScrollView resolves to zero height. " +
            "Use explicit padding if bottom spacing is wanted."
        )
    }

    // MARK: - Every presentation site

    /// Files that present `StatusComposerView` in a sheet, and the modifiers that
    /// follow each presentation.
    private struct PresentationSite {
        let file: String
        let line: Int
        let modifiers: String
    }

    /// Modifiers are chained on the lines immediately following the initializer, so
    /// a bounded look-ahead captures them without parsing Swift. The window is
    /// generous enough to clear the widest call site (six labelled arguments).
    /// Les quatre feuilles, nommées. La liste est ADDITIVE : en retirer une
    /// entrée sans la remplacer perd une présentation de la mesure, en silence.
    private static let presentationFiles = [
        "Meeshy/Features/Main/Views/RootView.swift",
        "Meeshy/Features/Main/Views/iPadRootView.swift",
        "Meeshy/Features/Main/Views/RootViewComponents.swift",
        "Meeshy/Features/Main/Views/ConversationListView.swift",
    ]

    private func presentationSites() throws -> [PresentationSite] {
        // `RootView` et `iPadRootView` présentent le composer pré-rempli
        // (republication depuis la bulle de mood) : cet état, mort dans
        // `ConversationListView`, a remonté aux racines de fenêtre avec l'hôte
        // unique de la bulle (2026-07-30). Sans ces deux fichiers ici, deux
        // présentations sur quatre n'étaient plus couvertes du tout.
        //
        // **Lot 4.6 — le montage a changé de NOM, pas de nature.** Les quatre
        // feuilles montent `MoodComposerDoor`, la porte app-side qui ouvre
        // `MeeshyComposerHost` sur la surface du mood. Chercher encore
        // `StatusComposerView(` aurait rendu ce tableau VIDE, et les deux tests
        // qui itèrent ci-dessous seraient passés au vert en ne mesurant plus
        // rien — c'est précisément ce que leur garde-fou « au moins un site »
        // interdit désormais.
        var sites: [PresentationSite] = []
        for file in Self.presentationFiles {
            let lines = try code(file).components(separatedBy: "\n")
            for (index, line) in lines.enumerated() where line.contains("MoodComposerDoor(") {
                let window = lines[index..<min(index + 20, lines.count)].joined(separator: "\n")
                sites.append(PresentationSite(file: file, line: index + 1, modifiers: window))
            }
        }
        return sites
    }

    func test_allFourEntryPointsAreDiscovered() throws {
        // Guards the look-ahead itself: if a call site is renamed or added and this
        // count is not revisited, the two assertions below would silently stop
        // covering it. C'est un `XCTAssertEqual(…, 4)` : zéro site le fait ROUGIR,
        // pas verdir — il n'a besoin d'aucun renfort.
        XCTAssertEqual(
            try presentationSites().count, 4,
            "Expected exactly four MoodComposerDoor presentations (one in RootView, one in " +
            "iPadRootView, one in RootViewComponents, one in ConversationListView). Update this " +
            "suite when an entry point is added."
        )
    }

    /// **Le recâblage du lot 4.6, gardé du bon côté.** Les quatre feuilles ne
    /// montent plus l'écran historique. Sans cette garde, un retour en arrière
    /// sur une seule d'entre elles laisserait le compte ci-dessus à quatre —
    /// trois portes sur le meuble, une sur sa feuille — et personne ne le dirait.
    func test_noEntryPointStillMountsTheLegacyComposer() throws {
        for file in Self.presentationFiles {
            let swift = try code(file)
            XCTAssertTrue(
                swift.contains("MoodComposerDoor("),
                "\(file) ne présente plus le composer de mood — la garde ne mesurerait RIEN."
            )
            XCTAssertFalse(
                swift.contains("StatusComposerView("),
                "\(file) monte encore `StatusComposerView` : le lot 4.6 a fait passer les six déclencheurs " +
                "du mood par le meuble, et y revenir perdrait le socle, la règle de surface et le gate de matière."
            )
        }
    }

    /// **Chaque présentation donne à la porte ce qu'elle sait, et rien de plus.**
    ///
    /// Les deux racines de fenêtre republient : elles SÈMENT. Les deux autres
    /// créent : elles ne sèment rien, et c'est cette absence — et elle seule —
    /// qui autorise la reprise hors-ligne. Un site de republication qui perdrait
    /// sa graine ouvrirait un mood NEUF sans bandeau ni `repostOfId` ; un site de
    /// création qui en poserait une ferait taire la reprise. Les deux échecs sont
    /// silencieux, et aucun compilateur ne les voit.
    func test_everyPresentationSeedsWhatItKnows_andNothingElse() throws {
        let republication = [
            "Meeshy/Features/Main/Views/RootView.swift",
            "Meeshy/Features/Main/Views/iPadRootView.swift",
        ]
        for file in republication {
            let swift = try code(file)
            XCTAssertTrue(
                swift.contains("sourceFormat: .status"),
                "\(file) doit PORTER le format de la republication : une entrée de bulle de mood est un statut " +
                "par construction, et le deviner ouvrirait le mauvais composer."
            )
            XCTAssertTrue(
                swift.contains("ComposerMoodSeed("),
                "\(file) republie sans graine : le composer s'ouvrirait vide, sans bandeau « Status de @X », " +
                "et le mood publié serait une création — pas un repartage."
            )
        }

        let creation = [
            "Meeshy/Features/Main/Views/RootViewComponents.swift",
            "Meeshy/Features/Main/Views/ConversationListView.swift",
        ]
        for file in creation {
            let swift = try code(file)
            XCTAssertTrue(
                swift.contains("origin: .moodChip"),
                "\(file) doit ouvrir la porte du mood — c'est elle qui décide de la surface montée."
            )
            XCTAssertTrue(
                swift.contains("seed: nil"),
                "\(file) sème quelque chose sur une CRÉATION : `MoodComposerDoor` ne reprend le mood bloqué " +
                "hors ligne que si rien n'est semé, exactement comme l'écran historique."
            )
        }
    }

    func test_everyPresentationOffersTheLargeDetent() throws {
        let sites = try presentationSites()
        // Le garde-fou des DEUX tests qui ITÈRENT : `for site in []` ne lève
        // aucune assertion. Le jour du retrait (tâche 4.8) ou d'un renommage de
        // montage, ils passeraient au vert en ayant perdu leur objet — le mode
        // d'extinction silencieuse propre aux gardes négatives.
        XCTAssertFalse(sites.isEmpty, "Aucune présentation trouvée — cette garde ne mesurerait RIEN.")

        for site in sites {
            guard let detents = site.modifiers.range(of: "presentationDetents(") else {
                XCTFail("\(site.file):\(site.line) presents the composer without any detent.")
                continue
            }
            let declaration = site.modifiers[detents.upperBound...].prefix(while: { $0 != "\n" })
            XCTAssertTrue(
                declaration.contains(".medium") && declaration.contains(".large"),
                "\(site.file):\(site.line) must offer [.medium, .large]: at accessibility text " +
                "sizes the composer outgrows .medium, and a single-detent sheet gives the user " +
                "nowhere to grow to. Found: \(declaration)"
            )
        }
    }

    func test_everyPresentationShowsTheDragIndicator() throws {
        let sites = try presentationSites()
        XCTAssertFalse(sites.isEmpty, "Aucune présentation trouvée — cette garde ne mesurerait RIEN.")

        for site in sites {
            XCTAssertTrue(
                site.modifiers.contains("presentationDragIndicator(.visible)"),
                "\(site.file):\(site.line) must show the drag indicator — it is the only visible " +
                "affordance that the sheet can be resized to reach content below the fold."
            )
        }
    }
}

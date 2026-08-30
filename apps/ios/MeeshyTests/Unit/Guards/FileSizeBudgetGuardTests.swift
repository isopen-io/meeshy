import XCTest

/// **Un budget déclaré trois fois et mesuré nulle part ne protège rien.**
///
/// La directive 2026-08-28 pose 800–1100 lignes par fichier et une règle stricte :
/// « Ajouter à un fichier déjà hors budget est interdit : on extrait d'abord, on
/// ajoute ensuite. » Elle est répétée dans le `CLAUDE.md` racine et repris par les
/// `CLAUDE.md` de répertoire — **et aucun test ne la mesurait** (#4302).
///
/// Ce qui a rendu le manque visible : les itérations 257i et 259i ont ajouté des
/// lignes à CINQ fichiers déjà hors budget sans que rien ne le signale, ni à la
/// relecture, ni en CI. Les ajouts étaient minuscules et localisés, et extraire un
/// contrôleur de 3568 lignes pour y poser six lignes aurait été plus risqué que
/// l'ajout — mais **personne ne pouvait constater l'écart**, et c'est cela le
/// défaut.
///
/// C'est la forme de #4292 (le cliquet i18n épinglé à 1545 pour un backlog réel de
/// 102) : une règle dont la mesure n'existe pas, ou a cessé de mordre, ne protège
/// plus rien. Ici il n'y avait même pas de cliquet à re-piquer.
///
/// ### Trois nombres plutôt que 42 plafonds
///
/// Un plafond par fichier interdirait la croissance mais rougirait dès qu'un
/// fichier légitimement DÉCOUPÉ fait disparaître son nom. Les trois règles
/// ci-dessous obtiennent le même effet en laissant la découpe passer : le cumul
/// (règle 3) empêche la croissance interne, la liste (règle 2) ne peut que
/// rétrécir, et le plafond dur (règle 1) interdit le 43ᵉ.
final class FileSizeBudgetGuardTests: XCTestCase {

    /// Le budget de la directive. Un fichier neuf n'a aucune raison de le dépasser.
    private static let budget = 1100

    /// **Dette héritée, mesurée au 261i.** Cette liste ne s'ALLONGE jamais : un
    /// fichier qui la quitte (découpé, ou redescendu sous le budget) en sort pour
    /// toujours. Chaque découpe est un lot à elle seule — `CallManager.swift`
    /// (6462 lignes) n'est pas un lot d'UI/UX.
    private static let legacyOverBudget: Set<String> = [
        "AudioFullscreenView.swift",
        "BubbleStandardLayout.swift",
        "CallManager.swift",
        "CallView.swift",
        "ComposerMoodSurface.swift",
        "ConversationDashboardView.swift",
        "ConversationInfoSheet.swift",
        "ConversationListView+Overlays.swift",
        "ConversationListView.swift",
        "ConversationListViewModel.swift",
        "ConversationMediaGalleryView.swift",
        "ConversationMediaViews.swift",
        "ConversationSocketHandler.swift",
        "ConversationView.swift",
        "ConversationViewModel.swift",
        "FeedCommentsSheet.swift",
        "FeedPostCard.swift",
        "FeedView+Attachments.swift",
        "FeedView.swift",
        "FeedViewModel.swift",
        "MeeshyApp.swift",
        "MessageListViewController.swift",
        "MessageOverlayMenu.swift",
        "MyStoriesView.swift",
        "OnboardingStepViews.swift",
        "OutboxDispatcher.swift",
        "P2PWebRTCClient.swift",
        "PostDetailView.swift",
        "PostDetailViewModel.swift",
        "ProfileUserPostsList.swift",
        "ReelsPlayerView.swift",
        "RootView.swift",
        "StoryViewModel.swift",
        "StoryViewerView+Canvas.swift",
        "StoryViewerView+Content.swift",
        "StoryViewerView+Sidebar.swift",
        "StoryViewerView.swift",
        "WebRTCTypes.swift",
    ]

    /// Cumul des lignes de la dette héritée. **Ne doit que DESCENDRE.**
    ///
    /// C'est la règle qui regarde non pas QUI est hors budget, mais de COMBIEN — et
    /// donc la seule qui aurait rougi sur les cinq ajouts de 257i/259i.
    ///
    /// **Épinglé à l'état d'AVANT 257i (88 268), pas à l'état du jour (88 338).**
    /// Pinner sur aujourd'hui aurait scellé dans le cliquet les 70 lignes que ces
    /// deux itérations ont ajoutées à des fichiers déjà hors budget — exactement le
    /// jeu de mou que #4292 venait de reprocher au cliquet i18n. La dette a donc été
    /// PAYÉE dans le même lot : `AnimatedWaveformBar` et `AudioLevelBar` sont sorties
    /// de `ConversationMediaViews.swift` vers `RecordingWaveformBars.swift`
    /// (−93 lignes, relocalisation pure), ce qui ramène le cumul à 88 245.
    /// **85 271 depuis #4102.** `MeeshyComposerHost.swift` a QUITTÉ la dette : ses
    /// 3 018 lignes sont découpées par responsabilité — le type, `+Surfaces`,
    /// `+Intake`, `+Socle`, plus les règles pures sorties en
    /// `ComposerHostRules.swift` — toutes sous le budget. Le plafond baisse de
    /// tout ce que le fichier pesait, et non de sa seule part au-dessus de 1100 :
    /// un nom qui sort de la liste en sort ENTIER, sinon le cliquet garderait du
    /// mou au nom d'un fichier qu'il ne mesure plus.
    /// **82 770 depuis #4103.** `ComposerDocumentSurface.swift` a quitté la dette
    /// à son tour : ses 2 534 lignes se répartissent en `ComposerSurfaceRules`
    /// (512, les règles de surface : routage, propriété du chrome, `⋯`, mémoire
    /// d'audience), `ComposerDocumentRules` (1 004, les règles du document :
    /// ingestion, envoi, refus, gate, libellés) et la VUE (1 043). Le plafond
    /// baisse de tout ce que le fichier pesait — un nom qui sort de la liste en
    /// sort ENTIER.
    /// **82 767 depuis #4363.** Le gate plein écran du splash a quitté
    /// `MeeshyApp.swift` pour `FullScreenGate.swift` — la seule façon d'y écrire
    /// la raison du correctif sans faire grossir un fichier déjà hors budget.
    /// Le cliquet a fait exactement son travail : il a refusé l'ajout, et
    /// l'extraction qui s'en est suivie nomme le concept au lieu de le cacher
    /// dans un `body`.
    /// **80 004 depuis le 2026-08-30**, soit la somme MESURÉE des 38 fichiers
    /// qui restent en dette. `ConversationView+Composer.swift` (399 lignes) et
    /// `UniversalComposerBar.swift` (379) sont redescendus sous le budget au
    /// découpage : ils SORTENT de la liste, entiers, et le plafond suit.
    ///
    /// **Le plafond se MESURE, il ne se calcule pas de tête.** Posé d'abord à
    /// 80 233 en soustrayant un chiffre lu dans le commentaire d'un AUTRE
    /// découpage, il aurait laissé 229 lignes de mou — de quoi accueillir en
    /// silence l'ajout que ce cliquet existe pour refuser. Un cliquet dont le
    /// cran est trop haut ne rougit pas : il attend.
    ///
    /// Le cliquet a d'ailleurs signalé leur départ de lui-même (« ces fichiers
    /// sont repassés sous le budget — bravo, et les RETIRER »). C'est la moitié
    /// SILENCIEUSE du travail de découpage : sans elle, la dette reste comptée
    /// pour des fichiers qui ne la portent plus.
    private static let legacyLineCeiling = 80_004

    // MARK: - Règle 1 — pas de 43ᵉ

    func test_aucunFichierNeufNeDepasseLeBudget() throws {
        let offenders = try sources()
            .map { ($0.lastPathComponent, lineCount(of: $0)) }
            .filter { $0.1 > Self.budget && !Self.legacyOverBudget.contains($0.0) }
            .sorted { $0.1 > $1.1 }

        XCTAssertTrue(
            offenders.isEmpty,
            "Fichier(s) au-delà du budget de \(Self.budget) lignes, hors dette héritée. "
            + "Un fichier qui dépasse se DÉCOUPE — par responsabilité, pas par tranche :\n"
            + offenders.map { "  \($0.0) — \($0.1) lignes" }.joined(separator: "\n")
        )
    }

    // MARK: - Règle 2 — la dette ne s'allonge pas

    func test_laDetteHeriteeNeSAllongePas() throws {
        let stillOver = try sources()
            .filter { lineCount(of: $0) > Self.budget }
            .map(\.lastPathComponent)

        XCTAssertLessThanOrEqual(
            stillOver.count, Self.legacyOverBudget.count,
            "plus de fichiers hors budget qu'au 261i (\(Self.legacyOverBudget.count))"
        )

        let departed = Self.legacyOverBudget.subtracting(stillOver).sorted()
        if !departed.isEmpty {
            // Sortir de la liste est le but : le signaler pour que la liste soit
            // ÉLAGUÉE dans le même commit, sinon elle se met à garder des noms
            // qui n'existent plus et cesse de dire la vérité.
            XCTFail(
                "Ces fichiers sont repassés sous le budget (ou ont été découpés) — bravo, et "
                + "les RETIRER de `legacyOverBudget` + baisser `legacyLineCeiling` en "
                + "conséquence, dans ce même commit :\n  " + departed.joined(separator: "\n  ")
            )
        }
    }

    // MARK: - Règle 3 — et elle ne grossit pas de l'intérieur

    func test_leCumulDeLaDetteHeriteeNeMonteJamais() throws {
        let total = try sources()
            .filter { Self.legacyOverBudget.contains($0.lastPathComponent) }
            .reduce(0) { $0 + lineCount(of: $1) }

        XCTAssertLessThanOrEqual(
            total, Self.legacyLineCeiling,
            "la dette héritée a GROSSI (\(total) > \(Self.legacyLineCeiling)). Ajouter à un "
            + "fichier déjà hors budget est interdit par la directive 2026-08-28 : extraire "
            + "d'abord, ajouter ensuite. Ce test existe parce que 257i et 259i l'ont fait "
            + "cinq fois sans que rien ne le signale (#4302)."
        )
    }

    // MARK: - Bornes

    /// Sans elles, les trois règles passeraient au vert en ne regardant rien — le
    /// mode de panne payé au 256i et rejoué au 257i.
    func test_leBalayageVoitBienLeDepot() throws {
        let files = try sources()
        XCTAssertGreaterThan(files.count, 400, "racine attendue : \(appRoot.path)")
        XCTAssertTrue(
            files.contains { $0.lastPathComponent == "CallManager.swift" },
            "le plus gros fichier du dépôt doit être vu"
        )
        let names = Set(files.map(\.lastPathComponent))
        let missing = Self.legacyOverBudget.subtracting(names)
        XCTAssertTrue(missing.isEmpty,
                      "noms hérités introuvables sur disque : \(missing.sorted())")
    }

    // MARK: - Balayage

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func sources() throws -> [URL] {
        guard let walker = FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil)
        else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    /// Compté comme `wc -l` + 1 le fait sur un fichier terminé par un saut de ligne :
    /// c'est la mesure que rend un `split` sur les sauts de ligne, et celle qui a
    /// servi à poser les plafonds ci-dessus. La cohérence compte plus que la
    /// convention choisie.
    private func lineCount(of url: URL) -> Int {
        let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        return text.components(separatedBy: .newlines).count
    }
}

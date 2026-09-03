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
    /// Relevé à 1200 le 2026-09-02 (directive porteur : « relâcher un peu la
    /// consigne de 1100 ; 1000-1200 est acceptable »). Le plafond DUR est 1200 ;
    /// 1000 reste le seuil au-delà duquel un découpage se justifie sans se
    /// discuter, mais il ne se mesure pas ici — un cliquet n'a qu'un seuil.
    ///
    /// **Ce relèvement n'a rien effacé.** Trois fichiers sont repassés sous le
    /// budget par ce seul fait (`MyStoriesView` 1158, `ConversationMediaViews`
    /// 1120, `ComposerMoodSurface` 1109) : ils sortent de la liste ci-dessous, et
    /// `legacyLineCeiling` baisse EXACTEMENT de ce qu'ils pesaient — jamais du
    /// cumul du jour, qui scellerait les lignes que la règle 3 vient de refuser.
    private static let budget = 1200

    /// **Dette héritée, mesurée au 261i.** Cette liste ne s'ALLONGE jamais : un
    /// fichier qui la quitte (découpé, ou redescendu sous le budget) en sort pour
    /// toujours. Chaque découpe est un lot à elle seule — `CallManager.swift`
    /// (6462 lignes) n'est pas un lot d'UI/UX.
    private static let legacyOverBudget: Set<String> = [
        "AudioFullscreenView.swift",
        "BubbleStandardLayout.swift",
        "CallManager.swift",
        "CallView.swift",
        "ConversationDashboardView.swift",
        "ConversationInfoSheet.swift",
        "ConversationListView+Overlays.swift",
        "ConversationListView.swift",
        "ConversationListViewModel.swift",
        "ConversationSocketHandler.swift",
        "ConversationView.swift",
        "FeedCommentsSheet.swift",
        "FeedPostCard.swift",
        "FeedView+Attachments.swift",
        "FeedView.swift",
        "FeedViewModel.swift",
        "MeeshyApp.swift",
        "MessageListViewController.swift",
        "MessageOverlayMenu.swift",
        "OnboardingStepViews.swift",
        "P2PWebRTCClient.swift",
        "PostDetailView.swift",
        "PostDetailViewModel.swift",
        "ProfileUserPostsList.swift",
        "ReelsPlayerView.swift",
        "RootView.swift",
        "StoryViewerView+Canvas.swift",
        "StoryViewerView+Content.swift",
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
    /// **76 402 après la fusion du 2026-08-30**, soit la somme MESURÉE des 37
    /// fichiers qui restent en dette.
    ///
    /// Deux sessions ont allégé cette dette le même jour, chacune de son côté,
    /// et le conflit qui en est né est instructif : chacune avait soustrait
    /// CORRECTEMENT ce que SON découpage retirait — 80 004 d'un côté, 80 183 de
    /// l'autre — et garder l'une ou l'autre aurait laissé la moitié du travail
    /// non comptée.
    ///
    /// > **Un plafond cumulatif ne se résout pas en choisissant un côté du
    /// > conflit : il se REMESURE.** C'est la seule valeur qui reste vraie quel
    /// > que soit l'ordre dans lequel les deux découpages sont arrivés.
    ///
    /// Ce que les deux côtés retiraient, réuni :
    /// - `StoryViewModel.swift` (3 584) → `+Publication` (960),
    ///   `+PublicationUpload` (811), `+MediaPreload` (431), `+Viewing` (302),
    ///   `StoryViewModelRules` (157) et le type lui-même (1 000) ;
    /// - `ConversationView+Composer.swift` (399) et `UniversalComposerBar.swift`
    ///   (379), redescendus sous le budget à leur propre découpage ;
    /// - `ComposerDocumentSurface.swift` n'y a jamais figuré : il a franchi le
    ///   plafond ce jour-là et a été découpé aussitôt — c'est le cliquet qui
    ///   l'a exigé, et c'est ce qu'on lui demande.
    ///
    /// Le plafond se MESURE, il ne se calcule pas de tête : posé une première
    /// fois à 80 233 en soustrayant un chiffre lu dans le commentaire d'un
    /// AUTRE découpage, il aurait laissé 229 lignes de mou — de quoi accueillir
    /// en silence l'ajout que ce cliquet existe pour refuser. Un cliquet dont
    /// le cran est trop haut ne rougit pas : il attend.
    /// **73 390 depuis #4084.** `StoryViewerView+Sidebar.swift` a quitté la
    /// dette : il portait DEUX vues entières — le rail d'actions et l'en-tête —
    /// pour 1 369 lignes, et l'en-tête est parti chez lui
    /// (`StoryViewerView+Header.swift`, 598). Les deux moitiés sont sous le
    /// budget, donc le nom sort de la liste ENTIER, plafond compris. C'est le
    /// cliquet qui l'a exigé : la vue `2f` ajoutait à un fichier hors budget, ce
    /// que la directive 2026-08-28 interdit — extraire d'abord, ajouter ensuite.
    /// **73 333 depuis #4086.** La section canvas quitte `PostDetailView.swift`
    /// pour `PostDetailView+Canvas.swift` — la vue `2h` devait y AJOUTER une
    /// garde de contenu au chemin republication, ce que la directive interdit
    /// sur un fichier hors budget. Le cliquet a fait son travail : il a refusé
    /// l'ajout, et l'extraction qui s'en est suivie nomme la responsabilité au
    /// lieu de la diluer dans un `body` de 2 572 lignes. Le fichier reste en
    /// dette (2 513) ; seul le plafond baisse — laisser 57 lignes de mou
    /// accueillerait en silence le prochain ajout.
    /// **73 205 depuis #4098.** `BubbleBodyFooterLayout` + son cache de hauteur
    /// (214 lignes) quittent `BubbleStandardLayout.swift` — la vue `3h` devait y
    /// monter la carte de citation, ce que la directive interdit sur un fichier
    /// hors budget. Le découpage suit la responsabilité : ce qui part n'est pas
    /// une vue mais un `Layout` et sa mesure, qui se relisent sans rien savoir
    /// de ce que la bulle contient. L'hôte reste en dette (1 610) ; le plafond
    /// descend au cumul RÉEL — le mou laissé en route est exactement ce qui
    /// accueille en silence l'ajout suivant.
    /// **73 203 depuis #3902.** Le fait « ce que la liste MONTRE » a été câblé
    /// à travers trois hôtes hors budget, et la LOI qu'il alimente est partie
    /// dans son propre fichier (`ConversationCatchUpLaw`) plutôt que d'épaissir
    /// le modèle. Net : −2. Le plafond suit le cumul RÉEL — laisser le mou
    /// accueillerait en silence l'ajout suivant.
    // 271i — 73 203 → 71 698 (−1 505). `OutboxDispatcher.swift` portait 1 519
    // lignes, 40 % au-dessus du budget, et la migration des chemins d'API
    // (#4282) voulait y ajouter onze lignes. Le cliquet a refusé, en faisant
    // exactement son travail : rendre le coût d'un fichier trop gros payable
    // par le PROCHAIN qui y touche, quel que soit son sujet.
    //
    // La famille « messages » (envoi, édition, suppression, réaction — la plus
    // longue et la plus autonome) est partie dans
    // `OutboxDispatcher+Messages.swift` ; le fichier retombe à 1 029 lignes,
    // SORT de la liste, et le plafond suit le cumul réel. Nombre LU du témoin avec le plafond posé à 0, jamais
    // soustrait — un plafond calculé dérive dans le sens confortable.
    //
    // 232i — 71 698 → 71 266 (−432). #3914 devait changer la règle d'amorçage
    // de la position de reprise dans `ConversationViewModel.swift` (5 055
    // lignes) : le cliquet a refusé, en faisant exactement son travail. L'amorçage
    // média est parti chez lui — `ConversationViewModel+MediaConsumptionSeed.swift`,
    // 113 lignes — et l'hôte retombe à 4 992. Il RESTE en dette ; seul le
    // plafond baisse.
    //
    // Le nombre est REMESURÉ sur les 34 noms, pas soustrait : mes 63 lignes
    // n'expliquent que 63 des 432, le reste venant de découpes voisines livrées
    // entre-temps. Soustraire aurait laissé 369 lignes de mou — de quoi
    // accueillir en silence l'ajout que ce cliquet existe pour refuser.
    /// Baissé de 3 387 le 2026-09-02 — la somme EXACTE des trois fichiers sortis
    /// de la liste au relèvement du budget, mesurée à leur taille du jour.
    ///
    /// **Il reste 165 lignes de dette IMPAYÉE, et c'est voulu.** Elles ont été
    /// attribuées, fichier par fichier, en comparant au commit qui a posé le
    /// plafond précédent (`0912db893d`) : `PostDetailView` +93,
    /// `StoryViewerView+Canvas` +45, `MessageListViewController` +17,
    /// `StoryViewerView` +10. Les quatre RESTENT dans la dette, donc le
    /// relèvement du budget ne les absout pas : la règle 3 demeure rouge tant que
    /// ces 165 lignes ne sont pas extraites (#4841). Un plafond qui se lève pour
    /// couvrir une croissance qu'il vient de refuser cesse d'être un cliquet.
    ///
    /// 2026-09-02 (fusion de la branche stickers, #4823) — 67 879 → 67 385 (−494).
    /// Les 165 lignes impayées ci-dessus le sont : `StoryComposerBarView` a
    /// quitté `StoryViewerView+Canvas.swift` (298 lignes), le saut vers un
    /// message hors fenêtre a quitté `ConversationViewModel.swift` (152) et
    /// l'état du composer `ConversationView.swift` (70) — trois découpes par
    /// responsabilité faites AVANT d'ajouter aux hôtes, qui restent en dette.
    /// Le nombre est REMESURÉ sur les 31 noms avec la méthode de
    /// `lineCount(of:)` sur l'arbre fusionné, jamais soustrait.
    ///
    /// 2026-09-02 (seconde fusion de dev, `3853f03c`) — 67 385 → 67 091 (−294) :
    /// le post cité a quitté `PostDetailView` sur dev (`598ba11f`). REMESURÉ sur
    /// les 31 noms de l'arbre fusionné, jamais soustrait.
    private static let legacyLineCeiling = 62_330

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

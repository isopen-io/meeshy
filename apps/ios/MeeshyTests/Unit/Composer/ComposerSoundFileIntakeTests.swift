import XCTest
import UniformTypeIdentifiers
@testable import Meeshy

/// #4632 — **un son choisi dans Fichiers arrive sur la scène.**
///
/// Le défaut signalé par le porteur (« l'ajout de son à partir du fichier ne
/// semble pas fonctionner ») en cachait DEUX, et le premier empêchait
/// d'observer le second.
///
/// 1. **Le bouton était inerte.** `presentSoundSource(.files)` posait
///    `showsFileImporter = true` en laissant `presentedPortal = .sound` monté.
///    Les deux présentations vivent sur le MÊME corps de vue ; iOS n'en honore
///    pas une seconde depuis un présentateur occupé. Aucun crash, aucune trace.
/// 2. **La destination était fausse.** L'ingestion versait tout dans
///    `documentLocalMedia`, la liste média du DOCUMENT — un audio n'y devenait
///    jamais un son de scène.
///
/// > **Une garantie STRUCTURELLE ne protège que ce qu'elle représente.**
/// > `ComposerPortal?` rend deux FEUILLES concurrentes non représentables ; il
/// > ne peut rien contre une feuille et un sélecteur système, qui n'est pas une
/// > de ses valeurs. La branche voisine `.library` passait, elle, par le type
/// > somme — c'est cette ressemblance qui a tenu le défaut invisible.
final class ComposerSoundFileIntakeTests: XCTestCase {

    private func source(_ nom: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Le fusible.** Sans lui, les gardes de source qui suivent passeraient au
    /// vert par OMISSION le jour où un chemin change — le mode d'échec le plus
    /// discret de ce dépôt.
    func test_lesSourcesLues_sontNonVides() throws {
        XCTAssertTrue(try source("MeeshyComposerHost+Intake.swift")
            .contains("func presentSoundSource"))
        XCTAssertTrue(try source("MeeshyComposerHost+Portals.swift")
            .contains("var surfaceWithIntakePortals"))
    }

    // MARK: - La règle de présentation

    /// Le témoin qui se RETOURNE sur le défaut : la provenance fichier ne peut
    /// pas s'ouvrir dans la même transaction que la fermeture de la feuille.
    func test_laProvenanceFichier_exigeQueLaFeuilleSeFermeDAbord() {
        XCTAssertEqual(ComposerSoundHandoff.handoff(for: .files),
                       .systemImporterAfterDismiss)
    }

    /// Et sa voisine, qui n'a JAMAIS eu le défaut — c'est la comparaison qui
    /// nomme la cause : elle remplace un portail, donc le type somme la protège.
    func test_laProvenanceBibliotheque_passeParLeTypeSomme() {
        XCTAssertEqual(ComposerSoundHandoff.handoff(for: .library), .portal)
    }

    /// Le micro EST la feuille : il n'a rien à présenter.
    func test_leMicro_estLaSurfaceDeLaFeuille() {
        XCTAssertEqual(ComposerSoundHandoff.handoff(for: .record), .sheetSurface)
    }

    /// **Aucune provenance ne reste sans réponse.** Un quatrième cas ajouté sans
    /// mécanisme de présentation rejouerait exactement le défaut de #4632.
    func test_chaqueProvenance_declareSonMecanismeDePresentation() {
        for source in ComposerSoundSource.allCases {
            let handoff = ComposerSoundHandoff.handoff(for: source)
            XCTAssertTrue([.portal, .systemImporterAfterDismiss, .sheetSurface].contains(handoff),
                          "\(source) n'a pas de mécanisme de présentation déclaré")
        }
    }

    // MARK: - Ce que l'importateur demande, et ce qu'il rapporte

    /// `.item` laissait choisir un PDF pour un son de fond — une erreur que
    /// l'utilisateur n'apprend qu'après coup, quand rien ne se passe.
    func test_lImportateurDuSon_neFiltreQueDeLAudio() {
        XCTAssertEqual(ComposerFileImportIntent.sound.contentTypes, [UTType.audio])
    }

    /// La porte média garde son filtre large : elle accepte tout ce qu'une
    /// publication peut porter.
    func test_lImportateurDuMedia_gardeSonFiltreLarge() {
        XCTAssertEqual(ComposerFileImportIntent.media.contentTypes, [UTType.item])
    }

    /// La scène ne porte qu'UN son par rôle : offrir la sélection multiple
    /// promettrait une pose que le modèle ne tient pas.
    func test_leSon_estUnique_laOuLeMediaEstMultiple() {
        XCTAssertFalse(ComposerFileImportIntent.sound.allowsMultipleSelection)
        XCTAssertTrue(ComposerFileImportIntent.media.allowsMultipleSelection)
    }

    // MARK: - Le câblage, mesuré sur la source

    /// **La moitié « présentation ».** La porte fichier ferme le portail et
    /// pose son intention ; elle n'ouvre RIEN dans la même transaction.
    func test_laPorteFichier_fermeLePortailAuLieuDOuvrirParDessus() throws {
        let code = compact(try source("MeeshyComposerHost+Intake.swift"))
        XCTAssertTrue(code.contains("case.systemImporterAfterDismiss:"),
                      "`presentSoundSource` doit aiguiller sur `ComposerSoundHandoff`, "
                      + "sinon la règle est écrite et personne ne l'applique.")
        XCTAssertTrue(code.contains("pendingFileImport=true"))
        XCTAssertTrue(code.contains("presentedPortal=nil"))
    }

    /// **Et la reprise existe, et retombe.** Un drapeau resté vrai rouvrirait
    /// l'importateur à la fermeture du portail SUIVANT, quel qu'il soit.
    func test_laReprise_consommeSonDrapeau() throws {
        let code = compact(try source("MeeshyComposerHost+Intake.swift"))
        XCTAssertTrue(code.contains("funcresumePendingFileImport()"))
        XCTAssertTrue(code.contains("guardpendingFileImportelse{return}"))
        XCTAssertTrue(code.contains("pendingFileImport=false"))
    }

    /// **Le lecteur de la reprise est le `onDismiss` de la feuille.** Sans lui,
    /// l'intention serait posée et jamais consommée — le bouton resterait
    /// inerte, avec un état de plus pour le prouver.
    func test_leOnDismissDeLaFeuille_consommeLIntentionEnAttente() throws {
        let code = compact(try source("MeeshyComposerHost+Portals.swift"))
        XCTAssertTrue(code.contains("onDismiss:{resumePendingFileImport()}"),
                      "La feuille des portails doit reprendre l'import en attente à sa "
                      + "fermeture EFFECTIVE — c'est le seul instant où le présentateur "
                      + "est libre.")
    }

    /// **La moitié « destination », celle que le premier défaut cachait.** Un
    /// fichier audio va sur la SCÈNE avec son rôle, jamais dans la liste média.
    func test_unFichierAudio_estPoseSurLaScene_avecSonRole() throws {
        let code = compact(try source("MeeshyComposerHost+Intake.swift"))
        XCTAssertTrue(code.contains("funcingestSoundFiles("))
        XCTAssertTrue(code.contains("viewModel.attachPastedAudio(url:destination,role:chosenSoundRole)"),
                      "Le rôle choisi dans la feuille doit suivre le fichier — il survit "
                      + "à la fermeture parce qu'il est un état du MEUBLE.")
    }

    /// **L'intention retombe dès la lecture.** Laissée à `.sound`, elle ferait
    /// poser sur la scène le fichier suivant, même arrivé par la rangée du
    /// document — la classe de défaut que `railPosesNextMedia` documente déjà.
    func test_lIntention_valutPourUneSeuleOuverture() throws {
        let code = compact(try source("MeeshyComposerHost+Intake.swift"))
        XCTAssertTrue(code.contains("letintention=fileImportIntent"))
        XCTAssertTrue(code.contains("fileImportIntent=.media"))
    }

    /// **Le filtre du sélecteur suit l'intention, il n'est plus figé.**
    func test_leSelecteur_demandeCeQueLIntentionDeclare() throws {
        let code = compact(try source("MeeshyComposerHost+Portals.swift"))
        XCTAssertTrue(code.contains("allowedContentTypes:fileImportIntent.contentTypes"))
        XCTAssertTrue(code.contains("allowsMultipleSelection:fileImportIntent.allowsMultipleSelection"))
        XCTAssertFalse(code.contains("allowedContentTypes:[.item],"),
                       "Un filtre figé est revenu : la porte du son laisserait choisir un PDF.")
    }
}

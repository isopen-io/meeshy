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

    /// **Les gardes lisent l'UNITÉ du meuble, jamais un fichier** (2026-09-01).
    ///
    /// `AppSourceGuard.composerHostSource()` concatène `MeeshyComposerHost.swift`,
    /// ses compagnons et tout `MeeshyComposerHost+*.swift`. Épingler un fichier
    /// précis rend la garde otage du prochain découpage : le budget de 1 100
    /// lignes en impose un régulièrement, et une garde qui ne trouve plus son
    /// ancre passe au vert en ne mesurant plus rien.
    private func hostUnit() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Le fusible.** Sans lui, les gardes de source qui suivent passeraient au
    /// vert par OMISSION le jour où un chemin change — le mode d'échec le plus
    /// discret de ce dépôt.
    func test_lesSourcesLues_sontNonVides() throws {
        XCTAssertTrue(try hostUnit()
            .contains("func presentSoundSource"))
        XCTAssertTrue(try hostUnit()
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
        let code = compact(try hostUnit())
        XCTAssertTrue(code.contains("case.systemImporterAfterDismiss:"),
                      "`presentSoundSource` doit aiguiller sur `ComposerSoundHandoff`, "
                      + "sinon la règle est écrite et personne ne l'applique.")
        XCTAssertTrue(code.contains("pendingFileImport=true"))
        XCTAssertTrue(code.contains("presentedPortal=nil"))
    }

    /// **Et la reprise existe, et retombe.** Un drapeau resté vrai rouvrirait
    /// l'importateur à la fermeture du portail SUIVANT, quel qu'il soit.
    func test_laReprise_consommeSonDrapeau() throws {
        let code = compact(try hostUnit())
        XCTAssertTrue(code.contains("funcresumePendingPresentation()"))
        // Le drapeau est LU puis remis à faux — la forme du test (`guard` ou
        // `if`) n'est pas ce que la garde affirme, et l'épingler l'a fait rougir
        // sur une réécriture parfaitement correcte.
        XCTAssertTrue(code.contains("ifpendingFileImport{"))
        XCTAssertTrue(code.contains("pendingFileImport=false"))
        XCTAssertTrue(code.contains("showsFileImporter=true"))
    }

    /// **Le lecteur de la reprise est le `onDismiss` de la feuille.** Sans lui,
    /// l'intention serait posée et jamais consommée — le bouton resterait
    /// inerte, avec un état de plus pour le prouver.
    func test_leOnDismissDeLaFeuille_consommeLIntentionEnAttente() throws {
        let code = compact(try hostUnit())
        // **Ancrée sur la FIN du `onDismiss`, pas sur son contenu entier.** La
        // fermeture porte aussi l'extinction du contexte d'édition du son de
        // contenu (#4657) ; exiger un corps d'UNE seule instruction aurait fait
        // rougir la garde sur un ajout parfaitement légitime, sans rien dire de
        // la reprise qu'elle protège. Ce qui compte est que la reprise soit là,
        // et qu'elle CONCLUE la fermeture — le présentateur n'est libre qu'après.
        XCTAssertTrue(code.contains("resumePendingPresentation()}){portailin"),
                      "La feuille des portails doit reprendre l'import en attente à sa "
                      + "fermeture EFFECTIVE, en DERNIER — c'est le seul instant où le "
                      + "présentateur est libre.")
    }

    /// **La moitié « destination », celle que le premier défaut cachait.** Un
    /// fichier audio suit le PLACEMENT choisi dans la feuille — un état du
    /// MEUBLE, qui survit donc à sa fermeture.
    ///
    /// **Le témoin s'est resserré au #4676.** Il exigeait
    /// `attachPastedAudio(url:destination, role: chosenSoundPlacement)`, c'est-à-dire
    /// que le rôle VOYAGE. C'était nécessaire et pas suffisant : posé en fond,
    /// un son passé par ce chemin ajoutait un SECOND objet `isBackground` que
    /// `resolvedBackgroundAudio` ne regardait pas — le rôle arrivait bien, et ne
    /// produisait rien. Les deux branches sont donc épinglées séparément,
    /// puisqu'elles n'appellent plus la même chose.
    func test_unFichierAudio_suitSonPlacement_etLeFondREMPLACE() throws {
        let code = compact(try hostUnit())
        XCTAssertTrue(code.contains("funcingestSoundFiles("))
        XCTAssertTrue(code.contains("case.background:attachBackgroundSound(url:destination)"),
                      "posé en fond, le fichier doit REMPLACER le fond en place — "
                      + "`attachPastedAudio` en ajouterait un second que personne ne regarde")
        XCTAssertTrue(code.contains("ComposerSoundDestination.forForeground(on:mountedComposerView)"),
                      "posé en premier plan, il demande d'abord OÙ ce premier plan atterrit")
        XCTAssertTrue(code.contains("case.sceneChip:viewModel.attachPastedAudio(url:destination,role:.foreground)"),
                      "sur une scène, il devient une puce POSÉE dessus")
        XCTAssertTrue(code.contains("case.contentCard:documentLocalMedia.append("),
                      "sans scène, il devient une carte de contenu — sinon l'objet de scène "
                      + "n'est rendu par rien et part quand même à la publication")
    }

    /// **Le témoin qui vient d'être retourné, et pourquoi** (#4722).
    ///
    /// Il exigeait `case .foreground: viewModel.attachPastedAudio(…)` — une pose
    /// d'objet de scène INCONDITIONNELLE. C'était juste sur une scène et faux
    /// sur un post texte, où rien ne rend un objet de scène : le son y
    /// disparaissait de l'écran sans quitter la publication.
    ///
    /// > Un témoin qui épingle un APPEL épingle aussi, sans le dire, le fait
    /// > qu'aucune condition ne le précède. C'est la moitié de son affirmation
    /// > que personne ne relit — et celle qui se périme quand la question gagne
    /// > un second cas.
    ///
    /// Le chemin voisin (`applyCreatedAudio`, l'enregistrement) faisait
    /// l'inverse au même moment : toujours une carte de contenu. Deux réponses
    /// pour une intention, chacune fausse sur la surface de l'autre.
    func test_lesDeuxCheminsDuPremierPlan_nePosentPlusChacunLeurReponse() throws {
        let code = compact(try hostUnit())
        XCTAssertFalse(code.contains("case.foreground:viewModel.attachPastedAudio(url:destination,role:.foreground)"),
                       "la pose inconditionnelle est ce que ce lot retire")
        let consultations = code.components(separatedBy: "ComposerSoundDestination.forForeground(").count - 1
        XCTAssertEqual(consultations, 3,
                       "les deux poses et le libellé de la feuille interrogent la même règle")
    }

    /// **L'intention retombe dès la lecture.** Laissée à `.sound`, elle ferait
    /// poser sur la scène le fichier suivant, même arrivé par la rangée du
    /// document — la classe de défaut que `railPosesNextMedia` documente déjà.
    func test_lIntention_valutPourUneSeuleOuverture() throws {
        let code = compact(try hostUnit())
        XCTAssertTrue(code.contains("letintention=fileImportIntent"))
        XCTAssertTrue(code.contains("fileImportIntent=.media"))
    }

    /// **Le filtre du sélecteur suit l'intention, il n'est plus figé.**
    func test_leSelecteur_demandeCeQueLIntentionDeclare() throws {
        let code = compact(try hostUnit())
        XCTAssertTrue(code.contains("allowedContentTypes:fileImportIntent.contentTypes"))
        XCTAssertTrue(code.contains("allowsMultipleSelection:fileImportIntent.allowsMultipleSelection"))
        XCTAssertFalse(code.contains("allowedContentTypes:[.item],"),
                       "Un filtre figé est revenu : la porte du son laisserait choisir un PDF.")
    }
}

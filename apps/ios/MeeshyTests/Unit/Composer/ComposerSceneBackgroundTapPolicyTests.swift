import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **#4035 — l'inspecteur était câblé de bout en bout, et INATTEIGNABLE.**
///
/// La scène incrustée transmet `onItemTapped`, l'hôte retient la sélection, la
/// surface monte la zone au-dessus de la rangée d'outils : trois maillons
/// justes, tous testés. Et pourtant, sur l'écran document, taper la scène ne
/// faisait RIEN — écran identique au bit près, mesuré au simulateur le
/// 2026-08-28.
///
/// La cause n'était dans aucun des trois maillons. En profil Post une slide ne
/// porte qu'UN média, et la règle 4 en fait son FOND (#4038) ; or le hit-test du
/// canvas n'itère que le conteneur des ITEMS, où un fond ne vit pas. Le tap
/// retombait donc sur `onBackgroundTapped` — qui EFFAÇAIT la sélection.
///
/// > Une chaîne dont chaque maillon est juste peut ne transporter personne.
/// > La question n'est pas « le rappel est-il branché ? » mais « le geste
/// > réel de l'utilisateur ATTEINT-il ce rappel ? ».
final class ComposerSceneBackgroundTapPolicyTests: XCTestCase {

    // MARK: - La règle

    /// Le cas qui débloque l'inspecteur sur l'écran document.
    func test_rienDeSelectionne_etUnFondMedia_selectionneLeMedia() {
        XCTAssertEqual(
            ComposerSceneBackgroundTapPolicy.selection(
                currentSelection: nil, backgroundIsMedia: true),
            .media
        )
    }

    /// Un fond de COULEUR n'est pas un objet : il n'y a rien à inspecter, donc
    /// aucune zone (loi 4).
    func test_unFondDeCouleur_neSelectionneRien() {
        XCTAssertNil(
            ComposerSceneBackgroundTapPolicy.selection(
                currentSelection: nil, backgroundIsMedia: false)
        )
    }

    /// **La moitié qui rend le geste utilisable.** Sans elle, une sélection
    /// posée par un tap sur le fond n'aurait aucune SORTIE : la zone
    /// contextuelle resterait montée pour toujours, et l'auteur n'aurait aucun
    /// moyen de récupérer la hauteur qu'elle prend.
    func test_unSecondTap_efface_doncLaZoneSeReferme() {
        XCTAssertNil(
            ComposerSceneBackgroundTapPolicy.selection(
                currentSelection: .media, backgroundIsMedia: true)
        )
    }

    /// Taper le fond alors qu'un objet de PREMIER PLAN est sélectionné efface
    /// aussi : le geste dit « je sors de ce que je regardais », pas « je passe
    /// au fond ».
    func test_taperLeFond_effaceUneSelectionDePremierPlan() {
        for selection: StoryCanvasUIView.CanvasItemKind in [.text, .sticker, .place, .media] {
            XCTAssertNil(
                ComposerSceneBackgroundTapPolicy.selection(
                    currentSelection: selection, backgroundIsMedia: true),
                "Une sélection \(selection) doit s'effacer au tap sur le fond."
            )
        }
    }

    // MARK: - Sur la SCÈNE, toucher le fond le SÉLECTIONNE (#9521, #13839 L5)

    /// **Le fond est un objet du plan `bg`, et il se sélectionne comme les
    /// autres : au toucher** (vue `1c` ; recette de #9496 : le toucher ne posait
    /// qu'un `kind` sans identifiant, et les réglages du fond restaient
    /// inatteignables). Depuis L5 il se SÉLECTIONNE — sa barre paraît — au lieu
    /// de s'ouvrir ; la règle est `ComposerSceneEmptyTap`, la seule câblée.
    func test_emptyTap_rienDeSelectionne_selectionneLeFond() {
        XCTAssertEqual(
            ComposerSceneEmptyTap.outcome(hadSelection: false, effectIsOpen: false,
                                          quickCaptureOffered: false, backgroundMediaId: "fond"),
            .selectBackground("fond"))
    }

    /// Le geste reste un TOGGLE : un objet (le fond compris) déjà sélectionné ⇒
    /// le toucher QUITTE (#8714), il ne bascule pas sur le fond.
    func test_emptyTap_uneSelectionEnCours_deselectionneSansBasculerSurLeFond() {
        XCTAssertEqual(
            ComposerSceneEmptyTap.outcome(hadSelection: true, effectIsOpen: false,
                                          quickCaptureOffered: false, backgroundMediaId: "fond"),
            .deselect)
    }

    /// Un fond de couleur ou de dégradé n'est pas un objet : rien à sélectionner.
    func test_emptyTap_sansFondMedia_neSelectionneRien() {
        for fond in [nil, ""] as [String?] {
            XCTAssertEqual(
                ComposerSceneEmptyTap.outcome(hadSelection: false, effectIsOpen: false,
                                              quickCaptureOffered: false, backgroundMediaId: fond),
                .nothing)
        }
    }

    /// **Une sélection qui ne désigne plus rien n'en est pas une.** Un objet
    /// sélectionné puis défait (↶ d'une duplication, suppression) laisse son
    /// identifiant au meuble ; le toucher suivant d'une scène redevenue vide
    /// « désélectionnait » ce fantôme au lieu d'armer le viseur — un toucher
    /// perdu, sans rien à l'écran.
    func test_hadSelection_identifiantQuiNeDesignePlusRien_nEstPasUneSelection() {
        let slide = StorySlide()
        XCTAssertFalse(ComposerSceneEmptyTap.hadSelection(selectedId: "parti", slide: slide, isEditing: false))
        XCTAssertFalse(ComposerSceneEmptyTap.hadSelection(selectedId: nil, slide: slide, isEditing: false))
    }

    func test_hadSelection_objetPresentOuEditionOuverte_estUneSelection() {
        var slide = StorySlide()
        let texte = StoryTextObject(text: "Bonjour")
        slide.effects.textObjects = [texte]
        XCTAssertTrue(ComposerSceneEmptyTap.hadSelection(selectedId: texte.id, slide: slide, isEditing: false))
        XCTAssertTrue(ComposerSceneEmptyTap.hadSelection(selectedId: nil, slide: slide, isEditing: true))
    }

    /// **Le câblage** (#13839, L5) : le toucher du fond lit la règle du
    /// toucher à vide AVANT d'effacer — lue après, elle verrait toujours
    /// « rien de sélectionné » et ne désélectionnerait jamais —, n'arme le
    /// viseur que sur son verdict, puis SÉLECTIONNE le fond (sa barre paraît)
    /// au lieu de l'ouvrir. La sélection par `kind` du document (#4035) demeure.
    func test_leToucherDuFond_litLaRegleDuToucherAVide_puisSelectionneLeFond() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Composer/MeeshyComposerHost.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()
        guard let debut = code.range(of: "funchandleSceneBackgroundTap(){"),
              let fin = code.range(of: "varbody:someView{", range: debut.upperBound..<code.endIndex)
        else { return XCTFail("le toucher du fond a changé de forme") }
        let corps = String(code[debut.upperBound..<fin.lowerBound])
        guard let regle = corps.range(of: "ComposerSceneEmptyTap.outcome("),
              let viseur = corps.range(of: "ifissue==.armViewfinder,handleSceneQuickTap(){return}"),
              let efface = corps.range(of: "selectedSceneItemKind=ComposerSceneBackgroundTapPolicy.selection("),
              let choisit = corps.range(of: "selectSceneItem(fond)")
        else { return XCTFail("le toucher du fond ne suit pas la règle du toucher à vide : \(corps)") }
        XCTAssertLessThan(regle.lowerBound, viseur.lowerBound, "la règle décide avant le viseur")
        XCTAssertLessThan(viseur.lowerBound, efface.lowerBound)
        XCTAssertLessThan(efface.lowerBound, choisit.lowerBound,
                          "Le fond se sélectionne APRÈS l'effacement — sinon l'effacement le désélectionnerait.")
        XCTAssertTrue(corps.contains("effectIsOpen:openSceneEffect!=nil"))
        XCTAssertTrue(corps.contains("sceneBackgroundMedia?.id"))
        XCTAssertFalse(corps.contains("beginInlineEdit("), "toucher le fond ne l'ouvre plus : il le sélectionne")
    }

    // MARK: - La garde NÉGATIVE que l'issue exige : la surface neuve ignore la coquille

    /// **La preuve MÉCANIQUE que la bêta ne casse pas l'autre chemin.**
    ///
    /// L'arbitrage porteur du 2026-08-27 tient en une ligne : « coquille NEUVE,
    /// modèle PARTAGÉ ». La surface document et ses deux briques de scène
    /// peuvent lire et muter le MÊME `StoryComposerViewModel` — c'est le modèle,
    /// et le dupliquer serait la jumelle divergente que le dépôt interdit. Ce
    /// qu'elles n'ont pas le droit de toucher est la COQUILLE : `StoryComposerView`
    /// et les trois vues de son chrome.
    ///
    /// Une promesse ne suffit pas : cette garde doit ROUGIR si l'on injecte une
    /// référence interdite. Le témoin de mutation est dans le journal du lot.
    func test_laSurfaceNeuve_neReferenceAucunFichierDeLaCoquille() throws {
        let interdits = ["ComposerControlsLayer", "ComposerBottomBand", "ComposerToolPanelHost"]

        for fichier in fichiersDeLaSurfaceNeuve {
            let code = AppSourceGuard.stripComments(try String(contentsOf: fichier, encoding: .utf8))
            XCTAssertGreaterThan(
                code.count, 400,
                "Source vide ou introuvable (\(fichier.lastPathComponent)) — la garde serait verte par omission."
            )

            for interdit in interdits {
                XCTAssertFalse(
                    code.contains(interdit),
                    "\(fichier.lastPathComponent) référence « \(interdit) », une vue de la COQUILLE. "
                        + "La surface neuve partage le MODÈLE, jamais le chrome de l'atelier plein écran."
                )
            }

            // `StoryComposerView` est un PRÉFIXE de `StoryComposerViewModel`, qui
            // est le modèle PARTAGÉ et donc autorisé. Chercher la chaîne nue
            // ferait rougir la garde sur ce qu'elle doit permettre — et la
            // « corriger » en retirant l'assertion perdrait la protection.
            let coquille = try NSRegularExpression(pattern: "StoryComposerView(?!Model)")
            let plage = NSRange(code.startIndex..., in: code)
            XCTAssertEqual(
                coquille.numberOfMatches(in: code, range: plage), 0,
                "\(fichier.lastPathComponent) monte ou référence `StoryComposerView` — la coquille plein "
                    + "écran. Elle doit rester atteignable et INCHANGÉE par l'autre chemin."
            )
        }
    }

    /// **Le discriminant de la garde, éprouvé DANS LES DEUX SENS.**
    ///
    /// L'assertion par `contains` se prouve par mutation (injecter
    /// `ComposerToolPanelHost` la fait rougir, journal du lot). Celle par regex
    /// ne le peut pas aussi facilement — injecter la coquille demanderait un
    /// montage qui compile. Or c'est elle qui porte le piège : `StoryComposerView`
    /// est un PRÉFIXE de `StoryComposerViewModel`, le modèle PARTAGÉ et donc
    /// AUTORISÉ. Un motif naïf rougirait sur ce que la garde doit permettre — et
    /// la « correction » évidente (retirer l'assertion) perdrait la protection
    /// en silence, exactement le mode de mort des gardes négatives.
    ///
    /// On éprouve donc le motif lui-même, sur deux littéraux.
    func test_leMotifDeLaCoquille_distingueLaVueDuModelePartage() throws {
        let motif = try NSRegularExpression(pattern: "StoryComposerView(?!Model)")
        func occurrences(_ texte: String) -> Int {
            motif.numberOfMatches(in: texte, range: NSRange(texte.startIndex..., in: texte))
        }
        XCTAssertEqual(
            occurrences("@ObservedObject var viewModel: StoryComposerViewModel"), 0,
            "Le MODÈLE partagé doit passer — c'est lui qui garantit qu'il n'existe pas deux vérités "
                + "sur ce qu'EST une story."
        )
        XCTAssertEqual(
            occurrences("StoryComposerView(viewModel: viewModel)"), 1,
            "La COQUILLE doit être attrapée."
        )
        XCTAssertEqual(occurrences("StoryComposerViewModel + StoryComposerView("), 1)
    }

    /// Le fusible de la garde ci-dessus : si un chemin devient faux, elle
    /// deviendrait verte sur zéro fichier.
    func test_laGarde_litBienTroisFichiers() {
        XCTAssertEqual(fichiersDeLaSurfaceNeuve.count, 3)
        for fichier in fichiersDeLaSurfaceNeuve {
            XCTAssertTrue(
                FileManager.default.fileExists(atPath: fichier.path),
                "Introuvable : \(fichier.path)"
            )
        }
    }

    private var fichiersDeLaSurfaceNeuve: [URL] {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .deletingLastPathComponent()   // .../apps
            .deletingLastPathComponent()   // racine du dépôt
        return [
            racine.appendingPathComponent("apps/ios/Meeshy/Features/Composer/ComposerSceneSurface.swift"),
            racine.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Story/EmbeddedSceneCanvas.swift"),
            racine.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Story/EmbeddedSceneInspector.swift")
        ]
    }
}

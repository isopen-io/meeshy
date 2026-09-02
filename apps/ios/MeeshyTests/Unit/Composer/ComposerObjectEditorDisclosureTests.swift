import XCTest
import MeeshyUI
@testable import Meeshy

/// **#4842 — l'éditeur d'objet plein écran dépliait NEUF sections d'un coup.**
///
/// Mesuré au simulateur iPhone 16 Pro le 2026-09-02 : sous la scène, STYLE
/// (grille de 18), COULEUR, ALIGNEMENT, FOND, CADRE, BORDURE, LANGUE, la
/// FENÊTRE de temps et le PLAN 2D, tous ouverts. Il fallait faire défiler pour
/// atteindre les quatre dernières, et rien n'annonçait qu'elles existaient.
///
/// > « ne pas tout montrer d'un coup (la vue plein ecran actuelle est trop
/// > chargé) » — directive porteur du 2026-09-01 23h04, et **loi 8** : le
/// > prisme n'affiche que ce dont on a besoin, au moment où on en a besoin.
///
/// La règle est PURE parce que c'est le seul moyen de poser la question qui
/// compte — « deux sections peuvent-elles être ouvertes ensemble ? » — sans
/// monter d'écran. Un témoin de vue répondrait sur UN chemin ; celui-ci répond
/// sur tous.
final class ComposerObjectEditorDisclosureTests: XCTestCase {

    private var toutes: [ComposerObjectEditorSection] {
        TextEditTool.all.map { ComposerObjectEditorSection.tool($0) } + [.timing, .plan]
    }

    // MARK: - Ce qui est ouvert au premier rendu

    /// **Jamais tout replié.** Un écran qui naîtrait entièrement fermé
    /// échangerait un défaut contre son symétrique : neuf sections d'un coup
    /// devient neuf titres muets, et l'auteur doit deviner par où commencer.
    /// Le style est le premier geste sur un texte — c'est lui qui s'ouvre.
    func test_auPremierRendu_uneSectionEstOuverte_etCEstLeStyle() {
        XCTAssertEqual(ComposerObjectEditorDisclosure.initiallyOpened,
                       .tool(.style))
    }

    // MARK: - Une à la fois

    /// L'essence de la loi 8 : ouvrir une section FERME la précédente.
    func test_ouvrirUneSection_fermeCelleQuiEtaitOuverte() {
        let apres = ComposerObjectEditorDisclosure.opened(after: .tool(.color),
                                                          from: .tool(.style))
        XCTAssertEqual(apres, .tool(.color))
    }

    /// **Aucune paire n'est jamais ouverte ensemble** — posé sur les neuf
    /// sections deux à deux, pas sur un chemin choisi. C'est ce que ce lot
    /// promet, donc c'est ce qui doit être mesuré.
    func test_aucuneSection_neResteOuverteQuandUneAutreSOuvre() {
        for depart in toutes {
            for touchee in toutes where touchee != depart {
                let apres = ComposerObjectEditorDisclosure.opened(after: touchee,
                                                                  from: depart)
                XCTAssertEqual(apres, touchee)
                XCTAssertFalse(ComposerObjectEditorDisclosure.isOpen(depart, opened: apres),
                               "\(depart) est restée ouverte alors que \(touchee) s'ouvrait.")
            }
        }
    }

    /// **Refermer la section ouverte rend l'écran à la SCÈNE.** Sur cet écran
    /// l'objet se déplace, se pince et se tourne : pouvoir tout replier n'est
    /// pas un état dégradé, c'est le geste de celui qui veut positionner.
    func test_toucherLaSectionOuverte_laReferme() {
        XCTAssertNil(ComposerObjectEditorDisclosure.opened(after: .tool(.style),
                                                           from: .tool(.style)))
        XCTAssertNil(ComposerObjectEditorDisclosure.opened(after: .plan, from: .plan))
    }

    /// Rien d'ouvert ⇒ rien n'est ouvert. Le cas paraît trivial et ne l'est
    /// pas : c'est celui que produit le geste ci-dessus, donc celui que la vue
    /// rend le plus souvent après une manipulation.
    func test_riendOuvert_aucuneSectionNeSeDitOuverte() {
        for section in toutes {
            XCTAssertFalse(ComposerObjectEditorDisclosure.isOpen(section, opened: nil))
        }
    }

    /// **Une section neuve du SDK entre dans la règle sans qu'on l'écrive.**
    /// La liste des outils vient de `TextEditTool.all` — la recopier ici
    /// l'aurait fait diverger au premier outil ajouté, exactement le défaut que
    /// la garde d'empilement de `ComposerObjectEditorTests` protège déjà.
    func test_lesSections_couvrentTousLesOutilsDuSDK() {
        let outils = Set(TextEditTool.all.map { ComposerObjectEditorSection.tool($0) })
        XCTAssertEqual(outils.count, TextEditTool.all.count)
        XCTAssertEqual(toutes.count, TextEditTool.all.count + 2,
                       "Neuf sections : les sept outils, la fenêtre, le plan.")
    }

    // MARK: - Le câblage

    private func editorSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerObjectEditorView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// L'écran DEMANDE à la règle — il ne réécrit pas « une à la fois » dans un
    /// `body`, où aucun témoin ne peut l'atteindre.
    func test_lEcran_demandeSonDepliageALaRegle() throws {
        let code = try editorSource()
        XCTAssertTrue(code.contains("ComposerObjectEditorDisclosure"),
                      "Le dépliage est une règle, pas un `if` dans le corps de la vue.")
        XCTAssertTrue(code.contains("DisclosureGroup"),
                      "L'état déplié/replié doit se DIRE — un chevron maison ne "
                      + "l'annonce à aucun lecteur d'écran.")
    }

    /// **Le dépliage est LOCAL à l'écran, jamais celui du ViewModel.** C'est la
    /// distinction que la garde d'empilement existante protège : la zone basse
    /// d'une édition de texte était vide tant qu'aucune bulle du rail n'avait
    /// été tapée, parce qu'elle lisait `expandedTool`. Ce lot ne la ramène pas.
    func test_leDepliage_neLitJamaisLOutilDeployeDuViewModel() throws {
        let code = try editorSource()
        XCTAssertFalse(code.contains("expandedTool"),
                       "Le dépliage du ViewModel a un état VIDE — aucune bulle tapée, "
                       + "aucune option. Celui de cet écran n'en a pas.")
        XCTAssertTrue(code.contains("@State private var openedSection"),
                      "L'état vit dans l'écran, et il est initialisé par la règle.")
        XCTAssertTrue(code.contains("ComposerObjectEditorDisclosure.initiallyOpened"),
                      "Le premier rendu ne choisit pas sa section lui-même.")
        // **Pas d'interdit sur `textEditingMode`.** L'écran le lit
        // légitimement — pour dire au canvas quel texte s'édite en ligne — et
        // une garde qui le bannirait punirait un usage juste au motif qu'il
        // ressemble au fautif. Ce qu'on interdit est l'outil DÉPLOYÉ, pas le
        // mode d'édition.
    }
}

import XCTest
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

/// **Le rail d'outils de l'éditeur d'objet** (#4936).
///
/// > Directive porteur 2026-09-03 : « Plutôt que d'avoir une liste de fold, ce
/// > n'est pas mieux d'avoir une rangée de tool à gauche […] et préserver le bas
/// > pour afficher les options des tools à chaque fois ? »
///
/// ## Ce que le passage de la LISTE au RAIL change vraiment
///
/// Les deux modèles portent le même jeu d'entrées — le dépliant en avait déjà
/// une par outil. Ce qui change est une seule règle, et c'est elle que ces
/// témoins gardent : **dans une liste, tout replier est un état voulu** (le
/// doc-comment de `ComposerObjectEditorDisclosure` l'écrit : « pouvoir tout
/// replier rend la hauteur à la scène »). Dans un rail, la même bascule
/// viderait le bas — c'est-à-dire rejouerait le défaut que la liste dépliante
/// avait été écrite pour fermer.
final class ComposerObjectEditorRailTests: XCTestCase {

    // MARK: - Les entrées se DÉRIVENT, elles ne se recopient pas

    /// Le rail porte les huit outils du SDK, puis le temps, puis le plan.
    ///
    /// Il les LIT de `TextEditTool.all` : un neuvième outil doit entrer sans
    /// qu'une ligne change ici, comme l'EFFET (#4870) est entré dans les
    /// sections. Une liste écrite à la main se périmerait à la prochaine
    /// capacité — le motif exact qui a fait tomber deux témoins au #4919.
    func test_lesEntrees_seDeriventDesOutilsDuSDK() {
        let entrees = ComposerObjectEditorRail.entries
        XCTAssertEqual(entrees.count, TextEditTool.all.count + 2,
                       "les 8 outils, plus le temps et le plan")
        for outil in TextEditTool.all {
            XCTAssertTrue(entrees.contains(.tool(outil)), "\(outil) manque au rail")
        }
        XCTAssertEqual(entrees.suffix(2), [.timing, .plan],
                       "le temps puis le plan ferment le rail — ce qui QUALIFIE l'objet "
                       + "vient après ce qui le DESSINE")
    }

    /// L'ordre des outils est celui de la rangée du SDK, pas celui de
    /// `allCases` : passer de l'atelier à cet écran ne doit pas demander de
    /// réapprendre où se trouve POLICE.
    func test_lOrdreDesOutils_estCeluiDeLaRangee() {
        let outils = ComposerObjectEditorRail.entries.compactMap { entree -> TextEditTool? in
            if case .tool(let t) = entree { return t }
            return nil
        }
        XCTAssertEqual(outils, TextEditTool.all)
    }

    // MARK: - Le témoin qui PORTE la loi du lot

    /// **Le bas n'est JAMAIS vide.** Retaper l'outil déjà ouvert ne le referme
    /// pas — il reste ouvert.
    ///
    /// C'est la seule règle que le passage au rail change, et sans ce témoin
    /// « garder l'outil » et « le basculer » rendent le même verdict sur tout
    /// tap qui CHANGE d'outil, c'est-à-dire sur le cas nominal et sur lui seul.
    ///
    /// Le doc-comment de la liste dépliante disait pourquoi la bascule était
    /// bonne CHEZ ELLE : « pouvoir tout replier rend la hauteur à la scène ».
    /// Dans un rail, la scène ne récupère rien — le rail occupe le couloir, pas
    /// le bas — et un bas vide serait le défaut que cet écran existe pour
    /// fermer : « toutes les options n'existaient nulle part ».
    /// **Le bas ne PEUT PAS être vide** — et c'est le type qui le garantit, pas
    /// une garde d'exécution.
    ///
    /// La liste dépliante portait un état optionnel (`ComposerObjectEditorSection?`)
    /// parce que « tout replier » y était un geste utile : la hauteur revenait à
    /// la scène. Dans un rail, refermer ne rend rien — le rail occupe le
    /// couloir, pas le bas — et un `nil` y rejouerait le défaut que cet écran
    /// existe pour fermer : « toutes les options n'existaient nulle part ».
    ///
    /// Ce témoin lit la SOURCE parce que l'invariant est structurel : il vérifie
    /// que la vue déclare sa sélection en NON optionnel. Une garde d'exécution
    /// pourrait être oubliée à un site d'appel ; un type qui ne sait pas dire
    /// l'état interdit ne peut pas l'être.
    func test_laSelectionDeLaVue_nEstPasOptionnelle() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerObjectEditorView.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(
            source.contains("@State private var selectedTool: ComposerObjectEditorSection ="),
            "la sélection du rail doit être NON optionnelle — un `ComposerObjectEditorSection?` "
            + "rendrait le bas vide représentable, et le vide est le défaut que cet écran ferme")
        XCTAssertFalse(
            source.contains("@State private var selectedTool: ComposerObjectEditorSection?"),
            "un point d'interrogation ici rouvre exactement le défaut du dépliant")
    }

    // MARK: - #4937 — les cinq familles

    /// **La fenêtre et la timeline valent pour les CINQ familles.**
    ///
    /// C'est ce qui rend « une seule vue » possible : ni `timing` ni `plan` ne
    /// connaît le type de ce qu'il règle. Le premier lit `startTime` /
    /// `duration`, que `MeeshySceneObject` expose génériquement ; le second
    /// dessine toutes les pistes de la slide.
    func test_chaqueFamille_aSaFenetreEtSaTimeline() {
        for famille in MeeshySceneObject.Kind.allCases {
            let entrees = ComposerObjectEditorRail.entries(for: famille)
            XCTAssertTrue(entrees.contains(.timing), "\(famille) n'a pas sa fenêtre")
            XCTAssertTrue(entrees.contains(.plan), "\(famille) n'a pas sa timeline")
        }
    }

    /// **Le texte est la seule famille à porter des outils**, et c'est une
    /// absence DÉCLARÉE, pas un oubli : les quatre autres n'ont pas encore de
    /// panneau d'options propre, et une entrée sans contenu serait un contrôle
    /// inerte.
    ///
    /// Ce témoin tombera le jour où une famille en gagnera — et c'est le but :
    /// il faudra alors dire laquelle et pourquoi.
    func test_seulLeTexte_porteDesOutils() {
        for famille in MeeshySceneObject.Kind.allCases where famille != .text {
            let outils = ComposerObjectEditorRail.entries(for: famille).filter {
                if case .tool = $0 { return true }
                return false
            }
            XCTAssertTrue(outils.isEmpty,
                          "\(famille) porte un outil sans panneau d'options — un contrôle inerte")
        }
        XCTAssertEqual(ComposerObjectEditorRail.entries(for: .text).count,
                       TextEditTool.all.count + 2)
    }

    /// **Aucune famille n'a un rail VIDE.** Un objet qu'on ouvre et qui ne
    /// propose rien serait un écran qui ment sur son existence.
    func test_aucuneFamille_nAUnRailVide() {
        for famille in MeeshySceneObject.Kind.allCases {
            XCTAssertGreaterThanOrEqual(ComposerObjectEditorRail.entries(for: famille).count, 2,
                                        "\(famille)")
        }
    }

    // MARK: - Changer d'objet sans quitter l'écran

    /// **Passer d'un texte à un sticker ne vide pas le bas.**
    ///
    /// POLICE n'existe pas pour un sticker ; garder la sélection telle quelle
    /// rejouerait le défaut que l'écran existe pour fermer. Le témoin s'écrit
    /// sur ce croisement précis, parce que sur toute autre paire — même famille,
    /// ou outil commun — « garder » et « replier sur le premier » rendent le
    /// même verdict.
    func test_changerDeFamille_neLaissePasLeBasVide() {
        let apres = ComposerObjectEditorRail.selection(forFamily: .sticker,
                                                       keeping: .tool(.style))
        XCTAssertTrue(ComposerObjectEditorRail.entries(for: .sticker).contains(apres),
                      "l'outil retenu doit être SERVI par la nouvelle famille")
        XCTAssertEqual(apres, .timing, "à défaut, la première entrée de la famille")
    }

    /// **Et ce qui reste valide est CONSERVÉ.** Régler la fenêtre de trois
    /// objets de suite ne doit pas ramener trois fois au premier outil.
    func test_unOutilEncoreServi_estConserve() {
        for famille in MeeshySceneObject.Kind.allCases {
            XCTAssertEqual(ComposerObjectEditorRail.selection(forFamily: famille, keeping: .plan),
                           .plan, "\(famille) sert la timeline — la sélection doit tenir")
        }
        XCTAssertEqual(ComposerObjectEditorRail.selection(forFamily: .text, keeping: .tool(.color)),
                       .tool(.color))
    }

    /// À l'ouverture, le STYLE — le premier geste sur un texte, et la raison
    /// que la liste dépliante donnait déjà pour ne jamais naître toute fermée.
    func test_aLOuverture_leStyleEstSelectionne() {
        XCTAssertEqual(ComposerObjectEditorRail.initiallySelected, .tool(.style))
    }

    // MARK: - La bascule (#5098)

    /// **Retaper l'outil OUVERT le range.**
    ///
    /// > Directive porteur 2026-09-04 : « Lorsqu'on active un outil le retoucher
    /// > le desactive et ses options se cachent. »
    ///
    /// Le #4936 avait REFUSÉ cette bascule, et sa raison était juste à sa date :
    /// replier exigeait alors de vider `selectedTool`, donc de rendre le bas
    /// vide — le défaut même que l'écran existe pour fermer. Le #5027 a séparé
    /// les deux faits : l'outil reste SÉLECTIONNÉ pendant que son panneau se
    /// range. La bascule ne casse donc plus rien.
    func test_retaperLOutilOuvert_rangeSesOptions() {
        XCTAssertTrue(
            ComposerObjectEditorRail.collapsed(afterTapping: .tool(.style),
                                               selected: .tool(.style),
                                               wasCollapsed: false),
            "le même outil, panneau ouvert ⇒ il se range")
    }

    /// L'autre sens du MÊME geste : un panneau rangé se rouvre au doigt qui l'a
    /// rangé. Sans quoi la bascule serait un aller sans retour, et l'outil
    /// deviendrait inatteignable une fois replié.
    func test_retaperLOutilRange_leRouvre() {
        XCTAssertFalse(
            ComposerObjectEditorRail.collapsed(afterTapping: .tool(.style),
                                               selected: .tool(.style),
                                               wasCollapsed: true),
            "le même outil, panneau rangé ⇒ il se rouvre")
    }

    /// **Taper un AUTRE outil ouvre toujours** — c'est ce qui distingue une
    /// bascule d'un interrupteur global. Choisir un outil dit qu'on veut le
    /// régler ; le laisser rangé rendrait le rail muet.
    func test_taperUnAutreOutil_ouvreTOUJOURS() {
        for wasCollapsed in [true, false] {
            XCTAssertFalse(
                ComposerObjectEditorRail.collapsed(afterTapping: .tool(.color),
                                                   selected: .tool(.style),
                                                   wasCollapsed: wasCollapsed),
                "un outil AUTRE que l'ouvert déplie, quel que soit l'état d'avant")
        }
    }

    /// Le cas qui vient du #5027 : le glissement bas a rangé le panneau sans
    /// changer l'outil. Taper une entrée — même celle qui reste sélectionnée —
    /// doit rendre le panneau, jamais l'enfoncer davantage.
    func test_apresLeGesteQuiRange_leRailRouvre() {
        XCTAssertFalse(
            ComposerObjectEditorRail.collapsed(afterTapping: .plan,
                                               selected: .plan,
                                               wasCollapsed: true))
        XCTAssertFalse(
            ComposerObjectEditorRail.collapsed(afterTapping: .timing,
                                               selected: .plan,
                                               wasCollapsed: true))
    }

    /// La bascule vaut pour TOUTES les entrées, pas seulement les outils de
    /// texte : la fenêtre et le plan sont des sections comme les autres, et un
    /// geste qui marche sur huit entrées sur dix serait pire qu'absent.
    func test_laBascule_vautPourChaqueEntree() {
        for famille in MeeshySceneObject.Kind.allCases {
            for entree in ComposerObjectEditorRail.entries(for: famille) {
                XCTAssertTrue(
                    ComposerObjectEditorRail.collapsed(afterTapping: entree,
                                                       selected: entree,
                                                       wasCollapsed: false),
                    "\(entree) doit se ranger quand on la retape")
            }
        }
    }

}

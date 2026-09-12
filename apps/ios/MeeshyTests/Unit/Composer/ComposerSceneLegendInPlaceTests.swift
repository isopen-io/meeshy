import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **La légende s'écrit là où elle se lit, et son encre suit le fond**
/// (#6126, #6127 — directives porteur 2026-09-12).
///
/// > « La légende qu'on met dans le canvas […] affichée par défaut quand la
/// > scène s'affiche avec un placeholder invitant à s'exprimer ; lorsqu'on
/// > touche la zone on doit pouvoir éditer EN PLACE, on n'ouvre plus la zone en
/// > bas comme pour l'édition de contenu du poste ! »
///
/// > « Lorsque le fond de la scène est claire la description doit avoir son
/// > écriture fonction et vice versa. »
///
/// ## Pourquoi des gardes de SOURCE
///
/// Ce que ces deux lots changent n'a presque aucune sortie calculée : c'est une
/// STRUCTURE de vue (« la légende n'ouvre plus de zone en bas ») et un
/// BRANCHEMENT (« l'encre vient du scheme, pas d'une constante »). Ni l'un ni
/// l'autre ne rougirait dans un test de valeur — et les deux se défont en
/// silence à la première refonte de la vue, parce que rien ne cesse de compiler.
///
/// ## Ces gardes sont NÉGATIVES, donc elles savent mourir
///
/// Quatre d'entre elles cherchent l'ABSENCE d'un motif. Une garde négative
/// passe au vert le jour où le fichier qu'elle lit devient introuvable, ou le
/// symptôme simplement renommé. La question à se poser en les relisant n'est
/// donc jamais « passent-elles ? » mais **« rougiraient-elles si on
/// réintroduisait l'interdit ? »** — d'où `test_lesGardesLisentDesSourcesNonVides`,
/// sans laquelle une faute de chemin rendrait toute cette suite verte par
/// omission.
final class ComposerSceneLegendInPlaceTests: XCTestCase {

    // MARK: - Les sources lues

    private func hostCode() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func panelCode() throws -> String {
        AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Composer/ComposerSceneDescriptionPanel.swift"))
    }

    private func layerCode() throws -> String {
        AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Composer/ComposerDescriptionLayer.swift"))
    }

    /// Sans blancs : les gardes ci-dessous cherchent des littéraux
    /// MULTI-TOKENS, qu'un simple retour à la ligne ferait passer au vert en
    /// perdant leur protection. C'est le mode d'extinction silencieuse déjà
    /// payé sur `MeeshyComposerHostGuardTests`.
    private func compact(_ source: String) -> String {
        source.filter { !$0.isWhitespace }
    }

    // MARK: - #6126 · La légende naît visible
    //
    // **Cette loi n'est PAS gardée ici**, et c'est délibéré : la naissance du
    // volet appartient au volet, et `ComposerSceneDescriptionPanelTests` la
    // garde depuis #5138 — avec la lignée des deux directives qui se succèdent
    // (2026-09-04 « replié par défaut » puis 2026-09-12 « affichée par défaut
    // avec un placeholder invitant à s'exprimer »).
    //
    // > Une loi gardée à DEUX endroits n'est pas gardée deux fois : elle est
    // > gardée une fois et contredite une fois le jour où l'un des deux sites
    // > évolue seul. Ce qui suit garde ce qui est propre au MEUBLE.

    // MARK: - #6126 · Plus de zone en bas pour la légende

    /// **La légende ne fait plus monter de zone.** `textEditingZones` arbitrait
    /// deux textes ancrés au même bord bas ; il n'en reste qu'un, et le corps de
    /// post garde le sien.
    ///
    /// Garde NÉGATIVE sur la seule branche qui doit disparaître — et POSITIVE
    /// sur celle qui doit rester, sans quoi supprimer les deux passerait au
    /// vert.
    func test_laLegendeNOuvrePlusDeZoneEnBas() throws {
        let code = compact(try hostCode())
        XCTAssertFalse(code.contains("varsceneDescriptionEditor:someView"),
                       "La zone basse de la LÉGENDE doit avoir disparu (#6126).")
        XCTAssertTrue(code.contains("varpostContentEditor:someView"),
                      "Le CORPS du post garde sa zone du bas — c'est le contraste que la directive décrit.")
    }

    /// **La réserve du canvas ne peut plus valoir zéro en silence.** La légende
    /// s'écrivant en place, ce qui menace de la couvrir est le CLAVIER, pas une
    /// zone dont on mesure la hauteur. Reprendre `sceneDescriptionEditorHeight`
    /// pour elle aurait servi `0` sans que rien ne rougisse : la mesure existe
    /// toujours, la zone qui l'écrivait n'existe plus.
    func test_laReserveDeLaLegendeEstCelleDuClavier() throws {
        let code = compact(try hostCode())
        XCTAssertTrue(code.contains("ifeditsSceneDescription{returnkeyboardTransition?.height??0}"),
                      "La légende doit réserver la hauteur du CLAVIER (#6126).")
    }

    // MARK: - #6126 · Les portes qui mènent à la légende agissent encore

    /// **La loi 4 vérifiée sur ce qui MENAIT à ce que le lot a déplacé.**
    ///
    /// Deux portes ouvrent la légende sans passer par elle — le bouton de
    /// l'atelier et la porte `.description` du rail. Elles posaient
    /// `editsSceneDescription = true`, ce qui montait une zone ; ce drapeau
    /// CONSTATE désormais, il ne commande plus. Sans le jeton d'ouverture, les
    /// deux portes seraient devenues inertes — et une porte qui s'ouvre sur rien
    /// ne rougit nulle part.
    func test_lesPortesDeLaLegendePassentParLaPorteUnique() throws {
        let code = compact(try hostCode())
        XCTAssertFalse(code.contains("editsSceneDescription=true"),
                       "Poser le drapeau n'ouvre plus rien : passer par `openSceneDescriptionEditing()`.")
        XCTAssertTrue(code.contains("funcopenSceneDescriptionEditing()"),
                      "Le site unique d'ouverture doit exister.")
        XCTAssertEqual(AppSourceGuard.occurrences(ofIdentifier: "openSceneDescriptionEditing",
                                                  in: try hostCode()), 3,
                       "Sa déclaration et ses DEUX portes — l'atelier et le rail. Un appelant en moins = une porte inerte.")
    }

    // MARK: - #6127 · L'encre suit le fond

    /// **Le volet ne décide plus d'aucune couleur.** Il branche
    /// `CanvasChromeScheme`, la loi que le reste du chrome consomme déjà, et
    /// l'épingle sur toute sa colonne.
    func test_leVoletConsommeLeSchemeDuCanvas() throws {
        XCTAssertTrue(compact(try hostCode()).contains("chromeScheme:viewModel.canvasChromeScheme"),
                      "Le volet doit recevoir le scheme résolu par le FOND (#6127).")
        XCTAssertTrue(compact(try panelCode()).contains(".environment(\\.colorScheme,chromeScheme)"),
                      "Épinglé une fois pour toute la colonne — sinon un site est oublié.")
    }

    /// **Aucune encre en dur dans le volet.** Le blanc y était justifié par un
    /// raisonnement exact — « une teinte sémantique disparaîtrait sur un fond
    /// clair » — dont la conclusion s'arrêtait un cran trop tôt : ce qu'il faut
    /// n'est pas une teinte du THÈME, c'est une teinte du FOND.
    func test_leVoletNePeintAucuneEncreEnDur() throws {
        let code = compact(try panelCode())
        XCTAssertFalse(code.contains(".foregroundStyle(.white)"),
                       "L'encre du chevron suit `glassControlForeground()`, pas une constante.")
        XCTAssertFalse(code.contains("Color.white"),
                       "Aucune couleur ne se décide dans le volet (#6127).")
    }

    /// **Et le calque non plus** — c'est le site le plus profond des deux, et
    /// celui qu'on rate en ne corrigeant que le volet : `readerText` forçait
    /// `isDark: true` QUATRE fois, ce qui rendait l'invite et le texte rendu
    /// illisibles sur un fond clair alors même que le volet aurait été corrigé.
    func test_leCalqueNeForcePlusLObscurite() throws {
        XCTAssertFalse(compact(try layerCode()).contains("isDark:true"),
                       "Le calque LIT le `colorScheme` que son hôte épingle (#6127).")
    }

    // MARK: - La garde des gardes

    /// **Sans elle, toute cette suite est verte par omission.** Quatre des
    /// gardes ci-dessus cherchent une ABSENCE : une faute de chemin, un fichier
    /// renommé, et elles passent toutes sans rien protéger.
    func test_lesGardesLisentDesSourcesNonVides() throws {
        for (nom, source) in [("meuble", try hostCode()),
                              ("volet", try panelCode()),
                              ("calque", try layerCode())] {
            XCTAssertGreaterThan(source.count, 500,
                                 "La source du \(nom) est vide ou introuvable — les gardes négatives ne protègent plus rien.")
        }
    }
}

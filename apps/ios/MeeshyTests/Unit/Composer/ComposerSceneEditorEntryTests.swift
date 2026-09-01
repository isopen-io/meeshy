import XCTest
@testable import Meeshy

/// **La scène naît INCRUSTÉE ; on entre dans son éditeur par un geste** (#4513,
/// directive porteur 2026-09-01 : « ne pas tout montrer d'un coup — la vue
/// plein écran actuelle est trop chargée »).
///
/// ## Deux vues, pas deux implémentations d'une même
///
/// #4513 proposait un arbitrage binaire — garder `ComposerSceneSurface` OU la
/// branche `showsScene` de `ComposerDocumentSurface`. Les deux options
/// supposaient qu'il s'agit de la même vue. Le document des vues en décrit
/// deux :
///
/// | | `1b` — « Naissance de la scène » | `1c` — « Éditeur de scène » |
/// |---|---|---|
/// | doctrine | « la scène est **incrustée, pas plein écran** » | « **un seul objet à la fois** » |
/// | coin haut-gauche | **✕** fermer | **‹** retour |
/// | chrome | la rangée d'outils du document | rails + inspecteur |
///
/// > Un `‹` n'est pas un `✕`. Il dit qu'on est ENTRÉ depuis un écran parent —
/// > donc que `1c` est l'ENFANT de `1b`, pas sa variante. Une issue qui propose
/// > « l'un OU l'autre » a déjà tranché qu'il s'agit du même objet ; ici la
/// > source qui départage n'était pas dans le code, mais dans le document des
/// > vues, et elle disait qu'il en fallait deux.
///
/// ## Pourquoi c'est la règle de divulgation progressive, à l'échelle de l'écran
///
La doctrine est la **loi 8** du composer (`docs/product/MeeshyComposerDesign/BOUCLE.md`,
/// ligne 45, directive porteur 2026-08-30) : « le prisme n'affiche que ce dont
/// on a besoin, au moment où on en a besoin — un contrôle dont l'objet n'existe
/// pas ENCORE est absent, et il paraît à l'instant où son objet apparaît ».
/// `ComposerProgressiveDisclosureGuardTests` est son cliquet, pas son origine.
///
/// > Note de méthode : `grep "loi 8"` sur ce document rend **zéro**, quand
/// > `grep "loi 4"` rend trois — le fichier NUMÉROTE sa huitième loi (`**8. …**`)
/// > sans jamais la nommer ainsi, alors que ses renvois internes disent bien
/// > « loi 4 ». Un balayage par LABEL rate ce qui arrive par NUMÉRO, et le pire
/// > cas n'est pas le silence : c'est le silence dans un corpus où la même
/// > méthode répond pour les voisines, parce qu'alors l'absence se lit comme un
/// > fait sur le monde plutôt que comme une limite de la requête.
///
/// Les rails et l'inspecteur sont exactement cela — leur
/// objet est *un objet sélectionné à éditer*, qui n'existe pas quand l'auteur
/// vient d'ouvrir le composer. Les servir d'emblée n'était pas un choix de
/// disposition : c'était cette règle appliquée aux contrôles mais pas à
/// l'ÉCRAN qui les porte.
final class ComposerSceneEditorEntryTests: XCTestCase {

    // MARK: - `1b` par défaut

    /// **LE témoin du lot.** Une scène existe, l'auteur n'a rien demandé : elle
    /// est INCRUSTÉE dans le document.
    func test_uneSceneNaitIncrustee_pasDansLEditeur() {
        XCTAssertEqual(
            ComposerMountedView.mounted(surface: .document, hasScene: true, editsScene: false),
            .document,
            "la scène naît dans le document (`1b`) — l'éditeur plein écran n'est pas un état d'arrivée"
        )
    }

    /// Et le geste y fait entrer.
    func test_leGeste_ouvreLEditeur() {
        XCTAssertEqual(
            ComposerMountedView.mounted(surface: .document, hasScene: true, editsScene: true),
            .scene,
            "`1c` doit rester atteignable — une vue qu'aucun geste n'atteint est du code mort"
        )
    }

    /// **Éditer une scène qui n'existe pas n'a pas de sens**, et la règle le
    /// dit par un `&&` plutôt que par une garde chez l'appelant. Sans cela, un
    /// `editsScene` resté vrai après la suppression du dernier objet
    /// laisserait l'auteur dans un éditeur vide, sans rien à éditer.
    func test_sansScene_leGesteNeMonteRien() {
        XCTAssertEqual(
            ComposerMountedView.mounted(surface: .document, hasScene: false, editsScene: true),
            .document
        )
    }

    /// L'atelier et le mood ignorent la troisième entrée — l'atelier EST une
    /// scène (la question ne se pose pas), un mood n'en a pas.
    func test_lAtelierEtLeMood_ignorentLeGeste() {
        for geste in [true, false] {
            XCTAssertEqual(
                ComposerMountedView.mounted(surface: .scene, hasScene: true, editsScene: geste),
                .atelier)
            XCTAssertEqual(
                ComposerMountedView.mounted(surface: .mood, hasScene: false, editsScene: geste),
                .mood)
        }
    }

    /// **Les quatre vues restent atteignables** — la garde que #4072 avait fait
    /// rougir en tentant la bascule, et qui est la raison pour laquelle le
    /// décommissionnement avait été reporté. Elle passe ici parce que ce lot ne
    /// retire rien : il AJOUTE le geste qui manquait entre deux vues que le
    /// dépôt possédait déjà toutes les deux.
    func test_lesQuatreVues_restentAtteignables() {
        let atteintes = Set([
            ComposerMountedView.mounted(surface: .scene, hasScene: false, editsScene: false),
            ComposerMountedView.mounted(surface: .document, hasScene: true, editsScene: true),
            ComposerMountedView.mounted(surface: .document, hasScene: true, editsScene: false),
            ComposerMountedView.mounted(surface: .mood, hasScene: false, editsScene: false)
        ])
        XCTAssertEqual(atteintes, Set(ComposerMountedView.allCases))
    }

    // MARK: - Le câblage, lu à la source

    private func source(_ fichier: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(fichier)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// Le fusible : sans lui, les gardes de source ci-dessous seraient vertes
    /// par OMISSION le jour où un chemin change.
    func test_laGardeLitUneSourceNonVide() throws {
        XCTAssertGreaterThan(try source("MeeshyComposerHost+Surfaces.swift").count, 5_000)
    }

    /// **Le geste d'entrée est NOMMÉ, pas dérivé.** `selectedSceneItemKind` se
    /// pose aussi programmatiquement — poser un texte le sélectionne, taper un
    /// fond le sélectionne, une intake le remet à `nil`. Dériver l'écran de la
    /// sélection ferait basculer l'auteur dans l'éditeur au moment où il POSE
    /// un objet, pas au moment où il demande à l'éditer.
    func test_taperUnObjetDeLaSceneIncrustee_ouvreLEditeur() throws {
        let src = try source("MeeshyComposerHost+Surfaces.swift")
        XCTAssertTrue(
            src.contains("onSceneItemTapped:{_,kindinselectedSceneItemKind=kindeditsScene=true}"),
            "taper un objet de la scène incrustée doit ENTRER dans l'éditeur — sinon `1c` "
            + "est injoignable et ses rails sont du code mort"
        )
    }

    /// **Le `‹` revient, il ne ferme pas.** `onClose: onDismiss` fermerait le
    /// composer entier : l'auteur perdrait sa composition pour avoir voulu
    /// sortir de l'inspecteur.
    func test_leRetourDeLEditeur_neFermePasLeComposer() throws {
        let src = try source("MeeshyComposerHost+Surfaces.swift")
        XCTAssertTrue(
            src.contains("onClose:{editsScene=false}"),
            "la sortie de `1c` doit revenir à `1b`, pas démonter le composer"
        )
    }

    /// **Un seul lecteur de la vue montée.** `backgroundPaletteIsReachable`
    /// refaisait l'appel à la règle avec ses propres arguments — une seconde
    /// écriture de la même question, qui aurait divergé dès la troisième
    /// entrée en répondant « scène » pour une scène simplement incrustée.
    func test_laPaletteInterrogeLaVueMontee_elleNeLaRecalculePas() throws {
        let src = try source("MeeshyComposerHost+Intake.swift")
        XCTAssertTrue(src.contains("varbackgroundPaletteIsReachable:Bool{mountedComposerView != .scene}")
                      || src.contains("varbackgroundPaletteIsReachable:Bool{mountedComposerView!=.scene}"),
                      "une valeur lue à un seul endroit ne peut pas être lue de travers ailleurs")
    }
}

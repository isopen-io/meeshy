import XCTest
@testable import Meeshy

/// #4742 — **la description se lit sous la scène et se replie.**
///
/// > « Le texte de description doit se mettre dans la scène pliable avec un
/// > bouton V tout en bas de la scène tout de suite en dessous, et qui devient
/// > ^ après le repli pour afficher de nouveau. » — porteur, 2026-09-01
@MainActor
final class ComposerSceneDescriptionPanelTests: XCTestCase {

    /// La directive, littéralement : `V` déplié, `^` replié.
    func test_leChevron_pointeVersLeBas_deplié_etVersLeHaut_replié() {
        XCTAssertEqual(ComposerSceneDescriptionPanel.chevronSymbol(isCollapsed: false), "chevron.down")
        XCTAssertEqual(ComposerSceneDescriptionPanel.chevronSymbol(isCollapsed: true), "chevron.up")
    }

    /// **Le libellé dit l'ACTION, jamais l'état.** Un lecteur d'écran ne voit
    /// pas le chevron : « description repliée » le laisserait deviner ce qu'un
    /// appui ferait.
    func test_leLibelléVoiceOver_ditLActionEtNonLÉtat() {
        let replié = ComposerSceneDescriptionPanel.chevronLabel(isCollapsed: true)
        let déplié = ComposerSceneDescriptionPanel.chevronLabel(isCollapsed: false)

        XCTAssertNotEqual(replié, déplié, "les deux états doivent se dire différemment")
        XCTAssertFalse(replié.isEmpty)
        XCTAssertFalse(déplié.isEmpty)
        // Le libellé ne récite pas le nom du glyphe : « chevron.up » se
        // prononce mal, et une chaîne qui sert l'œil ET la voix n'en sert qu'un.
        XCTAssertFalse(replié.contains("chevron"))
        XCTAssertFalse(déplié.contains("chevron"))
    }

    /// **RETOURNÉ au #6126 : le volet RESTE pendant la saisie.**
    ///
    /// La garde d'origine était juste et sa raison exacte — « l'éditeur affiche
    /// déjà le texte ; le laisser derrière montrerait la description en double ».
    /// Cette raison est ÉTEINTE : il n'y a plus d'éditeur ailleurs. La légende
    /// s'écrit EN PLACE (directive porteur 2026-09-12), donc retirer le volet
    /// pendant la frappe retirerait le champ qu'on est en train de remplir.
    ///
    /// > Une garde qui protège un invariant contre un DOUBLON doit mourir avec
    /// > le doublon. Gardée telle quelle, elle aurait exigé de cacher la seule
    /// > chose que le lot rend visible.
    func test_leVolet_resteServiPendantLaSaisie() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        let compact = source.components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertGreaterThan(source.count, 500, "unité du meuble vide — la garde négative ne protégerait rien")
        XCTAssertFalse(compact.contains("guard!editsSceneDescriptionelse{returnnil}"),
                       "Le volet ne doit PLUS se retirer pendant la saisie : c'est lui qu'on édite (#6126).")
        XCTAssertTrue(compact.contains("varsceneDescriptionPanel:AnyView?"),
                      "… et il doit toujours exister — sans quoi l'assertion ci-dessus serait verte par omission.")
    }

    /// **#6126 — le volet NAÎT DÉPLIÉ, et #5138 est supplantée.**
    ///
    /// > « par défaut l'espace de contenu du caption doit être replié ! »
    /// > — porteur, 2026-09-04 (#5138)
    ///
    /// > « La légende qu'on met dans le canvas […] affichée par défaut quand la
    /// > scène s'affiche avec un placeholder invitant à s'exprimer »
    /// > — porteur, 2026-09-12 (#6126)
    ///
    /// La seconde directive REVIENT sur la première, et il faut dire pourquoi
    /// les deux se tiennent : #5138 refusait qu'un volet DÉPLIÉ couvre la bande
    /// basse « avant qu'il y ait la moindre légende à relire ». Le lot #6126
    /// retire cette prémisse — replié, le volet n'invitait à rien : il fallait
    /// trouver le chevron pour découvrir que la légende existe. Ce qui s'affiche
    /// d'entrée n'est plus un texte vide, c'est une INVITE.
    ///
    /// Le témoin porte sur la DÉCLARATION (`@State var … =`), jamais sur la
    /// chaîne `sceneDescriptionCollapsed = false` seule : celle-ci existe
    /// légitimement dans `openSceneDescriptionEditing()`, où ouvrir la saisie
    /// DOIT déplier. Une garde non bornée lirait l'affectation du geste et
    /// rendrait le verdict de la naissance — verte sur les deux valeurs.
    ///
    /// C'est ICI que vit la loi de naissance du volet, et nulle part ailleurs :
    /// la suite du lot #6126 (`ComposerSceneLegendInPlaceTests`) garde ce qui
    /// est propre au MEUBLE, pas ce qui est propre au volet.
    func test_leVolet_naitDéplié() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        let compact = source.components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(compact.contains("@StatevarsceneDescriptionCollapsed=false"),
                      "Le volet doit naître DÉPLIÉ : l'invite « touchez pour écrire » est ce que "
                        + "la scène montre d'emblée (#6126).")
        XCTAssertFalse(compact.contains("@StatevarsceneDescriptionCollapsed=true"),
                       "La valeur de naissance de #5138 est supplantée — voir le doc-comment.")
    }

    /// **Ouvrir la saisie DÉPLIE le volet** — inchangé depuis #5138, sauf le
    /// site qui l'écrit.
    ///
    /// Écrire dans un volet rangé laisserait l'auteur taper sans voir ce qu'il
    /// écrit. Les deux gestes étaient posés en ligne par chaque porte ; depuis
    /// #6126 ils vivent dans `openSceneDescriptionEditing()`, le site UNIQUE,
    /// et c'est lui que ce témoin lit. Poser le drapeau n'ouvre plus rien : le
    /// champ prend le focus par un JETON, parce qu'il n'est plus monté par
    /// l'apparition d'une zone mais déjà là.
    func test_ouvrirLaSaisie_déplieLeVolet() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        let compact = source.components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(
            compact.contains("funcopenSceneDescriptionEditing(){sceneDescriptionCollapsed=falsesceneDescriptionEditingRequest&+=1}"),
            "L'ordre compte : déplier AVANT de demander le focus, et les deux au même endroit.")
    }
}

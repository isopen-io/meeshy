import XCTest
import MeeshyUI
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

    // MARK: - #5008 · Une flèche DISCRÈTE, à l'échelle de la scène

    /// **La flèche se dimensionne depuis la taille RENDUE de la scène**, jamais
    /// d'un littéral (directive porteur 2026-09-03 : « proportionnelle à sa
    /// taille affichée »). Éprouvé à DEUX tailles de scène : une carte plus
    /// étroite — clavier levé, iPad, scène 1:1 — porte une flèche plus petite,
    /// dans la même proportion.
    func test_laFleche_seDimensionneAvecLaScene() {
        let large = ComposerSceneDescriptionPanel.chevronGlyphSize(sceneWidth: 402)
        let etroite = ComposerSceneDescriptionPanel.chevronGlyphSize(sceneWidth: 320)
        XCTAssertGreaterThan(large, etroite, "une scène plus grande porte une flèche plus grande")
        XCTAssertEqual(large / etroite, 402.0 / 320.0, accuracy: 0.001,
                       "proportionnelle, pas seulement croissante")
    }

    /// **Discrète ne veut pas dire illisible ni envahissante** : la proportion
    /// est bornée des deux côtés, pour une vignette comme pour un iPad.
    func test_laFleche_resteBorneeAuxExtremes() {
        let minuscule = ComposerSceneDescriptionPanel.chevronGlyphSize(sceneWidth: 40)
        let immense = ComposerSceneDescriptionPanel.chevronGlyphSize(sceneWidth: 4_000)
        XCTAssertGreaterThan(minuscule, 0)
        XCTAssertEqual(minuscule, ComposerSceneDescriptionPanel.chevronGlyphSize(sceneWidth: 80),
                       "sous le plancher, la taille ne descend plus")
        XCTAssertEqual(immense, ComposerSceneDescriptionPanel.chevronGlyphSize(sceneWidth: 3_000),
                       "au-dessus du plafond, la taille ne monte plus")
        XCTAssertLessThan(immense, MeeshyControlSize.tapTarget / 2,
                          "le DESSIN reste discret : moins de la moitié de la cible")
    }

    /// **La cible tactile reste ≥ 44 pt même si le dessin rétrécit** (dimension
    /// 5 : discret ne veut pas dire petit à toucher).
    func test_laCibleTactile_resteDe44ptQuelleQueSoitLaScene() {
        XCTAssertGreaterThanOrEqual(ComposerSceneDescriptionPanel.chevronTapTarget, MeeshyControlSize.tapTarget)
    }

    /// **Aucune bulle** — ni sous la flèche, ni sous la légende ; déplié, le
    /// texte SEUL sur un léger flou de la scène. `.ultraThinMaterial` existe
    /// depuis iOS 15 : le flou ne demande aucune branche de version.
    func test_aucuneBulle_leTexteSeLitSurUnFlouDeLaScene() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Main/Composer/ComposerSceneDescriptionPanel.swift"))
        let compact = code.components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(compact.contains("structComposerSceneDescriptionPanel"), "le fichier lu n'est pas le volet")
        XCTAssertFalse(compact.contains(".adaptiveGlass("),
                       "aucune capsule de verre : ni la flèche ni la légende ne portent de bulle (#5008)")
        XCTAssertFalse(compact.contains("Capsule()"), "la pastille de la flèche est partie (#5008)")
        XCTAssertTrue(compact.contains(".ultraThinMaterial"),
                      "le texte se lit sur un flou LÉGER de la scène, jamais sur un voile opaque")
        XCTAssertTrue(compact.contains("chevronGlyphSize(sceneWidth:"),
                      "la flèche se dessine depuis la règle, jamais d'un littéral")
    }

    // MARK: - #9450 · La légende tient 4,5:1 sur toute la palette

    /// **Le voile et l'encre viennent de la loi, mesurée par le SDK**
    /// (`SceneTextLegibilityTests` balaye la palette). Ces gardes vérifient que
    /// le volet et le calque PEIGNENT ce que le témoin mesure : un voile de la
    /// polarité opposée à l'encre, à l'opacité de la loi, et l'encre de scène
    /// pour l'invite comme pour le texte — plus jamais l'encre secondaire, qui
    /// mesurait 2,71:1 sur le rose `FF2E63`.
    func test_laLegende_peintLeVoileEtLEncreQueLeTemoinMesure() throws {
        let volet = AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Main/Composer/ComposerSceneDescriptionPanel.swift"))
            .components(separatedBy: .whitespacesAndNewlines).joined()
        let calque = AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Main/Composer/ComposerDescriptionLayer.swift"))
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(volet.contains("structComposerSceneDescriptionPanel"), "le fichier lu n'est pas le volet")
        XCTAssertTrue(calque.contains("structComposerDescriptionLayer"), "le fichier lu n'est pas le calque")
        XCTAssertTrue(volet.contains("CanvasChromeScheme.legibilityHalo(for:chromeScheme)"),
                      "le voile prend la polarité opposée à l'encre, depuis la loi")
        XCTAssertTrue(volet.contains(".opacity(CanvasChromeScheme.sceneTextVeilOpacity)"),
                      "l'opacité du voile est celle que le témoin de palette mesure")
        XCTAssertTrue(calque.contains("CanvasChromeScheme.sceneTextInk(for:colorScheme)"),
                      "le calque écrit de l'encre de scène")
        XCTAssertFalse(calque.contains("textSecondary("),
                       "l'invite en encre secondaire mesurait 2,71:1 sur le rose de la palette (#9450)")
        XCTAssertFalse(calque.contains("mentionColor(isDark:"),
                       "les teintes indigo des mentions tombent à 2,1:1 sur la scène — l'encre de scène les porte")
    }

    /// **Le voile atteint sa pleine opacité à la fin de la marge du texte**, pas
    /// à une fraction du volet : à 18 % d'une scène de 402 pt, le fondu mordait
    /// 72 pt sur des lignes qui commencent à 20 pt.
    func test_leVoile_estPleinDesLaFinDeLaMarge() {
        XCTAssertEqual(ComposerSceneDescriptionPanel.debutOpaque(fondu: 20, longueur: 400), 0.05, accuracy: 0.0001)
        XCTAssertEqual(ComposerSceneDescriptionPanel.debutOpaque(fondu: 20, longueur: 30), 0.5,
                       "les deux fondus ne se croisent jamais")
        XCTAssertEqual(ComposerSceneDescriptionPanel.debutOpaque(fondu: 20, longueur: 0), 0.5)
    }
}

import XCTest
@testable import Meeshy

/// **En Post, chaque média posé devient SA slide (#4038 — modèle § 3).**
///
/// Le modèle dit qu'en profil Post une slide EST un média du post : c'est ce qui
/// distingue un CARROUSEL (N slides d'un média) d'une SCÈNE COMPOSÉE (une slide,
/// un fond et des premiers plans). Cette suite éprouve la SOURCE — même patron
/// que `MeeshyComposerHostSceneInspectorGuardTests` : la dérivation vit dans une
/// `View`, dont l'état `@State` n'est pas atteignable sans monter UIKit.
final class MeeshyComposerHostPostSlidesGuardTests: XCTestCase {

    private func hostSource() throws -> String {
        return AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ text: String) -> String {
        text.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_theGuardReadsANonEmptySource() throws {
        let code = try hostSource()
        XCTAssertGreaterThan(code.count, 400,
            "La source du host est introuvable ou vide — les gardes ci-dessous ne mesureraient RIEN.")
        XCTAssertTrue(code.contains("struct MeeshyComposerHost"),
            "Le fichier lu n'est pas celui du host.")
    }

    /// **Story et Réel ne passent PAS par ici.** En Réel il n'y a qu'une slide
    /// (le réel EST la scène) ; en Story l'auteur compose sur celle qu'il
    /// regarde. Sans ce gate, choisir une photo en Story fabriquerait une slide
    /// au lieu de la poser sur la scène courante.
    func test_sync_isGatedOnThePostProfile() throws {
        let compacted = compact(try hostSource())
        XCTAssertTrue(compacted.contains("funcsyncPostMediaIntoSlides(){guardselectedFormat==.postelse{return}"),
            "`syncPostMediaIntoSlides` doit sortir immédiatement hors du profil Post — une slide par "
                + "média est la sémantique du POST, pas celle de Story ni de Réel (modèle § 3).")
    }

    /// La première slide est RÉEMPLOYÉE : un composer neuf naît avec une slide
    /// vierge, et lui en ajouter une pour le premier média laisserait un
    /// carrousel dont la première vue est vide.
    func test_sync_reusesTheVirginFirstSlide_beforeAddingAny() throws {
        let compacted = compact(try hostSource())
        XCTAssertTrue(compacted.contains("ifslideIdByMediaURL.isEmpty,"),
            "La dérivation doit d'abord regarder si AUCUN média n'a encore sa slide…")
        XCTAssertTrue(compacted.contains("(viewModel.currentSlide.effects.mediaObjects??[]).isEmpty{"),
            "…ET si la slide courante est vierge, pour la réemployer au lieu d'en ajouter une.")
    }

    /// Un média retiré de la bande retire SA slide — sinon le carrousel garderait
    /// une vue vide que rien ne peut plus atteindre.
    func test_sync_removesTheSlideOfAMediaThatIsGone() throws {
        let compacted = compact(try hostSource())
        XCTAssertTrue(compacted.contains("for(url,slideId)inslideIdByMediaURLwhere!present.contains(url)"),
            "La dérivation doit retirer la slide de tout média absent de `documentContentMedia`.")
        XCTAssertTrue(compacted.contains("viewModel.removeSlide(at:index)"),
            "…par `removeSlide`, la primitive du SDK — jamais en mutant `slides` directement.")
    }

    /// **Site UNIQUE.** Les trois portes d'ingestion (photothèque, caméra,
    /// importateur) écrivent toutes dans `documentLocalMedia` : brancher la
    /// dérivation sur la LISTE plutôt que sur chaque porte évite d'en oublier
    /// une — un inventaire qu'on ne peut pas laisser diverger.
    func test_sync_isWiredOnTheMediaList_notOnEachIngestionDoor() throws {
        let compacted = compact(try hostSource())
        XCTAssertTrue(compacted.contains(".adaptiveOnChange(of:documentLocalMedia,initial:true){_,_insyncPostMediaIntoSlides()}"),
            "La dérivation doit être branchée sur `documentLocalMedia` — le seul point que les trois "
                + "portes d'ingestion traversent toutes.")
    }

    /// Taper une vignette amène SA slide sur la scène. Sans le relais, la bande
    /// resterait un inventaire et le carrousel ne serait pas navigable depuis
    /// l'écran document (loi 4 : un contrôle existe s'il a un effet).
    func test_thumbnailTap_selectsTheSlideOfThatMedia() throws {
        let compacted = compact(try hostSource())
        XCTAssertTrue(compacted.contains("onSelectMedia:{mediain"),
            "Le meuble doit relayer le tap d'une vignette…")
        XCTAssertTrue(compacted.contains("viewModel.selectSlide(at:index)"),
            "…jusqu'à `selectSlide`, sans quoi taper une vignette ne changerait rien à l'écran.")
    }

    // MARK: - Le rail en barre haute (#4047)

    /// **Le rail DIT où l'on est, pas seulement ce que le post contient.**
    /// Sans anneau, taper une vignette change la scène sans que rien, dans le
    /// rail, ne le confirme : un contrôle dont l'effet est ailleurs ET
    /// invisible ici. La résolution appartient au MEUBLE — lui seul tient la
    /// carte `média → slide` et la slide courante.
    func test_theRailKnowsWhichSlideIsOnScreen() throws {
        let compacted = compact(try hostSource())
        XCTAssertTrue(compacted.contains("selectedMediaURL:selectedSlideMediaURL"),
            "Le meuble doit dire à la surface QUELLE vignette cercler.")
        XCTAssertTrue(
            compacted.contains("slideIdByMediaURL.first(where:{$0.value==current})?.key"),
            "La résolution passe par l'INDEX, jamais par l'ordre des tableaux — l'ordre ment dès qu'un "
                + "média est retiré au milieu."
        )
    }

    /// **Le rail vit dans la BARRE HAUTE, et en UN seul exemplaire.** Deux
    /// bandes montrant les mêmes vignettes seraient deux inventaires à faire
    /// diverger, et la seconde mentirait au premier chemin d'ingestion qui
    /// n'alimente que l'une. C'est le « d'un seul tenant » de #4047.
    ///
    /// **RE-POINTÉE au #4064**, et il faut dire pourquoi plutôt que de la
    /// réparer en silence : #4070 a sorti la barre haute de la surface document
    /// pour en faire un composant PARTAGÉ (`ComposerTopBar`), que la surface de
    /// scène consomme aussi. La garde, elle, lisait toujours
    /// `ComposerDocumentSurface.swift` — elle a donc rougi sur un fichier où le
    /// rail n'était plus, pendant que le rail allait très bien. Une garde de
    /// source ne suit pas le code qu'elle protège : c'est à la main qu'on la
    /// déplace, et le gate ciblé de #4070 ne l'exécutait pas.
    ///
    /// Elle en sort RENFORCÉE. « Un seul exemplaire » ne se compte plus dans un
    /// fichier : il se prouve par l'ABSENCE du rail chez les deux surfaces qui
    /// consomment la barre — la forme que #4070 rend vérifiable et que la
    /// version d'avant ne pouvait pas exprimer.
    func test_theRailLivesInTheTopBar_andOnlyThere() throws {
        func source(_ fichier: String) throws -> String {
            let url = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Composer/\(fichier)")
            return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        }

        let barre = try source("ComposerTopBar.swift")
        XCTAssertTrue(barre.contains("struct ComposerTopBar"),
            "La source de la barre haute est introuvable — la garde ne mesurerait RIEN.")
        XCTAssertEqual(
            barre.components(separatedBy: "slideRail").count - 1, 2,
            "`slideRail` doit apparaître EXACTEMENT deux fois : sa déclaration et son unique montage, "
                + "dans le `body` de la barre haute. Un troisième site est un second rail."
        )

        guard let corps = barre.range(of: "var body: some View"),
              let fin = barre.range(of: "private var slideRail", range: corps.upperBound..<barre.endIndex)
        else {
            return XCTFail("Le `body` de la barre haute doit précéder `slideRail` — c'est lui qui le MONTE.")
        }
        XCTAssertTrue(
            barre[corps.upperBound..<fin.lowerBound].contains("slideRail"),
            "La barre haute doit monter le rail. Ailleurs, il redevient la bande basse que #4047 remplace."
        )

        // **La moitié « et nulle part ailleurs », désormais VÉRIFIABLE.** Les
        // deux surfaces consomment la barre ; qu'aucune ne nomme le rail est ce
        // qui garantit qu'il n'en existe qu'un.
        for surface in ["ComposerDocumentSurface.swift", "ComposerSceneSurface.swift"] {
            let code = try source(surface)
            XCTAssertTrue(code.contains("ComposerTopBar("),
                "\(surface) doit CONSOMMER la barre — sinon cette garde ne dit rien de cette surface.")
            XCTAssertFalse(code.contains("slideRail"),
                "\(surface) redéclare un rail de slides : c'est le second inventaire que #4047 interdit.")
        }
    }

    // MARK: - Le `⋯` de la barre haute (#4047)

    /// **La règle, par COMPORTEMENT.** Ce qu'un menu offre est une décision
    /// produit : elle s'éprouve sur la règle pure, jamais en lisant une vue.
    func test_theOverflow_servesOnlyEntriesThatHaveSomethingToDo() {
        XCTAssertEqual(
            ComposerOverflowPolicy.entries(
                hasBackground: false, hasMedia: false, hasText: false, hasLocation: false),
            [],
            "Un composer VIERGE n'offre aucune entrée — donc aucun `⋯`. Un bouton qui n'ouvre rien est "
                + "l'UI morte que la loi 4 interdit, et un menu vide en est la forme la plus sournoise : "
                + "il a l'air de marcher jusqu'au tap."
        )
        XCTAssertEqual(
            ComposerOverflowPolicy.entries(
                hasBackground: false, hasMedia: true, hasText: false, hasLocation: false),
            [.clearAll],
            "Sans fond, « retirer le fond » n'a rien à retirer — elle est ABSENTE, jamais grisée."
        )
        XCTAssertEqual(
            ComposerOverflowPolicy.entries(
                hasBackground: true, hasMedia: false, hasText: false, hasLocation: false),
            [.removeBackground, .clearAll],
            "Un fond posé sert les deux, et dans cet ORDRE : le geste ciblé avant le geste destructeur."
        )
        XCTAssertEqual(
            ComposerOverflowPolicy.entries(
                hasBackground: false, hasMedia: false, hasText: false, hasLocation: true),
            [.clearAll],
            "Un LIEU seul suffit à rendre « tout effacer » utile — l'oublier laisserait un lieu posé "
                + "qu'aucun geste du menu ne retire."
        )
    }

    /// **Le meuble ne réécrit pas la règle.** Une condition posée dans un `body`
    /// est invisible aux tests — c'est la faute que ce dossier a déjà commise
    /// deux fois (la conjonction de l'éventail, puis le gate du plateau).
    func test_theOverflow_isGatedOnTheRule_notOnAnInlineCondition() throws {
        let compacted = compact(try hostSource())
        XCTAssertTrue(compacted.contains("ComposerOverflowPolicy.entries("),
            "Les entrées doivent venir de la RÈGLE, lue une seule fois.")
        XCTAssertTrue(
            compacted.contains("overflowMenu:documentOverflowEntries.isEmpty?nil:AnyView(overflowMenu)"),
            "Aucune entrée ⇒ AUCUN bouton. Monter le menu quand même donnerait un `⋯` qui s'ouvre sur "
                + "le vide."
        )
    }

    /// **« Tout effacer » doit passer par `viewModel.reset()`.**
    ///
    /// Vider le seul état du MEUBLE laisserait `carriedContentSources` intact
    /// dans le ViewModel — le cache d'idempotence d'`applyContentMedia`. La
    /// MÊME photo re-choisie après un effacement serait alors sautée EN
    /// SILENCE : rien ne casse, rien ne loggue, l'écran reste vide là où
    /// l'auteur vient de poser une image. C'est le défaut que ce lot corrige
    /// dans le SDK, et cette garde interdit de le rouvrir depuis l'app.
    func test_clearAll_goesThroughTheViewModelReset_notOnlyTheHostState() throws {
        let compacted = compact(try hostSource())
        XCTAssertTrue(compacted.contains("case.clearAll:viewModel.reset()"),
            "L'effacement doit COMMENCER par `viewModel.reset()` — lui seul oublie les sources portées.")
        for efface in ["documentText=\"\"", "documentLocalMedia=[]", "documentBackground=nil",
                       "documentLocation=nil", "slideIdByMediaURL=[:]"] {
            XCTAssertTrue(compacted.contains(efface),
                "« Tout effacer » laisse `\(efface)` derrière lui — un effacement partiel est pire "
                    + "qu'aucun : l'auteur croit être reparti de zéro.")
        }
    }

    /// Retirer le fond touche les DEUX niveaux, et pour deux raisons distinctes :
    /// l'INTENTION de l'auteur (`documentBackground`, qui fait naître la scène)
    /// et la couleur du CANVAS, qui doit rester valide — `background` n'est pas
    /// optionnel dans `StoryEffects`, et du vide y peindrait du NOIR.
    func test_removeBackground_clearsTheIntentAndKeepsTheCanvasPaintable() throws {
        let compacted = compact(try hostSource())
        XCTAssertTrue(
            compacted.contains("case.removeBackground:documentBackground=nilviewModel.clearBackground()"),
            "Retirer le fond doit effacer l'INTENTION et remettre le canvas sur une couleur valide."
        )
    }
}

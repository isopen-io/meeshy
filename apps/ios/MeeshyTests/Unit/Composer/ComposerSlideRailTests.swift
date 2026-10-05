import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **La rangée haute montre les SCÈNES, pas les médias** (constat porteur
/// 2026-09-06 : « lorsque je crée une nouvelle scène elle n'apparaît pas
/// immédiatement dans la mini-preview »).
///
/// ## La cause, écrite dans le doc-comment qu'elle contredisait
///
/// `ComposerTopBar` déclarait ses vignettes « une par `MeeshySlide`, ce qui veut
/// dire une par média posé en FOND ». Les deux moitiés de cette phrase ont été
/// vraies ensemble tant que toute slide naissait d'un média. Un fond COLORÉ les
/// sépare : la scène existe, elle n'a aucun média, et la rangée — filtrée par
/// `slideIdByMediaURL` — n'a rien à montrer.
///
/// > **Une équivalence écrite comme un fait devient un piège le jour où ses deux
/// > termes divergent.** Elle ne se relit pas : elle se lit comme une
/// > définition, et c'est ce qui la rend invisible.
///
/// Le défaut a été aggravé le même jour par le retrait de la bande de pastilles
/// (directive porteur) : elle comptait les slides, elle, et masquait donc ce
/// trou. **Retirer un doublon révèle ce que l'autre ne couvrait pas.**
final class ComposerSlideRailTests: XCTestCase {

    private func slideAvecMedia(_ id: String) -> StorySlide {
        var s = StorySlide(id: id)
        s.effects.mediaObjects = [StoryMediaObject(id: "m-\(id)", postMediaId: "p-\(id)",
                                                   aspectRatio: 1, isBackground: true)]
        return s
    }

    private func slideSansMedia(_ id: String, couleur: String = "FF2E63") -> StorySlide {
        var s = StorySlide(id: id)
        s.effects.background = couleur
        return s
    }

    /// **LE témoin du défaut.** Une scène à fond coloré n'a aucun média — et
    /// doit tout de même occuper sa place dans la rangée. Sans lui, l'auteur
    /// crée une scène et rien à l'écran ne le lui dit.
    func test_uneSceneSansMedia_aSaTuile() {
        let tuiles = ComposerHeaderTiles.tiles(for: [
            slideAvecMedia("a"), slideSansMedia("b")
        ])
        XCTAssertEqual(tuiles.map(\.id), ["a", "b"],
                       "une scène sans média reste une scène : la rangée la compte")
    }

    /// **Autant de tuiles que de scènes, toujours.** C'est l'invariant que la
    /// règle précédente ne pouvait pas tenir : elle comptait des médias, et deux
    /// médias sur une même scène — un fond et un objet posé — en auraient donné
    /// deux.
    func test_leCompte_suitLesScenes_jamaisLesMedias() {
        for scenes in [1, 2, 5] {
            let slides = (0..<scenes).map { slideSansMedia("s\($0)") }
            XCTAssertEqual(ComposerHeaderTiles.tiles(for: slides).count, scenes)
        }
    }

    /// **L'ORDRE est celui de la publication.** La rangée sert à savoir OÙ l'on
    /// est ; un ordre qui ne serait pas celui de lecture désignerait la mauvaise
    /// scène au doigt.
    func test_lOrdre_estCeluiDesScenes() {
        let slides = ["z", "a", "m"].map { slideSansMedia($0) }
        XCTAssertEqual(ComposerHeaderTiles.tiles(for: slides).map(\.id), ["z", "a", "m"])
    }

    // MARK: - La corbeille

    /// **Seule la tuile qu'on REGARDE porte la corbeille.** Six cibles
    /// destructrices dans une rangée de navigation, c'est une suppression par
    /// mégarde qui attend son heure.
    func test_laCorbeille_estSurLaTuileCourante_etElleSeule() {
        for index in 0..<3 {
            XCTAssertEqual(
                ComposerHeaderTiles.showsDelete(sceneIndex: index, currentIndex: 1, sceneCount: 3),
                index == 1, "tuile \(index)")
        }
    }

    /// **Aucune corbeille sous deux scènes.** `removeSlide` refuse de descendre
    /// au-dessous d'une slide : l'offrir là donnerait un bouton qui ne fait
    /// rien. Le témoin discriminant du lot — sans lui, la règle « la tuile
    /// courante » suffirait et laisserait passer le contrôle mort.
    func test_uneSeuleScene_nOffrePasLaCorbeille() {
        XCTAssertFalse(
            ComposerHeaderTiles.showsDelete(sceneIndex: 0, currentIndex: 0, sceneCount: 1))
    }

    /// Aucune scène ⇒ aucune rangée. Un rail vide occuperait la hauteur d'une
    /// bande pour ne rien dire (loi 4).
    func test_aucuneScene_aucuneTuile() {
        XCTAssertTrue(ComposerHeaderTiles.tiles(for: []).isEmpty)
    }

    /// **Une tuile se touche là où elle se VOIT** (#9126, mesuré au simulateur
    /// le 2026-10-02) : la mini-preview déborde sa vignette de 24 pt, et sans
    /// forme de toucher la tuile voisine couvrait la première — « Scène 1 » ne
    /// se sélectionnait jamais.
    func test_laTuile_restreintSonToucherASaVignette() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerSlideRail.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        let tuile = try XCTUnwrap(code.range(of: "private func tuile("))
        XCTAssertTrue(code[tuile.lowerBound...].contains(".contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.xxs))"))
    }

    // MARK: - La tuile EST la vignette de la scène (#5009 + #5037)

    /// **Une scène existe, sa vignette se voit** (#5037 : « dès qu'une scène
    /// existe »). Le rail se taisait sous deux scènes ; la story la plus simple
    /// — une seule scène — n'avait donc jamais d'aperçu.
    func test_showsRail_uneScenePresente_vrai() {
        XCTAssertTrue(ComposerHeaderTiles.showsRail(sceneCount: 1, scenePresent: true))
    }

    /// Le document d'un post sans scène montée n'a rien à résumer : une
    /// vignette noire y annoncerait une scène que l'auteur n'a pas.
    func test_showsRail_uneSceneNonMontee_faux() {
        XCTAssertFalse(ComposerHeaderTiles.showsRail(sceneCount: 1, scenePresent: false))
    }

    func test_showsRail_deuxScenes_vrai_aucune_faux() {
        XCTAssertTrue(ComposerHeaderTiles.showsRail(sceneCount: 2, scenePresent: false))
        XCTAssertFalse(ComposerHeaderTiles.showsRail(sceneCount: 0, scenePresent: true))
    }

    /// **Une vignette seule n'est pas un bouton** (loi 4) : elle ne navigue vers
    /// rien, VoiceOver la lit comme un aperçu.
    func test_tilesNavigate_seulementAPartirDeDeuxScenes() {
        XCTAssertFalse(ComposerHeaderTiles.tilesNavigate(sceneCount: 1))
        XCTAssertTrue(ComposerHeaderTiles.tilesNavigate(sceneCount: 2))
    }

    /// **Toucher (+) : la scène naît, sélectionnée, et sa vignette est NOIRE**
    /// (#5009). Les deux premiers points passaient déjà ; le troisième est ce
    /// que l'auteur VOIT — c'est lui qui manquait.
    @MainActor
    func test_addSlide_laNouvelleScene_estPresente_selectionnee_etNoire() {
        let vm = StoryComposerViewModel()
        var premiere = vm.currentSlide
        premiere.effects.background = "FF2E63"
        vm.currentSlide = premiere
        vm.addSlide()
        let tuiles = ComposerHeaderTiles.tiles(for: vm.slides)
        XCTAssertEqual(tuiles.count, 2)
        XCTAssertEqual(vm.currentSlideIndex, 1, "la scène créée est celle qu'on compose")
        XCTAssertTrue(ComposerHeaderTiles.showsRail(sceneCount: tuiles.count, scenePresent: true))
        XCTAssertTrue(SceneThumbnailContent.isBlank(tuiles[1], bgImage: nil),
                      "une scène neuve n'a rien : sa vignette est noire")
        XCTAssertFalse(SceneThumbnailContent.isBlank(tuiles[0], bgImage: nil))
    }

    /// **Le plafond de dix scènes se DIT** (#5009) : `addSlide()` y est un
    /// no-op, et un geste sans effet visible se lit comme un bouton inerte.
    func test_additionOutcome_auPlafond_refuseEtAnnonce() {
        XCTAssertEqual(ComposerSceneAddition.outcome(canAddSlide: true), .added)
        XCTAssertEqual(ComposerSceneAddition.outcome(canAddSlide: false), .refusedAtCap)
    }

    // MARK: - Quand repeindre une vignette

    /// La première image d'une tuile se peint TOUT DE SUITE — une tuile qui
    /// naît vide attendrait le débounce pour rien.
    func test_refresh_premiereImage_immediate() {
        XCTAssertFalse(ComposerSceneThumbnailRefresh.waits(isShowingImage: false, isCached: false, isBlank: false))
    }

    /// Une vignette en cache ou une scène vide (du noir) ne coûtent rien.
    func test_refresh_cacheOuSceneVide_immediate() {
        XCTAssertFalse(ComposerSceneThumbnailRefresh.waits(isShowingImage: true, isCached: true, isBlank: false))
        XCTAssertFalse(ComposerSceneThumbnailRefresh.waits(isShowingImage: true, isCached: false, isBlank: true))
    }

    /// **Pendant un geste sur la scène, la vignette attend que la main se
    /// pose** : l'image précédente reste à l'écran (jamais de trou), le rendu
    /// part après le débounce — et pas à chaque image du glisser.
    func test_refresh_sceneQuiChange_debounce() {
        XCTAssertTrue(ComposerSceneThumbnailRefresh.waits(isShowingImage: true, isCached: false, isBlank: false))
        XCTAssertGreaterThan(ComposerSceneThumbnailRefresh.debounceNanoseconds, 0)
        XCTAssertLessThanOrEqual(ComposerSceneThumbnailRefresh.debounceNanoseconds, 300_000_000)
    }

    /// **La tuile ne monte plus `SlideMiniPreview`** — le second chemin de rendu
    /// que #5037 nommait comme piège : elle peint la vignette du composite
    /// partagé (`SceneThumbnailRenderer`).
    func test_laTuile_peintLaVignetteDuCompositePartage() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerSlideRail.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        XCTAssertFalse(code.contains("SlideMiniPreview("))
        XCTAssertTrue(code.contains("SceneThumbnailRenderer.thumbnail("))
    }

    /// **Le refus du onzième `(+)` se VOIT** (#5009) : le meuble est présenté
    /// en `fullScreenCover` par chacune de ses portes, qui couvre l'hôte de
    /// toasts de la racine. L'hôte est donc monté par le meuble lui-même, une
    /// seule fois — une porte qui le reposerait doublerait chaque toast.
    func test_leMeuble_monteSonHoteDeToasts_uneSeuleFois() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        func code(_ chemin: String) throws -> String {
            AppSourceGuard.stripComments(
                try String(contentsOf: racine.appendingPathComponent(chemin), encoding: .utf8))
        }
        let couches = try code("Meeshy/Features/Main/Composer/MeeshyComposerHost+Layers.swift")
        XCTAssertTrue(couches.contains(".feedbackToastOverlay()"),
                      "le meuble doit monter l'hôte des toasts sur son chrome")
        for porte in ["DocumentComposerDoor", "MediaComposerDoor", "ShareComposeDoor",
                      "StoryEditComposer", "StoryRepublishComposer", "ConversationImageSceneDoor",
                      "ComposerMoodSurface"] {
            XCTAssertFalse(try code("Meeshy/Features/Main/Composer/\(porte).swift").contains(".feedbackToastOverlay()"),
                           "\(porte) repose l'hôte des toasts : chaque toast paraîtrait deux fois")
        }
    }
}

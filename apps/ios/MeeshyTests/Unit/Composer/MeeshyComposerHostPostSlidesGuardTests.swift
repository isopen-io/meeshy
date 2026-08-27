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
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Unit/Composer
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
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
}

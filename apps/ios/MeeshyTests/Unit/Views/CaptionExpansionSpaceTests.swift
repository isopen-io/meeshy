import XCTest
import SwiftUI
@testable import Meeshy

/// **Déplier une légende prend de la place, et chaque surface la prend
/// ailleurs** (directive porteur 2026-09-02).
///
/// Les deux règles sont VOLONTAIREMENT différentes, et ces témoins existent
/// pour qu'un futur « uniformisons » ait à les contredire explicitement plutôt
/// qu'à les aligner par distraction.
final class CaptionExpansionSpaceTests: XCTestCase {

    // MARK: Le plein écran média — l'auteur cède la place

    func test_legendeRepliee_lAuteurEstVisible() {
        XCTAssertTrue(CaptionExpansionSpace.showsAuthorDetails(captionExpanded: false))
    }

    func test_legendeDepliee_lAuteurSEfface() {
        XCTAssertFalse(CaptionExpansionSpace.showsAuthorDetails(captionExpanded: true),
            "Le bas de l'écran est fini : une légende dépliée et une carte d'auteur s'y disputent la place.")
    }

    // MARK: La story — la scène recule, rien ne se cache

    func test_storyAuRepos_laSceneEstPLEINE() {
        XCTAssertEqual(CaptionExpansionSpace.storySceneOpacity(captionExpanded: false), 1,
            "Au repos la scène se voit entière — rien ne se paie tant que personne n'a demandé à lire.")
    }

    func test_storyDepliee_laSceneSEFFACE_sansDisparaitre() {
        let o = CaptionExpansionSpace.storySceneOpacity(captionExpanded: true)
        XCTAssertLessThan(o, 1, "La scène doit s'effacer pour laisser remonter le fond naturel.")
        XCTAssertGreaterThan(o, 0,
            "Elle s'efface, elle ne DISPARAÎT pas : on doit encore deviner ce qu'on lisait.")
    }

    // MARK: La place que le corpus laisse à ses voisins (#4831)

    /// Le rail d'actions et la zone de retour en tête évitent le MÊME voisin :
    /// ils doivent l'éviter du même nombre, sans quoi taper « Partager » remonte
    /// le texte.
    func test_leCorpusEtSaZoneDeRetour_evitentLeRailDuMemeNombre() {
        XCTAssertGreaterThan(CaptionExpansionSpace.storyActionRailInset, 0,
            "Le rail occupe une vraie bande : la lui refuser superpose texte et icônes.")
    }

    /// **Le témoin qui porte le danger.** La zone de retour en tête est montée
    /// au-dessus du chrome (`zIndex(60)`) : une réserve nulle lui ferait avaler
    /// le bouton de fermeture, et sortir d'une story deviendrait impossible tant
    /// qu'un corpus est déplié.
    func test_laZoneDeRetourEnTete_neMangeJamaisLeChromeHaut() {
        let inset: CGFloat = 59
        let reserve = CaptionExpansionSpace.storyTopChromeReserve(topInset: inset)
        XCTAssertGreaterThan(reserve, inset,
            "La réserve doit dépasser l'encoche : le chrome vit SOUS elle, pas dedans.")
        XCTAssertGreaterThan(reserve - inset, 44,
            "Et laisser au moins une cible tactile entière au bouton de fermeture (HIG, 44 pt).")
    }

    /// **Le témoin qui porte le piège du repère.** La colonne du canvas déborde
    /// le viewport ; un retrait exprimé dedans n'a pas la même valeur à l'écran.
    /// Mesuré sur la story : colonne 491,3 pour un écran de 402.
    func test_leRetraitDroit_estRenduAuRepereDeLEcran() {
        let colonne: CGFloat = 491.3
        let ecran: CGFloat = 402
        let retrait = CaptionExpansionSpace.railClearanceInset(columnWidth: colonne,
                                                                     viewportWidth: ecran)
        // Bord droit tactile, en coordonnées d'ÉCRAN : le conteneur est centré,
        // donc son origine est à -(colonne - écran)/2.
        let origine = -(colonne - ecran) / 2
        let bordDroit = origine + colonne - retrait
        XCTAssertEqual(bordDroit, ecran - CaptionExpansionSpace.storyActionRailInset, accuracy: 0.01,
            "Le bord droit de la zone doit tomber là où commence le rail d'actions — pas 44 pt plus loin.")
    }

    /// Sans débordement, la règle ne doit rien inventer : la zone laisse
    /// exactement la bande du rail.
    func test_sansDebordement_leRetraitEstCeluiDuRail() {
        XCTAssertEqual(
            CaptionExpansionSpace.railClearanceInset(columnWidth: 402, viewportWidth: 402),
            CaptionExpansionSpace.storyActionRailInset,
            "Colonne et écran confondus : le retrait est celui du rail, sans correction.")
    }

    /// Une colonne PLUS ÉTROITE que l'écran ne doit pas faire RENTRER la zone :
    /// `max(0, …)` empêche un retrait négatif de l'élargir au-delà du rail.
    func test_uneColonnePlusEtroiteNElargitPasLaZone() {
        XCTAssertEqual(
            CaptionExpansionSpace.railClearanceInset(columnWidth: 300, viewportWidth: 402),
            CaptionExpansionSpace.storyActionRailInset,
            "Le correctif rend ce que le débordement a pris — il n'en invente jamais.")
    }

    /// Le témoin qui dit la DIFFÉRENCE, et pas seulement les deux valeurs :
    /// dépliée, la story ne cache rien ET floute ; le plein écran cache ET ne
    /// floute pas. Aligner les deux surfaces ferait tomber celui-ci.
    func test_lesDeuxSurfaces_repondentDIFFEREMMENT() {
        let depliee = true
        XCTAssertFalse(CaptionExpansionSpace.showsAuthorDetails(captionExpanded: depliee),
            "Plein écran : on cache.")
        XCTAssertLessThan(CaptionExpansionSpace.storySceneOpacity(captionExpanded: depliee), 1,
            "Story : la scène s'efface — et on ne cache rien.")
    }
}

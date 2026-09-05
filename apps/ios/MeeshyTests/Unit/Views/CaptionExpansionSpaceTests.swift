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

    // MARK: Le plein écran média — l'auteur ne cède plus, il MONTE (2026-09-05)

    /// **Ces deux témoins affirmaient le contraire, et ils avaient raison sur
    /// la directive du 2026-09-02.**
    ///
    /// > « En plein écran le "voir plus" de la légende doit juste afficher le
    /// > texte déplié avec effet ombre, en repoussant le détail de l'auteur
    /// > vers le haut. » — porteur, 2026-09-05
    ///
    /// Le changement n'est pas la correction d'un défaut : c'est un
    /// renversement assumé. Ce qui le rend sûr est qu'il retire une MÉCANIQUE
    /// (un gate + un fondu) plutôt qu'il n'en ajoute une : la pile ancrée en
    /// bas pousse déjà ses voisins vers le haut quand la légende grandit, et
    /// l'ombre de `MediaCaptionOverlay` porte la lisibilité que le retrait des
    /// voisins servait.
    ///
    /// `showsAuthorDetails` est SUPPRIMÉE plutôt que forcée à `true` — une
    /// fonction qui ignore son paramètre promet une dépendance qui n'existe
    /// plus. Ce qui la remplace ne peut pas être un unitaire : c'est une garde
    /// de SOURCE, parce que ce qu'on garde est une ABSENCE.
    func test_lePleinEcran_neConditionnePlusLAuteurSurLeDepliage() throws {
        let source = AppSourceGuard.stripComments(
            try MyStoriesSourceCorpus.text(
                of: "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"))
        let code = source.components(separatedBy: .whitespacesAndNewlines).joined()

        XCTAssertFalse(code.contains("showsAuthorDetails"),
            "La carte d'auteur ne se conditionne plus sur le dépliage : la légende la POUSSE.")
        XCTAssertTrue(code.contains("dimsBackgroundWhenExpanded:false"),
            "« JUSTE le texte déplié avec effet ombre » — le voile du composant masquerait "
            + "le média que l'utilisateur est venu regarder.")
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

    /// **Les deux surfaces répondent toujours DIFFÉREMMENT, et la différence a
    /// changé de nature.**
    ///
    /// Avant : le plein écran CACHAIT ses voisins, la story EFFAÇAIT sa scène.
    /// Depuis le 2026-09-05 : le plein écran ne prend la place de personne — il
    /// pousse —, la story efface toujours sa scène. Une seule des deux paie
    /// donc quelque chose au dépliage, et c'est celle qui n'a rien sous sa
    /// légende.
    ///
    /// Ce témoin reste ce qu'il était : le garde-fou contre un futur
    /// « uniformisons », qui devra le contredire explicitement.
    func test_lesDeuxSurfaces_repondentDIFFEREMMENT() {
        XCTAssertLessThan(CaptionExpansionSpace.storySceneOpacity(captionExpanded: true), 1,
            "Story : la scène s'efface, parce qu'elle n'a rien d'autre à donner.")
        XCTAssertEqual(CaptionExpansionSpace.storySceneOpacity(captionExpanded: false), 1,
            "…et seulement pendant la lecture.")
    }
}

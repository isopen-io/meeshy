import XCTest
import CoreGraphics
@testable import MeeshySDK

/// **Les trois portes du plein cadre, et ce qui les distingue** (#6142).
///
/// Trois gestes y entrent et ils ne disent pas la même chose : on s'arrête sur
/// ce qu'on veut REGARDER (appui long), on se laisse porter par ce qu'on veut
/// continuer d'ÉCOUTER (glissement), et le tap reste le geste sans intention.
/// `pausedOnEntry` est ce qui porte la différence — et un booléen qui ne
/// change rien serait décoratif, donc la pastille le rend.
///
/// Ces témoins ne montent aucune vue : la loi est une fonction de transition,
/// et un état d'immersion qui demanderait un écran pour être éprouvé serait la
/// preuve qu'il n'est pas un état mais un enchevêtrement.
///
/// Source : `docs/superpowers/specs/2026-09-12-lecture-media-plateau-design.md`
/// § 2.3 (les gestes) et § 3.2 (l'état unique).
final class StagePresentationTests: XCTestCase {

    // MARK: - Les trois portes

    func test_longPress_entersFullFrame_andPauses() {
        let entered = StagePresentation.carded.after(.longPress)

        XCTAssertTrue(entered.isFull)
        XCTAssertTrue(entered.pausedOnEntry,
                      "l'appui long est la porte de celui qui s'ARRÊTE sur le média")
    }

    func test_swipeUp_entersFullFrame_withoutInterrupting() {
        let entered = StagePresentation.carded.after(.swipeUp)

        XCTAssertTrue(entered.isFull)
        XCTAssertFalse(entered.pausedOnEntry,
                       "le glissement est la porte de celui qui veut CONTINUER d'écouter")
    }

    func test_tap_entersFullFrame_withoutInterrupting() {
        let entered = StagePresentation.carded.after(.tap)

        XCTAssertTrue(entered.isFull)
        XCTAssertFalse(entered.pausedOnEntry, "le tap est le geste SANS intention")
    }

    /// **Le tap est la seule porte qui soit aussi une sortie.** Les deux autres
    /// disent « entre » ; lui dit « bascule ».
    func test_tap_fromFullFrame_returnsToTheCard() {
        XCTAssertEqual(StagePresentation.full(pausedOnEntry: false).after(.tap), .carded)
        XCTAssertEqual(StagePresentation.full(pausedOnEntry: true).after(.tap), .carded)
    }

    /// On sort par le tap quelle que soit la porte empruntée : une entrée en
    /// pause ne piège pas le lecteur dans un état dont il ne connaîtrait pas la
    /// sortie.
    func test_anyDoorIn_sameDoorOut() {
        for door in [StageEntry.tap, .longPress, .swipeUp] {
            XCTAssertEqual(StagePresentation.carded.after(door).after(.tap), .carded,
                           "entré par \(door), le tap doit rendre la carte")
        }
    }

    func test_longPress_whileAlreadyFull_pausesAgain() {
        let repaused = StagePresentation.full(pausedOnEntry: false).after(.longPress)

        XCTAssertEqual(repaused, .full(pausedOnEntry: true),
                       "l'appui long PAUSE : il fait la même chose des deux côtés de la porte")
    }

    // MARK: - Ce que l'état commande au cadrage

    /// **L'état d'immersion PILOTE la géométrie** — c'est tout l'objet du lot.
    /// Un état qui ne ferait que masquer du chrome laisserait le média
    /// exactement là où il était, et le plein cadre ne serait qu'un fondu.
    func test_thePresentation_drivesTheFramingSolver() {
        XCTAssertEqual(StagePresentation.carded.framing, .carded)
        XCTAssertEqual(StagePresentation.full(pausedOnEntry: false).framing, .full)
        XCTAssertEqual(StagePresentation.full(pausedOnEntry: true).framing, .full)
    }

    /// Le plateau — les deux couloirs et tout ce qu'ils portent — n'existe que
    /// dans l'état cadré. En plein cadre il n'est pas atténué : il n'est pas là.
    func test_thePlateau_belongsToTheCardedStateAlone() {
        XCTAssertTrue(StagePresentation.carded.showsPlateau)
        XCTAssertFalse(StagePresentation.full(pausedOnEntry: false).showsPlateau)
        XCTAssertFalse(StagePresentation.full(pausedOnEntry: true).showsPlateau)
    }

    func test_theCard_neverClaimsToBePaused() {
        XCTAssertFalse(StagePresentation.carded.pausedOnEntry,
                       "l'état cadré n'a emprunté aucune porte — il n'a rien mis en pause")
    }

    // MARK: - La pastille « en pause »

    /// **Une pastille « en pause » sur une PHOTO serait un mensonge.** Rien n'y
    /// est en cours, donc rien n'y est arrêté : la porte de l'appui long reste
    /// la même, mais elle n'a rien à annoncer.
    func test_thePausedBadge_neverAppearsOverSomethingThatCannotPlay() {
        XCTAssertFalse(MediaStagePause.showsBadge(presentation: .full(pausedOnEntry: true),
                                                  isPlayable: false,
                                                  isPlaying: false))
    }

    func test_thePausedBadge_rendersTheLongPressDoor() {
        XCTAssertTrue(MediaStagePause.showsBadge(presentation: .full(pausedOnEntry: true),
                                                 isPlayable: true,
                                                 isPlaying: false),
                      "sans elle, `pausedOnEntry` serait un booléen que personne ne voit")
    }

    func test_thePausedBadge_isAbsentWhenTheDoorWasTheSwipe() {
        XCTAssertFalse(MediaStagePause.showsBadge(presentation: .full(pausedOnEntry: false),
                                                  isPlayable: true,
                                                  isPlaying: false),
                       "le glissement n'interrompt rien — il n'y a rien à annoncer")
    }

    /// **La pastille ne survit pas à la reprise.** `pausedOnEntry` dit par
    /// quelle PORTE on est entré, jamais où en est la lecture : laisser la
    /// pastille sur ce seul drapeau la ferait flotter au-dessus d'une vidéo qui
    /// joue — un indicateur qui affirme le contraire de ce qu'on voit.
    func test_thePausedBadge_disappearsWhenPlaybackResumes() {
        XCTAssertFalse(MediaStagePause.showsBadge(presentation: .full(pausedOnEntry: true),
                                                  isPlayable: true,
                                                  isPlaying: true))
    }

    // MARK: - Le glissement contre la fermeture verticale

    private static let threshold: CGFloat = 150

    private func drag(_ width: CGFloat, _ height: CGFloat,
                      from presentation: StagePresentation = .carded) -> MediaStageGestures.DragOutcome {
        MediaStageGestures.resolveDrag(translation: CGSize(width: width, height: height),
                                       presentation: presentation,
                                       threshold: Self.threshold)
    }

    /// **LA collision du lot.** La galerie fermait déjà au glissement vertical,
    /// dans les DEUX sens ; la loi donne maintenant le HAUT à l'entrée en plein
    /// cadre. Une même course de doigt ne peut pas signifier deux choses, donc
    /// le sens tranche : vers le haut on OUVRE, vers le bas on ferme.
    func test_aLongUpwardDrag_opensTheFullFrame_insteadOfDismissing() {
        XCTAssertEqual(drag(0, -200), .entersFull)
    }

    func test_aLongDownwardDrag_stillDismisses() {
        XCTAssertEqual(drag(0, 200), .dismisses,
                       "le bas garde son sens : on repousse le média vers sa bulle")
    }

    /// Sous le seuil, le média suit le doigt et revient — aucune des deux
    /// décisions n'est prise sur une hésitation.
    func test_aShortDrag_onlyFollowsTheFinger() {
        XCTAssertEqual(drag(0, -40), .follows)
        XCTAssertEqual(drag(0, 40), .follows)
    }

    /// Le pager horizontal garde ses courses : un glissement à dominante
    /// horizontale n'est ni une entrée ni une fermeture.
    func test_aHorizontalDrag_belongsToThePager() {
        XCTAssertEqual(drag(-220, -60), .ignored)
        XCTAssertEqual(drag(220, 60), .ignored)
        XCTAssertEqual(drag(0, 0), .ignored)
    }

    /// **En plein cadre, la porte est déjà ouverte.** Le glissement vers le haut
    /// n'y a plus rien à ouvrir — et lui rendre la fermeture ferait que le MÊME
    /// geste ouvre dans un état et quitte tout dans l'autre, l'ambiguïté la plus
    /// coûteuse qu'on puisse poser sur un plein écran.
    func test_anUpwardDrag_inTheFullFrame_opensNothingAndDismissesNothing() {
        XCTAssertEqual(drag(0, -200, from: .full(pausedOnEntry: false)), .follows)
    }

    func test_aDownwardDrag_dismissesFromBothStates() {
        XCTAssertEqual(drag(0, 200, from: .full(pausedOnEntry: true)), .dismisses)
    }

    // MARK: - L'appui long contre le déplacement

    /// **Un média AGRANDI a déjà pris le doigt.** Le déplacement y est monté en
    /// `highPriorityGesture` avec une distance minimale de 1 pt : armer l'appui
    /// long par-dessus ferait arbitrer les deux à chaque pose de doigt, et la
    /// première dérive d'un point déciderait laquelle gagne. Le zoom est déjà
    /// une inspection volontaire — il n'a pas besoin d'une seconde porte.
    func test_theLongPress_yieldsToThePanOfAZoomedMedium() {
        XCTAssertFalse(MediaStageGestures.longPressArmed(isActive: true, isTransformed: true))
    }

    func test_theLongPress_isArmedOnTheRestingActivePage() {
        XCTAssertTrue(MediaStageGestures.longPressArmed(isActive: true, isTransformed: false))
    }

    /// Une page voisine, réalisée par la fenêtre de rendu mais que personne ne
    /// regarde, ne répond à aucun geste — sinon un appui destiné à la page
    /// courante ouvrirait le plein cadre d'une autre.
    func test_theLongPress_isDisarmedOffTheActivePage() {
        XCTAssertFalse(MediaStageGestures.longPressArmed(isActive: false, isTransformed: false))
    }
}

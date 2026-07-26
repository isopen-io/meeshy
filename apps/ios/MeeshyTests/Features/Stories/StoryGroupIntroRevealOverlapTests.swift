import XCTest
import MeeshySDK
@testable import Meeshy

/// Recouvrement « retrait du voile / apparition du slide » (directive user
/// 2026-07-26).
///
/// Deux défauts distincts se cumulaient à la sortie de l'interlude d'identité :
///
/// 1. L'enchaînement se lisait comme DEUX animations successives — le voile
///    s'en allait, puis, après un blanc, la story arrivait. Le lot fait partir
///    les deux ensemble en écourtant l'attente du recouvrement
///    (`StoryGroupIntroPolicy.revealOverlap`).
/// 2. Ce chemin-là n'animait la story ENTRANTE d'aucune façon : passer d'un
///    groupe à l'autre la posait d'un bloc, alors qu'avancer DANS un groupe
///    respectait le zoom / slide / reveal choisi par l'auteur. D'où
///    `StoryOpeningEntrance`, table unique partagée par les deux chemins.
///
/// Les deux helpers ciblés sont `nonisolated` et purement calculatoires : ces
/// tests n'ont besoin d'aucune vue, d'aucun simulateur, d'aucun timing réel.
///
/// CE QUI N'EST VOLONTAIREMENT PAS TESTÉ : l'instant où le voile a FINI de
/// disparaître. Les courbes de `StoryGroupIntroPolicy.dismissAnimation` sont
/// conservées telles quelles par choix utilisateur — un ressort non borné
/// (`.spring(response: 0.38…)`) traîne au-delà de sa réponse nominale, donc la
/// disparition effective déborde la durée annoncée de l'interlude. C'est un
/// arbitrage assumé, pas un bug : une assertion « le voile est parti à 2,2 s »
/// serait rouge par construction. On n'épingle donc QUE l'instant de
/// DÉCLENCHEMENT, qui est le seul que ce lot décide.
final class StoryGroupIntroRevealOverlapTests: XCTestCase {

    // MARK: - (a) L'attente et le recouvrement recomposent la durée annoncée

    /// Invariante de composition : quelle que soit la durée nominale (dès
    /// qu'elle dépasse le recouvrement), `attente + recouvrement` redonne
    /// exactement la durée annoncée. Autrement dit, avancer la révélation ne
    /// RALLONGE ni ne RACCOURCIT l'interlude — il déplace seulement l'instant
    /// où le mouvement commence.
    func test_holdPlusOverlap_reconstructsTheAnnouncedDuration() {
        for total: TimeInterval in [0.5, 1.0, 2.2, 3.0, 5.0] {
            XCTAssertEqual(
                StoryGroupIntroPolicy.holdDuration(total: total)
                    + StoryGroupIntroPolicy.revealOverlap,
                total,
                accuracy: 0.0001,
                "Sur \(total) s annoncées, attente + recouvrement doit redonner \(total) s."
            )
        }
    }

    // MARK: - (b) Ancre métier

    /// Les deux valeurs décidées avec l'utilisateur, épinglées telles quelles :
    /// sur les 2,2 s nominales de `StoryViewerView.groupIntroDuration`, le
    /// retrait du voile — et l'apparition du slide qui part avec lui —
    /// s'amorcent à 2,0 s.
    func test_businessAnchor_overlapIs200ms_andHoldIs2Seconds() {
        XCTAssertEqual(StoryGroupIntroPolicy.revealOverlap, 0.2, accuracy: 0.0001,
                       "Le recouvrement décidé est de 200 ms.")
        XCTAssertEqual(StoryGroupIntroPolicy.holdDuration(total: 2.2), 2.0, accuracy: 0.0001,
                       "2,2 s annoncées → révélation déclenchée à 2,0 s.")
    }

    // MARK: - (c) Jamais d'attente négative

    /// Un interlude plus court que le recouvrement ne doit pas produire une
    /// attente négative : `Task.sleep` s'y comporte de travers. On plafonne à
    /// « pas d'attente » — révélation immédiate, qui est le comportement
    /// correct dans ce cas.
    func test_holdDuration_isClampedToZero_forVeryShortIntros() {
        XCTAssertEqual(StoryGroupIntroPolicy.holdDuration(total: 0.05), 0,
                       "Un interlude de 50 ms révèle immédiatement, il n'attend pas −150 ms.")
        XCTAssertGreaterThanOrEqual(StoryGroupIntroPolicy.holdDuration(total: 0), 0)
    }

    // MARK: - (d) Il y a réellement quelque chose à animer, pour CHAQUE ouverture

    /// Le défaut d'origine de ce chemin n'était pas « une mauvaise animation »
    /// mais « AUCUNE animation » : la story entrante était déjà à son état de
    /// repos quand le voile partait. Ce test le rend impossible à réintroduire
    /// en silence — pour chaque grammaire d'ouverture (transition absente
    /// comprise), l'état ARMÉ doit différer de l'état de REPOS, et partir d'une
    /// opacité nulle.
    func test_armedEntrance_differsFromRest_forEveryOpening() {
        // `nil` = story sans transition configurée : le chemin le plus fréquent,
        // et celui qui n'animait rien du tout avant le 2026-07-26.
        let openings: [StoryTransitionEffect?] = [nil] + StoryTransitionEffect.allCases.map { Optional($0) }

        for opening in openings {
            let armed = StoryOpeningEntrance.armed(for: opening)
            // État de repos tel que `dismissGroupIntro` / `crossFadeStory` le
            // rétablissent DANS la transaction animée. `.reveal` est la seule
            // grammaire dont le repos est « actif » : son cercle doit finir
            // plein écran.
            let rest = StoryOpeningEntrance(contentOpacity: 1,
                                            openingScale: 1.0,
                                            openingSlideFraction: 0,
                                            textSlideOffset: 0,
                                            isRevealActive: opening == .reveal)

            XCTAssertNotEqual(armed, rest,
                              "Ouverture \(String(describing: opening)) : l'état armé est déjà " +
                              "l'état de repos — il n'y aurait rien à animer, le slide serait posé d'un bloc.")
            XCTAssertEqual(armed.contentOpacity, 0, accuracy: 0.0001,
                           "Ouverture \(String(describing: opening)) : la story entrante part invisible, " +
                           "c'est l'animation qui la fait exister.")
        }
    }

    /// La révélation circulaire s'ARME fermée : le drapeau ne bascule à vrai que
    /// DANS la transaction animée, sinon `RevealCircleShape` naîtrait déjà plein
    /// écran et le cercle ne s'ouvrirait jamais.
    func test_armedEntrance_revealStartsClosed() {
        XCTAssertFalse(StoryOpeningEntrance.armed(for: .reveal).isRevealActive)
    }

    /// Les grammaires géométriques arment bien une géométrie à rattraper — sans
    /// ça, `.zoom` et `.slide` dégénèreraient en simple fondu.
    func test_armedEntrance_geometricOpeningsArmAGeometry() {
        XCTAssertNotEqual(StoryOpeningEntrance.armed(for: .zoom).openingScale, 1.0,
                          "Le zoom doit partir d'une échelle différente de 1.")
        // Le slide arme un débattement HORIZONTAL (fraction de la largeur du
        // canvas, aligné sur le SDK) et non plus un décalage vertical en
        // points : c'est ce que rendent l'aperçu du composer et l'export.
        XCTAssertNotEqual(StoryOpeningEntrance.armed(for: .slide).openingSlideFraction, 0,
                          "Le slide doit partir d'un débattement non nul.")
    }

    // MARK: - (e) Le recouvrement tient dans la fenêtre de swap de groupe

    /// `groupTransition` échange le groupe 0,38 s après le début du geste
    /// (arête du cube à ~90 %). Un recouvrement plus long ferait démarrer
    /// l'apparition de la story AVANT que le nouveau groupe ne soit en place :
    /// on animerait l'entrée de la story qu'on est en train de quitter.
    func test_revealOverlap_staysWithinTheGroupSwapDelay() {
        XCTAssertLessThan(StoryGroupIntroPolicy.revealOverlap, 0.38,
                          "Le recouvrement doit rester sous le délai de swap de groupTransition.")
    }

    // MARK: - (f) Garde structurelle : l'armement vit dans dismissGroupIntro

    /// Où l'armement est écrit n'est pas un détail de style. Il est posé HORS
    /// animation (`contentOpacity = 0`…) et n'est ramené au repos que par la
    /// transaction qui suit IMMÉDIATEMENT, sans le moindre `await` entre les
    /// deux. Le déplacer dans le `Task` du timer — « armer, dormir 200 ms,
    /// animer » — rendrait l'annulation destructrice : la Task annulée entre
    /// les deux temps laisserait `contentOpacity` à 0 pour de bon, c'est-à-dire
    /// un slide NOIR permanent.
    ///
    /// La garde lit du code, pas des commentaires : ceux de `presentGroupIntroIfNeeded`
    /// citent justement `contentOpacity` pour expliquer l'interdiction, et les
    /// laisser dans la fenêtre analysée déclencherait un faux positif.
    func test_openingEntrance_isArmedInDismiss_neverInTheTimerTask() throws {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()   // Stories
                .deletingLastPathComponent()   // Features
                .deletingLastPathComponent()   // MeeshyTests
                .deletingLastPathComponent()   // ios
                .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView.swift"),
            encoding: .utf8
        )

        guard let dismissStart = source.range(of: "private func dismissGroupIntro("),
              let dismissEnd = source.range(of: "\n    }",
                                            range: dismissStart.upperBound..<source.endIndex) else {
            return XCTFail("dismissGroupIntro introuvable")
        }
        let dismissBody = String(source[dismissStart.upperBound..<dismissEnd.lowerBound])
        XCTAssertTrue(
            dismissBody.contains("StoryOpeningEntrance.armed(for:"),
            "dismissGroupIntro doit armer la grammaire d'apparition du slide révélé — " +
            "sans ça, le passage d'un groupe à l'autre repose la story d'un bloc."
        )

        guard let taskStart = source.range(of: "groupIntroTask = Task { @MainActor in"),
              let taskEnd = source.range(of: "prefetchNeighborGroupIntros()",
                                         range: taskStart.upperBound..<source.endIndex) else {
            return XCTFail("Task de présentation de l'interlude introuvable")
        }
        let taskCode = String(source[taskStart.upperBound..<taskEnd.lowerBound])
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")

        XCTAssertFalse(
            taskCode.contains("StoryOpeningEntrance"),
            "L'armement ne doit JAMAIS vivre dans la Task du timer : une annulation " +
            "entre l'armement et l'animation fige la story à opacité 0 (slide noir permanent)."
        )
        XCTAssertFalse(
            taskCode.contains("contentOpacity"),
            "La Task du timer ne doit toucher AUCUN pilote d'apparition — elle attend, " +
            "puis délègue entièrement à dismissGroupIntro."
        )
    }
}

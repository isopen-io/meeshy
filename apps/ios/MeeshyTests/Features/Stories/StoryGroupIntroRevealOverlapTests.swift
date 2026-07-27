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

    // MARK: - (d) Il y a réellement quelque chose à animer
    //
    // Le défaut d'origine de ce chemin n'était pas « une mauvaise animation »
    // mais « AUCUNE animation » : la story entrante était déjà à son état de
    // repos quand le voile partait. La parade a d'abord été une table
    // d'armement SwiftUI locale au lecteur (`StoryOpeningEntrance`) — c'est
    // elle qui a été retirée : le même effet nommé se rendait alors de trois
    // façons selon la surface (aperçu composer, export, lecteur).
    //
    // La preuve « il se passe quelque chose » a donc changé de côté. Elle vit
    // désormais dans le SDK, là où l'ouverture est réellement rendue :
    // `StoryReaderOpeningPlaybackTests` couvre les quatre grammaires jouées par
    // un canvas né en `.play`, le rejeu explicite (`replayOpening`, le cas de
    // CE chemin : l'interlude masque la story pendant son ouverture) et
    // l'unicité du jeu. Ce qui reste vérifiable ici est structurel — section (f).

    // MARK: - (e) Le recouvrement tient dans la fenêtre de swap de groupe

    /// `groupTransition` échange le groupe 0,38 s après le début du geste
    /// (arête du cube à ~90 %). Un recouvrement plus long ferait démarrer
    /// l'apparition de la story AVANT que le nouveau groupe ne soit en place :
    /// on animerait l'entrée de la story qu'on est en train de quitter.
    func test_revealOverlap_staysWithinTheGroupSwapDelay() {
        XCTAssertLessThan(StoryGroupIntroPolicy.revealOverlap, 0.38,
                          "Le recouvrement doit rester sous le délai de swap de groupTransition.")
    }

    // MARK: - (f) Garde structurelle : la demande vit dans dismissGroupIntro

    /// Où l'apparition est déclenchée n'est pas un détail de style. Le voile est
    /// posé HORS animation (`contentOpacity = 0`) et n'est ramené au repos que
    /// par la transaction qui suit IMMÉDIATEMENT, sans le moindre `await` entre
    /// les deux. Déplacer ça dans le `Task` du timer — « armer, dormir 200 ms,
    /// animer » — rendrait l'annulation destructrice : la Task annulée entre
    /// les deux temps laisserait `contentOpacity` à 0 pour de bon, c'est-à-dire
    /// un slide NOIR permanent.
    ///
    /// S'y ajoute la demande de rejeu de l'ouverture. L'interlude est un overlay
    /// posé PAR-DESSUS le canvas : la story naît dessous et joue son ouverture à
    /// l'abri du voile, donc invisible. Sans ce rejeu, le passage d'un groupe à
    /// l'autre reposerait la story d'un bloc — le défaut corrigé le 2026-07-26.
    ///
    /// La garde lit du code, pas des commentaires : ceux de `presentGroupIntroIfNeeded`
    /// citent justement `contentOpacity` pour expliquer l'interdiction, et les
    /// laisser dans la fenêtre analysée déclencherait un faux positif.
    func test_openingReplay_isRequestedInDismiss_neverInTheTimerTask() throws {
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
            dismissBody.contains("openingGeneration"),
            "dismissGroupIntro doit redemander l'ouverture du slide révélé — sans ça, " +
            "le passage d'un groupe à l'autre repose la story d'un bloc : elle a joué " +
            "son ouverture sous le voile, personne ne l'a vue."
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
            taskCode.contains("openingGeneration"),
            "La demande de rejeu ne doit JAMAIS vivre dans la Task du timer : une annulation " +
            "entre l'armement et l'animation fige la story à opacité 0 (slide noir permanent)."
        )
        XCTAssertFalse(
            taskCode.contains("contentOpacity"),
            "La Task du timer ne doit toucher AUCUN pilote d'apparition — elle attend, " +
            "puis délègue entièrement à dismissGroupIntro."
        )
    }
}

import XCTest
import SwiftUI
@testable import MeeshyUI

/// `MeeshyMoodBadge` — atome extrait le 2026-08-22 (lot 3 de la Lentille)
/// pour que la pastille d'humeur ne soit pas écrite TROIS fois : l'avatar
/// (`MeeshyAvatar.moodBadge`), la pastille « moi » du rail Lentille, et — sans
/// cette extraction — chaque auteur du rail, dont le lot 3 rétablit le mood.
///
/// Ce qui se teste ici est ce qui peut régresser sans qu'aucune vue ne le
/// dise : le portillon d'animation et la trame du ressort. Le rendu lui-même
/// n'est pas inspectable (aucun framework d'inspection SwiftUI dans ce dépôt),
/// mais les deux appelants passent par CES symboles.
@MainActor
final class MoodBadgeTests: XCTestCase {

    // MARK: - Portillon : Reduce Motion ÉTEINT, il ne raccourcit pas

    /// `.repeatForever` est la seule famille d'animation qui ne s'arrête
    /// jamais d'elle-même : elle tourne tant que la vue est à l'écran. Les
    /// utilisateurs activent Reduce Motion parce qu'un mouvement soutenu
    /// déclenche vertige, nausée ou migraine (troubles vestibulaires) —
    /// WCAG 2.3.3 et la HIG demandent tous deux qu'on l'honore.
    func test_shouldAnimate_isFalseUnderReduceMotion_evenWhenTheCallerAsksForIt() {
        XCTAssertFalse(
            MeeshyMoodBadge.shouldAnimate(animates: true, reduceMotion: true),
            "Reduce Motion doit ÉTEINDRE le ressort. Le ressort historique de " +
            "`MeeshyAvatar.moodBadge` ne consultait ni `accessibilityReduceMotion` ni " +
            "`meeshyForceReduceMotion` : sur la trail de stories, une animation sans fin " +
            "restait hors de portée du réglage."
        )
    }

    /// Le réglage peut seulement RETIRER l'animation — jamais l'ajouter là où
    /// l'appelant n'en veut pas (contextes de liste : N ressorts simultanés
    /// pendant le défilement, précédent « hog device 2026-07-03 »).
    func test_shouldAnimate_staysFalseWhenTheCallerDoesNotAskForIt() {
        XCTAssertFalse(MeeshyMoodBadge.shouldAnimate(animates: false, reduceMotion: false))
        XCTAssertFalse(MeeshyMoodBadge.shouldAnimate(animates: false, reduceMotion: true))
    }

    func test_shouldAnimate_isTrueOnlyWhenBothAgree() {
        XCTAssertTrue(MeeshyMoodBadge.shouldAnimate(animates: true, reduceMotion: false))
    }

    /// Témoin de discrimination : le portillon doit dépendre des DEUX
    /// entrées. Une implémentation qui rendrait `animates` tel quel (l'état
    /// AVANT ce lot) passerait les trois témoins ci-dessus sauf le premier —
    /// celui-ci l'énonce comme une table complète, pour qu'un futur
    /// raccourci ne puisse pas la réduire à une seule variable.
    func test_gate_isTheConjunctionOfIntentAndSetting() {
        let table: [(animates: Bool, reduceMotion: Bool, expected: Bool)] = [
            (true,  false, true),
            (true,  true,  false),
            (false, false, false),
            (false, true,  false),
        ]
        for row in table {
            XCTAssertEqual(
                MeeshyMoodBadge.shouldAnimate(animates: row.animates, reduceMotion: row.reduceMotion),
                row.expected,
                "animates=\(row.animates), reduceMotion=\(row.reduceMotion)"
            )
        }
    }

    // MARK: - Trame du ressort (reprise trait pour trait de MeeshyAvatar)

    func test_spring_reproducesTheHistoricalAvatarPulse() {
        XCTAssertEqual(MeeshyMoodBadge.restingScale, 1.0)
        XCTAssertEqual(MeeshyMoodBadge.pulsedScale, 1.18)
        XCTAssertEqual(MeeshyMoodBadge.springResponse, 0.5)
        XCTAssertEqual(MeeshyMoodBadge.springDamping, 0.4)
        XCTAssertEqual(MeeshyMoodBadge.glyphRatio, 0.65)
    }

    /// Le départ décalé au hasard existe pour qu'une rangée de pastilles ne
    /// respire pas à l'unisson. Un délai maximal nul les remettrait en phase
    /// sans qu'aucun test de rendu ne le voie.
    func test_startDelay_isStaggered_notInstant() {
        XCTAssertGreaterThan(MeeshyMoodBadge.maximumStartDelay, 0)
        XCTAssertEqual(MeeshyMoodBadge.maximumStartDelay, 1.5)
    }

    // MARK: - Garde de source : une seule écriture du ressort

    /// `MeeshyAvatar` doit DÉLÉGUER, plus réimplémenter. Sans ce témoin, une
    /// copie du ressort pourrait revenir dans l'avatar et échapper au
    /// portillon d'accessibilité qui, lui, ne vit que dans l'atome.
    func test_meeshyAvatar_delegatesTheMoodPulseToTheAtom() throws {
        let avatar = try Self.source("Primitives/MeeshyAvatar.swift")
        XCTAssertTrue(
            avatar.contains("MeeshyMoodBadge("),
            "MeeshyAvatar doit monter l'atome partagé."
        )
        XCTAssertFalse(
            avatar.contains("repeatForever"),
            "MeeshyAvatar ne doit plus porter de `repeatForever` : le seul ressort de " +
            "pastille d'humeur vit dans `MoodBadge.swift`, derrière le portillon Reduce " +
            "Motion."
        )
    }

    /// L'atome, lui, DOIT consulter le réglage — système et override in-app.
    func test_theAtom_consultsBothReduceMotionSources() throws {
        let badge = try Self.source("Primitives/MoodBadge.swift")
        XCTAssertTrue(
            badge.contains("@Environment(\\.accessibilityReduceMotion)"),
            "L'atome doit lire le réglage système."
        )
        XCTAssertTrue(
            badge.contains("@Environment(\\.meeshyForceReduceMotion)"),
            "…et l'override in-app, qui ne peut que RENFORCER le réglage système " +
            "(`MeeshyMotion.shouldReduce`)."
        )
        XCTAssertTrue(
            badge.contains("MeeshyMotion.shouldReduce("),
            "La résolution passe par la règle partagée, jamais par un `||` recopié."
        )
    }

    private static func source(_ relativePath: String) throws -> String {
        let url = ComposerSourceGuard.packageRoot
            .appendingPathComponent("Sources/MeeshyUI")
            .appendingPathComponent(relativePath)
        return ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }
}

// apps/ios/MeeshyTests/Unit/Components/SyncPillAccentWindowTests.swift

import XCTest
@testable import Meeshy

/// **Une nouvelle entrée accentue la pastille six secondes, et chaque nouvelle
/// entrée relance ces six secondes** (issue #4050, directive porteur
/// 2026-08-27).
///
/// La règle amende #4026, qui liait l'accent à la PRÉSENCE du signal : la
/// frappe tenait l'accent tant qu'elle durait et le rendait à la seconde où
/// elle s'arrêtait. Les deux bords étaient faux.
///
/// - **Borne haute** : au bout de six secondes la pastille reprend sa forme
///   normale, MÊME si la personne écrit encore. Elle reste visible — c'est
///   l'accent qui retombe, pas la pastille.
/// - **Borne basse** : l'accent tient ses six secondes même si la frappe
///   s'arrête avant ; ce qui l'éteint est l'échéance, jamais la disparition du
///   signal.
/// - **Réarmement** : chaque entrée NEUVE relance une fenêtre PLEINE, à partir
///   de son arrivée — « et ainsi de suite ».
///
/// Loi PURE, sans horloge murale : la peau injecte l'instant, même patron que
/// `ScrollTimePillLaw` et `FocalMagnificationLaw`.
final class SyncPillAccentWindowTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    // MARK: - Armement

    func test_deadline_newEntry_armsAFullWindow() {
        XCTAssertEqual(
            SyncPillAccentLaw.deadline(previous: nil, hasNewEntries: true, entriesAreEmpty: false, now: t0),
            t0.addingTimeInterval(SyncPillAccentLaw.accentWindow),
            "une entrée neuve arme une fenêtre PLEINE à partir de son arrivée."
        )
    }

    func test_isAccented_insideTheWindow_isTrue() {
        let deadline = t0.addingTimeInterval(SyncPillAccentLaw.accentWindow)
        XCTAssertTrue(
            SyncPillAccentLaw.isAccented(deadline: deadline, now: t0.addingTimeInterval(3)),
            "à mi-fenêtre, la pastille est encore dans sa forme bien visible."
        )
    }

    // MARK: - Borne haute : la frappe continue, l'accent retombe quand même

    func test_isAccented_atTheDeadline_isFalse_evenWhileStillTyping() {
        let deadline = t0.addingTimeInterval(SyncPillAccentLaw.accentWindow)
        XCTAssertFalse(
            SyncPillAccentLaw.isAccented(deadline: deadline, now: deadline),
            "au bout de six secondes la pastille reprend sa forme normale — la durée de la frappe n'entre pas dans cette décision (amende #4026)."
        )
    }

    func test_deadline_ongoingSignalWithoutNewEntry_doesNotExtendTheWindow() {
        let armed = t0.addingTimeInterval(SyncPillAccentLaw.accentWindow)
        XCTAssertEqual(
            SyncPillAccentLaw.deadline(
                previous: armed,
                hasNewEntries: false,
                entriesAreEmpty: false,
                now: t0.addingTimeInterval(4)
            ),
            armed,
            "une frappe qui CONTINUE n'est pas une entrée neuve : elle ne repousse pas l'échéance."
        )
    }

    // MARK: - Borne basse : la frappe s'arrête, l'accent tient ses six secondes

    func test_deadline_signalStoppedButOtherEntriesRemain_keepsTheWindow() {
        let armed = t0.addingTimeInterval(SyncPillAccentLaw.accentWindow)
        XCTAssertEqual(
            SyncPillAccentLaw.deadline(
                previous: armed,
                hasNewEntries: false,
                entriesAreEmpty: false,
                now: t0.addingTimeInterval(2)
            ),
            armed,
            "le signal qui a armé la fenêtre a disparu, d'autres entrées restent : l'échéance tient — ce qui éteint l'accent est l'horloge, jamais la disparition du signal."
        )
    }

    // MARK: - Réarmement

    func test_deadline_secondEntryMidWindow_armsAFreshFullWindow() {
        let armed = t0.addingTimeInterval(SyncPillAccentLaw.accentWindow)
        let arrival = t0.addingTimeInterval(3)
        XCTAssertEqual(
            SyncPillAccentLaw.deadline(previous: armed, hasNewEntries: true, entriesAreEmpty: false, now: arrival),
            arrival.addingTimeInterval(SyncPillAccentLaw.accentWindow),
            "un deuxième typeur relance une fenêtre PLEINE depuis SON arrivée — jamais le reliquat de la précédente."
        )
    }

    func test_deadline_entryArrivingOnTheLastInstant_stillRearms() {
        let armed = t0.addingTimeInterval(SyncPillAccentLaw.accentWindow)
        XCTAssertEqual(
            SyncPillAccentLaw.deadline(previous: armed, hasNewEntries: true, entriesAreEmpty: false, now: armed),
            armed.addingTimeInterval(SyncPillAccentLaw.accentWindow),
            "une arrivée à l'instant même de l'échéance réarme : la fenêtre se ferme sur le temps, pas sur un tour de boucle."
        )
    }

    func test_deadline_successiveArrivals_rearmEveryTime() {
        var deadline: Date?
        for step in 0..<5 {
            let arrival = t0.addingTimeInterval(Double(step) * 2)
            deadline = SyncPillAccentLaw.deadline(
                previous: deadline,
                hasNewEntries: true,
                entriesAreEmpty: false,
                now: arrival
            )
            XCTAssertEqual(
                deadline,
                arrival.addingTimeInterval(SyncPillAccentLaw.accentWindow),
                "arrivée n°\(step + 1) : « et ainsi de suite » — chaque nouvelle entrée relance six secondes pleines."
            )
        }
    }

    // MARK: - Extinction

    func test_deadline_noEntriesLeft_disarms() {
        XCTAssertNil(
            SyncPillAccentLaw.deadline(
                previous: t0.addingTimeInterval(SyncPillAccentLaw.accentWindow),
                hasNewEntries: false,
                entriesAreEmpty: true,
                now: t0.addingTimeInterval(1)
            ),
            "plus aucune entrée : la pastille s'en va, l'accent avec elle — aucune échéance ne survit à la file vide."
        )
    }

    func test_isAccented_withoutDeadline_isFalse() {
        XCTAssertFalse(
            SyncPillAccentLaw.isAccented(deadline: nil, now: t0),
            "sans échéance armée, la pastille est dans sa forme normale."
        )
    }

    // MARK: - Deux durées distinctes qui portent le même nombre

    // MARK: - La forme normale doit être VISIBLE avant l'effacement

    func test_hideDelay_duringTheAccent_isPushedPastTheEndOfTheWindow() {
        let deadline = t0.addingTimeInterval(SyncPillAccentLaw.accentWindow)
        XCTAssertEqual(
            SyncPillAccentLaw.hideDelay(deadline: deadline, now: t0, idleHideDelay: 6),
            SyncPillAccentLaw.accentWindow + 6,
            accuracy: 0.001,
            "les deux durées valaient six secondes depuis la MÊME origine : la pastille aurait rétréci et disparu au même instant, et « reprendre la forme normale » n'aurait jamais rien voulu dire à l'écran. L'effacement se compte depuis la fin de l'accent."
        )
    }

    func test_hideDelay_midWindow_countsOnlyWhatRemainsOfTheAccent() {
        let deadline = t0.addingTimeInterval(SyncPillAccentLaw.accentWindow)
        XCTAssertEqual(
            SyncPillAccentLaw.hideDelay(deadline: deadline, now: t0.addingTimeInterval(4), idleHideDelay: 6),
            2 + 6,
            accuracy: 0.001,
            "à quatre secondes de fenêtre écoulées, il reste deux secondes d'accent — puis les six de lecture en forme normale."
        )
    }

    func test_hideDelay_afterTheWindow_isTheIdleDelayAlone() {
        let deadline = t0.addingTimeInterval(SyncPillAccentLaw.accentWindow)
        XCTAssertEqual(
            SyncPillAccentLaw.hideDelay(deadline: deadline, now: deadline.addingTimeInterval(1), idleHideDelay: 6),
            6,
            accuracy: 0.001,
            "échéance dépassée : l'accent ne repousse plus rien, l'effacement retrouve son délai nominal (#4017)."
        )
    }

    func test_hideDelay_withoutAccent_isTheIdleDelayAlone() {
        XCTAssertEqual(
            SyncPillAccentLaw.hideDelay(deadline: nil, now: t0, idleHideDelay: 6),
            6,
            accuracy: 0.001,
            "sans accent armé, #4017 s'applique inchangée."
        )
    }

    /// `idleHideDelay` (#4017, effacement) vaut AUSSI six secondes. Les deux
    /// durées portent le même nombre pour des raisons différentes ; ce test
    /// fixe la valeur de CELLE de l'accent, pour qu'un futur réglage de
    /// l'effacement ne l'emporte pas avec lui par mégarde.
    func test_accentWindow_isSixSeconds_namedApartFromTheIdleHideDelay() {
        XCTAssertEqual(
            SyncPillAccentLaw.accentWindow, 6.0,
            "« au bout d'au moins 6 secondes » — la fenêtre d'accent est une constante de CETTE loi, distincte du délai d'effacement de #4017 qui vaut le même nombre."
        )
    }
}

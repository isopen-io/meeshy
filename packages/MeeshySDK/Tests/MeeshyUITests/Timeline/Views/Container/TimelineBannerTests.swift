import XCTest
import SwiftUI
@testable import MeeshyUI

/// La timeline émettait DEUX signaux que personne ne lisait :
/// `durationDidAutoAdjust` (la durée de slide vient d'être recalculée sous les
/// pieds de l'utilisateur) et `showOfflineQueuedConfirmation` (la publication
/// est partie en file d'attente faute de réseau). Les deux existaient depuis
/// leur commit d'origine avec zéro lecteur en production : l'utilisateur
/// voyait la règle graduée changer de longueur sans explication, et croyait
/// sa story publiée alors qu'elle attendait le réseau.
///
/// `@MainActor` : le TEXTE du bandeau passe par `Bundle.module`, isolé par
/// `defaultIsolation(MainActor.self)`. La décision (`resolve`) et l'égalité,
/// elles, restent nonisolated.
@MainActor
final class TimelineBannerTests: XCTestCase {

    // MARK: - Arbitrage entre les deux signaux

    func test_noSignal_showsNothing() {
        XCTAssertNil(TimelineBanner.resolve(durationDidAutoAdjust: nil, isQueuedOffline: false))
    }

    func test_durationAdjusted_surfacesTheDurationBanner() {
        XCTAssertEqual(
            TimelineBanner.resolve(durationDidAutoAdjust: (from: 10, to: 6), isQueuedOffline: false),
            .durationAdjusted(from: 10, to: 6)
        )
    }

    func test_offlineQueue_surfacesTheOfflineBanner() {
        XCTAssertEqual(
            TimelineBanner.resolve(durationDidAutoAdjust: nil, isQueuedOffline: true),
            .queuedOffline
        )
    }

    /// Les deux peuvent tomber sur la même frame (publier hors-ligne juste
    /// après un trim). Le hors-ligne gagne : il annonce un état DURABLE que
    /// l'utilisateur ne peut deviner nulle part ailleurs, là où l'ajustement
    /// de durée ne fait que commenter un changement déjà visible à l'écran.
    func test_offlineQueue_winsOverDurationAdjust() {
        XCTAssertEqual(
            TimelineBanner.resolve(durationDidAutoAdjust: (from: 10, to: 6), isQueuedOffline: true),
            .queuedOffline
        )
    }

    // MARK: - Texte affiché

    func test_durationBanner_namesBothValues() {
        let text = TimelineBanner.durationAdjusted(from: 10, to: 6).text
        XCTAssertTrue(text.contains("10"), "La valeur d'AVANT manque : « \(text) »")
        XCTAssertTrue(text.contains("6"), "La valeur d'APRÈS manque : « \(text) »")
    }

    func test_durationBanner_formatsSecondsLikeTheTrackLabels() {
        // Même formatage que les étiquettes de piste — une seule convention de
        // durée dans toute la timeline.
        let text = TimelineBanner.durationAdjusted(from: 10, to: 6.5).text
        XCTAssertTrue(text.contains(TrackBarView<Color>.formatTrackDuration(6.5)),
                      "« \(text) » doit contenir « \(TrackBarView<Color>.formatTrackDuration(6.5)) »")
    }

    func test_offlineBanner_hasRealCopy_notTheRawKey() {
        let text = TimelineBanner.queuedOffline.text
        XCTAssertFalse(text.isEmpty)
        XCTAssertFalse(text.hasPrefix("story.timeline."),
                       "La clé brute est remontée telle quelle — traduction manquante : « \(text) »")
    }

    func test_durationBanner_hasRealCopy_notTheRawKey() {
        XCTAssertFalse(TimelineBanner.durationAdjusted(from: 10, to: 6).text.hasPrefix("story.timeline."))
    }

    // MARK: - Durée d'affichage

    /// Le bandeau hors-ligne porte une information qu'on ne peut pas relire
    /// ailleurs : il reste plus longtemps que le commentaire de durée.
    func test_offlineBanner_staysLongerThanTheDurationBanner() {
        XCTAssertGreaterThan(TimelineBanner.queuedOffline.displayDuration,
                             TimelineBanner.durationAdjusted(from: 10, to: 6).displayDuration)
    }

    func test_everyBanner_dismissesOnItsOwn() {
        for banner in [TimelineBanner.queuedOffline, .durationAdjusted(from: 10, to: 6)] {
            XCTAssertGreaterThan(banner.displayDuration, 0, "\(banner) resterait à l'écran indéfiniment")
            XCTAssertLessThanOrEqual(banner.displayDuration, 6, "\(banner) squatte la timeline")
        }
    }
}

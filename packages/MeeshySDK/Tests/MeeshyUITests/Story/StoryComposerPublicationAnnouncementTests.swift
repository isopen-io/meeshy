import XCTest
@testable import MeeshyUI

/// A11y-7 — publier une story doit être annoncé à VoiceOver, pas seulement
/// signalé par un haptique (`HapticFeedback.success()`), invisible pour un
/// utilisateur non-voyant.
///
/// `AdaptiveAccessibility.announce` est un appel UIKit statique sans point
/// d'injection — la garde de source (patron `ComposerSourceGuard`, déjà
/// utilisé par le domaine chrome composer : extraction du corps d'une
/// fonction par équilibrage d'accolades, commentaires retirés en amont) est
/// le seul mécanisme viable ici.
///
/// Portée volontairement limitée à `publishAllSlides()` : le succès/l'échec
/// final de la publication (`StoryViewModel.launchUploadTask`) sont DÉJÀ
/// annoncés par `FeedbackToastManager.present(_:tapAction:)`, qui poste
/// `AdaptiveAccessibility.announce(toast.message, priority:)` pour CHAQUE
/// toast affiché. Dupliquer l'annonce là-bas ferait parler VoiceOver deux
/// fois le même message à chaque publication.
final class StoryComposerPublicationAnnouncementTests: XCTestCase {

    private func publishAllSlidesBody() throws -> String {
        let code = try ComposerSourceGuard.source("StoryComposerView+Publication.swift")
        let body = ComposerSourceGuard.functionBody(named: "func publishAllSlides()", in: code)
        return try XCTUnwrap(body, "publishAllSlides() introuvable dans StoryComposerView+Publication.swift")
    }

    func test_publishAllSlides_announcesPublicationStarted() throws {
        let body = try publishAllSlidesBody()
        XCTAssertTrue(body.contains("HapticFeedback.success()"),
                      "Le haptique existant ne doit pas disparaître.")
        XCTAssertTrue(body.contains("AdaptiveAccessibility.announce("),
                      "Le lancement de la publication doit être annoncé à VoiceOver — aucun toast n'existe encore à ce point du flux.")
    }
}

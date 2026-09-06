import XCTest
@testable import Meeshy

/// **Le longpress d'un message ouvre le composer v3, pas l'atelier** (#5409).
///
/// Directive porteur 2026-09-06 : « dans le longpress de message dans les
/// conversations, le composer qui est ouvert à ce moment-là doit être remplacé
/// par le composer v3 ».
///
/// Le chemin est : longpress → `MessageOverlayMenu` → « Composer » →
/// `ConversationMediaComposerDoor` → `MeeshyComposerHost`, ouverture
/// `.mediaSeeded`. La seule règle qui décide de la surface montée est
/// `ComposerSurfaceRouting.surface`, et c'est elle que ce fichier interroge —
/// jamais une capture d'écran, qui ne dirait pas POURQUOI.
final class ComposerLongPressOpensV3Tests: XCTestCase {

    /// **Sur les QUATRE formats**, pas seulement celui qui s'ouvre par défaut :
    /// l'auteur bascule de format dans le meuble, et une surface qui
    /// retomberait sur l'atelier au premier changement rendrait le reroutage
    /// illusoire.
    func test_mediaSeeded_neMonteJamaisLAtelier() {
        // Les quatre, nommés : `ComposerFormat` n'est pas `CaseIterable`, et
        // c'est le `switch` exhaustif de la règle qui garde la totalité — un
        // cinquième format ne compilera pas tant qu'on n'aura pas dit où il va.
        for format in [ComposerFormat.post, .story, .reel, .status] {
            XCTAssertNotEqual(
                ComposerSurfaceRouting.surface(opening: .mediaSeeded, format: format),
                .scene,
                "un média reçu doit ouvrir le composer v3, jamais l'atelier — format \(format)"
            )
        }
    }

    func test_mediaSeeded_monteLePlateauDocument() {
        XCTAssertEqual(ComposerSurfaceRouting.surface(opening: .mediaSeeded, format: .post), .document)
        XCTAssertEqual(ComposerSurfaceRouting.surface(opening: .mediaSeeded, format: .story), .document)
        XCTAssertEqual(ComposerSurfaceRouting.surface(opening: .mediaSeeded, format: .reel), .document)
    }

    /// Le statut garde sa surface : le mood est sans scène, et c'est la même
    /// réponse que pour toutes les autres ouvertures qui laissent choisir.
    func test_mediaSeeded_leStatutResteSurLeMood() {
        XCTAssertEqual(ComposerSurfaceRouting.surface(opening: .mediaSeeded, format: .status), .mood)
    }

    /// **Les deux ouvertures qui RESTENT sur l'atelier sont nommées** — pour que
    /// leur chute soit un choix et non un effet de bord. Elles tomberont quand
    /// le meuble saura REPRENDRE (#4746) ; ce témoin dit lesquelles restent, et
    /// rougira le jour où l'une d'elles bougera sans qu'on l'ait décidé.
    func test_lesDeuxOuverturesQuiRestentSurLAtelier() {
        XCTAssertEqual(ComposerSurfaceRouting.surface(opening: .resume, format: .post), .scene)
        XCTAssertEqual(ComposerSurfaceRouting.surface(opening: .videoCameraReady, format: .post), .scene)
    }
}

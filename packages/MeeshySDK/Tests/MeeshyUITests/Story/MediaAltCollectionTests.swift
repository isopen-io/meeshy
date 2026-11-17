import XCTest
import MeeshySDK
@testable import MeeshyUI

/// C7-UI — collecte du texte alternatif par média.
///
/// `mediaAlt: [String: String]?` traverse déjà le transport (gateway
/// `CreatePostSchema.mediaAlt`, `PostService.create/update(… mediaAlt:)`)
/// mais rien ne le COLLECTAIT côté UI avant `MediaAccessibilityStore` +
/// `MediaAltTextField` + le panneau qu'ils alimentent dans
/// `ComposerToolPanelHost.mediaItemRow`.
@MainActor
final class MediaAltCollectionTests: XCTestCase {

    // MARK: - MediaAccessibilityStore — moitié alt

    // MARK: - Gardes de source — le champ EST accessible, pas seulement persisté

    /// `test_altField_exposesAccessibilityLabelAndHint` rougit si
    /// `.accessibilityLabel`/`.accessibilityHint` disparaissent de
    /// `MediaAltTextField` : un champ qui COLLECTE du texte pour VoiceOver
    /// sans être lui-même navigable à VoiceOver serait une contradiction —
    /// la consigne du lot le nomme explicitement.
    func test_altField_exposesAccessibilityLabelAndHint() throws {
        let code = try ComposerSourceGuard.source("Controls/MediaAltTextField.swift")
        XCTAssertTrue(code.contains(".accessibilityLabel("),
                      "Le champ alt doit porter un accessibilityLabel explicite.")
        XCTAssertTrue(code.contains(".accessibilityHint("),
                      "Le champ alt doit expliquer à VoiceOver ce que la saisie produit.")
    }

    // MARK: - La chaîne ATTEINT le point de publication (C-bis)

    /// Espaces normalisés : une garde ancrée sur un littéral multi-lignes est
    /// contournée par un simple retour à la ligne (constat de la revue
    /// adversariale — quatre gardes de la vague 2 tombaient ainsi). Comparer
    /// sur la forme aplatie rend l'assertion insensible au formatage tout en
    /// restant une assertion sur du CODE, pas sur un fichier.
    private func collapsed(_ code: String) -> String {
        code.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    // MARK: - Le store SURVIT au démontage du panneau (C-bis, correctif 4)

    // MARK: - V3-4 — le texte saisi PART (transport, pas seulement collecte)

    /// `test_createStoryRequest_encodesMediaAlt` rougit si le champ disparaît
    /// du corps de `POST /posts` : le gateway l'accepte depuis
    /// `CreatePostSchema.mediaAlt`, mais une story ne le lui envoyait jamais —
    /// `CreateStoryRequest` ne portait pas le champ du tout.
    func test_createStoryRequest_encodesMediaAlt() throws {
        let body = CreateStoryRequest(mediaAlt: ["post-media-7": "Une plage au couchant"])

        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: try JSONEncoder().encode(body)) as? [String: Any]
        )

        XCTAssertEqual(json["mediaAlt"] as? [String: String],
                       ["post-media-7": "Une plage au couchant"])
    }

    /// `test_createStoryRequest_omitsMediaAltWhenAbsent` rougit si le champ
    /// part à `null` faute de saisie : `UpdatePostSchema` lit l'ABSENCE comme
    /// « n'y touche pas », et un `null` explicite est une autre phrase.
    func test_createStoryRequest_omitsMediaAltWhenAbsent() throws {
        let body = CreateStoryRequest(content: "coucou")

        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: try JSONEncoder().encode(body)) as? [String: Any]
        )

        XCTAssertNil(json["mediaAlt"])
    }

    // MARK: - Les clés envoyées sont celles que le SERVEUR connaît

    /// `test_serverKeyedAlt_translatesComposerIdsIntoPostMediaIds` rougit si la
    /// traduction saute : le panneau collecte sous l'id d'élément du COMPOSER
    /// (les médias ne sont uploadés qu'après le hand-off) alors que
    /// `PostService.applyMediaAlt` FILTRE les clés absentes de `mediaIds`.
    /// Envoyer les ids locaux serait un no-op parfaitement silencieux —
    /// requête acceptée, aucun texte enregistré.
    func test_serverKeyedAlt_translatesComposerIdsIntoPostMediaIds() {
        let uploaded = StoryMediaObject(id: "local-1", postMediaId: "post-media-7", aspectRatio: 1)

        let keyed = StoryMediaAltMapping.serverKeyed(
            composerKeyed: ["local-1": "Une plage au couchant"],
            mediaObjects: [uploaded]
        )

        XCTAssertEqual(keyed, ["post-media-7": "Une plage au couchant"])
    }

    /// `test_serverKeyedAlt_dropsMediaThatNeverReachedTheServer` rougit si un
    /// média dont l'upload n'a pas abouti (`postMediaId` vide, cas déjà
    /// journalisé par le publish) fait naître une clé vide dans le payload.
    func test_serverKeyedAlt_dropsMediaThatNeverReachedTheServer() {
        let neverUploaded = StoryMediaObject(id: "local-1", aspectRatio: 1)

        let keyed = StoryMediaAltMapping.serverKeyed(
            composerKeyed: ["local-1": "Une plage au couchant"],
            mediaObjects: [neverUploaded]
        )

        XCTAssertTrue(keyed.isEmpty)
    }

    // MARK: - F2 — la collecte SURVIT à la fermeture du composer

    // MARK: - Gardes POSITIVES : la collecte est ÉCRITE et RELUE par le composer

}

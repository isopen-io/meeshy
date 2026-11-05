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

    func test_alt_defaultsToEmptyString_forUntouchedMedia() {
        let store = MediaAccessibilityStore()
        XCTAssertEqual(store.alt(for: "media-1"), "")
    }

    /// `test_setAlt_roundTrips` rougit si `setAlt(_:for:)` cesse d'écrire
    /// dans `altText` (ex : un refactor qui oublierait l'affectation).
    func test_setAlt_roundTrips() {
        let store = MediaAccessibilityStore()
        store.setAlt("Coucher de soleil sur la plage", for: "media-1")
        XCTAssertEqual(store.alt(for: "media-1"), "Coucher de soleil sur la plage")
    }

    /// `test_setAlt_emptyString_clearsEntry_ratherThanStoringEmptyString`
    /// rougit si `setAlt("", for:)` stocke `""` au lieu de retirer l'entrée —
    /// un média jamais touché et un média dont le texte a été effacé
    /// doivent produire le MÊME payload (absent), pas une chaîne vide qui
    /// écraserait un texte serveur existant au prochain update.
    func test_setAlt_emptyString_clearsEntry_ratherThanStoringEmptyString() {
        let store = MediaAccessibilityStore()
        store.setAlt("Un texte", for: "media-1")
        store.setAlt("", for: "media-1")
        XCTAssertEqual(store.alt(for: "media-1"), "")
        XCTAssertNil(store.mediaAltPayload())
    }

    /// `test_setAlt_clampsToMaxLength` rougit si le clamp
    /// (`String(text.prefix(Self.maxAltLength))`) est retiré : un texte plus
    /// long que ce que le gateway accepte (`z.string().max(1000)`,
    /// `services/gateway/src/routes/posts/types.ts:249`) doit être tronqué
    /// AVANT d'atteindre le transport, pas rejeté silencieusement là-bas.
    func test_setAlt_clampsToMaxLength() {
        let store = MediaAccessibilityStore()
        let tooLong = String(repeating: "a", count: MediaAccessibilityStore.maxAltLength + 50)
        store.setAlt(tooLong, for: "media-1")
        XCTAssertEqual(store.alt(for: "media-1").count, MediaAccessibilityStore.maxAltLength)
    }

    /// `test_mediaAltPayload_isNilWhenNoEntriesSet` rougit si
    /// `mediaAltPayload()` renvoie un dictionnaire vide au lieu de `nil` :
    /// un payload vide et une absence de payload sont deux signaux
    /// différents pour `PostService.create(… mediaAlt:)`.
    func test_mediaAltPayload_isNilWhenNoEntriesSet() {
        let store = MediaAccessibilityStore()
        XCTAssertNil(store.mediaAltPayload())
    }

    /// `test_mediaAltPayload_includesOnlyTouchedMedia` rougit si le payload
    /// inclut un média qui n'a jamais été touché.
    func test_mediaAltPayload_includesOnlyTouchedMedia() {
        let store = MediaAccessibilityStore()
        store.setAlt("Un chat", for: "media-1")
        let payload = store.mediaAltPayload()
        XCTAssertEqual(payload, ["media-1": "Un chat"])
    }

    /// `test_remove_clearsAlt` rougit si `remove(mediaId:)` cesse de vider
    /// `altText` pour cet id — un média supprimé de la slide ne doit pas
    /// laisser un id orphelin fuiter dans un futur payload.
    func test_remove_clearsAlt() {
        let store = MediaAccessibilityStore()
        store.setAlt("Un texte", for: "media-1")
        store.remove(mediaId: "media-1")
        XCTAssertEqual(store.alt(for: "media-1"), "")
        XCTAssertNil(store.mediaAltPayload())
    }

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

    // MARK: - Gardes POSITIVES : la charge a un appelant, et il publie

    /// `test_mediaAltPayload_hasAtLeastOneProductionCaller` rougit si le
    /// snapshot redevient orphelin.
    ///
    /// Formulée en POSITIF (« au moins un appelant ») et non en négatif : une
    /// garde qui vérifierait l'ABSENCE d'un motif interdit resterait verte le
    /// jour où le motif change de nom, et c'est exactement l'état mesuré avant
    /// ce lot — `mediaAltPayload()` compilait, était testé, et n'était appelé
    /// par personne.
    func test_mediaAltPayload_hasAtLeastOneProductionCaller() throws {
        let callers = try ComposerSourceGuard.allStorySources()
            .filter { $0.path != "Controls/MediaAccessibilityStore.swift" }
            .filter { $0.code.contains("mediaAltPayload()") }
            .map { $0.path }

        XCTAssertFalse(
            callers.isEmpty,
            """
            `mediaAltPayload()` n'a AUCUN appelant hors de sa propre déclaration : \
            le texte alternatif se saisit, se conserve, et ne part nulle part.
            """
        )
    }

    // MARK: - F2 — la collecte SURVIT à la fermeture du composer

    /// `test_draftSnapshot_carriesTheTypedAltText` rougit si l'instantané que
    /// le brouillon persiste cesse de porter ce que l'auteur a écrit : le
    /// texte se saisissait, partait à la publication, et disparaissait dès que
    /// le composer se refermait sans publier.
    func test_draftSnapshot_carriesTheTypedAltText() {
        let store = MediaAccessibilityStore()
        store.setAlt("Un chat roux sur un muret", for: "media-1")

        XCTAssertEqual(store.draftSnapshot().mediaAlt, ["media-1": "Un chat roux sur un muret"])
    }

    /// `test_draftSnapshot_ofAnUntouchedStore_isEmpty` rougit si un composer
    /// vierge se met à écrire une collecte dans le brouillon — l'instantané
    /// d'un store jamais touché n'a rien à persister.
    func test_draftSnapshot_ofAnUntouchedStore_isEmpty() {
        XCTAssertEqual(MediaAccessibilityStore().draftSnapshot(), .empty)
    }

    /// `test_restore_reposesTheAltTextOfAnAdoptedDraft` rougit si adopter un
    /// brouillon ne repose pas ses textes dans le store vivant : la collecte
    /// serait persistée puis relue par personne, et l'auteur retrouverait des
    /// champs vides devant ses propres médias.
    func test_restore_reposesTheAltTextOfAnAdoptedDraft() {
        let store = MediaAccessibilityStore()

        store.restore(from: StoryDraftAccessibility(mediaAlt: ["media-1": "Une plage au couchant"]))

        XCTAssertEqual(store.alt(for: "media-1"), "Une plage au couchant")
        XCTAssertEqual(store.mediaAltPayload(), ["media-1": "Une plage au couchant"])
    }

    /// `test_restore_replacesTheCollectionRatherThanMergingIntoIt` rougit si
    /// l'adoption FUSIONNE : le composer porterait alors les textes d'une
    /// composition précédente sur des ids de médias que le brouillon repris ne
    /// contient pas — exactement le texte fantôme que `remove(mediaId:)` évite
    /// par ailleurs.
    func test_restore_replacesTheCollectionRatherThanMergingIntoIt() {
        let store = MediaAccessibilityStore()
        store.setAlt("Texte d'une autre composition", for: "media-9")

        store.restore(from: StoryDraftAccessibility(mediaAlt: ["media-1": "Une plage au couchant"]))

        XCTAssertEqual(store.alt(for: "media-9"), "")
        XCTAssertEqual(store.mediaAltPayload(), ["media-1": "Une plage au couchant"])
    }

    /// `test_restore_clampsAltTextToTheTransportLimit` rougit si la reprise
    /// court-circuite le clamp : un brouillon écrit quand la limite était plus
    /// large repartirait vers un gateway qui refuse au-delà de
    /// `z.string().max(1000)`.
    func test_restore_clampsAltTextToTheTransportLimit() {
        let store = MediaAccessibilityStore()
        let tooLong = String(repeating: "a", count: MediaAccessibilityStore.maxAltLength + 50)

        store.restore(from: StoryDraftAccessibility(mediaAlt: ["media-1": tooLong]))

        XCTAssertEqual(store.alt(for: "media-1").count, MediaAccessibilityStore.maxAltLength)
    }

    // MARK: - Gardes POSITIVES : la collecte est ÉCRITE et RELUE par le composer

}

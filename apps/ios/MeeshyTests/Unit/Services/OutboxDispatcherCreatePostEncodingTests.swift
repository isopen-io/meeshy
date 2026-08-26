import XCTest
import MeeshySDK
@testable import Meeshy

/// Le corps de `POST /posts` tel que la file durable l'émet.
///
/// Un post texte — le cas le plus courant de l'app — ne part JAMAIS par
/// `PostService.create` : il passe par l'outbox, et c'est ce corps-ci qui
/// atteint le serveur. Une référence qui survit jusqu'au payload persisté mais
/// que ce corps n'écrit pas serait perdue au tout dernier saut, exactement
/// comme la position l'avait été (Task 17).
final class OutboxDispatcherCreatePostEncodingTests: XCTestCase {

    private func encodeToJSON<T: Encodable>(_ value: T) throws -> [String: Any] {
        let data = try JSONEncoder().encode(value)
        let object = try JSONSerialization.jsonObject(with: data)
        return try XCTUnwrap(object as? [String: Any])
    }

    private func makeBody(
        mentions: [PostMentionInput]? = nil,
        location: SharedPlace? = nil,
        discoverabilityPrecision: DiscoverabilityPrecision? = nil,
        repostOfId: String? = nil,
        mobileTranscription: MobileTranscriptionPayload? = nil
    ) -> CreatePostBody {
        CreatePostBody(
            content: "Coucou",
            mediaIds: nil,
            visibility: "PUBLIC",
            originalLanguage: nil,
            type: nil,
            moodEmoji: nil,
            audioUrl: nil,
            audioDuration: nil,
            visibilityUserIds: nil,
            location: location,
            mentions: mentions,
            discoverabilityPrecision: discoverabilityPrecision,
            repostOfId: repostOfId,
            mobileTranscription: mobileTranscription
        )
    }

    func test_createPostBody_carriesDeclaredReferencesWithTheirMode() throws {
        let json = try encodeToJSON(makeBody(mentions: [
            PostMentionInput.id("u-alice", display: .note),
            PostMentionInput.handle("bob", display: .silent)
        ]))

        let encoded = try XCTUnwrap(json["mentions"] as? [[String: Any]])
        XCTAssertEqual(encoded.count, 2)
        XCTAssertEqual(encoded[0]["userId"] as? String, "u-alice")
        XCTAssertEqual(encoded[0]["display"] as? String, "NOTE")
        XCTAssertEqual(encoded[1]["username"] as? String, "bob")
        XCTAssertEqual(encoded[1]["display"] as? String, "SILENT")
    }

    func test_createPostBody_withoutReferences_omitsTheKey() throws {
        let json = try encodeToJSON(makeBody(mentions: nil))

        XCTAssertNil(json["mentions"],
                     "Rien de déclaré : la clé ne part pas — le serveur relit le texte lui-même")
    }

    func test_createPostBody_emptyReferences_omitsTheKey() throws {
        // À la CRÉATION, `[]` n'a rien à effacer : il n'existe encore aucune
        // ligne. L'émettre ferait porter au réseau un verdict sans objet.
        let json = try encodeToJSON(makeBody(mentions: []))

        XCTAssertNil(json["mentions"])
    }

    // MARK: - Découvrabilité à proximité (spec 2026-08-02 §2)

    /// Le consentement atteint le FIL, pas seulement la ligne persistée. Le
    /// témoin lit le JSON réellement produit — c'est le dernier saut où
    /// `location` avait autrefois disparu, et le consentement emprunte
    /// exactement le même.
    func test_createPostBody_carriesTheDiscoverabilityPrecision() throws {
        let json = try encodeToJSON(makeBody(discoverabilityPrecision: .neighborhood))

        XCTAssertEqual(json["discoverabilityPrecision"] as? String, "NEIGHBORHOOD")
    }

    /// Sans consentement, la clé est ABSENTE — pas `null`. Le schéma gateway
    /// est un `z.enum().optional()`, qui rejette un `null` explicite : émettre
    /// la clé vide ferait échouer la publication au lieu de la laisser
    /// simplement non découvrable.
    func test_createPostBody_withoutConsent_omitsTheKeyEntirely() throws {
        let json = try encodeToJSON(makeBody())

        XCTAssertNil(json["discoverabilityPrecision"])
        XCTAssertFalse(json.keys.contains("discoverabilityPrecision"))
    }

    /// La règle de vie privée du §2 : le client n'arrondit JAMAIS. Quel que
    /// soit le palier revendiqué, la coordonnée part au chiffre près — le
    /// serveur seul quantifie.
    func test_createPostBody_sendsTheExactCoordinateWhateverTheTierClaimed() throws {
        for tier in DiscoverabilityPrecision.allCases {
            let json = try encodeToJSON(makeBody(
                location: SharedPlace(latitude: 48.8583736, longitude: 2.2944813, name: "Tour Eiffel"),
                discoverabilityPrecision: tier
            ))

            let location = try XCTUnwrap(json["location"] as? [String: Any])
            XCTAssertEqual(location["latitude"] as? Double, 48.8583736, "latitude arrondie sous \(tier.rawValue)")
            XCTAssertEqual(location["longitude"] as? Double, 2.2944813, "longitude arrondie sous \(tier.rawValue)")
        }
    }

    // MARK: - L'attribution d'une republication, et la voix transcrite

    /// **La source d'un repost atteint le FIL.** Elle survivait déjà dans le
    /// payload persisté depuis ce lot ; sans elle ICI, elle serait jetée à
    /// l'ultime saut réseau — le défaut exact que `location` avait payé avant
    /// elle (Task 17), sur le chemin qu'emprunte le cas nominal.
    func test_createPostBody_carriesTheRepostSource() throws {
        let json = try encodeToJSON(makeBody(repostOfId: "post-source"))

        XCTAssertEqual(json["repostOfId"] as? String, "post-source")
    }

    /// Sans repost, la clé est ABSENTE — jamais `"repostOfId": null`. Un post
    /// d'origine n'a rien à déclarer, et un `null` explicite est une
    /// affirmation là où il n'y en a pas.
    func test_createPostBody_withoutRepost_omitsTheKeyEntirely() throws {
        let json = try encodeToJSON(makeBody())

        XCTAssertNil(json["repostOfId"])
        XCTAssertFalse(json.keys.contains("repostOfId"))
    }

    /// **La voix transcrite sur l'appareil atteint le FIL, dans la graphie du
    /// serveur.** Le gateway la persiste sur le premier `PostMedia` audio et
    /// évite alors la re-transcription Whisper ; une graphie camelCase serait
    /// écartée en silence par le `z.object()` du schéma, et le serveur
    /// re-transcrirait sans que rien ne le dise.
    func test_createPostBody_carriesTheOnDeviceTranscriptionInTheServerSpelling() throws {
        let json = try encodeToJSON(makeBody(mobileTranscription: MobileTranscriptionPayload(
            text: "Salut tout le monde",
            language: "fr",
            confidence: 0.91,
            durationMs: 4200,
            segments: [MobileTranscriptionSegment(text: "Salut", start: 0, end: 1.1, speakerId: "s1")]
        )))

        let transcription = try XCTUnwrap(json["mobileTranscription"] as? [String: Any])
        XCTAssertEqual(transcription["text"] as? String, "Salut tout le monde")
        XCTAssertEqual(transcription["language"] as? String, "fr")
        XCTAssertEqual(transcription["duration_ms"] as? Int, 4200)
        XCTAssertNil(transcription["durationMs"], "camelCase serait écarté en silence par le `z.object()`")

        let segments = try XCTUnwrap(transcription["segments"] as? [[String: Any]])
        XCTAssertEqual(segments.first?["speaker_id"] as? String, "s1")
    }

    func test_createPostBody_withoutTranscription_omitsTheKeyEntirely() throws {
        let json = try encodeToJSON(makeBody())

        XCTAssertNil(json["mobileTranscription"])
        XCTAssertFalse(json.keys.contains("mobileTranscription"))
    }
}

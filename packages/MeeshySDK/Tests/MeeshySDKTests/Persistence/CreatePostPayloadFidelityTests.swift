import XCTest
@testable import MeeshySDK

/// **Ce que la charge durable AMPUTAIT.**
///
/// `CreatePostPayload` est le format ON-DISK d'une publication en attente : ce
/// qu'il ne porte pas est perdu au flush, silencieusement, et même quand le
/// réseau était là une seconde plus tard. Deux champs y manquaient, et chacun
/// coûtait un fait de l'utilisateur :
///
/// - **`repostOfId`** — la publication REPARTAGÉE. `StatusViewModel.setStatus`
///   le passait sur sa branche en ligne et le laissait tomber sur sa branche
///   hors ligne : republier un mood sans réseau publiait un mood ORIGINAL, sans
///   sa source ni son attribution. C'est le SEUL porteur de l'attribution — il
///   n'y a pas de `viaUsername` sur le fil, et il n'y en a jamais eu que le
///   gateway lise (`CreatePostSchema` ne le déclare pas, et un `z.object()`
///   écarte les clés inconnues en silence).
/// - **`mobileTranscription`** — la transcription faite SUR L'APPAREIL. Sans
///   elle, le serveur re-transcrit au flush : la transcription embarquée est
///   jetée, le coût est payé deux fois, et le résultat peut différer de celui
///   que l'auteur a relu avant d'envoyer.
///
/// **Pourquoi des tests de FIDÉLITÉ et pas seulement d'encodage.** Les raw
/// values de ce type sont des identifiants PERSISTÉS : une ligne écrite par une
/// version antérieure de l'app doit continuer de décoder après ce lot. Les deux
/// champs sont donc OPTIONNELS, et le premier test le prouve sur du JSON écrit
/// à la main — pas sur un aller-retour, qui prouverait seulement que le type
/// est d'accord avec lui-même.
final class CreatePostPayloadFidelityTests: XCTestCase {

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    private func jsonObject<T: Encodable>(_ value: T) throws -> [String: Any] {
        let data = try encoder.encode(value)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    // MARK: - Rétro-compatibilité on-disk

    /// Une ligne d'outbox écrite AVANT ce lot décode encore, et les deux champs
    /// neufs y valent `nil`. Sans cette garantie, la livraison de ce lot
    /// détruirait les publications déjà en attente sur l'appareil des gens qui
    /// mettent l'app à jour hors ligne — exactement la population que la file
    /// durable existe pour servir.
    func test_createPostPayload_decodeUneLigneEcriteAvantCeLot_lesDeuxChampsNeufsAbsents() throws {
        let ligneHistorique = Data("""
        {
          "clientMutationId": "cmid_00000000-0000-4000-8000-000000000001",
          "content": "Un post d'avant",
          "attachmentIds": [],
          "visibility": "PUBLIC",
          "type": "POST"
        }
        """.utf8)

        let payload = try JSONDecoder().decode(CreatePostPayload.self, from: ligneHistorique)

        XCTAssertEqual(payload.content, "Un post d'avant")
        XCTAssertNil(
            payload.repostOfId,
            "Une ligne écrite avant ce lot n'a pas de source de repost — elle doit décoder, pas lever."
        )
        XCTAssertNil(
            payload.mobileTranscription,
            "Une ligne écrite avant ce lot n'a pas de transcription embarquée — elle doit décoder, pas lever."
        )
        XCTAssertNil(
            payload.localMediaMimeTypes,
            "Une ligne écrite avant ce lot ne déclare aucun MIME — elle doit décoder, pas lever, et le "
                + "dispatcher retombe alors sur l'extension, exactement comme hier."
        )
        XCTAssertNil(
            payload.declaredMimeType(at: 0),
            "Sans tableau de MIME, l'accès par index doit rendre nil plutôt que de lever hors bornes."
        )
    }

    // MARK: - Les deux champs voyagent

    func test_createPostPayload_porteLaSourceDuRepost_etLaTranscriptionEmbarquee() throws {
        let payload = CreatePostPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000002",
            content: "",
            attachmentIds: [],
            visibility: "PUBLIC",
            type: "STATUS",
            moodEmoji: "🎤",
            audioUrl: "https://cdn.meeshy.me/a.m4a",
            repostOfId: "post-source",
            mobileTranscription: MobileTranscriptionPayload(
                text: "Salut tout le monde",
                language: "fr",
                confidence: 0.92,
                durationMs: 4200,
                segments: [MobileTranscriptionSegment(text: "Salut", start: 0, end: 1.1, speakerId: "s1")]
            )
        )

        let json = try jsonObject(payload)
        XCTAssertEqual(json["repostOfId"] as? String, "post-source")
        XCTAssertNotNil(json["mobileTranscription"])

        let relu = try JSONDecoder().decode(CreatePostPayload.self, from: encoder.encode(payload))
        XCTAssertEqual(
            relu, payload,
            "L'aller-retour on-disk doit être fidèle : ce que la file relit au flush est ce que le "
                + "composer y a déposé, champ pour champ."
        )
    }

    /// `nil` ⇒ la clé est ABSENTE du JSON persisté, jamais `"repostOfId": null`.
    func test_createPostPayload_sansRepost_nEcritPasLaCle() throws {
        let payload = CreatePostPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000003",
            content: "Un post ordinaire",
            attachmentIds: [],
            visibility: "PUBLIC"
        )

        let json = try jsonObject(payload)
        XCTAssertFalse(json.keys.contains("repostOfId"))
        XCTAssertFalse(json.keys.contains("mobileTranscription"))
        XCTAssertFalse(json.keys.contains("localMediaMimeTypes"))
    }

    // MARK: - Le MIME DÉCLARÉ voyage, et il est aligné par INDEX

    /// L'extension NE SUFFIT PAS. La file relocalise les fichiers « extension
    /// préservée pour que le dispatcher en dérive le MIME » — un contrat qui
    /// tient tant que la table connaît le conteneur. Un vocal importé en `.caf`
    /// / `.aiff` / `.opus` s'y re-dérivait en `application/octet-stream`, et le
    /// gateway ne reconnaît un média audio qu'à
    /// `mimeType.startsWith('audio/')` : ni transcription embarquée persistée,
    /// ni Whisper. Le site d'envoi connaissait pourtant le MIME depuis le début.
    func test_createPostPayload_porteLeMimeDeclare_parIndex() throws {
        let payload = CreatePostPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000004",
            content: "",
            attachmentIds: [],
            visibility: "PUBLIC",
            localMediaPaths: ["cmid/0.caf", "cmid/1.jpg"],
            type: "REEL",
            localMediaMimeTypes: ["audio/mp4", "image/jpeg"]
        )

        XCTAssertEqual(payload.declaredMimeType(at: 0), "audio/mp4")
        XCTAssertEqual(payload.declaredMimeType(at: 1), "image/jpeg")
        XCTAssertNil(payload.declaredMimeType(at: 2), "Hors bornes ⇒ nil, jamais un crash au flush.")
        XCTAssertNil(payload.declaredMimeType(at: -1))

        let relu = try JSONDecoder().decode(CreatePostPayload.self, from: encoder.encode(payload))
        XCTAssertEqual(relu.localMediaMimeTypes, ["audio/mp4", "image/jpeg"])
        XCTAssertEqual(relu, payload)
    }

    // MARK: - La transcription voyage dans la GRAPHIE du serveur

    /// Le gateway lit `duration_ms` et `speaker_id` (`MobileTranscriptionSchema`,
    /// `services/gateway/src/routes/posts/types.ts`). Une graphie camelCase
    /// serait écartée en silence par le `z.object()` — la transcription
    /// arriverait tronquée sans que rien ne le dise.
    func test_mobileTranscription_voyageDansLaGraphieDuServeur() throws {
        let transcription = MobileTranscriptionPayload(
            text: "Bonjour",
            language: "fr",
            confidence: 0.8,
            durationMs: 3100,
            segments: [MobileTranscriptionSegment(text: "Bonjour", start: 0, end: 0.9, speakerId: "s1")]
        )

        let json = try jsonObject(transcription)
        XCTAssertEqual(json["duration_ms"] as? Int, 3100)
        XCTAssertNil(json["durationMs"], "La graphie camelCase serait écartée en silence par le `z.object()`")

        let segments = try XCTUnwrap(json["segments"] as? [[String: Any]])
        XCTAssertEqual(segments.first?["speaker_id"] as? String, "s1")
        XCTAssertNil(segments.first?["speakerId"])
    }

    /// La conformance NEUVE, mesurée pour elle-même : sans `Decodable`, la
    /// transcription ne pouvait pas vivre dans un payload persisté — c'est la
    /// raison technique pour laquelle elle manquait, et c'est elle qu'on vient
    /// de lever.
    func test_mobileTranscription_serelitDepuisLaGraphieDuServeur() throws {
        let brut = Data("""
        {
          "text": "Bonjour",
          "language": "fr",
          "confidence": 0.8,
          "duration_ms": 3100,
          "segments": [{ "text": "Bonjour", "start": 0, "end": 0.9, "speaker_id": "s1" }]
        }
        """.utf8)

        let relu = try JSONDecoder().decode(MobileTranscriptionPayload.self, from: brut)

        XCTAssertEqual(relu.durationMs, 3100)
        XCTAssertEqual(relu.language, "fr")
        XCTAssertEqual(relu.segments.first?.speakerId, "s1")
    }
}

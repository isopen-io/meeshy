import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// Un son EMPRUNTÉ à la bibliothèque n'a pas de `postMediaId` : il n'appartient
/// pas à la publication qui le joue. Sans repli sur `mediaURL`, sa piste était
/// sautée à la lecture et absente de l'export — la story publiait en silence,
/// sans la moindre erreur.
final class StoryAudioSourceResolverTests: XCTestCase {

    private func audio(postMediaId: String = "", mediaURL: String? = nil) -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(postMediaId: postMediaId, mediaURL: mediaURL)
    }

    // MARK: - Priorité des sources

    func test_postMediaId_gagne_quandIlEstResolvable() {
        let resolved = StoryAudioSourceResolver.remoteURL(
            for: audio(postMediaId: "media-1", mediaURL: "/api/v1/static/x.m4a"),
            preferredLanguages: ["fr"],
            resolver: { _ in URL(string: "https://cdn.test/media-1.m4a") })

        XCTAssertEqual(resolved?.absoluteString, "https://cdn.test/media-1.m4a")
    }

    func test_sonEmprunte_sansPostMediaId_seResoutParMediaURL() {
        let resolved = StoryAudioSourceResolver.remoteURL(
            for: audio(mediaURL: "/api/v1/static/abc.m4a"),
            preferredLanguages: ["fr"],
            resolver: { _ in nil })

        XCTAssertNotNil(resolved, "sans ça la piste est sautée et la story joue muette")
        XCTAssertNotNil(resolved?.scheme, "une URL sans schéma est refusée par le cache, en silence")
    }

    func test_repliSurMediaURL_quandLeResolverRendNil() {
        let resolved = StoryAudioSourceResolver.remoteURL(
            for: audio(postMediaId: "media-1", mediaURL: "/api/v1/static/abc.m4a"),
            preferredLanguages: ["fr"],
            resolver: { _ in nil })

        XCTAssertNotNil(resolved)
    }

    func test_sansResolverNiMediaURL_rendNil() {
        XCTAssertNil(StoryAudioSourceResolver.remoteURL(
            for: audio(postMediaId: "media-1"), preferredLanguages: ["fr"], resolver: nil))
    }

    func test_leResolverNEstPasAppele_surUnPostMediaIdVide() {
        // Un son emprunté ne doit pas provoquer une résolution sur la chaîne
        // vide : selon l'implémentation de l'appelant, ça rendait n'importe quoi.
        var calls: [String] = []
        _ = StoryAudioSourceResolver.remoteURL(
            for: audio(mediaURL: "/api/v1/static/abc.m4a"),
            preferredLanguages: ["fr"],
            resolver: { calls.append($0); return URL(string: "https://cdn.test/faux.m4a") })

        XCTAssertTrue(calls.isEmpty)
    }

    // MARK: - Résolution d'adresse

    func test_playableURL_gardeUneURLAbsolue() {
        XCTAssertEqual(
            StoryAudioSourceResolver.playableURL(from: "https://cdn.test/a.m4a")?.absoluteString,
            "https://cdn.test/a.m4a")
    }

    func test_playableURL_gardeUnFichierLocal() {
        let url = StoryAudioSourceResolver.playableURL(from: "file:///tmp/a.m4a")
        XCTAssertEqual(url?.isFileURL, true)
        XCTAssertEqual(url?.path, "/tmp/a.m4a")
    }

    func test_playableURL_donneUnSchemaAUneAdresseRELATIVE() {
        // Le cœur du bug : `URL(string: "/api/v1/static/a.m4a")` réussit et rend
        // une URL sans schéma, que le cache disque rejette sans un mot.
        let url = StoryAudioSourceResolver.playableURL(from: "/api/v1/static/a.m4a")

        XCTAssertNotNil(url?.scheme)
        XCTAssertNotEqual(url?.absoluteString, "/api/v1/static/a.m4a")
    }

    func test_playableURL_rendNil_surVideOuBlancs() {
        XCTAssertNil(StoryAudioSourceResolver.playableURL(from: nil))
        XCTAssertNil(StoryAudioSourceResolver.playableURL(from: ""))
        XCTAssertNil(StoryAudioSourceResolver.playableURL(from: "   "))
    }
}

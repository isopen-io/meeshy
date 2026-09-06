import XCTest
@testable import Meeshy

/// **Un audio de story publié porte son ADRESSE, pas seulement son identifiant**
/// (#5420, directive porteur 2026-09-06 : « il faut résoudre le même problème
/// pour les audios »).
///
/// ## Le défaut
///
/// À l'upload, les trois médias d'une scène passent par le même bloc — même
/// `uploadFile`, même `seed` de cache — et deux d'entre eux seulement posaient
/// l'adresse :
///
/// | médium | `postMediaId` | `mediaURL` |
/// |---|---|---|
/// | vidéo | oui | oui |
/// | image | oui | oui |
/// | **audio** | oui | **non** |
///
/// Une story ne porte AUCUN `PostMedia` — mesuré sur le fil : `media = 0` pour
/// les six stories du compte de test, leur contenu vivant dans le canvas. Le
/// résolveur par identifiant de l'hôte (`StoryItem.media`) ne trouve donc jamais
/// rien, et `StoryAudioSourceResolver.remoteURL` retombe sur `audio.mediaURL` —
/// qui n'était jamais écrit.
///
/// > **L'identifiant voyage, l'adresse reste à quai.** Troisième exemplaire du
/// > même patron en une journée, sur trois médiums : le cadrage du fond (#5406),
/// > la vidéo de fond (#5419), et celui-ci.
///
/// ## Pourquoi une garde de SOURCE
///
/// Le bloc fautif vit dans une méthode `async` de `StoryViewModel` qui téléverse
/// réellement. Ce qui doit être gardé n'est pas l'upload — c'est la SYMÉTRIE :
/// aucun médium ne doit poser son identifiant sans son adresse.
final class StoryAudioAddressUploadTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/ViewModels/StoryViewModel+PublicationUpload.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// **Chaque `postMediaId = result.id` a son `mediaURL = result.fileUrl`.**
    ///
    /// Le témoin compte les deux, plutôt que de citer une ligne : c'est
    /// l'ÉGALITÉ qui est la règle, et elle survivra à un quatrième médium.
    func test_chaqueIdentifiantPose_aSonAdresse() throws {
        let code = try source()
        let identifiants = code.components(separatedBy: "postMediaId = result.id").count - 1
        let adresses = code.components(separatedBy: "mediaURL = result.fileUrl").count - 1
        XCTAssertGreaterThan(identifiants, 0, "le balayage doit trouver les sites d'upload")
        XCTAssertEqual(
            adresses, identifiants,
            "\(identifiants) médias reçoivent un identifiant et \(adresses) une adresse. "
            + "Une story ne porte aucun PostMedia : sans adresse, le média est injouable (#5420)."
        )
    }

    /// **Les DEUX chemins.** La publication et la republication/édition portent
    /// le même bloc ; n'en corriger qu'un laisserait l'audio muet sur l'autre —
    /// et c'est le chemin d'édition qui est le plus discret des deux.
    func test_lesDeuxCheminsDUploadAudio_sontCorriges() throws {
        let code = try source()
        let sites = code.components(separatedBy: "audioObjects[i].mediaURL = result.fileUrl").count - 1
        XCTAssertEqual(sites, 2,
                       "publication ET republication/édition posent l'adresse de l'audio")
    }
}

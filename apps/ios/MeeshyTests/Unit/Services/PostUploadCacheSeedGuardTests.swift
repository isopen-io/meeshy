import XCTest

/// #9875 — après un téléversement, le fichier envoyé n'est mis en cache
/// qu'UNE fois, et jamais relu en mémoire.
///
/// La boucle qui suit `OrderedParallelUpload.run` relisait chaque pièce
/// entière (`readAttachmentFileBytes` → `Data(contentsOf:)`), la rangeait par
/// `images.store` / `video.store` / `audio.store`, et redécodait l'image par
/// `UIImage(data:)` — alors que `TusUploadManager.seedMediaCache` venait de
/// copier le même fichier dans le même cache. Une vidéo de 200 Mo traversait
/// la mémoire pour rien, deux fois rangée.
///
/// **Pourquoi une garde de SOURCE.** La boucle vit dans le corps d'une vue
/// SwiftUI, sans couture injectable : aucun double n'observe une lecture de
/// fichier. La source est la seule surface où le défaut existe.
final class PostUploadCacheSeedGuardTests: XCTestCase {

    private static let handlersPath = "Meeshy/Features/Main/Views/MediaGroupUploader.swift"
    private static let loopAnchor = "struct TusMediaGroupUploader"

    private struct AncreIntrouvable: Error, CustomStringConvertible {
        let ancre: String
        var description: String {
            "L'ancre `\(ancre)` a disparu — la garde ne mesurerait RIEN"
        }
    }

    private func postUploadLoopBody() throws -> String {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.handlersPath))
        guard let start = code.range(of: Self.loopAnchor) else {
            throw AncreIntrouvable(ancre: Self.loopAnchor)
        }
        var depth = 0
        var body = ""
        for character in code[start.lowerBound...] {
            body.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return body }
            }
        }
        throw AncreIntrouvable(ancre: Self.loopAnchor + " { … }")
    }

    func test_laGardeLitLaBoucleApresTeleversement() throws {
        let body = try postUploadLoopBody()

        XCTAssertTrue(
            body.contains("didPromote(item.attachmentId, result.id)"),
            "La boucle lue n'est pas celle qui suit le téléversement — la garde ne mesurerait rien"
        )
    }

    func test_apresTeleversement_aucunOctetDuFichierNEstRelu() throws {
        let body = try postUploadLoopBody()

        for interdit in ["Data(contentsOf", "readAttachmentFileBytes", "UIImage(data:"] {
            XCTAssertFalse(
                body.contains(interdit),
                "`\(interdit)` relit le fichier envoyé, déjà copié dans le cache par TusUploadManager (#9875)"
            )
        }
    }

    func test_apresTeleversement_leMediaNEstPasRangeUneSecondeFois() throws {
        let body = try postUploadLoopBody()

        for interdit in ["images.store(", "video.store(", "audio.store("] {
            XCTAssertFalse(
                body.contains(interdit),
                "`\(interdit)` range une seconde copie du média, déjà ensemencé sous la clé de rendu (#9875)"
            )
        }
    }

    func test_apresTeleversement_laBulleRelitSousLaCleDeRenduDuSDK() throws {
        let body = try postUploadLoopBody()

        XCTAssertTrue(
            body.contains("TusUploadManager.renderCacheKey(forFileUrl:"),
            "L'aperçu de la bulle se range sous la MÊME clé que l'ensemencement du SDK, sinon il se re-télécharge"
        )
    }
}

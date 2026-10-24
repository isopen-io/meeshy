import Foundation

/// **La passerelle ne sait pas lire ce format d'image** (415, #11263).
///
/// `tus-handler.ts` répond 415 à la FIN d'un envoi quand un HEIC/AVIF n'est
/// décodable ni par sharp ni par `heif-convert`. Le refus est définitif pour CE
/// fichier : il remonte typé, sans nouvelle tentative, pour que l'appelant
/// envoie une variante JPEG au lieu de rejouer les mêmes octets.
///
/// Une passerelle d'AVANT S8 ne connaît pas la signature HEIC : elle répond 400
/// « … does not match any known image signature » (`verifyDeclaredMimeType`).
/// C'est le même refus d'un format d'image, et il appelle le même repli —
/// sinon la pièce échoue à chaque rejeu de l'outbox, sans fin.
public struct UnsupportedImageFormatRefusal: Error, Sendable, Equatable {
    static let unknownSignatureMarker = "does not match any known image signature"

    public init?(statusCode: Int) {
        guard statusCode == 415 else { return nil }
    }

    public init?(statusCode: Int, body: Data) {
        let unknownSignature = statusCode == 400
            && String(decoding: body, as: UTF8.self).contains(Self.unknownSignatureMarker)
        guard statusCode == 415 || unknownSignature else { return nil }
    }
}

/// Le refus TYPÉ qu'un envoi TUS peut recevoir à sa fin : celui d'un invité
/// (`GuestAttachmentRefusal`, 403/413) ou celui d'un format d'image (415, ou
/// 400 de signature inconnue sur une passerelle d'avant S8).
/// `nil` ⇒ un autre statut, que l'envoi traite comme une réponse illisible.
struct TusFinalRefusal {
    let error: any Error

    init?(statusCode: Int, body: Data) {
        if let guest = GuestAttachmentRefusal(statusCode: statusCode, body: body) {
            error = guest
        } else if let format = UnsupportedImageFormatRefusal(statusCode: statusCode, body: body) {
            error = format
        } else {
            return nil
        }
    }
}

import Foundation

/// **La passerelle ne sait pas lire ce format d'image** (415, #11263).
///
/// `tus-handler.ts` répond 415 à la FIN d'un envoi quand un HEIC/AVIF n'est
/// décodable ni par sharp ni par `heif-convert`. Le refus est définitif pour CE
/// fichier : il remonte typé, sans nouvelle tentative, pour que l'appelant
/// envoie une variante JPEG au lieu de rejouer les mêmes octets.
public struct UnsupportedImageFormatRefusal: Error, Sendable, Equatable {
    public init?(statusCode: Int) {
        guard statusCode == 415 else { return nil }
    }
}

/// Le refus TYPÉ qu'un envoi TUS peut recevoir à sa fin : celui d'un invité
/// (`GuestAttachmentRefusal`, 403/413) ou celui d'un format d'image (415).
/// `nil` ⇒ un autre statut, que l'envoi traite comme une réponse illisible.
struct TusFinalRefusal {
    let error: any Error

    init?(statusCode: Int, body: Data) {
        if let guest = GuestAttachmentRefusal(statusCode: statusCode, body: body) {
            error = guest
        } else if let format = UnsupportedImageFormatRefusal(statusCode: statusCode) {
            error = format
        } else {
            return nil
        }
    }
}

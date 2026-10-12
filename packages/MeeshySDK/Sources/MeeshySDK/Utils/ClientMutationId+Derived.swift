import CryptoKit
import Foundation

extension ClientMutationId {

    /// **Une clé d'idempotence STABLE pour un même contenu** (#10321).
    ///
    /// `generate()` tire une clé neuve à chaque appel : parfait pour une ligne
    /// d'outbox, qui la grave une fois. Une story, elle, se rejoue depuis sa
    /// file sans clé gravée — une app tuée entre le succès serveur et
    /// l'écriture disque la republiait. Dériver la clé d'une graine stable
    /// (l'item de file et la slide) rend la même clé à chaque rejeu : le
    /// `MutationLog` de la passerelle reconnaît la seconde requête et rend la
    /// publication déjà écrite, jamais un doublon.
    ///
    /// La forme respecte `regexPattern` : 16 octets d'un SHA-256, bits de
    /// version et de variante posés comme ceux d'un UUID v4.
    public static func derived(from seed: String) -> String {
        var bytes = Array(SHA256.hash(data: Data(seed.utf8)).prefix(16))
        bytes[6] = (bytes[6] & 0x0F) | 0x40
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        let uuid = UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
        ))
        return "cmid_\(uuid.uuidString.lowercased())"
    }

    /// La clé d'une slide de story publiée depuis sa file : un item, une slide,
    /// une clé — la même à chaque rejeu.
    public static func storySlide(queueItemId: String, slideId: String) -> String {
        derived(from: "story-slide|\(queueItemId)|\(slideId)")
    }
}

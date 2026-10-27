import Foundation
import GRDB

/// **Le clair d'un message chiffré de bout en bout ne s'écrit sur le disque que
/// dans le coffre libsignal** (#12999, modèle : appareil volé).
///
/// La base des messages (`meeshy.sqlite`, protégée après le premier
/// déverrouillage), le cache du fil et celui des conversations ne portent, pour
/// un tel message, que le littéral que la passerelle sert. Le fil, la ligne de
/// liste et le renvoi d'un échec relisent le clair dans le coffre, en mémoire.
/// Cette loi est appliquée là où l'on ÉCRIT (`MessageRecord` vers ses colonnes,
/// `MeeshyMessage` vers le cache), pour qu'aucun chemin d'écriture, présent ou
/// futur, n'y échappe.
public enum EndToEndDiskPlaintextLaw {

    /// La ligne est-elle celle d'un message chiffré de bout en bout ?
    public static func sealsContent(isEncrypted: Bool, encryptionMode: String?) -> Bool {
        isEncrypted && encryptionMode == E2EEWire.mode
    }

    /// Le texte que le cache garde d'un message. Un clair déchiffré sur
    /// l'appareil ne se pose que sur un message chiffré : la provenance (et sa
    /// clé du trousseau) ne se lit que pour lui.
    public static func persistableContent(of message: MeeshyMessage) -> String {
        guard message.isEncrypted, !message.content.isEmpty,
              message.encryptionMode == E2EEWire.mode || message.isContentDecryptedOnDevice
        else { return message.content }
        return E2EEWire.contentPlaceholder
    }

    /// La ligne telle qu'elle s'écrit.
    public static func sealed(_ record: MessageRecord) -> MessageRecord {
        guard sealsContent(isEncrypted: record.isEncrypted, encryptionMode: record.encryptionMode),
              let content = record.content, !content.isEmpty, content != E2EEWire.contentPlaceholder
        else { return record }
        var sealed = record
        sealed.content = E2EEWire.contentPlaceholder
        return sealed
    }
}

/// Les colonnes d'une ligne, encodées par l'`Encodable` synthétisé de
/// `MessageRecord` — que son propre `encode(to: PersistenceContainer)` ne peut
/// pas appeler directement.
struct MessageRecordDiskColumns: Encodable, EncodableRecord {
    let record: MessageRecord

    func encode(to encoder: Encoder) throws {
        try record.encode(to: encoder)
    }
}

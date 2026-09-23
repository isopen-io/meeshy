import Foundation
import GRDB

// MARK: - La vue unique OUVERTE, dans la base (#7579)

public extension MessageRecord {

    /// La ligne porte-t-elle une vue unique — au niveau du message, d'une de
    /// ses pièces, ou parce que ce lecteur l'a déjà ouverte ?
    var holdsViewOnce: Bool {
        if viewOnceOpenedAt != nil { return true }
        if effectFlags & MessageEffectFlags.viewOnce.rawValue != 0 { return true }
        guard let attachmentsJson,
              let pieces = try? JSONSerialization.jsonObject(with: attachmentsJson) as? [[String: Any]]
        else { return false }
        return pieces.contains { ($0["isViewOnce"] as? Bool) == true }
    }

    /// Scelle la ligne comme vue unique **déjà ouverte** par ce lecteur, et
    /// PURGE son contenu : texte, chiffré, pièces (légendes, vignettes,
    /// transcriptions et pistes traduites comprises), sticker, lieu.
    ///
    /// Seule l'enveloppe reste — identifiant, auteur, heure, type — et le
    /// drapeau de vue unique est posé sur le MESSAGE : une photo dont seule la
    /// pièce portait la vue unique ne doit pas redevenir, une fois vidée, un
    /// message ordinaire.
    ///
    /// Idempotent : l'instant d'ouverture déjà gravé n'est jamais déplacé.
    mutating func sealAsOpenedViewOnce(at date: Date) {
        viewOnceOpenedAt = viewOnceOpenedAt ?? date
        effectFlags |= MessageEffectFlags.viewOnce.rawValue
        content = nil
        encryptedPayload = nil
        attachmentsJson = nil
        stickerJson = nil
        locationJson = nil
    }
}

extension MessagePersistenceActor {

    /// Grave l'ouverture d'une vue unique par CE lecteur et purge son contenu
    /// local, traductions comprises (#7579).
    ///
    /// Appelé à la fermeture du plein écran d'un média, et quand un texte lu
    /// sur place est retouché ou quitte l'écran. Le fil lit GRDB : c'est cette
    /// écriture qui fait passer la bulle à `(1) · Déjà ouvert`, et qui survit au
    /// redémarrage et à toute revalidation REST (`upsertFromAPIMessages`
    /// respecte la colonne).
    public func markViewOnceOpened(localId: String, at date: Date = Date()) throws {
        var affectedConversationId: String?
        try dbWriter.write { db in
            guard var record = try MessageRecord
                .filter(Column("localId") == localId || Column("serverId") == localId)
                .fetchOne(db) else { return }
            affectedConversationId = record.conversationId
            record.sealAsOpenedViewOnce(at: date)
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
            _ = try TranslationRecord
                .filter(Column("messageLocalId") == record.localId
                        || Column("messageServerId") == (record.serverId ?? record.localId))
                .deleteAll(db)
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }
}

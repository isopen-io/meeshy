import CoreGraphics
import Foundation

// MARK: - API -> Status Entry Conversion
extension APIPost {
    public func toStatusEntry() -> StatusEntry? {
        guard (type ?? "").uppercased() == "STATUS", let emoji = moodEmoji else { return nil }
        // Attribution "via @X" : un status republié pointe la source via
        // `repostOf` (single source of truth — pas de colonne `viaUsername`
        // dédiée côté gateway, et il n'y en a jamais eu : `git log -S
        // "viaUsername" -- services/gateway packages/shared` est vide sur
        // toute l'histoire du dépôt). `APIPost.viaUsername` reste décodé
        // (compat descendante d'un champ jamais servi) mais N'EST PLUS lu
        // ici : le préférer à `repostOf.author` offrirait à une charge
        // falsifiée le droit de renommer l'auteur d'une source republiée.
        let via = repostOf?.author.username
        return StatusEntry(id: id, userId: author.id, username: author.name,
                           avatarColor: DynamicColorGenerator.colorForName(author.name),
                           moodEmoji: emoji, content: content, audioUrl: audioUrl, createdAt: createdAt,
                           expiresAt: expiresAt, viaUsername: via)
    }
}

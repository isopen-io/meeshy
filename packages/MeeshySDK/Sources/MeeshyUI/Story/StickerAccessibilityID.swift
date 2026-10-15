import Foundation

/// **Les identifiants d'accessibilité des stickers (#10683)** — un nom stable
/// par onglet, par case et par œuvre, que la recette sur appareil désigne sans
/// coordonnées (`apps/ios/scripts/iphone-remote/`). Un seul site les compose :
/// la vue, son témoin et la télécommande lisent la même chaîne.
public nonisolated enum StickerAccessibilityID {
    /// `id` est celui de l'entrée d'onglet, déjà préfixé par son genre
    /// (`tab.recents`, `pack.mee`) : l'identifiant devient
    /// `sticker.sheet.tab.recents` ou `sticker.sheet.pack.mee`.
    public static func tab(_ id: String) -> String { "sticker.sheet.\(id)" }
    public static func mee(_ id: String) -> String { "sticker.mee.\(id)" }
    public static func instant(_ id: String) -> String { "sticker.instant.\(id)" }
    public static func pack(_ pack: String, item: String) -> String { "sticker.pack.\(pack).\(item)" }
    public static func emoji(_ emoji: String) -> String { "sticker.emoji.\(emoji)" }
    public static func library(_ id: String) -> String { "sticker.library.\(id)" }
    public static let messageArtwork = "message.sticker"
}

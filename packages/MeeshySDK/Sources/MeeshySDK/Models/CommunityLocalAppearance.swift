import Foundation

/// L'emoji et la couleur choisis pour une communauté vivent sur l'APPAREIL :
/// aucun champ de la passerelle ne les porte (#6377, #6380). Ce type est le
/// seul site de leurs clés, que la création, les réglages et le détail
/// partagent ; les clés sont celles que les installations existantes ont déjà
/// écrites.
public struct CommunityLocalAppearance: Equatable, Sendable {
    public let emoji: String?
    public let color: String?

    public init(emoji: String?, color: String?) {
        self.emoji = emoji
        self.color = color
    }

    public static func read(communityId: String, from defaults: UserDefaults = .standard) -> CommunityLocalAppearance {
        CommunityLocalAppearance(
            emoji: nonBlank(defaults.string(forKey: emojiKey(communityId))),
            color: nonBlank(defaults.string(forKey: colorKey(communityId)))
        )
    }

    public static func writeEmoji(_ emoji: String, communityId: String, to defaults: UserDefaults = .standard) {
        write(emoji, forKey: emojiKey(communityId), to: defaults)
    }

    public static func writeColor(_ color: String, communityId: String, to defaults: UserDefaults = .standard) {
        write(color, forKey: colorKey(communityId), to: defaults)
    }

    private static func write(_ value: String, forKey key: String, to defaults: UserDefaults) {
        guard let kept = nonBlank(value) else {
            defaults.removeObject(forKey: key)
            return
        }
        defaults.set(kept, forKey: key)
    }

    private static func nonBlank(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return nil
        }
        return trimmed
    }

    private static func emojiKey(_ communityId: String) -> String { "community.emoji.\(communityId)" }
    private static func colorKey(_ communityId: String) -> String { "community.color.\(communityId)" }
}

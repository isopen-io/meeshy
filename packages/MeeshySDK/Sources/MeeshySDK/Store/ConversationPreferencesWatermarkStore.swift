import Foundation

/// Le filigrane SERVEUR du rattrapage des préférences par conversation (#19307), persisté par compte : un
/// redémarrage relit ce qui a changé depuis, au lieu de rejouer jusqu'à 20 pages de 100 lignes. L'instant est celui
/// que le serveur a servi (`updatedAt`), jamais l'horloge de l'appareil.
public struct ConversationPreferencesWatermarkStore: Sendable {
    let load: @Sendable (_ userId: String) -> Date?
    let save: @Sendable (_ userId: String, _ watermark: Date) -> Void

    public init(
        load: @escaping @Sendable (_ userId: String) -> Date?,
        save: @escaping @Sendable (_ userId: String, _ watermark: Date) -> Void
    ) {
        self.load = load
        self.save = save
    }

    private static func key(for userId: String) -> String { "meeshy.conversationPrefsCatchUpWatermark.\(userId)" }

    public static let standard = ConversationPreferencesWatermarkStore(
        load: { userId in
            let seconds = UserDefaults.standard.double(forKey: key(for: userId))
            return seconds > 0 ? Date(timeIntervalSince1970: seconds) : nil
        },
        save: { userId, watermark in
            UserDefaults.standard.set(watermark.timeIntervalSince1970, forKey: key(for: userId))
        }
    )

    static func inMemory() -> ConversationPreferencesWatermarkStore {
        let held = Locked<[String: Date]>([:])
        return ConversationPreferencesWatermarkStore(
            load: { userId in held.read { $0[userId] } },
            save: { userId, watermark in held.mutate { $0[userId] = watermark } }
        )
    }
}

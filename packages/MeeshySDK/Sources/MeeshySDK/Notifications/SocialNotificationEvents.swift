import Foundation

// MARK: - L'entonnoir des notifications : reçue, affichée, ouverte, écartée (#10507)

public enum SocialNotificationEvents {

    /// L'événement d'une notification, depuis la charge APNs. `nil` sans
    /// identifiant de notification : la passerelle ne pourrait pas vérifier
    /// qu'elle appartient au lecteur. Le parent n'est posé que pour un CONTENU
    /// social (un post) — jamais une conversation ni un message.
    public static func event(
        _ action: SocialNotificationEvent.Action,
        userInfo: [AnyHashable: Any],
        channel: SocialNotificationEvent.Channel = .apns,
        at date: Date = Date()
    ) -> SocialEventV2? {
        guard let notificationId = userInfo["notificationId"] as? String, !notificationId.isEmpty else { return nil }
        let type = (userInfo["type"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "unknown"
        let parent = (userInfo["postId"] as? String).flatMap { $0.isEmpty ? nil : SocialTargetRef(kind: .post, id: $0) }
        let latency = action == .received ? deliveryLatencyMs(userInfo["createdAt"], at: date) : nil
        return SocialEventV2(
            occurredAt: date,
            target: SocialTarget(kind: .notification, id: notificationId, parent: parent),
            surface: .notifications,
            payload: .notification(SocialNotificationEvent(action: action, notificationType: type, channel: channel, deliveryLatencyMs: latency))
        )
    }

    static func deliveryLatencyMs(_ raw: Any?, at date: Date) -> Int? {
        guard let text = raw as? String else { return nil }
        guard let sent = WireDate.date(from: text) else { return nil }
        let ms = Int(date.timeIntervalSince(sent) * 1_000)
        return (0...SocialEventsV2Wire.maxAgeMs).contains(ms) ? ms : nil
    }
}

extension SocialEventsV2Wire {
    static let maxAgeMs = Int(maxAge * 1_000)
}

/// La boîte partagée (groupe d'app) où l'extension de notification dépose ce
/// qu'elle a REÇU — sans réseau, une ligne JSON par événement. L'app la vide
/// dans sa file v2 au lot suivant. Bornée : au-delà de 256 Kio, rien ne
/// s'ajoute (la boîte ne grossit jamais sans fin si l'app ne s'ouvre pas).
public final class SocialNotificationInbox: Sendable {
    public static let shared = SocialNotificationInbox(
        fileURL: FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: UserPreferencesManager.appGroupSuiteName)?
            .appendingPathComponent("social-events-v2-inbox.jsonl")
    )
    public static let maxBytes = 256 * 1_024

    private let fileURL: URL?
    private let fileAccess = Locked(())

    public init(fileURL: URL?) {
        self.fileURL = fileURL
    }

    public func append(_ event: SocialEventV2) {
        guard let fileURL, let data = try? SocialEventsV2Wire.encode(event) else { return }
        fileAccess.mutate { _ -> Void in
            let manager = FileManager.default
            let size = (try? manager.attributesOfItem(atPath: fileURL.path)[.size] as? Int) ?? 0
            guard size + data.count < SocialNotificationInbox.maxBytes else { return }
            let line = data + Data("\n".utf8)
            guard manager.fileExists(atPath: fileURL.path), let handle = try? FileHandle(forWritingTo: fileURL) else {
                try? line.write(to: fileURL, options: .atomic)
                return
            }
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: line)
        }
    }

    /// Prend tout le contenu de la boîte, qui repart vide. Le fichier est
    /// d'abord DÉPLACÉ : une écriture concurrente de l'extension crée une
    /// boîte neuve au lieu de se perdre dans celle qu'on lit.
    public func drain() -> [Data] {
        guard let fileURL else { return [] }
        return fileAccess.mutate { _ -> [Data] in
            let manager = FileManager.default
            guard manager.fileExists(atPath: fileURL.path) else { return [] }
            let taken = fileURL.deletingLastPathComponent().appendingPathComponent("social-events-v2-inbox.\(UUID().uuidString).draining")
            guard (try? manager.moveItem(at: fileURL, to: taken)) != nil else { return [] }
            defer { try? manager.removeItem(at: taken) }
            guard let content = try? Data(contentsOf: taken) else { return [] }
            return content.split(separator: UInt8(ascii: "\n")).map { Data($0) }.filter { !$0.isEmpty }
        }
    }

    public func purge() {
        guard let fileURL else { return }
        fileAccess.mutate { _ in try? FileManager.default.removeItem(at: fileURL) }
    }
}

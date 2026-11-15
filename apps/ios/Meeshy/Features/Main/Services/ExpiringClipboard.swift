import UIKit
import UniformTypeIdentifiers

enum ExpiringClipboard {
    static let lifetime: TimeInterval = 30

    struct Payload {
        let items: [[String: Any]]
        let options: [UIPasteboard.OptionsKey: Any]
    }

    static func payload(for secret: String, now: Date) -> Payload {
        Payload(
            items: [[UTType.utf8PlainText.identifier: secret]],
            options: [
                .expirationDate: now.addingTimeInterval(lifetime),
                .localOnly: true
            ]
        )
    }

    static func write(_ secret: String, to pasteboard: UIPasteboard = .general, now: Date = Date()) {
        let payload = payload(for: secret, now: now)
        pasteboard.setItems(payload.items, options: payload.options)
    }
}

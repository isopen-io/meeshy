import Foundation

/// Per-conversation draft state preserved across kills and navigation so the
/// user never loses an in-progress message. Mirrors the WhatsApp/iMessage
/// behaviour where the compose bar restores exactly as left: text, the
/// message being replied to, the selected language, and any pending effects.
///
/// The payload is JSON-encoded into `UserDefaults` under
/// `meeshy_draft_<conversationId>`; `saveText(_:for:)` / `loadText(for:)`
/// remain for compatibility with legacy call sites that only care about the
/// text portion, and drain into / read from the same `Draft` blob so both
/// code paths stay in sync.
public struct MessageDraft: Codable, Equatable, Sendable {
    public var text: String
    public var replyToId: String?
    /// Author name rendered in the inline reply chip so we can restore it
    /// without needing the original message in memory.
    public var replyAuthorName: String?
    public var replyPreviewText: String?
    public var replyIsMe: Bool
    public var selectedLanguage: String?
    /// Raw rawValue of `MessageEffects.flags` so we don't have to import the
    /// app-only type here (the SDK-free DraftStore lives in the app target).
    public var effectFlags: UInt32
    public var isBlurEnabled: Bool
    public var ephemeralDurationRawValue: Int?
    public var updatedAt: Date

    public init(
        text: String = "",
        replyToId: String? = nil,
        replyAuthorName: String? = nil,
        replyPreviewText: String? = nil,
        replyIsMe: Bool = false,
        selectedLanguage: String? = nil,
        effectFlags: UInt32 = 0,
        isBlurEnabled: Bool = false,
        ephemeralDurationRawValue: Int? = nil,
        updatedAt: Date = Date()
    ) {
        self.text = text
        self.replyToId = replyToId
        self.replyAuthorName = replyAuthorName
        self.replyPreviewText = replyPreviewText
        self.replyIsMe = replyIsMe
        self.selectedLanguage = selectedLanguage
        self.effectFlags = effectFlags
        self.isBlurEnabled = isBlurEnabled
        self.ephemeralDurationRawValue = ephemeralDurationRawValue
        self.updatedAt = updatedAt
    }

    /// `true` when the draft is effectively empty and can be removed from
    /// storage instead of being persisted (avoids leaving stale entries for
    /// conversations the user briefly opened).
    public var isEffectivelyEmpty: Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty
            && replyToId == nil
            && effectFlags == 0
            && !isBlurEnabled
            && ephemeralDurationRawValue == nil
    }
}

final class DraftStore: @unchecked Sendable {
    static let shared = DraftStore()

    private let defaults: UserDefaults
    private let prefix = "meeshy_draft_"
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    init(userDefaults: UserDefaults = .standard) {
        self.defaults = userDefaults
    }

    // MARK: - Full Draft API

    func save(_ draft: MessageDraft, for conversationId: String) {
        if draft.isEffectivelyEmpty {
            defaults.removeObject(forKey: key(for: conversationId))
            return
        }
        var stamped = draft
        stamped.updatedAt = Date()
        guard let data = try? encoder.encode(stamped) else { return }
        defaults.set(data, forKey: key(for: conversationId))
    }

    func load(for conversationId: String) -> MessageDraft? {
        let key = key(for: conversationId)
        if let data = defaults.data(forKey: key),
           let draft = try? decoder.decode(MessageDraft.self, from: data) {
            return draft
        }
        // Legacy fallback: older builds stored the raw text under the same
        // key. Decode it so the user doesn't lose their in-progress message
        // on upgrade, and migrate to the new encoded blob on next save.
        if let legacy = defaults.string(forKey: key), !legacy.isEmpty {
            return MessageDraft(text: legacy)
        }
        return nil
    }

    func remove(for conversationId: String) {
        defaults.removeObject(forKey: key(for: conversationId))
    }

    func hasDraft(for conversationId: String) -> Bool {
        load(for: conversationId) != nil
    }

    // MARK: - Text-only convenience (legacy callers)

    func saveText(_ text: String, for conversationId: String) {
        var draft = load(for: conversationId) ?? MessageDraft()
        draft.text = text
        save(draft, for: conversationId)
    }

    func loadText(for conversationId: String) -> String {
        load(for: conversationId)?.text ?? ""
    }

    // Legacy shorthand kept for call sites already passing raw strings.
    func save(_ text: String, for conversationId: String) {
        saveText(text, for: conversationId)
    }

    // Legacy shorthand (string overload conflicts with `load(for:) -> MessageDraft?`
    // — callers that want the full draft must use `load(for:)`).

    // MARK: - Maintenance

    func clearAll() {
        let allKeys = defaults.dictionaryRepresentation().keys
        for k in allKeys where k.hasPrefix(prefix) {
            defaults.removeObject(forKey: k)
        }
    }

    /// Sweep drafts older than `maxAge` so abandoned compose sessions don't
    /// linger in UserDefaults forever. Called from the app's background
    /// maintenance hook.
    func purgeExpired(olderThan maxAge: TimeInterval = 30 * 24 * 3600) {
        let cutoff = Date().addingTimeInterval(-maxAge)
        let allKeys = defaults.dictionaryRepresentation().keys
        for k in allKeys where k.hasPrefix(prefix) {
            guard let data = defaults.data(forKey: k),
                  let draft = try? decoder.decode(MessageDraft.self, from: data) else { continue }
            if draft.updatedAt < cutoff {
                defaults.removeObject(forKey: k)
            }
        }
    }

    private func key(for conversationId: String) -> String {
        "\(prefix)\(conversationId)"
    }
}

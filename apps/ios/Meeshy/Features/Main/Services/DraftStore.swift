import Foundation
import Combine
import MeeshySDK

/// Per-conversation draft state preserved across kills and navigation so the
/// user never loses an in-progress message. Mirrors the WhatsApp/iMessage
/// behaviour where the compose bar restores exactly as left: text, the
/// message being replied to, the selected language, and any pending effects.
///
/// Q4 (2026-05-26) — les clés sont désormais préfixées par userId :
/// `meeshy_draft_<userId>_<conversationId>`. Avant ce fix, l'absence de
/// préfixage userId créait une fuite privacy active : sur un device avec
/// 2+ users, un user B ouvrant une conversation voyait le brouillon du
/// user A dans le compose box. Migration ascendante des clés legacy
/// (`meeshy_draft_<convId>`) au premier `load()` du user courant.
/// Voir `docs/superpowers/specs/2026-05-26-user-session-migration-design.md`.
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

    /// `true` when the draft carries actual unsent TEXT (after trimming). The
    /// conversation-list "Brouillon" badge keys on this: a draft that only holds
    /// a reply reference or composer effects (no typed text) must NOT raise the
    /// badge — there is no unsent message content to flag, so showing "Brouillon"
    /// would point the user at a draft message that doesn't exist.
    public var hasDraftText: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

/// Projection légère et prête au rendu d'un brouillon persisté, pour la liste
/// de conversations. Ne porte que ce dont la ligne et le comparateur de tri
/// ont besoin.
struct DraftSummary: Equatable, Sendable {
    let previewText: String
    let updatedAt: Date
}

final class DraftStore: @unchecked Sendable {
    static let shared = DraftStore()

    /// Émis à chaque mutation de brouillon (save, remove, clearAll,
    /// purgeExpired). La liste de conversations s'y abonne pour ré-annoter et
    /// re-trier en temps réel.
    let changed = PassthroughSubject<Void, Never>()

    private let defaults: UserDefaults
    private let prefix = "meeshy_draft_"
    /// Q4 — résolveur du userId courant. Injecté pour testabilité ; en
    /// production, lit `AuthManager.shared.currentUser?.id`. Retourne `nil`
    /// quand aucun user n'est connecté → fallback sur les anciennes clés
    /// (la migration n'a pas de user-cible).
    private let userIdProvider: () -> String?
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

    init(
        userDefaults: UserDefaults = .standard,
        userIdProvider: @escaping () -> String? = { AuthManager.shared.currentUser?.id }
    ) {
        self.defaults = userDefaults
        self.userIdProvider = userIdProvider
    }

    // MARK: - Full Draft API

    func save(_ draft: MessageDraft, for conversationId: String) {
        if draft.isEffectivelyEmpty {
            defaults.removeObject(forKey: key(for: conversationId))
            changed.send()
            return
        }
        var stamped = draft
        stamped.updatedAt = Date()
        guard let data = try? encoder.encode(stamped) else { return }
        defaults.set(data, forKey: key(for: conversationId))
        changed.send()
    }

    func load(for conversationId: String) -> MessageDraft? {
        let userKey = key(for: conversationId)
        // 1) Per-user encoded blob (current format)
        if let data = defaults.data(forKey: userKey),
           let draft = try? decoder.decode(MessageDraft.self, from: data) {
            return draft
        }
        // 2) Q4 migration : legacy key without userId prefix.
        // Attribué au user courant + supprimé de l'ancien emplacement
        // pour que les autres users du device ne le voient pas. Si
        // userId est nil (cas dégradé : pas de session), `userKey ==
        // legacy` et on saute le bloc — l'ancien chemin legacy plus bas
        // gère le cas.
        let legacy = legacyKey(for: conversationId)
        if legacy != userKey {
            if let data = defaults.data(forKey: legacy),
               let draft = try? decoder.decode(MessageDraft.self, from: data) {
                defaults.set(data, forKey: userKey)
                defaults.removeObject(forKey: legacy)
                return draft
            }
            // Very old legacy : raw string (pré-MessageDraft)
            if let str = defaults.string(forKey: legacy), !str.isEmpty {
                let migrated = MessageDraft(text: str)
                if let encoded = try? encoder.encode(migrated) {
                    defaults.set(encoded, forKey: userKey)
                }
                defaults.removeObject(forKey: legacy)
                return migrated
            }
        } else {
            // userId nil — pas de migration possible. Lire la legacy raw
            // string si présente (compat ascendante).
            if let str = defaults.string(forKey: userKey), !str.isEmpty {
                return MessageDraft(text: str)
            }
        }
        return nil
    }

    func remove(for conversationId: String) {
        defaults.removeObject(forKey: key(for: conversationId))
        changed.send()
    }

    func hasDraft(for conversationId: String) -> Bool {
        load(for: conversationId) != nil
    }

    /// Tous les brouillons persistés du **user courant** qui ont encore du
    /// contenu, indexés par conversationId. Utilisé par la liste de
    /// conversations pour afficher le badge « Brouillon ». Q4 — filtre
    /// strict par userId pour ne JAMAIS exposer les drafts des autres
    /// users du device.
    func allNonEmptyDrafts() -> [String: MessageDraft] {
        var result: [String: MessageDraft] = [:]
        guard let userId = userIdProvider() else {
            // Pas de user logged in — cas dégradé. On retourne les clés
            // legacy uniquement (pré-Q4) pour compat ascendante, mais
            // pas les clés per-user (on ne sait pas à qui elles
            // appartiennent).
            for k in defaults.dictionaryRepresentation().keys where k.hasPrefix(prefix) {
                let rest = String(k.dropFirst(prefix.count))
                // Une clé per-user contient au moins un `_` séparant
                // userId du conversationId. On l'exclut ici.
                guard !rest.contains("_") else { continue }
                guard !rest.isEmpty,
                      let draft = load(for: rest),
                      draft.hasDraftText else { continue }
                result[rest] = draft
            }
            return result
        }
        let userPrefix = "\(prefix)\(userId)_"
        for k in defaults.dictionaryRepresentation().keys where k.hasPrefix(userPrefix) {
            let conversationId = String(k.dropFirst(userPrefix.count))
            guard !conversationId.isEmpty,
                  let draft = load(for: conversationId),
                  draft.hasDraftText else { continue }
            result[conversationId] = draft
        }
        return result
    }

    /// Purge the reply reference (`replyToId`) of an existing draft so the
    /// composer reply banner stops re-appearing on conversation re-entry.
    /// Text, attachments, and effect flags are preserved — this only clears
    /// the reply context. No-op if no draft exists for the conversation.
    func clearReplyReference(conversationId: String) {
        guard var draft = load(for: conversationId) else { return }
        guard draft.replyToId != nil else { return }
        draft.replyToId = nil
        draft.replyAuthorName = nil
        draft.replyPreviewText = nil
        draft.replyIsMe = false
        save(draft, for: conversationId)
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
        changed.send()
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
        changed.send()
    }

    /// Clé per-user actuelle : `meeshy_draft_<userId>_<convId>`. Si aucun
    /// user n'est connecté, retombe sur la clé legacy (pour les call sites
    /// qui pourraient survenir avant le login — défensif).
    private func key(for conversationId: String) -> String {
        if let userId = userIdProvider() {
            return "\(prefix)\(userId)_\(conversationId)"
        }
        return legacyKey(for: conversationId)
    }

    /// Format legacy pré-Q4 : `meeshy_draft_<convId>`. Référencé uniquement
    /// par la migration ascendante dans `load()` et par `purgeExpired`.
    private func legacyKey(for conversationId: String) -> String {
        "\(prefix)\(conversationId)"
    }
}

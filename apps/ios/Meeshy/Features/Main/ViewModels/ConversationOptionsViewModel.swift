import Foundation
import Combine
import MeeshySDK
import os

@MainActor
final class ConversationOptionsViewModel: ObservableObject {
    @Published var prefs: APIConversationPreferences = .empty
    @Published var categories: [ConversationCategory] = []
    @Published var allTags: [String] = []
    @Published var loadState: MeeshySDK.LoadState = .idle
    @Published var errorMessage: String?
    @Published var didDelete: Bool = false
    @Published var didLeave: Bool = false

    private let conversation: MeeshyConversation
    private var conversationId: String { conversation.id }
    private let store: ConversationStore
    private let preferenceService: PreferenceServiceProviding
    private static let logger = Logger(subsystem: "me.meeshy.app", category: "conv-options")

    private let customNameSubject = PassthroughSubject<String, Never>()
    private var cancellables = Set<AnyCancellable>()

    init(
        conversation: MeeshyConversation,
        store: ConversationStore = .shared,
        preferenceService: PreferenceServiceProviding = PreferenceService.shared
    ) {
        self.conversation = conversation
        self.store = store
        self.preferenceService = preferenceService
        self.prefs = Self.prefs(from: conversation.userState)
        setupDebounce()
    }

    func load() async {
        // The store owns the mutable per-user state (pin/mute/archive/section/
        // reaction/tags). Hydrate it (version-gated, so an in-flight optimistic
        // mutation from the list isn't clobbered) then mirror it into `prefs`.
        // Categories + the tag autocomplete corpus aren't in the store, so they
        // keep their own cache-first load from PreferenceService.
        await store.hydrateMetadata([conversation])
        if let conv = await store.conversation(id: conversationId) {
            prefs = Self.prefs(from: conv.userState)
        }

        async let cachedCategories = preferenceService.loadCachedCategories()
        async let cachedTags = preferenceService.loadCachedConversationTags()
        let (cc, ct) = await (cachedCategories, cachedTags)
        if let cc { categories = cc.sorted { ($0.order ?? 0) < ($1.order ?? 0) } }
        if let ct { allTags = ct }
        loadState = (cc != nil || ct != nil) ? .loaded : .loading

        do {
            async let categoriesCall = preferenceService.revalidateCategories()
            async let tagsCall = preferenceService.revalidateConversationTags()
            let (c, t) = try await (categoriesCall, tagsCall)
            categories = c.sorted { ($0.order ?? 0) < ($1.order ?? 0) }
            allTags = t
            loadState = .loaded
        } catch {
            Self.logger.error("Failed to load options metadata: \(error.localizedDescription)")
            if loadState != .loaded {
                loadState = .error(error.localizedDescription)
                errorMessage = "Impossible de charger les préférences."
            }
        }
    }

    // MARK: - Setters (optimistic display + store-backed persistence)
    //
    // Each setter mutates `prefs` SYNCHRONOUSLY for instant UI feedback in the
    // same render frame as the tap, then persists through `ConversationStore`
    // (optimistic + outbox offline replay + version + cross-surface sync). On a
    // permanent (4xx) failure the store throws and we roll the display back; a
    // transient failure keeps the optimistic value and retries via the outbox.

    @discardableResult
    func setPinned(_ value: Bool) -> Task<Void, Never> {
        let previous = prefs.isPinned
        return applyMutation(.setPinned(value),
                             optimistic: { self.prefs.isPinned = value },
                             rollback: { self.prefs.isPinned = previous })
    }

    @discardableResult
    func setMuted(_ value: Bool) -> Task<Void, Never> {
        let previous = prefs.isMuted
        return applyMutation(.setMuted(value),
                             optimistic: { self.prefs.isMuted = value },
                             rollback: { self.prefs.isMuted = previous })
    }

    @discardableResult
    func setMentionsOnly(_ value: Bool) -> Task<Void, Never> {
        let previous = prefs.mentionsOnly
        return applyMutation(.setMentionsOnly(value),
                             optimistic: { self.prefs.mentionsOnly = value },
                             rollback: { self.prefs.mentionsOnly = previous })
    }

    func setCustomName(_ value: String) {
        prefs.customName = value.isEmpty ? nil : value
        customNameSubject.send(value)
    }

    @discardableResult
    func setReaction(_ emoji: String?) -> Task<Void, Never> {
        let previous = prefs.reaction
        return applyMutation(.setReaction(emoji),
                             optimistic: { self.prefs.reaction = emoji },
                             rollback: { self.prefs.reaction = previous })
    }

    @discardableResult
    func setCategory(_ id: String?) -> Task<Void, Never> {
        let previous = prefs.categoryId
        return applyMutation(.setSection(categoryId: id),
                             optimistic: { self.prefs.categoryId = id },
                             rollback: { self.prefs.categoryId = previous })
    }

    @discardableResult
    func addTag(_ tag: String) -> Task<Void, Never> {
        let trimmed = tag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return Task {} }
        let current = prefs.tags ?? []
        guard !current.contains(trimmed) else { return Task {} }
        return setTags(current + [trimmed])
    }

    @discardableResult
    func removeTag(_ tag: String) -> Task<Void, Never> {
        let current = prefs.tags ?? []
        return setTags(current.filter { $0 != tag })
    }

    /// Replace the entire tag set in one mutation. Used by the tag field binding
    /// (which emits a fully-resolved next state) to avoid the last-write-wins
    /// race that fan-out add/remove would create.
    @discardableResult
    func setTags(_ next: [String]) -> Task<Void, Never> {
        let normalized = next
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        var seen = Set<String>()
        let deduped = normalized.filter { seen.insert($0).inserted }
        let previous = prefs.tags
        return applyMutation(.setTags(deduped),
                             optimistic: {
                                 self.prefs.tags = deduped
                                 for tag in deduped where !self.allTags.contains(tag) {
                                     self.allTags.append(tag)
                                 }
                                 self.allTags.sort()
                             },
                             rollback: { self.prefs.tags = previous })
    }

    @discardableResult
    func toggleArchive() -> Task<Void, Never> {
        let next = !(prefs.isArchived ?? false)
        let previous = prefs.isArchived
        return applyMutation(.setArchived(next),
                             optimistic: { self.prefs.isArchived = next },
                             rollback: { self.prefs.isArchived = previous })
    }

    @discardableResult
    func createCategoryAndSelect(name: String) async -> ConversationCategory? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        do {
            let created = try await preferenceService.createCategory(name: trimmed, color: nil, icon: nil)
            if !categories.contains(where: { $0.id == created.id }) {
                categories.append(created)
                categories.sort { ($0.order ?? 0) < ($1.order ?? 0) }
            }
            await setCategory(created.id).value
            return created
        } catch {
            Self.logger.error("createCategory failed: \(error.localizedDescription)")
            errorMessage = "Impossible de créer la catégorie."
            return nil
        }
    }

    func deleteForMe() async {
        do {
            try await store.apply(.deleteForUser, for: conversationId)
            didDelete = true
        } catch {
            Self.logger.error("deleteForMe failed: \(error.localizedDescription)")
            errorMessage = "Impossible de supprimer la conversation."
        }
    }

    func leave() async {
        do {
            try await store.apply(.leave, for: conversationId)
            didLeave = true
        } catch {
            Self.logger.error("leave failed: \(error.localizedDescription)")
            errorMessage = "Impossible de quitter la conversation."
        }
    }

    // MARK: - Internals

    /// Apply an optimistic display mutation, then persist via the store. Rolls
    /// the display back only on a permanent (4xx) failure (the store throws);
    /// transient failures keep the optimistic value (outbox retries).
    @discardableResult
    private func applyMutation(
        _ mutation: UserStateMutation,
        optimistic: @escaping () -> Void,
        rollback: @escaping () -> Void
    ) -> Task<Void, Never> {
        optimistic()
        let convId = conversationId
        return Task { [weak self] in
            guard let self else { return }
            do {
                try await self.store.apply(mutation, for: convId)
                self.errorMessage = nil
            } catch {
                rollback()
                self.errorMessage = "Erreur lors de la sauvegarde."
            }
        }
    }

    private func setupDebounce() {
        customNameSubject
            .debounce(for: .milliseconds(500), scheduler: DispatchQueue.main)
            .sink { [weak self] value in
                guard let self else { return }
                let convId = self.conversationId
                let name: String? = value.isEmpty ? nil : value
                Task { try? await self.store.apply(.setCustomName(name), for: convId) }
            }
            .store(in: &cancellables)
    }

    private static func prefs(from s: ConversationUserState) -> APIConversationPreferences {
        APIConversationPreferences(
            isPinned: s.isPinned,
            isMuted: s.isMuted,
            isArchived: s.isArchived,
            deletedForUserAt: s.deletedForUserAt,
            tags: s.tags,
            categoryId: s.sectionId,
            reaction: s.reaction,
            customName: s.customName,
            mentionsOnly: s.mentionsOnly,
            version: s.version
        )
    }
}

extension APIConversationPreferences {
    static var empty: APIConversationPreferences {
        APIConversationPreferences(
            isPinned: false,
            isMuted: false,
            isArchived: false,
            deletedForUserAt: nil,
            tags: [],
            categoryId: nil,
            reaction: nil,
            customName: nil,
            mentionsOnly: false
        )
    }
}

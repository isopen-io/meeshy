import Foundation
import Combine
import MeeshySDK
import os

@MainActor
final class ConversationOptionsViewModel: ObservableObject {
    @Published var prefs: APIConversationPreferences = .empty
    @Published var categories: [ConversationCategory] = []
    @Published var allTags: [String] = []
    @Published var loadState: LoadState = .idle
    @Published var errorMessage: String?
    @Published var didDelete: Bool = false
    @Published var didLeave: Bool = false

    private let conversationId: String
    private let preferenceService: PreferenceServiceProviding
    private let conversationService: ConversationServiceProviding
    private static let logger = Logger(subsystem: "me.meeshy.app", category: "conv-options")

    private let customNameSubject = PassthroughSubject<String, Never>()
    private var cancellables = Set<AnyCancellable>()

    init(
        conversationId: String,
        preferenceService: PreferenceServiceProviding = PreferenceService.shared,
        conversationService: ConversationServiceProviding = ConversationService.shared
    ) {
        self.conversationId = conversationId
        self.preferenceService = preferenceService
        self.conversationService = conversationService
        setupDebounce()
    }

    enum LoadState: Equatable {
        case idle, loading, loaded, error(String)
    }

    func load() async {
        loadState = .loading
        do {
            async let prefsCall = preferenceService.getConversationPreferences(conversationId: conversationId)
            async let categoriesCall = preferenceService.getCategories()
            async let tagsCall = preferenceService.getMyConversationTags()
            let (p, c, t) = try await (prefsCall, categoriesCall, tagsCall)
            self.prefs = p
            self.categories = c.sorted { ($0.order ?? 0) < ($1.order ?? 0) }
            self.allTags = t
            self.loadState = .loaded
        } catch {
            Self.logger.error("Failed to load options: \(error.localizedDescription)")
            loadState = .error(error.localizedDescription)
            errorMessage = "Impossible de charger les préférences."
        }
    }

    // MARK: - Setters with optimistic + rollback

    func setPinned(_ value: Bool) async {
        let previous = prefs.isPinned
        prefs.isPinned = value
        await persist(UpdateConversationPreferencesRequest(isPinned: value)) { [weak self] in
            await MainActor.run { self?.prefs.isPinned = previous }
        }
    }

    func setMuted(_ value: Bool) async {
        let previous = prefs.isMuted
        prefs.isMuted = value
        await persist(UpdateConversationPreferencesRequest(isMuted: value)) { [weak self] in
            await MainActor.run { self?.prefs.isMuted = previous }
        }
    }

    func setMentionsOnly(_ value: Bool) async {
        let previous = prefs.mentionsOnly
        prefs.mentionsOnly = value
        await persist(UpdateConversationPreferencesRequest(mentionsOnly: value)) { [weak self] in
            await MainActor.run { self?.prefs.mentionsOnly = previous }
        }
    }

    func setCustomName(_ value: String) {
        prefs.customName = value.isEmpty ? nil : value
        customNameSubject.send(value)
    }

    func setReaction(_ emoji: String?) async {
        let previous = prefs.reaction
        prefs.reaction = emoji
        await persist(UpdateConversationPreferencesRequest(reaction: emoji)) { [weak self] in
            await MainActor.run { self?.prefs.reaction = previous }
        }
    }

    func setCategory(_ id: String?) async {
        let previous = prefs.categoryId
        prefs.categoryId = id
        await persist(UpdateConversationPreferencesRequest(categoryId: id)) { [weak self] in
            await MainActor.run { self?.prefs.categoryId = previous }
        }
    }

    func addTag(_ tag: String) async {
        let trimmed = tag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let current = prefs.tags ?? []
        guard !current.contains(trimmed) else { return }
        let next = current + [trimmed]
        let previous = current
        prefs.tags = next
        if !allTags.contains(trimmed) {
            allTags.append(trimmed)
            allTags.sort()
        }
        await persist(UpdateConversationPreferencesRequest(tags: next)) { [weak self] in
            await MainActor.run { self?.prefs.tags = previous }
        }
    }

    func removeTag(_ tag: String) async {
        let current = prefs.tags ?? []
        let next = current.filter { $0 != tag }
        let previous = current
        prefs.tags = next
        await persist(UpdateConversationPreferencesRequest(tags: next)) { [weak self] in
            await MainActor.run { self?.prefs.tags = previous }
        }
    }

    /// Replace the entire tag set in one server call. Use this when the binding
    /// emits a fully-resolved next state (e.g. TagInputField setter) to avoid the
    /// last-write-wins race that fan-out add/remove tasks would create.
    func setTags(_ next: [String]) async {
        let normalized = next
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        // Dedupe preserving order
        var seen = Set<String>()
        let deduped = normalized.filter { seen.insert($0).inserted }

        let previous = prefs.tags
        prefs.tags = deduped
        for tag in deduped where !allTags.contains(tag) {
            allTags.append(tag)
        }
        allTags.sort()
        await persist(UpdateConversationPreferencesRequest(tags: deduped)) { [weak self] in
            await MainActor.run { self?.prefs.tags = previous }
        }
    }

    func toggleArchive() async {
        let next = !(prefs.isArchived ?? false)
        let previous = prefs.isArchived
        prefs.isArchived = next
        await persist(UpdateConversationPreferencesRequest(isArchived: next)) { [weak self] in
            await MainActor.run { self?.prefs.isArchived = previous }
        }
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
            await setCategory(created.id)
            return created
        } catch {
            Self.logger.error("createCategory failed: \(error.localizedDescription)")
            errorMessage = "Impossible de créer la catégorie."
            return nil
        }
    }

    func deleteForMe() async {
        do {
            try await conversationService.deleteForMe(conversationId: conversationId)
            didDelete = true
        } catch {
            Self.logger.error("deleteForMe failed: \(error.localizedDescription)")
            errorMessage = "Impossible de supprimer la conversation."
        }
    }

    func leave() async {
        do {
            try await conversationService.leave(conversationId: conversationId)
            didLeave = true
        } catch {
            Self.logger.error("leave failed: \(error.localizedDescription)")
            errorMessage = "Impossible de quitter la conversation."
        }
    }

    // MARK: - Internals

    private func setupDebounce() {
        customNameSubject
            .debounce(for: .milliseconds(500), scheduler: DispatchQueue.main)
            .sink { [weak self] value in
                guard let self else { return }
                let body = UpdateConversationPreferencesRequest(customName: value.isEmpty ? nil : value)
                Task { await self.persist(body, rollback: nil) }
            }
            .store(in: &cancellables)
    }

    private func persist(
        _ request: UpdateConversationPreferencesRequest,
        rollback: (@Sendable () async -> Void)?
    ) async {
        do {
            try await preferenceService.updateConversationPreferences(
                conversationId: conversationId,
                request: request
            )
            errorMessage = nil
        } catch {
            Self.logger.error("persist failed: \(error.localizedDescription)")
            await rollback?()
            errorMessage = "Erreur lors de la sauvegarde."
        }
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

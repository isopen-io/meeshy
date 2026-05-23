import Foundation
import Combine

// MARK: - Service protocol (testable seam)

/// Minimum surface `UserCategoryStore` needs from the network layer.
/// Existing `PreferenceServiceProviding` covers `getCategories`,
/// `createCategory`, and (partial) `patchCategory(isExpanded:)`. The
/// missing endpoints (full PATCH, DELETE, POST /reorder) are exposed
/// here so the Store has a single dependency surface and tests can
/// inject a mock.
public protocol UserCategoryWriting: Sendable {
    func listCategories() async throws -> [ConversationCategory]

    func createCategory(name: String, color: String?, icon: String?) async throws -> ConversationCategory

    /// Partial update. `nil` for any param means "leave unchanged".
    /// Returns the resulting row.
    func updateCategory(
        id: String,
        name: String?,
        color: String?,
        icon: String?,
        isExpanded: Bool?
    ) async throws -> ConversationCategory

    func deleteCategory(id: String) async throws

    /// Batch order update for drag-and-drop reorder.
    func reorderCategories(_ updates: [(id: String, order: Int)]) async throws
}

// MARK: - Subject registry (Combine bridge)

/// Same pattern as `ConversationStoreSubjects`: a small lock-guarded
/// class that hands out subjects synchronously to UI code without
/// requiring callers to `await` the actor.
final class UserCategorySubjects: @unchecked Sendable {
    let list = CurrentValueSubject<[ConversationCategory], Never>([])
}

// MARK: - Errors

public enum UserCategoryStoreError: Error, Sendable {
    case unknownCategory(String)
    case requestFailed(reason: String)
}

// MARK: - Remote event

/// Strongly-typed payload variants for the four category socket events
/// (`CATEGORY_CREATED`, `CATEGORY_UPDATED`, `CATEGORY_DELETED`,
/// `CATEGORIES_REORDERED`). Phase 1 of the gateway refactor emits all
/// four.
public enum CategoryRemoteEvent: Sendable, Hashable {
    case created(ConversationCategory)
    case updated(ConversationCategory)
    case deleted(id: String)
    case reordered(updates: [(id: String, order: Int)])

    public func hash(into hasher: inout Hasher) {
        switch self {
        case .created(let c): hasher.combine("c"); hasher.combine(c.id)
        case .updated(let c): hasher.combine("u"); hasher.combine(c.id)
        case .deleted(let id): hasher.combine("d"); hasher.combine(id)
        case .reordered(let updates):
            hasher.combine("r")
            for u in updates { hasher.combine(u.id); hasher.combine(u.order) }
        }
    }

    public static func == (lhs: CategoryRemoteEvent, rhs: CategoryRemoteEvent) -> Bool {
        switch (lhs, rhs) {
        case (.created(let a), .created(let b)),
             (.updated(let a), .updated(let b)):
            return a.id == b.id && a.name == b.name && a.color == b.color
                && a.icon == b.icon && a.order == b.order && a.isExpanded == b.isExpanded
        case (.deleted(let a), .deleted(let b)):
            return a == b
        case (.reordered(let a), .reordered(let b)):
            return a.count == b.count && zip(a, b).allSatisfy { $0.id == $1.id && $0.order == $1.order }
        default:
            return false
        }
    }
}

// MARK: - Store

/// Single source of truth for the user-defined conversation categories.
///
/// Separate entity from `ConversationStore` because categories have a
/// user-scoped lifecycle independent of any single conversation:
/// rename a category and every conversation assigned to it benefits
/// from the new label.
///
/// Concurrency: actor; UI subscribes via `publisher()` which is
/// non-isolated and backed by a `CurrentValueSubject` guarded for
/// thread-safe access.
public actor UserCategoryStore {

    // MARK: - State

    private var categoriesById: [String: ConversationCategory] = [:]
    private nonisolated let subjects = UserCategorySubjects()
    private let service: UserCategoryWriting

    // MARK: - Init

    public static let shared = UserCategoryStore()

    private init() {
        self.service = DefaultUserCategoryWritingAdapter()
    }

    public init(service: UserCategoryWriting) {
        self.service = service
    }

    // MARK: - Read

    public func categories() -> [ConversationCategory] {
        sortedSnapshot()
    }

    public nonisolated func publisher() -> AnyPublisher<[ConversationCategory], Never> {
        subjects.list.eraseToAnyPublisher()
    }

    // MARK: - Hydration

    public func hydrate() async throws {
        let fresh = try await service.listCategories()
        categoriesById = Dictionary(uniqueKeysWithValues: fresh.map { ($0.id, $0) })
        publish()
    }

    /// Seed the store from a known snapshot (e.g. cache hit) without
    /// hitting the network. The caller is expected to follow up with a
    /// background `hydrate()` for the stale-while-revalidate path.
    public func hydrateFromSnapshot(_ snapshot: [ConversationCategory]) {
        categoriesById = Dictionary(uniqueKeysWithValues: snapshot.map { ($0.id, $0) })
        publish()
    }

    // MARK: - CRUD

    @discardableResult
    public func create(name: String, color: String?, icon: String?) async throws -> ConversationCategory {
        let created = try await service.createCategory(name: name, color: color, icon: icon)
        categoriesById[created.id] = created
        publish()
        return created
    }

    @discardableResult
    public func rename(_ id: String, to newName: String) async throws -> ConversationCategory {
        try await update(id: id, name: newName, color: nil, icon: nil, isExpanded: nil)
    }

    @discardableResult
    public func setColor(_ id: String, color: String?) async throws -> ConversationCategory {
        // `nil` here means "leave the color unchanged" — the JSON
        // encoder will skip the key. Clearing a color server-side will
        // require a follow-up that emits explicit JSON null; tracked
        // for Phase 5 polish.
        try await update(id: id, name: nil, color: color, icon: nil, isExpanded: nil)
    }

    @discardableResult
    public func setIcon(_ id: String, icon: String?) async throws -> ConversationCategory {
        // Same "leave unchanged on nil" semantics as `setColor`.
        try await update(id: id, name: nil, color: nil, icon: icon, isExpanded: nil)
    }

    @discardableResult
    public func setExpanded(_ id: String, expanded: Bool) async throws -> ConversationCategory {
        try await update(id: id, name: nil, color: nil, icon: nil, isExpanded: expanded)
    }

    public func delete(_ id: String) async throws {
        guard categoriesById[id] != nil else { throw UserCategoryStoreError.unknownCategory(id) }
        try await service.deleteCategory(id: id)
        categoriesById.removeValue(forKey: id)
        publish()
    }

    /// Optimistic batch reorder. Applies the new ordering locally first
    /// so the UI updates on the next tick, then posts. On REST failure,
    /// reverts to the prior snapshot and rethrows so the caller can
    /// surface an error toast.
    public func reorder(_ updates: [(id: String, order: Int)]) async throws {
        let snapshot = categoriesById
        for (id, order) in updates {
            guard var cat = categoriesById[id] else { continue }
            cat = ConversationCategory(
                id: cat.id, name: cat.name, color: cat.color, icon: cat.icon,
                order: order, isExpanded: cat.isExpanded
            )
            categoriesById[id] = cat
        }
        publish()

        do {
            try await service.reorderCategories(updates)
        } catch {
            categoriesById = snapshot
            publish()
            throw error
        }
    }

    // MARK: - Remote event application

    public func applyRemote(_ event: CategoryRemoteEvent) {
        switch event {
        case .created(let cat), .updated(let cat):
            categoriesById[cat.id] = cat
        case .deleted(let id):
            categoriesById.removeValue(forKey: id)
        case .reordered(let updates):
            for (id, order) in updates {
                guard let cat = categoriesById[id] else { continue }
                categoriesById[id] = ConversationCategory(
                    id: cat.id, name: cat.name, color: cat.color, icon: cat.icon,
                    order: order, isExpanded: cat.isExpanded
                )
            }
        }
        publish()
    }

    // MARK: - Private helpers

    private func update(
        id: String,
        name: String?,
        color: String?,
        icon: String?,
        isExpanded: Bool?
    ) async throws -> ConversationCategory {
        guard categoriesById[id] != nil else { throw UserCategoryStoreError.unknownCategory(id) }
        let updated = try await service.updateCategory(
            id: id, name: name, color: color, icon: icon, isExpanded: isExpanded
        )
        categoriesById[id] = updated
        publish()
        return updated
    }

    private func sortedSnapshot() -> [ConversationCategory] {
        Array(categoriesById.values).sorted { lhs, rhs in
            let lo = lhs.order ?? Int.max
            let ro = rhs.order ?? Int.max
            if lo != ro { return lo < ro }
            return lhs.name.localizedCompare(rhs.name) == .orderedAscending
        }
    }

    private func publish() {
        subjects.list.send(sortedSnapshot())
    }
}

// MARK: - Default service adapter
//
// Bridges to `PreferenceService.shared` for `listCategories` /
// `createCategory` and to `APIClient.shared` directly for the
// PATCH-full / DELETE / POST-reorder endpoints not yet exposed on
// `PreferenceServiceProviding`. A later refactor can fold them into
// `PreferenceService` proper.

struct DefaultUserCategoryWritingAdapter: UserCategoryWriting {

    private struct UpdateBody: Encodable {
        let name: String?
        let color: String?
        let icon: String?
        let isExpanded: Bool?
    }

    private struct ReorderItem: Encodable {
        let categoryId: String
        let order: Int
    }

    private struct ReorderBody: Encodable {
        let updates: [ReorderItem]
    }

    func listCategories() async throws -> [ConversationCategory] {
        try await PreferenceService.shared.getCategories()
    }

    func createCategory(name: String, color: String?, icon: String?) async throws -> ConversationCategory {
        try await PreferenceService.shared.createCategory(name: name, color: color, icon: icon)
    }

    func updateCategory(
        id: String,
        name: String?,
        color: String?,
        icon: String?,
        isExpanded: Bool?
    ) async throws -> ConversationCategory {
        let body = UpdateBody(name: name, color: color, icon: icon, isExpanded: isExpanded)
        let response: APIResponse<ConversationCategory> = try await APIClient.shared.patch(
            endpoint: "/me/preferences/categories/\(id)",
            body: body
        )
        return response.data
    }

    func deleteCategory(id: String) async throws {
        // Gateway returns `{ success, message }` with NO `data` key for
        // this endpoint (see services/gateway/src/routes/me/preferences/categories.ts).
        // `APIResponse<T>` requires `data` and would throw
        // `DecodingError.keyNotFound`; route through `request<T>` with
        // `SimpleAPIResponse` which accepts the response shape directly.
        let _: SimpleAPIResponse = try await APIClient.shared.request(
            endpoint: "/me/preferences/categories/\(id)",
            method: "DELETE"
        )
    }

    func reorderCategories(_ updates: [(id: String, order: Int)]) async throws {
        // Same response shape as DELETE — `{ success, message }`. Bypass
        // the `APIResponse<T>` wrapper for the same reason.
        let body = ReorderBody(updates: updates.map { ReorderItem(categoryId: $0.id, order: $0.order) })
        let bodyData = try JSONEncoder().encode(body)
        let _: SimpleAPIResponse = try await APIClient.shared.request(
            endpoint: "/me/preferences/categories/reorder",
            method: "POST",
            body: bodyData
        )
    }
}

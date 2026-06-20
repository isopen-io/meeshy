import SwiftUI
import Combine
import MeeshySDK

/// Narrow search seam so the picker VM can be unit-tested with a one-method
/// mock instead of conforming to the full `UserServiceProviding`.
public protocol AudienceUserSearching: Sendable {
    func searchUsers(query: String, limit: Int, offset: Int) async throws -> [UserSearchResult]
}

extension UserService: AudienceUserSearching {}

@MainActor
final class AudienceUserPickerViewModel: ObservableObject {
    @Published var query: String = ""
    @Published var results: [UserSearchResult] = []
    @Published var selectedIds: [String]
    @Published var selectedUsers: [UserSearchResult] = []
    @Published var isSearching: Bool = false

    private let userService: AudienceUserSearching
    private let currentUserId: String?

    init(initialSelection: [String],
         currentUserId: String?,
         userService: AudienceUserSearching = UserService.shared) {
        self.selectedIds = initialSelection
        self.currentUserId = currentUserId
        self.userService = userService
    }

    func performSearch() async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { results = []; return }
        isSearching = true
        defer { isSearching = false }
        do {
            let found = try await userService.searchUsers(query: trimmed, limit: 20, offset: 0)
            results = found.filter { $0.id != currentUserId }
        } catch {
            results = []
        }
    }

    func isSelected(_ id: String) -> Bool { selectedIds.contains(id) }

    func toggle(_ user: UserSearchResult) {
        if let idx = selectedIds.firstIndex(of: user.id) {
            selectedIds.remove(at: idx)
            selectedUsers.removeAll { $0.id == user.id }
        } else {
            selectedIds.append(user.id)
            if !selectedUsers.contains(where: { $0.id == user.id }) {
                selectedUsers.append(user)
            }
        }
    }
}

/// Reusable audience picker for ONLY / EXCEPT post visibility. Agnostic: it
/// takes the mode (for copy), an initial selection, and reports the chosen
/// user IDs via `onDone`. Search runs against `/users/search`.
public struct AudienceUserPickerView: View {
    private let mode: PostVisibility
    private let onDone: ([String]) -> Void
    @StateObject private var vm: AudienceUserPickerViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var searchTask: Task<Void, Never>?

    public init(mode: PostVisibility,
                initialSelection: [String],
                currentUserId: String? = AuthManager.shared.currentUser?.id,
                onDone: @escaping ([String]) -> Void) {
        self.mode = mode
        self.onDone = onDone
        _vm = StateObject(wrappedValue: AudienceUserPickerViewModel(
            initialSelection: initialSelection,
            currentUserId: currentUserId
        ))
    }

    private var title: String {
        mode == .only
            ? String(localized: "audience.picker.only.title", defaultValue: "Seulement ces personnes")
            : String(localized: "audience.picker.except.title", defaultValue: "Tout le monde sauf")
    }

    public var body: some View {
        // Custom header (not a NavigationStack toolbar): the picker is presented
        // as a `.sheet` from the story composer, which is itself a
        // `.statusBarHidden()` fullScreenCover — that zeroes the SwiftUI safe-area
        // insets, so a NavigationStack bar renders its toolbar buttons in a
        // clipped/off-screen region (Annuler/OK invisible). An explicit header row
        // always renders regardless of the host's safe-area state.
        VStack(spacing: 0) {
            header
            searchField
            if !vm.selectedUsers.isEmpty { selectedChips }
            resultsList
        }
        // Translucent + partial-height sheet so the story composer header stays
        // visible above it. Version gating lives in Compatibility/.
        .modifier(AudiencePickerPresentationStyle())
    }

    private var header: some View {
        ZStack {
            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .lineLimit(1)
            HStack {
                Button(String(localized: "common.cancel", defaultValue: "Annuler")) { dismiss() }
                Spacer()
                Button(String(localized: "common.done", defaultValue: "OK")) {
                    onDone(vm.selectedIds)
                    dismiss()
                }
                .fontWeight(.semibold)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 18)
        .padding(.bottom, 10)
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField(String(localized: "audience.picker.search", defaultValue: "Rechercher…"), text: $vm.query)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if vm.isSearching {
                ProgressView().scaleEffect(0.8)
            } else if !vm.query.isEmpty {
                Button { vm.query = ""; vm.results = [] } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .adaptiveOnChange(of: vm.query) { _, _ in
            searchTask?.cancel()
            searchTask = Task {
                try? await Task.sleep(nanoseconds: 350_000_000)
                guard !Task.isCancelled else { return }
                await vm.performSearch()
            }
        }
    }

    private var selectedChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(vm.selectedUsers) { user in
                    HStack(spacing: 6) {
                        Text(user.displayName ?? user.username)
                            .font(.system(size: 13, weight: .medium))
                            .lineLimit(1)
                        Button { vm.toggle(user) } label: {
                            Image(systemName: "xmark.circle.fill").font(.system(size: 13))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(Color(.tertiarySystemBackground)))
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.bottom, 8)
    }

    private var resultsList: some View {
        List {
            ForEach(vm.results) { user in
                Button { vm.toggle(user) } label: { row(user) }
                    .buttonStyle(.plain)
                    .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    private func row(_ user: UserSearchResult) -> some View {
        HStack(spacing: 12) {
            MeeshyAvatar(name: user.displayName ?? user.username, context: .userListItem)
            VStack(alignment: .leading, spacing: 2) {
                Text(user.displayName ?? user.username)
                    .font(.system(size: 15, weight: .medium))
                    .lineLimit(1)
                Text("@\(user.username)")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Image(systemName: vm.isSelected(user.id) ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 20))
                .foregroundStyle(vm.isSelected(user.id) ? Color.accentColor : Color.secondary)
        }
        .contentShape(Rectangle())
        .padding(.vertical, 4)
    }
}

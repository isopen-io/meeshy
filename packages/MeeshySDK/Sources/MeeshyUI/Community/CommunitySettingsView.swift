import SwiftUI
import MeeshySDK

public struct CommunitySettingsView: View {
    @StateObject private var viewModel: CommunitySettingsViewModel
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    public var onUpdated: ((MeeshyCommunity) -> Void)? = nil
    public var onDeleted: (() -> Void)? = nil
    public var onLeft: (() -> Void)? = nil

    public init(community: MeeshyCommunity, onUpdated: ((MeeshyCommunity) -> Void)? = nil, onDeleted: (() -> Void)? = nil, onLeft: (() -> Void)? = nil) {
        _viewModel = StateObject(wrappedValue: CommunitySettingsViewModel(community: community))
        self.onUpdated = onUpdated
        self.onDeleted = onDeleted
        self.onLeft = onLeft
    }

    public var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        editSection
                        privacySection
                        dangerSection
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(theme.textSecondary)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            let updated = await viewModel.save()
                            if let updated {
                                onUpdated?(updated)
                                dismiss()
                            }
                        }
                    }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(viewModel.hasChanges ? Color(hex: "FF2E63") : theme.textMuted)
                    .disabled(!viewModel.hasChanges || viewModel.isSaving)
                }
            }
            .alert("Error", isPresented: $viewModel.showError) {
                Button("OK") {}
            } message: {
                Text(viewModel.errorMessage ?? "An error occurred")
            }
            .alert("Delete Community", isPresented: $viewModel.showDeleteConfirm) {
                Button("Delete", role: .destructive) {
                    Task {
                        await viewModel.deleteCommunity()
                        onDeleted?()
                        dismiss()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This action cannot be undone. All members, channels, and messages will be permanently deleted.")
            }
            .alert("Leave Community", isPresented: $viewModel.showLeaveConfirm) {
                Button("Leave", role: .destructive) {
                    Task {
                        await viewModel.leaveCommunity()
                        onLeft?()
                        dismiss()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You will no longer have access to this community's channels and messages.")
            }
        }
    }

    // MARK: - Edit Section

    private var editSection: some View {
        VStack(spacing: 16) {
            sectionHeader("Community Info")

            VStack(spacing: 12) {
                settingsField(label: "Name") {
                    TextField("Community name", text: $viewModel.name)
                        .font(.system(size: 16, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                }

                settingsField(label: "Description") {
                    TextField("Description", text: $viewModel.descriptionText, axis: .vertical)
                        .font(.system(size: 16, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(3...6)
                }
            }
        }
    }

    // MARK: - Privacy Section

    private var privacySection: some View {
        VStack(spacing: 12) {
            sectionHeader("Privacy")

            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Private Community")
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                    Text(viewModel.isPrivate ? "Invite only" : "Open to all")
                        .font(.system(size: 12))
                        .foregroundColor(theme.textSecondary)
                }
                Spacer()
                Toggle("", isOn: $viewModel.isPrivate)
                    .tint(Color(hex: "A855F7"))
                    .labelsHidden()
            }
            .padding(14)
            .background(theme.backgroundSecondary.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Danger Section

    private var dangerSection: some View {
        VStack(spacing: 12) {
            sectionHeader("Danger Zone")

            if viewModel.isCreator {
                Button {
                    viewModel.showDeleteConfirm = true
                } label: {
                    HStack {
                        Image(systemName: "trash.fill")
                        Text("Delete Community")
                    }
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(.red)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.red.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            } else {
                Button {
                    viewModel.showLeaveConfirm = true
                } label: {
                    HStack {
                        Image(systemName: "arrow.right.square.fill")
                        Text("Leave Community")
                    }
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(.orange)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.orange.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 13, weight: .bold, design: .rounded))
            .foregroundColor(theme.textMuted)
            .textCase(.uppercase)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func settingsField<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textSecondary)
            content()
                .textFieldStyle(.plain)
                .padding(12)
                .background(theme.backgroundSecondary.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }
}

// MARK: - ViewModel

@MainActor
final class CommunitySettingsViewModel: ObservableObject {
    @Published var name: String
    @Published var descriptionText: String
    @Published var isPrivate: Bool
    @Published var isSaving = false
    @Published var showError = false
    @Published var errorMessage: String?
    @Published var showDeleteConfirm = false
    @Published var showLeaveConfirm = false

    let communityId: String
    let isCreator: Bool

    private let originalName: String
    private let originalDescription: String
    private let originalIsPrivate: Bool

    var hasChanges: Bool {
        name != originalName || descriptionText != originalDescription || isPrivate != originalIsPrivate
    }

    init(community: MeeshyCommunity) {
        self.communityId = community.id
        self.name = community.name
        self.descriptionText = community.description ?? ""
        self.isPrivate = community.isPrivate
        self.originalName = community.name
        self.originalDescription = community.description ?? ""
        self.originalIsPrivate = community.isPrivate
        self.isCreator = community.createdBy == (AuthManager.shared.currentUser?.id ?? "")
    }

    func save() async -> MeeshyCommunity? {
        isSaving = true
        defer { isSaving = false }

        do {
            let apiCommunity = try await CommunityService.shared.update(
                communityId: communityId,
                name: name != originalName ? name : nil,
                description: descriptionText != originalDescription ? descriptionText : nil,
                isPrivate: isPrivate != originalIsPrivate ? isPrivate : nil
            )
            return apiCommunity.toCommunity()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
            return nil
        }
    }

    func deleteCommunity() async {
        do {
            try await CommunityService.shared.delete(communityId: communityId)
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    func leaveCommunity() async {
        do {
            try await CommunityService.shared.leave(communityId: communityId)
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }
}

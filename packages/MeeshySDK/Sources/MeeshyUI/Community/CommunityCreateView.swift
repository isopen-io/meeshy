import SwiftUI
import MeeshySDK

public struct CommunityCreateView: View {
    @StateObject private var viewModel = CommunityCreateViewModel()
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    public var onCreated: ((MeeshyCommunity) -> Void)? = nil

    public init(onCreated: ((MeeshyCommunity) -> Void)? = nil) {
        self.onCreated = onCreated
    }

    public var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        avatarPreview
                        formFields
                        privacyToggle
                        createButton
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                }
            }
            .navigationTitle("New Community")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(theme.textSecondary)
                }
            }
            .alert("Error", isPresented: $viewModel.showError) {
                Button("OK") {}
            } message: {
                Text(viewModel.errorMessage ?? "An error occurred")
            }
        }
    }

    // MARK: - Avatar Preview

    private var avatarPreview: some View {
        let color = DynamicColorGenerator.colorForName(viewModel.name.isEmpty ? "New" : viewModel.name)
        return RoundedRectangle(cornerRadius: 22)
            .fill(
                LinearGradient(
                    colors: [Color(hex: color), Color(hex: color).opacity(0.6)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 80, height: 80)
            .overlay {
                Text(String(viewModel.name.isEmpty ? "?" : String(viewModel.name.prefix(2))).uppercased())
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
            }
            .shadow(color: Color(hex: color).opacity(0.3), radius: 10, y: 4)
    }

    // MARK: - Form Fields

    private var formFields: some View {
        VStack(spacing: 16) {
            fieldGroup(label: "Name", required: true) {
                TextField("Community name", text: $viewModel.name)
                    .textFieldStyle(.plain)
                    .font(.system(size: 16, design: .rounded))
                    .foregroundColor(theme.textPrimary)
            }

            fieldGroup(label: "Identifier", required: false) {
                HStack(spacing: 4) {
                    Text("mshy_")
                        .font(.system(size: 14, weight: .medium, design: .monospaced))
                        .foregroundColor(theme.textMuted)
                    TextField("my-community", text: $viewModel.identifier)
                        .textFieldStyle(.plain)
                        .font(.system(size: 16, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                }
            }

            fieldGroup(label: "Description", required: false) {
                TextField("What is this community about?", text: $viewModel.description, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: 16, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(3...6)
            }
        }
    }

    private func fieldGroup<Content: View>(label: String, required: Bool, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 2) {
                Text(label)
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textSecondary)
                if required {
                    Text("*")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(Color(hex: "FF2E63"))
                }
            }

            content()
                .padding(12)
                .background(theme.backgroundSecondary.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    // MARK: - Privacy Toggle

    private var privacyToggle: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Private Community")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                Text(viewModel.isPrivate ? "Only invited members can join" : "Anyone can discover and join")
                    .font(.system(size: 12, weight: .regular, design: .rounded))
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

    // MARK: - Create Button

    private var createButton: some View {
        Button {
            Task {
                let community = await viewModel.createCommunity()
                if let community {
                    onCreated?(community)
                    dismiss()
                }
            }
        } label: {
            HStack(spacing: 8) {
                if viewModel.isCreating {
                    ProgressView()
                        .tint(.white)
                } else {
                    Image(systemName: "plus.circle.fill")
                }
                Text("Create Community")
            }
            .font(.system(size: 16, weight: .semibold, design: .rounded))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                LinearGradient(
                    colors: viewModel.isValid ? [Color(hex: "FF2E63"), Color(hex: "A855F7")] : [Color.gray.opacity(0.4)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .disabled(!viewModel.isValid || viewModel.isCreating)
        .padding(.top, 8)
    }
}

// MARK: - ViewModel

@MainActor
final class CommunityCreateViewModel: ObservableObject {
    @Published var name = ""
    @Published var identifier = ""
    @Published var description = ""
    @Published var isPrivate = true
    @Published var isCreating = false
    @Published var showError = false
    @Published var errorMessage: String?

    var isValid: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty }

    func createCommunity() async -> MeeshyCommunity? {
        guard isValid else { return nil }
        isCreating = true
        defer { isCreating = false }

        do {
            let identifierParam = identifier.isEmpty ? nil : identifier
            let descParam = description.isEmpty ? nil : description
            let apiCommunity = try await CommunityService.shared.create(
                name: name.trimmingCharacters(in: .whitespaces),
                identifier: identifierParam,
                description: descParam,
                isPrivate: isPrivate
            )
            return apiCommunity.toCommunity()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
            return nil
        }
    }
}

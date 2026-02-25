import SwiftUI
import MeeshySDK

public struct CommunityCreateView: View {
    @StateObject private var viewModel = CommunityCreateViewModel()
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    public var onCreated: ((MeeshyCommunity) -> Void)?
    public var onDismiss: (() -> Void)?

    public init(
        onCreated: ((MeeshyCommunity) -> Void)? = nil,
        onDismiss: (() -> Void)? = nil
    ) {
        self.onCreated = onCreated
        self.onDismiss = onDismiss
    }

    public var body: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()

            VStack(spacing: 0) {
                navigationHeader
                scrollContent
            }
        }
        .alert("Erreur", isPresented: $viewModel.showError) {
            Button("OK") {}
        } message: {
            Text(viewModel.errorMessage ?? "Une erreur est survenue")
        }
    }

    // MARK: - Navigation Header

    private var navigationHeader: some View {
        HStack {
            Button {
                onDismiss?()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .frame(width: 36, height: 36)
                    .background(.ultraThinMaterial)
                    .clipShape(Circle())
            }

            Spacer()

            Text("Nouvelle communaute")
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Color.clear.frame(width: 36, height: 36)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView {
            VStack(spacing: 24) {
                communityPreviewCard
                formFields
                emojiPicker
                privacyToggle
                memberSearchSection
                createButton
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
    }

    // MARK: - Community Preview Card

    private var communityPreviewCard: some View {
        let color = viewModel.accentColor
        return ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [Color(hex: color), Color(hex: color).opacity(0.6)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            if !viewModel.selectedEmoji.isEmpty {
                Text(viewModel.selectedEmoji)
                    .font(.system(size: 44))
                    .rotationEffect(.degrees(-8))
                    .offset(x: 8, y: 6)
                    .opacity(0.85)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(.trailing, 14)
                    .padding(.top, 12)
            }

            LinearGradient(
                colors: [.clear, .clear, Color.black.opacity(0.55)],
                startPoint: .top,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 4) {
                Text(viewModel.name.isEmpty ? "Ma communaute" : viewModel.name)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .lineLimit(2)

                if !viewModel.description.isEmpty {
                    Text(viewModel.description)
                        .font(.system(size: 12, design: .rounded))
                        .foregroundColor(.white.opacity(0.8))
                        .lineLimit(2)
                }

                HStack(spacing: 6) {
                    Image(systemName: viewModel.isPrivate ? "lock.fill" : "globe")
                        .font(.system(size: 10, weight: .semibold))
                    Text(viewModel.isPrivate ? "Privee" : "Publique")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundColor(.white.opacity(0.9))
                .padding(.top, 2)
            }
            .padding(16)
        }
        .frame(height: 160)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .shadow(color: Color(hex: color).opacity(0.35), radius: 12, y: 6)
        .animation(.spring(response: 0.4, dampingFraction: 0.7), value: viewModel.name)
        .animation(.spring(response: 0.4, dampingFraction: 0.7), value: viewModel.selectedEmoji)
    }

    // MARK: - Form Fields

    private var formFields: some View {
        VStack(spacing: 16) {
            fieldGroup(label: "Nom", required: true) {
                TextField("Nom de la communaute", text: $viewModel.name)
                    .textFieldStyle(.plain)
                    .font(.system(size: 16, design: .rounded))
                    .foregroundColor(theme.textPrimary)
            }

            fieldGroup(label: "Identifiant", required: false) {
                HStack(spacing: 4) {
                    Text("mshy_")
                        .font(.system(size: 14, weight: .medium, design: .monospaced))
                        .foregroundColor(theme.textMuted)
                    TextField("mon-groupe", text: $viewModel.identifier)
                        .textFieldStyle(.plain)
                        .font(.system(size: 16, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                }
            }

            fieldGroup(label: "Description", required: false) {
                TextField("De quoi parle cette communaute ?", text: $viewModel.description, axis: .vertical)
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

    // MARK: - Emoji Picker

    private var emojiPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Emoji")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textSecondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(CommunityCreateViewModel.popularEmojis, id: \.self) { emoji in
                        Button {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                                viewModel.selectedEmoji = viewModel.selectedEmoji == emoji ? "" : emoji
                            }
                        } label: {
                            Text(emoji)
                                .font(.system(size: 28))
                                .frame(width: 44, height: 44)
                                .background(
                                    viewModel.selectedEmoji == emoji
                                        ? Color(hex: viewModel.accentColor).opacity(0.25)
                                        : theme.backgroundSecondary.opacity(0.5)
                                )
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(
                                            viewModel.selectedEmoji == emoji
                                                ? Color(hex: viewModel.accentColor)
                                                : Color.clear,
                                            lineWidth: 2
                                        )
                                )
                                .scaleEffect(viewModel.selectedEmoji == emoji ? 1.1 : 1.0)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Privacy Toggle

    private var privacyToggle: some View {
        HStack {
            Image(systemName: viewModel.isPrivate ? "lock.shield.fill" : "eye.fill")
                .font(.system(size: 18))
                .foregroundStyle(
                    LinearGradient(
                        colors: viewModel.isPrivate
                            ? [Color(hex: "A855F7"), Color(hex: "6366F1")]
                            : [Color(hex: "10B981"), Color(hex: "06B6D4")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text("Communaute privee")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                Text(viewModel.isPrivate ? "Seuls les membres invites peuvent rejoindre" : "Tout le monde peut decouvrir et rejoindre")
                    .font(.system(size: 12, design: .rounded))
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
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: viewModel.isPrivate)
    }

    // MARK: - Member Search Section

    private var memberSearchSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Ajouter des membres")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textSecondary)

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 14))
                    .foregroundColor(theme.textMuted)
                TextField("Rechercher par nom ou username...", text: $viewModel.memberSearch)
                    .textFieldStyle(.plain)
                    .font(.system(size: 15, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .autocapitalization(.none)

                if !viewModel.memberSearch.isEmpty {
                    Button {
                        viewModel.memberSearch = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundColor(theme.textMuted)
                    }
                }
            }
            .padding(12)
            .background(theme.backgroundSecondary.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            // Selected members badges
            if !viewModel.selectedMembers.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(viewModel.selectedMembers, id: \.id) { user in
                            selectedMemberBadge(user)
                        }
                    }
                }
            }

            // Search results
            if viewModel.isSearchingMembers {
                HStack {
                    Spacer()
                    ProgressView()
                        .tint(Color(hex: "A855F7"))
                    Spacer()
                }
                .padding(.vertical, 8)
            } else if !viewModel.searchResults.isEmpty {
                VStack(spacing: 0) {
                    ForEach(viewModel.searchResults, id: \.id) { user in
                        searchResultRow(user)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private func selectedMemberBadge(_ user: UserSearchResult) -> some View {
        HStack(spacing: 4) {
            Text(user.displayName ?? user.username)
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(.white)
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    viewModel.selectedMembers.removeAll { $0.id == user.id }
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(.white.opacity(0.8))
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            LinearGradient(
                colors: [Color(hex: "FF2E63"), Color(hex: "A855F7")],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .clipShape(Capsule())
        .transition(.scale.combined(with: .opacity))
    }

    private func searchResultRow(_ user: UserSearchResult) -> some View {
        let isSelected = viewModel.selectedMembers.contains { $0.id == user.id }
        return Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                if isSelected {
                    viewModel.selectedMembers.removeAll { $0.id == user.id }
                } else {
                    viewModel.selectedMembers.append(user)
                }
            }
        } label: {
            HStack(spacing: 12) {
                Circle()
                    .fill(Color(hex: DynamicColorGenerator.colorForName(user.username)))
                    .frame(width: 36, height: 36)
                    .overlay {
                        Text(String(user.username.prefix(1)).uppercased())
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                    }

                VStack(alignment: .leading, spacing: 1) {
                    Text(user.displayName ?? user.username)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                    Text("@\(user.username)")
                        .font(.system(size: 12, design: .rounded))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(Color(hex: "10B981"))
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                isSelected
                    ? Color(hex: "10B981").opacity(0.08)
                    : theme.backgroundSecondary.opacity(0.3)
            )
        }
    }

    // MARK: - Create Button

    private var createButton: some View {
        Button {
            Task {
                let community = await viewModel.createCommunity()
                if let community {
                    onCreated?(community)
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
                Text("Creer la communaute")
            }
            .font(.system(size: 16, weight: .semibold, design: .rounded))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                LinearGradient(
                    colors: viewModel.isValid
                        ? [Color(hex: "FF2E63"), Color(hex: "A855F7")]
                        : [Color.gray.opacity(0.4)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .shadow(
                color: viewModel.isValid ? Color(hex: "FF2E63").opacity(0.3) : .clear,
                radius: 10, y: 4
            )
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
    @Published var selectedEmoji = ""
    @Published var isPrivate = true
    @Published var isCreating = false
    @Published var showError = false
    @Published var errorMessage: String?

    // Member search
    @Published var memberSearch = "" {
        didSet { scheduleSearch() }
    }
    @Published var searchResults: [UserSearchResult] = []
    @Published var selectedMembers: [UserSearchResult] = []
    @Published var isSearchingMembers = false

    private var searchTask: Task<Void, Never>?

    static let popularEmojis = [
        "\u{1F680}", "\u{1F3AE}", "\u{1F3B5}", "\u{1F4DA}", "\u{1F4BB}",
        "\u{1F3A8}", "\u{2764}\u{FE0F}", "\u{1F525}", "\u{2B50}", "\u{1F331}",
        "\u{1F30D}", "\u{1F3C6}", "\u{1F4F8}", "\u{1F37F}", "\u{1F389}"
    ]

    var accentColor: String {
        DynamicColorGenerator.colorForName(name.isEmpty ? "New" : name)
    }

    var isValid: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty }

    private func scheduleSearch() {
        searchTask?.cancel()
        guard memberSearch.count >= 2 else {
            searchResults = []
            isSearchingMembers = false
            return
        }
        searchTask = Task {
            isSearchingMembers = true
            defer { isSearchingMembers = false }
            do {
                let results = try await UserService.shared.searchUsers(query: memberSearch, limit: 10)
                guard !Task.isCancelled else { return }
                let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                searchResults = results.filter { $0.id != currentUserId }
            } catch {
                if !Task.isCancelled { searchResults = [] }
            }
        }
    }

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

            // Add selected members
            for member in selectedMembers {
                _ = try? await CommunityService.shared.addMember(
                    communityId: apiCommunity.id,
                    userId: member.id
                )
            }

            return apiCommunity.toCommunity()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
            return nil
        }
    }
}

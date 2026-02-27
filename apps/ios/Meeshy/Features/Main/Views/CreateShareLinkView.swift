import SwiftUI
import MeeshySDK

// MARK: - CreateShareLinkView

struct CreateShareLinkView: View {
    let onCreate: (CreatedShareLink) -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @State private var selectedConversation: Conversation? = nil
    @State private var linkName: String = ""
    @State private var showConversationPicker = false
    @State private var isCreating = false
    @State private var errorMessage: String? = nil
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 20) {
                        conversationSection
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Nom du lien (optionnel)")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(theme.textSecondary)
                            TextField("ex: Partage Twitter", text: $linkName)
                                .padding(12)
                                .background(
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
                                )
                                .foregroundColor(theme.textPrimary)
                        }
                        .padding(.horizontal, 20)
                        if let error = errorMessage {
                            Text(error)
                                .font(.system(size: 13))
                                .foregroundColor(.red)
                                .padding(.horizontal, 20)
                        }
                        Button(action: create) {
                            if isCreating {
                                ProgressView().tint(.white)
                            } else {
                                Text("Créer le lien")
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundColor(.white)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            Capsule().fill(LinearGradient(
                                colors: [Color(hex: "08D9D6"), Color(hex: "4ECDC4")],
                                startPoint: .leading,
                                endPoint: .trailing
                            ))
                        )
                        .disabled(selectedConversation == nil || isCreating)
                        .opacity((selectedConversation == nil || isCreating) ? 0.5 : 1)
                        .padding(.horizontal, 20)
                    }
                    .padding(.top, 20)
                }
            }
            .navigationTitle("Nouveau lien de partage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Annuler") { dismiss() }
                        .foregroundColor(theme.textSecondary)
                }
            }
            .sheet(isPresented: $showConversationPicker) {
                conversationPickerSheet
            }
        }
    }

    private var conversationSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Conversation")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .padding(.horizontal, 20)
            Button {
                showConversationPicker = true
            } label: {
                HStack {
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                        .foregroundColor(Color(hex: "08D9D6"))
                    if let conv = selectedConversation {
                        Text(conv.name)
                            .foregroundColor(theme.textPrimary)
                    } else {
                        Text("Choisir une conversation")
                            .foregroundColor(theme.textMuted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)
                }
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
                )
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 20)
        }
    }

    private var conversationPickerSheet: some View {
        NavigationStack {
            List(conversationListViewModel.conversations, id: \.id) { conv in
                Button {
                    selectedConversation = conv
                    showConversationPicker = false
                } label: {
                    HStack {
                        Text(conv.name)
                            .foregroundColor(.primary)
                        Spacer()
                        if selectedConversation?.id == conv.id {
                            Image(systemName: "checkmark")
                                .foregroundColor(Color(hex: "08D9D6"))
                        }
                    }
                }
            }
            .navigationTitle("Choisir une conversation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") { showConversationPicker = false }
                }
            }
        }
    }

    private func create() {
        guard let conv = selectedConversation else { return }
        isCreating = true
        errorMessage = nil
        Task {
            do {
                let req = CreateShareLinkRequest(
                    conversationId: conv.id,
                    name: linkName.isEmpty ? nil : linkName,
                    allowAnonymousMessages: true,
                    allowAnonymousFiles: false,
                    allowAnonymousImages: true,
                    allowViewHistory: true,
                    requireAccount: false,
                    requireNickname: true,
                    requireEmail: false,
                    requireBirthday: false
                )
                let created = try await ShareLinkService.shared.createShareLink(request: req)
                await MainActor.run {
                    HapticFeedback.success()
                    onCreate(created)
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isCreating = false
                }
            }
        }
    }
}

import SwiftUI

struct StatusComposerView: View {
    @ObservedObject var viewModel: StatusViewModel
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    @State private var selectedEmoji: String?
    @State private var statusText = ""
    @State private var isPublishing = false

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 16), count: 5)

    var body: some View {
        NavigationView {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                VStack(spacing: 24) {
                    // Emoji Grid
                    emojiGrid

                    // Text Field
                    textInput

                    // Preview
                    if let emoji = selectedEmoji {
                        previewPill(emoji: emoji)
                    }

                    Spacer()

                    // Publish Button
                    publishButton
                }
                .padding(20)
            }
            .navigationTitle("Status")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Fermer") {
                        dismiss()
                    }
                    .foregroundColor(theme.textSecondary)
                }
            }
        }
    }

    // MARK: - Emoji Grid

    private var emojiGrid: some View {
        VStack(spacing: 12) {
            Text("Comment tu te sens ?")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            LazyVGrid(columns: columns, spacing: 16) {
                ForEach(StatusViewModel.moodOptions, id: \.self) { emoji in
                    emojiButton(emoji)
                }
            }
        }
    }

    private func emojiButton(_ emoji: String) -> some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                if selectedEmoji == emoji {
                    selectedEmoji = nil
                } else {
                    selectedEmoji = emoji
                    HapticFeedback.medium()
                }
            }
        } label: {
            Text(emoji)
                .font(.system(size: 36))
                .frame(width: 56, height: 56)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(
                            selectedEmoji == emoji ?
                                Color(hex: "FF2E63").opacity(0.15) :
                                Color.clear
                        )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(
                            selectedEmoji == emoji ?
                                MeeshyColors.avatarRingGradient :
                                LinearGradient(colors: [Color.clear], startPoint: .top, endPoint: .bottom),
                            lineWidth: 2
                        )
                )
                .scaleEffect(selectedEmoji == emoji ? 1.1 : 1.0)
        }
    }

    // MARK: - Text Input

    private var textInput: some View {
        TextField("Comment tu vas ?", text: $statusText)
            .font(.system(size: 15))
            .foregroundColor(theme.textPrimary)
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(theme.inputBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(theme.inputBorder, lineWidth: 1)
                    )
            )
            .onChange(of: statusText) { newValue in
                if newValue.count > 140 {
                    statusText = String(newValue.prefix(140))
                }
            }

        // Character count
            .overlay(alignment: .bottomTrailing) {
                if !statusText.isEmpty {
                    Text("\(statusText.count)/140")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(statusText.count > 120 ? Color(hex: "FF6B6B") : theme.textMuted)
                        .padding(.trailing, 14)
                        .padding(.bottom, -18)
                }
            }
    }

    // MARK: - Preview Pill

    private func previewPill(emoji: String) -> some View {
        VStack(spacing: 8) {
            Text("Apercu")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(theme.textMuted)

            HStack(spacing: 6) {
                Text(emoji)
                    .font(.system(size: 22))
                Text(statusText.isEmpty ? "Moi" : statusText)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .glassCard(cornerRadius: 20)
        }
        .transition(.scale.combined(with: .opacity))
    }

    // MARK: - Publish Button

    private var publishButton: some View {
        Button {
            guard let emoji = selectedEmoji else { return }
            isPublishing = true
            HapticFeedback.success()

            Task {
                await viewModel.setStatus(
                    emoji: emoji,
                    content: statusText.isEmpty ? nil : statusText
                )
                isPublishing = false
                dismiss()
            }
        } label: {
            HStack(spacing: 8) {
                if isPublishing {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.8)
                } else {
                    Text("Publier")
                        .font(.system(size: 16, weight: .bold))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(
                        selectedEmoji != nil ?
                            MeeshyColors.primaryGradient :
                            LinearGradient(colors: [Color.gray.opacity(0.3)], startPoint: .leading, endPoint: .trailing)
                    )
            )
            .foregroundColor(.white)
        }
        .disabled(selectedEmoji == nil || isPublishing)
        .opacity(selectedEmoji == nil ? 0.5 : 1)
    }
}

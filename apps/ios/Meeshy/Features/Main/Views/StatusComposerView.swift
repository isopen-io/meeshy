import SwiftUI
import MeeshyUI

enum StatusVisibility: String, CaseIterable {
    case `public` = "PUBLIC"
    case friends = "FRIENDS"
    case except = "EXCEPT"
    case only = "ONLY"

    var label: String {
        switch self {
        case .public: return "Public"
        case .friends: return "Amis"
        case .except: return "Sauf..."
        case .only: return "Seulement..."
        }
    }

    var icon: String {
        switch self {
        case .public: return "globe"
        case .friends: return "person.2.fill"
        case .except: return "person.fill.xmark"
        case .only: return "person.fill.checkmark"
        }
    }
}

struct StatusComposerView: View {
    @ObservedObject var viewModel: StatusViewModel
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    @State private var selectedEmoji: String?
    @State private var statusText = ""
    @State private var isPublishing = false
    @AppStorage("lastStatusVisibility") private var lastVisibility: String = "PUBLIC"
    @State private var selectedVisibility: StatusVisibility = .public
    @State private var selectedUserIds: [String] = []

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 16), count: 5)

    var body: some View {
        NavigationView {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                VStack(spacing: 24) {
                    // Emoji Grid
                    emojiGrid

                    // Visibility picker
                    visibilityPicker

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
                                MeeshyColors.pink.opacity(0.15) :
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
            .onChange(of: statusText) { _, newValue in
                if newValue.count > 140 {
                    statusText = String(newValue.prefix(140))
                }
            }

        // Character count
            .overlay(alignment: .bottomTrailing) {
                if !statusText.isEmpty {
                    Text("\(statusText.count)/140")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(statusText.count > 120 ? MeeshyColors.coral : theme.textMuted)
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
                    content: statusText.isEmpty ? nil : statusText,
                    visibility: selectedVisibility.rawValue,
                    visibilityUserIds: (selectedVisibility == .except || selectedVisibility == .only) ? selectedUserIds : nil
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

    // MARK: - Visibility Picker

    private var visibilityPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(StatusVisibility.allCases, id: \.rawValue) { vis in
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            selectedVisibility = vis
                            lastVisibility = vis.rawValue
                        }
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: vis.icon)
                                .font(.system(size: 11))
                            Text(vis.label)
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(selectedVisibility == vis ? .white : theme.textSecondary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            Capsule()
                                .fill(selectedVisibility == vis ?
                                    AnyShapeStyle(MeeshyColors.primaryGradient) :
                                    AnyShapeStyle(theme.inputBackground))
                        )
                    }
                }
            }
            .padding(.horizontal, 4)
        }
        .onAppear {
            if let vis = StatusVisibility(rawValue: lastVisibility) {
                selectedVisibility = vis
            }
        }
    }
}

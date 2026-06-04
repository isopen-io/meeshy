import SwiftUI
import Combine
import MeeshyUI

enum StatusVisibility: String, CaseIterable {
    case `public` = "PUBLIC"
    case friends = "FRIENDS"
    case except = "EXCEPT"
    case only = "ONLY"

    var label: String {
        switch self {
        case .public: return String(localized: "status.composer.visibility.public", defaultValue: "Public", bundle: .main)
        case .friends: return String(localized: "status.composer.visibility.friends", defaultValue: "Amis", bundle: .main)
        case .except: return String(localized: "status.composer.visibility.except", defaultValue: "Sauf...", bundle: .main)
        case .only: return String(localized: "status.composer.visibility.only", defaultValue: "Seulement...", bundle: .main)
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
    var initialEmoji: String? = nil
    var initialText: String? = nil
    var viaUsername: String? = nil

    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    @State private var selectedEmoji: String?
    @State private var statusText = ""
    @State private var isPublishing = false
    @AppStorage("lastStatusVisibility") private var lastVisibility: String = "PUBLIC"
    @State private var selectedVisibility: StatusVisibility = .public
    @State private var selectedUserIds: [String] = []
    @State private var didApplyInitialValues = false

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 16), count: 5)

    var body: some View {
        NavigationView {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                VStack(spacing: 24) {
                    // Republication header
                    if let via = viaUsername {
                        HStack(spacing: 6) {
                            Image(systemName: "arrow.2.squarepath")
                                .font(.system(size: 12))
                                .foregroundColor(MeeshyColors.indigo400)
                            Text(String(localized: "status.composer.repost.via", defaultValue: "Status de @\(via)", bundle: .main))
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(theme.textSecondary)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            Capsule()
                                .fill(MeeshyColors.indigo500.opacity(0.1))
                        )
                    }

                    // Emoji Grid
                    emojiGrid

                    // Visibility picker
                    visibilityPicker

                    // Text Field
                    textInput

                    Spacer()
                }
                .padding(20)
            }
            .navigationTitle(viaUsername != nil ? String(localized: "status.composer.title.repost", defaultValue: "Republier un status", bundle: .main) : String(localized: "status.composer.title", defaultValue: "Status", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) {
                        dismiss()
                    }
                    .foregroundColor(theme.textSecondary)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    publishToolbarButton
                }
            }
            .onAppear {
                guard !didApplyInitialValues else { return }
                didApplyInitialValues = true
                if let emoji = initialEmoji { selectedEmoji = emoji }
                if let text = initialText { statusText = text }
            }
        }
    }

    // MARK: - Emoji Grid

    private var emojiGrid: some View {
        VStack(spacing: 12) {
            Text(String(localized: "status.composer.mood.question", defaultValue: "Comment tu te sens ?", bundle: .main))
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
                                MeeshyColors.indigo500.opacity(0.15) :
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
        TextField(String(localized: "status.composer.placeholder", defaultValue: "Comment tu vas ?", bundle: .main), text: $statusText)
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
            .adaptiveOnChange(of: statusText) { _, newValue in
                if newValue.count > 122 {
                    statusText = String(newValue.prefix(122))
                }
            }

        // Character count
            .overlay(alignment: .bottomTrailing) {
                if !statusText.isEmpty {
                    Text("\(statusText.count)/122")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(statusText.count > 100 ? MeeshyColors.error : theme.textMuted)
                        .padding(.trailing, 14)
                        .padding(.bottom, -18)
                }
            }
    }

    // MARK: - Publish Button (toolbar)

    private var publishToolbarButton: some View {
        Button {
            guard let emoji = selectedEmoji else { return }
            isPublishing = true
            HapticFeedback.success()

            Task {
                await viewModel.setStatus(
                    emoji: emoji,
                    content: statusText.isEmpty ? nil : statusText,
                    visibility: selectedVisibility.rawValue,
                    visibilityUserIds: (selectedVisibility == .except || selectedVisibility == .only) ? selectedUserIds : nil,
                    viaUsername: viaUsername
                )
                isPublishing = false
                dismiss()
            }
        } label: {
            if isPublishing {
                ProgressView()
                    .tint(MeeshyColors.indigo500)
                    .scaleEffect(0.8)
            } else {
                Text(String(localized: "status.composer.publish", defaultValue: "Publier", bundle: .main))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(selectedEmoji != nil ? MeeshyColors.brandGradient : LinearGradient(colors: [theme.textMuted], startPoint: .leading, endPoint: .trailing))
            }
        }
        .disabled(selectedEmoji == nil || isPublishing)
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
                                    AnyShapeStyle(MeeshyColors.brandGradient) :
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

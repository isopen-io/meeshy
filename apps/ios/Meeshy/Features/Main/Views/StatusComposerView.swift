import SwiftUI
import Combine
import MeeshyUI

struct StatusComposerView: View {
    @ObservedObject var viewModel: StatusViewModel
    var initialEmoji: String? = nil
    var initialText: String? = nil
    var viaUsername: String? = nil
    /// When republishing an existing status: id of the source post (links the
    /// repost → attribution resolves from repostOf.author) and the source voice
    /// note url (preserved so a republished voice mood keeps its audio).
    var repostOfId: String? = nil
    var repostAudioUrl: String? = nil

    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    @State private var selectedEmoji: String?
    @State private var statusText = ""
    @State private var isPublishing = false
    @AppStorage("lastStatusVisibility") private var lastVisibility: String = "PUBLIC"
    @State private var selectedVisibility: PostVisibility = .public
    @State private var selectedUserIds: [String] = []
    @State private var audiencePickerMode: PostVisibility?
    @State private var didApplyInitialValues = false
    /// `clientMutationId` of a mood recovered from the offline queue (pre-filled
    /// as a draft). Set when the composer opens onto a stuck unsent mood; the
    /// re-send supersedes this row so the resend replaces it (no duplicate).
    @State private var recoveredCmid: String?

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
                // Draft recovery: only for a fresh compose (not a repost or a
                // caller-prefilled mood). Pre-fill the last mood that got stuck
                // offline so the user can re-send it instead of losing it.
                if initialEmoji == nil, initialText == nil, viaUsername == nil {
                    Task {
                        guard let draft = await viewModel.recoverUnsentStatus() else { return }
                        if selectedEmoji == nil, let emoji = draft.moodEmoji { selectedEmoji = emoji }
                        if statusText.isEmpty { statusText = draft.content }
                        if let vis = PostVisibility(rawValue: draft.visibility),
                           PostVisibility.composerSelectableCases.contains(vis) { selectedVisibility = vis }
                        // Restore the audience too, else an ONLY/EXCEPT mood would
                        // re-send with an empty list and the gateway would reject it.
                        if let ids = draft.visibilityUserIds { selectedUserIds = ids }
                        recoveredCmid = draft.clientMutationId
                    }
                }
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
                // Supersede the recovered stuck mood (if any) so re-sending it
                // replaces the queued row instead of duplicating it on reconnect.
                if let cmid = recoveredCmid {
                    await viewModel.supersedeRecoveredStatus(clientMutationId: cmid)
                    recoveredCmid = nil
                }
                await viewModel.setStatus(
                    emoji: emoji,
                    content: statusText.isEmpty ? nil : statusText,
                    visibility: selectedVisibility.rawValue,
                    visibilityUserIds: selectedVisibility.requiresUserSelection ? selectedUserIds : nil,
                    viaUsername: viaUsername,
                    audioUrl: repostAudioUrl,
                    repostOfId: repostOfId
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
                ForEach(PostVisibility.composerSelectableCases, id: \.rawValue) { vis in
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            selectedVisibility = vis
                            lastVisibility = vis.rawValue
                        }
                        if vis.requiresUserSelection { audiencePickerMode = vis }
                        HapticFeedback.light()
                    } label: {
                        let showCount = vis.requiresUserSelection && selectedVisibility == vis && !selectedUserIds.isEmpty
                        HStack(spacing: 4) {
                            Image(systemName: vis.icon)
                                .font(.system(size: 11))
                            Text(showCount ? "\(vis.label) (\(selectedUserIds.count))" : vis.label)
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
        .sheet(item: $audiencePickerMode) { mode in
            AudienceUserPickerView(mode: mode, initialSelection: selectedUserIds) { ids in
                selectedUserIds = ids
            }
        }
        .onAppear {
            if let vis = PostVisibility(rawValue: lastVisibility),
               PostVisibility.composerSelectableCases.contains(vis) {
                selectedVisibility = vis
            } else {
                selectedVisibility = .public
            }
        }
    }
}

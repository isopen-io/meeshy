import SwiftUI
import MeeshySDK
import MeeshyUI

/// Lightweight sheet for editing the body content of an authored post.
/// V1 scope: text only — no attachments, visibility, mood emoji change.
/// Those edits remain composer-only on create; the gateway PUT route
/// supports them but the iOS UX doesn't expose them yet on edit.
///
/// Wraps a TextEditor pre-filled with the original content and a
/// publish button that calls the supplied `onSave` callback async.
/// The parent (FeedView / PostDetailView) owns the persistence path
/// (ViewModel.updatePost) so this sheet stays presentation-only and
/// re-usable across contexts.
struct EditPostSheet: View {
    let originalContent: String
    var maxLength: Int = 5000
    let onSave: (String) async -> Void
    let onDismiss: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    @State private var draftContent: String = ""
    @FocusState private var isFocused: Bool
    @State private var isSaving: Bool = false

    private var trimmedContent: String {
        draftContent.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var hasChanges: Bool {
        trimmedContent != originalContent.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isValid: Bool {
        !trimmedContent.isEmpty && trimmedContent.count <= maxLength
    }

    private var remainingChars: Int {
        max(0, maxLength - draftContent.count)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                VStack(alignment: .leading, spacing: 12) {
                    // Editor
                    TextEditor(text: $draftContent)
                        .focused($isFocused)
                        .font(.system(size: 17))
                        .foregroundColor(theme.textPrimary)
                        .scrollContentBackground(.hidden)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 14)
                                .fill(theme.inputBackground)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14)
                                        .stroke(theme.inputBorder, lineWidth: 1)
                                )
                        )
                        .padding(.horizontal, 16)
                        .frame(maxHeight: .infinity)

                    // Char counter
                    HStack {
                        Spacer()
                        Text("\(remainingChars)")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(remainingChars < 100 ? MeeshyColors.warning : theme.textMuted)
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
                }
            }
            .navigationTitle(String(localized: "feed.post.edit.title", defaultValue: "Modifier le post", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) {
                        onDismiss()
                    }
                    .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView()
                                .tint(MeeshyColors.indigo300)
                                .scaleEffect(0.85)
                        } else {
                            Text(String(localized: "feed.post.edit.publish", defaultValue: "Publier", bundle: .main))
                                .font(.system(size: 16, weight: .semibold))
                        }
                    }
                    .disabled(!isValid || !hasChanges || isSaving)
                }
            }
        }
        .onAppear {
            draftContent = originalContent
            // Defer focus slightly so the keyboard rises after the sheet
            // present animation settles — otherwise the appearance jolts.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                isFocused = true
            }
        }
        .interactiveDismissDisabled(isSaving)
    }

    private func save() async {
        guard isValid, !isSaving else { return }
        isSaving = true
        await onSave(trimmedContent)
        isSaving = false
        onDismiss()
    }
}

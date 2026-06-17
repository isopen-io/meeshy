import SwiftUI
import MeeshySDK
import MeeshyUI

/// Result of an edit: the body plus the two structural fields the gateway lets
/// an author change. `language`/`type` are non-nil ONLY when actually changed,
/// so an unchanged edit never triggers a re-translation or a type switch.
struct EditPostDraft {
    let content: String
    /// Non-nil only when the source language changed → re-runs the Prisme
    /// translation pipeline server-side.
    let language: String?
    /// Non-nil only when the author switched between "POST" and "REEL".
    let type: String?
}

/// Sheet for editing an authored post: body text, source language (with
/// re-translation), and POST <-> REEL type. The parent owns persistence
/// (`ViewModel.updatePost`) so this sheet stays presentation-only and reusable.
struct EditPostSheet: View {
    let originalContent: String
    var originalLanguage: String? = nil
    var originalType: String? = nil
    /// The post carries media → switching to REEL is allowed (a reel needs
    /// something to show on the immersive surface).
    var canBeReel: Bool = false
    /// A repost mirrors its source; its type is not editable.
    var isRepost: Bool = false
    var maxLength: Int = 5000
    let onSave: (EditPostDraft) async -> Void
    let onDismiss: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    @State private var draftContent: String = ""
    @State private var selectedLanguage: String = ""
    @State private var selectedType: String = "POST"
    @State private var showLanguagePicker = false
    @FocusState private var isFocused: Bool
    @State private var isSaving: Bool = false

    private var trimmedContent: String {
        draftContent.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var normalizedOriginalType: String { (originalType ?? "POST").uppercased() }

    /// Only meaningful when not a repost and the post can actually be a reel
    /// (carries media) or already is one (allowing the reverse switch).
    private var showTypePicker: Bool {
        !isRepost && (canBeReel || normalizedOriginalType == "REEL")
    }

    private var contentChanged: Bool {
        trimmedContent != originalContent.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    private var languageChanged: Bool { selectedLanguage != (originalLanguage ?? "") }
    private var typeChanged: Bool { showTypePicker && selectedType != normalizedOriginalType }
    private var hasChanges: Bool { contentChanged || languageChanged || typeChanged }

    private var isValid: Bool {
        !trimmedContent.isEmpty && trimmedContent.count <= maxLength
    }

    private var remainingChars: Int {
        max(0, maxLength - draftContent.count)
    }

    private var selectedLanguageInfo: LanguageInfo? {
        LanguageData.allLanguages.first { $0.code == selectedLanguage }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                VStack(alignment: .leading, spacing: 12) {
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

                    metadataSection

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
            .sheet(isPresented: $showLanguagePicker) {
                ProfileLanguagePickerSheet(
                    title: String(localized: "feed.post.edit.language", defaultValue: "Langue du contenu", bundle: .main),
                    languages: LanguageData.allLanguages,
                    selectedCode: selectedLanguage,
                    allowClear: false,
                    onSelect: { code in
                        selectedLanguage = code
                        showLanguagePicker = false
                    }
                )
            }
        }
        .onAppear {
            draftContent = originalContent
            selectedLanguage = originalLanguage ?? ""
            selectedType = normalizedOriginalType
            // Defer focus slightly so the keyboard rises after the sheet
            // present animation settles — otherwise the appearance jolts.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                isFocused = true
            }
        }
        .interactiveDismissDisabled(isSaving)
    }

    // MARK: - Language + type controls

    @ViewBuilder
    private var metadataSection: some View {
        VStack(spacing: 10) {
            Button {
                isFocused = false
                showLanguagePicker = true
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "globe")
                        .foregroundColor(theme.textSecondary)
                    Text(String(localized: "feed.post.edit.language", defaultValue: "Langue du contenu", bundle: .main))
                        .font(.system(size: 15))
                        .foregroundColor(theme.textPrimary)
                    Spacer()
                    if let info = selectedLanguageInfo {
                        Text("\(info.flag) \(info.name)")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    } else {
                        Text(String(localized: "feed.post.edit.language.auto", defaultValue: "Auto", bundle: .main))
                            .font(.system(size: 15))
                            .foregroundColor(theme.textMuted)
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
                .padding(.vertical, 10)
                .padding(.horizontal, 14)
                .background(
                    RoundedRectangle(cornerRadius: 12).fill(theme.inputBackground)
                )
            }
            .buttonStyle(.plain)
            .disabled(isSaving)

            if showTypePicker {
                Picker(String(localized: "feed.post.edit.type", defaultValue: "Type", bundle: .main), selection: $selectedType) {
                    Text(String(localized: "feed.post.edit.type.post", defaultValue: "Post", bundle: .main)).tag("POST")
                    Text(String(localized: "feed.post.edit.type.reel", defaultValue: "Réel", bundle: .main)).tag("REEL")
                }
                .pickerStyle(.segmented)
                .disabled(isSaving)
            }
        }
        .padding(.horizontal, 16)
    }

    private func save() async {
        guard isValid, !isSaving else { return }
        isSaving = true
        let draft = EditPostDraft(
            content: trimmedContent,
            language: languageChanged ? selectedLanguage : nil,
            type: typeChanged ? selectedType : nil
        )
        await onSave(draft)
        isSaving = false
        onDismiss()
    }
}

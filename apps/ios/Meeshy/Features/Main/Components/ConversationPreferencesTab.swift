import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - ConversationPreferencesTab

struct ConversationPreferencesTab: View {
    let conversation: Conversation
    let accentColor: String

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.dismiss) private var dismiss

    @StateObject private var viewModel: ConversationOptionsViewModel

    @State private var showArchiveConfirm: Bool = false
    @State private var showLeaveConfirm: Bool = false
    @State private var showDeleteConfirm: Bool = false
    @State private var showEmojiPicker: Bool = false
    @State private var customNameLocal: String = ""

    private var isDirect: Bool { conversation.type == .direct }
    private var isCreator: Bool { conversation.currentUserRole?.lowercased() == "creator" }
    private var accent: Color { Color(hex: accentColor) }

    private var canLeave: Bool { !isDirect && !isCreator }

    init(conversation: Conversation, accentColor: String) {
        self.conversation = conversation
        self.accentColor = accentColor
        self._viewModel = StateObject(wrappedValue: ConversationOptionsViewModel(conversation: conversation))
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.lg) {
            if viewModel.loadState == .loading && viewModel.prefs.tags == nil {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 200)
            } else {
                displaySection
                organizationSection
                notificationsSection
                actionsSection
            }

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(MeeshyColors.error)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, MeeshySpacing.xl)
            }
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.xxxl)
        .task {
            await viewModel.load()
            customNameLocal = viewModel.prefs.customName ?? ""
        }
        .adaptiveOnChange(of: viewModel.didDelete) { _, deleted in if deleted { dismiss() } }
        .adaptiveOnChange(of: viewModel.didLeave) { _, left in if left { dismiss() } }
        .alert(
            (viewModel.prefs.isArchived ?? false) ? String(localized: "conversation.prefs.unarchive.title", defaultValue: "Désarchiver la conversation ?", bundle: .main) : String(localized: "conversation.prefs.archive.title", defaultValue: "Archiver la conversation ?", bundle: .main),
            isPresented: $showArchiveConfirm
        ) {
            Button((viewModel.prefs.isArchived ?? false) ? String(localized: "conversation.prefs.unarchive", defaultValue: "Désarchiver", bundle: .main) : String(localized: "conversation.prefs.archive", defaultValue: "Archiver", bundle: .main),
                   role: (viewModel.prefs.isArchived ?? false) ? .none : .destructive) {
                viewModel.toggleArchive()
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        }
        .confirmationDialog(String(localized: "conversation.prefs.leave.title", defaultValue: "Quitter la conversation ?", bundle: .main), isPresented: $showLeaveConfirm, titleVisibility: .visible) {
            Button(String(localized: "conversation.prefs.leave", defaultValue: "Quitter", bundle: .main), role: .destructive) {
                Task { await viewModel.leave() }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        } message: {
            Text(String(localized: "conversation.prefs.leave.message", defaultValue: "Vous ne recevrez plus de messages. Votre historique restera consultable.", bundle: .main))
        }
        .confirmationDialog(String(localized: "conversation.prefs.delete.title", defaultValue: "Supprimer pour moi", bundle: .main), isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main), role: .destructive) {
                Task { await viewModel.deleteForMe() }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        } message: {
            Text(String(localized: "conversation.prefs.delete.message", defaultValue: "Cette conversation sera retirée de votre liste. Les autres membres ne seront pas affectés.", bundle: .main))
        }
    }

    // MARK: - Sections

    private var displaySection: some View {
        settingsSection(title: String(localized: "conversation.prefs.section.display", defaultValue: "Mon affichage", bundle: .main), icon: "paintbrush.fill", color: accentColor) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "pencil")
                        // Decorative glyph in a fixed 28×28 badge — kept fixed (86i doctrine:
                        // a scalable glyph would overflow the fixed frame) + hidden (the label carries the meaning).
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(accent)
                        .frame(width: 28, height: 28)
                        .background(RoundedRectangle(cornerRadius: MeeshyRadius.xs).fill(accent.opacity(MeeshyOpacity.light)))
                        .accessibilityHidden(true)
                    Text(String(localized: "conversation.prefs.custom-name", defaultValue: "Nom personnalisé", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundColor(theme.textSecondary)
                }

                HStack(spacing: MeeshySpacing.xsPlus) {
                    TextField(String(localized: "conversation.prefs.custom-name.placeholder", defaultValue: "Donnez un surnom à cette conversation…", bundle: .main), text: $customNameLocal)
                        .textFieldStyle(.plain)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                        .adaptiveOnChange(of: customNameLocal) { _, newValue in
                            viewModel.setCustomName(newValue)
                        }
                    if !customNameLocal.isEmpty {
                        Button {
                            customNameLocal = ""
                            viewModel.setCustomName("")
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(MeeshyFont.relative(MeeshyIconSize.sm))
                                .foregroundColor(theme.textMuted)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(String(localized: "conversation.prefs.custom-name.clear", defaultValue: "Effacer le nom personnalisé", bundle: .main))
                    }
                }
                .padding(MeeshySpacing.md)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(MeeshyColors.surfaceFill(isDark: isDark))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .strokeBorder(theme.textMuted.opacity(MeeshyOpacity.light), lineWidth: 1)
                )
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)

            Divider().padding(.leading, 54).opacity(MeeshyOpacity.medium)

            Button {
                showEmojiPicker = true
            } label: {
                // Cette « réaction » EST le favori : le filtre « Favoris » de la
                // liste lit `userState.reaction != nil` — nommée comme telle
                // (directive 2026-08-21).
                settingsRow(icon: "star.fill", iconColor: accentColor, title: String(localized: "action.favorite", defaultValue: "Favori", bundle: .main)) {
                    HStack(spacing: MeeshySpacing.xsPlus) {
                        if let r = viewModel.prefs.reaction, !r.isEmpty {
                            Text(r).font(MeeshyFont.relative(24))
                        } else {
                            Text(String(localized: "conversation.prefs.reaction.none", defaultValue: "Aucune", bundle: .main))
                                .font(MeeshyFont.relative(MeeshyFont.labelSize))
                                .foregroundColor(theme.textMuted)
                        }
                        Image(systemName: "chevron.forward")
                            .font(MeeshyFont.relative(11, weight: .semibold))
                            .foregroundColor(theme.textMuted)
                            .accessibilityHidden(true)
                    }
                }
            }
            .buttonStyle(.plain)
        }
        .sheet(isPresented: $showEmojiPicker) {
            EmojiPickerSheet(
                quickReactions: ["❤️", "😂", "👍", "🔥", "😍", "😮", "😢", "👏", "🎉"],
                onSelect: { emoji in
                    showEmojiPicker = false
                    viewModel.setReaction(emoji)
                }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    private var organizationSection: some View {
        settingsSection(title: String(localized: "conversation.prefs.section.organization", defaultValue: "Organisation", bundle: .main), icon: "folder.fill", color: MeeshyColors.infoHex) {
            // Pin toggle
            settingsToggleRow(
                icon: "pin.fill",
                iconColor: MeeshyColors.infoHex,
                title: String(localized: "conversation.prefs.pin", defaultValue: "Épingler", bundle: .main),
                tint: MeeshyColors.info,
                isOn: Binding(
                    get: { viewModel.prefs.isPinned ?? false },
                    set: { val in viewModel.setPinned(val) }
                )
            )

            Divider().padding(.leading, 54).opacity(MeeshyOpacity.medium)

            // Catégorie
            VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "square.grid.2x2.fill")
                        // Decorative glyph in a fixed 28×28 badge — kept fixed + hidden (86i doctrine).
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(MeeshyColors.info)
                        .frame(width: 28, height: 28)
                        .background(RoundedRectangle(cornerRadius: MeeshyRadius.xs).fill(MeeshyColors.info.opacity(MeeshyOpacity.light)))
                        .accessibilityHidden(true)
                    Text(String(localized: "conversation.prefs.category", defaultValue: "Catégorie", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundColor(theme.textSecondary)
                }

                CategoryPickerField(
                    categories: viewModel.categories,
                    selectedId: Binding(
                        get: { viewModel.prefs.categoryId },
                        set: { newId in viewModel.setCategory(newId) }
                    ),
                    accentColor: MeeshyColors.info,
                    onCreateCategory: { name in
                        await viewModel.createCategoryAndSelect(name: name)
                    }
                )
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)

            Divider().padding(.leading, 54).opacity(MeeshyOpacity.medium)

            // Tags
            VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "tag.fill")
                        // Decorative glyph in a fixed 28×28 badge — kept fixed + hidden (86i doctrine).
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(MeeshyColors.info)
                        .frame(width: 28, height: 28)
                        .background(RoundedRectangle(cornerRadius: MeeshyRadius.xs).fill(MeeshyColors.info.opacity(MeeshyOpacity.light)))
                        .accessibilityHidden(true)
                    Text(String(localized: "conversation.prefs.tags", defaultValue: "Étiquettes", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundColor(theme.textSecondary)
                }

                TagInputField(
                    selectedTags: Binding(
                        get: { viewModel.prefs.tags ?? [] },
                        set: { newTags in viewModel.setTags(newTags) }
                    ),
                    knownTags: viewModel.allTags,
                    accentColor: MeeshyColors.info
                )
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)
        }
    }

    private var notificationsSection: some View {
        settingsSection(title: String(localized: "conversation.prefs.section.notifications", defaultValue: "Notifications", bundle: .main), icon: "bell.fill", color: MeeshyColors.tileCoralHex) {
            settingsToggleRow(
                icon: "bell.slash.fill",
                iconColor: MeeshyColors.tileCoralHex,
                title: String(localized: "conversation.prefs.muted", defaultValue: "Muet", bundle: .main),
                tint: MeeshyColors.error,
                isOn: Binding(
                    get: { viewModel.prefs.isMuted ?? false },
                    set: { val in viewModel.setMuted(val) }
                )
            )
            Divider().padding(.leading, 54).opacity(MeeshyOpacity.medium)
            settingsToggleRow(
                icon: "at",
                iconColor: MeeshyColors.tileCoralHex,
                title: String(localized: "conversation.prefs.mentions-only", defaultValue: "Mentions seulement", bundle: .main),
                tint: MeeshyColors.error,
                isEnabled: !(viewModel.prefs.isMuted ?? false),
                isOn: Binding(
                    get: { viewModel.prefs.mentionsOnly ?? false },
                    set: { val in viewModel.setMentionsOnly(val) }
                )
            )
        }
    }

    private var actionsSection: some View {
        settingsSection(title: String(localized: "conversation.prefs.section.actions", defaultValue: "Actions", bundle: .main), icon: "ellipsis.circle.fill", color: MeeshyColors.neutral500Hex) {
            Button {
                showArchiveConfirm = true
            } label: {
                settingsRow(
                    icon: (viewModel.prefs.isArchived ?? false) ? "archivebox.fill" : "archivebox",
                    iconColor: MeeshyColors.amber500Hex,
                    title: (viewModel.prefs.isArchived ?? false) ? String(localized: "conversation.prefs.unarchive", defaultValue: "Désarchiver", bundle: .main) : String(localized: "conversation.prefs.archive", defaultValue: "Archiver", bundle: .main)
                ) { EmptyView() }
                .foregroundColor(MeeshyColors.warning)
            }
            .buttonStyle(.plain)

            if canLeave {
                Divider().padding(.leading, 54).opacity(MeeshyOpacity.medium)
                Button {
                    showLeaveConfirm = true
                } label: {
                    settingsRow(icon: "rectangle.portrait.and.arrow.right", iconColor: MeeshyColors.orange500Hex, title: String(localized: "conversation.prefs.leave-group", defaultValue: "Quitter le groupe", bundle: .main)) {
                        EmptyView()
                    }
                    .foregroundColor(MeeshyColors.warning)
                }
                .buttonStyle(.plain)
            }

            Divider().padding(.leading, 54).opacity(MeeshyOpacity.medium)
            Button {
                showDeleteConfirm = true
            } label: {
                settingsRow(icon: "trash.fill", iconColor: MeeshyColors.errorHex, title: String(localized: "conversation.prefs.delete-for-me", defaultValue: "Supprimer pour moi", bundle: .main)) {
                    EmptyView()
                }
                .foregroundColor(MeeshyColors.error)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Builders

    private func settingsSection<Content: View>(
        title: String,
        icon: String,
        color: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundColor(Color(hex: color))
                    .accessibilityHidden(true)
                Text(title.uppercased())
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: color))
                    .tracking(1.2)
                    .accessibilityLabel(title)
                    .accessibilityAddTraits(.isHeader)
            }
            .padding(.leading, MeeshySpacing.xs)

            VStack(spacing: 0) {
                content()
            }
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(theme.surfaceGradient(tint: color))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                            .stroke(theme.border(tint: color), lineWidth: 1)
                    )
            )
        }
    }

    @ViewBuilder
    private func settingsToggleRow(
        icon: String,
        iconColor: String,
        title: String,
        tint: Color,
        isEnabled: Bool = true,
        isOn: Binding<Bool>
    ) -> some View {
        settingsRow(icon: icon, iconColor: iconColor, title: title) {
            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(tint)
                .disabled(!isEnabled)
                .accessibilityLabel(title)
        }
        .opacity(isEnabled ? 1 : 0.4)
    }

    @ViewBuilder
    private func settingsRow<Trailing: View>(
        icon: String,
        iconColor: String,
        title: String,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: icon)
                // Decorative glyph in a fixed 28×28 badge — kept fixed + hidden (86i doctrine).
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: iconColor))
                .frame(width: 28, height: 28)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.xs).fill(Color(hex: iconColor).opacity(MeeshyOpacity.light)))
                .accessibilityHidden(true)
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.bodySize))
                .foregroundColor(theme.textPrimary)
            Spacer()
            trailing()
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
    }
}

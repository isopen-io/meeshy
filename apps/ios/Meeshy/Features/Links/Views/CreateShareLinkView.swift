import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - CreateShareLinkView

struct CreateShareLinkView: View {
    let onCreate: (CreatedShareLink) -> Void

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // Conversation
    @State private var openNoteID: String?
    @State private var selectedConversation: Conversation? = nil
    @State private var showConversationPicker = false

    // Identité
    @State private var linkName: String = ""
    @State private var linkDescription: String = ""
    @State private var customSlug: String = ""

    // Accès invités
    @State private var requireAccount: Bool = false
    @State private var requireNickname: Bool = true
    @State private var requireEmail: Bool = false
    @State private var requireBirthday: Bool = false

    // Permissions anonymes
    @State private var allowAnonymousMessages: Bool = true
    @State private var allowAnonymousFiles: Bool = false
    @State private var allowAnonymousImages: Bool = true
    @State private var allowViewHistory: Bool = false

    // Limites — les crans et le plafond de la planche `Lien-Creer` (#19502)
    @State private var maxUsesEnabled: Bool = true
    @State private var maxUsesValue: Int = ShareLinkDraft.defaultEntries
    @State private var expiry: LinkExpiryNotch = .days7

    // Langues autorisées — vide = toutes
    @State private var languages: [String] = []
    @State private var showsLanguages = false

    // Etat
    @State private var isCreating = false
    @State private var errorMessage: String? = nil

    private let accent = MeeshyColors.shareAccent

    var body: some View {
        LinksPage(
            title: String(localized: "share.link.create.title", defaultValue: "Nouveau lien de partage", bundle: .main),
            accent: accent,
            glyph: .close
        ) {
            VStack(spacing: 0) {
                conversationSection
                identitySection
                accessSection
                permissionsSection
                limitsSection
                languagesSection
                LinkTicketPreviewView(preview: draft.ticket, tint: accent, systemImage: "bubble.left.and.bubble.right")
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.top, MeeshySpacing.lg)
                createButton
                    .padding(.top, MeeshySpacing.sm)
                    .padding(.bottom, 40)
            }
            .padding(.top, MeeshySpacing.sm)
        }
        .sheet(isPresented: $showConversationPicker) {
            ConversationPickerSheet(
                conversations: sharableConversations,
                selected: $selectedConversation,
                isPresented: $showConversationPicker
            )
        }
    }

    // MARK: - Conversations filtrées (pas de DM)

    private var sharableConversations: [Conversation] {
        conversationListViewModel.conversations.filter { $0.type != .direct }
    }

    // MARK: - Section: Conversation

    private var conversationSection: some View {
        formSection(title: String(localized: "share.link.create.section.conversation", defaultValue: "Conversation", bundle: .main), icon: "bubble.left.and.bubble.right.fill") {
            MeeshyToggleRow(
                content: MeeshyToggleRowContent(
                    title: selectedConversation?.name
                        ?? String(localized: "share.link.create.choose_group", defaultValue: "Choisir un groupe ou une communauté", bundle: .main),
                    subtitle: selectedConversation?.type.displayLabel,
                    accessory: .chevron
                ),
                action: { showConversationPicker = true },
                leading: {
                    if let conv = selectedConversation {
                        conversationTypeIcon(conv.type)
                    } else {
                        iconBadge("plus.circle.dashed", color: MeeshyColors.shareAccentHex)
                    }
                },
                titleAccessory: { MeeshyToggleRowNoSlot() },
                trailing: { MeeshyToggleRowNoSlot() }
            )
            .background(rowBackground)
            .accessibilityLabel(selectedConversation.map { "\($0.name), \($0.type.displayLabel)" }
                ?? String(localized: "share.link.create.choose_group", defaultValue: "Choisir un groupe ou une communauté", bundle: .main))
            .accessibilityHint(String(localized: "share.link.create.conversation.a11yHint", defaultValue: "Choisit la conversation à partager", bundle: .main))
        }
    }

    // MARK: - Section: Identité du lien

    private var identitySection: some View {
        formSection(title: String(localized: "share.link.create.section.identity", defaultValue: "Identité du lien", bundle: .main), icon: "tag.fill") {
            VStack(spacing: 0) {
                formField(String(localized: "share.link.create.field.name", defaultValue: "Nom du lien", bundle: .main), placeholder: String(localized: "share.link.create.field.name.placeholder", defaultValue: "ex: Partage Twitter", bundle: .main), text: $linkName, input: .sentence)
                divider
                formField(String(localized: "share.link.create.field.description", defaultValue: "Description", bundle: .main), placeholder: String(localized: "share.link.create.field.description.placeholder", defaultValue: "Optionnel", bundle: .main), text: $linkDescription, input: .paragraph)
                divider
                LinkSlugField(prefix: "meeshy.me/chat/", slug: customSlug, isAcceptable: LinkSlugRules.isAcceptable(customSlug),
                              openNoteID: $openNoteID, onChange: { customSlug = $0 })
                    .padding(.horizontal, MeeshySpacing.mdPlus)
                    .padding(.vertical, MeeshySpacing.md)
                    .background(rowBackground)
            }
        }
    }

    // MARK: - Section: Accès invités

    private var accessSection: some View {
        formSection(title: String(localized: "share.link.create.section.access", defaultValue: "Demander aux invités", bundle: .main), icon: "person.badge.key.fill",
                    subtitle: String(localized: "share.link.create.section.access.subtitle", defaultValue: "Ce que les invités doivent fournir", bundle: .main)) {
            VStack(spacing: 0) {
                ruleRow(
                    String(localized: "share.link.create.access.account_required", defaultValue: "Compte Meeshy", bundle: .main),
                    icon: "person.fill.checkmark",
                    iconColor: MeeshyColors.shareAccentHex,
                    isOn: $requireAccount
                )
                divider
                ruleRow(
                    String(localized: "share.link.create.access.nickname_required", defaultValue: "Pseudo", bundle: .main),
                    icon: "person.fill",
                    iconColor: MeeshyColors.trackingAccentHex,
                    isOn: $requireNickname
                )
                .disabled(requireAccount)
                divider
                ruleRow(
                    String(localized: "share.link.create.access.email_required", defaultValue: "E-mail", bundle: .main),
                    icon: "envelope.fill",
                    iconColor: MeeshyColors.communityAccentHex,
                    isOn: $requireEmail
                )
                .disabled(requireAccount)
                divider
                ruleRow(
                    String(localized: "share.link.create.access.birthday_required", defaultValue: "Date de naissance", bundle: .main),
                    note: MeeshyInfoNote(
                        question: String(localized: "share.link.create.access.birthday_required.question", defaultValue: "Pourquoi demander la date de naissance ?", bundle: .main),
                        text: String(localized: "share.link.create.access.birthday_required.note", defaultValue: "Permet le contrôle d'âge", bundle: .main)
                    ),
                    icon: "calendar",
                    iconColor: MeeshyColors.warningHex,
                    isOn: $requireBirthday
                )
                .disabled(requireAccount)
            }
        }
    }

    // MARK: - Section: Permissions

    private var permissionsSection: some View {
        formSection(title: String(localized: "share.link.create.section.permissions", defaultValue: "Autoriser", bundle: .main), icon: "slider.horizontal.3",
                    subtitle: String(localized: "share.link.create.section.permissions.subtitle", defaultValue: "Ce que les invités anonymes peuvent faire", bundle: .main)) {
            VStack(spacing: 0) {
                ruleRow(
                    String(localized: "share.link.create.permission.send_messages", defaultValue: "Messages", bundle: .main),
                    icon: "bubble.left.fill",
                    iconColor: MeeshyColors.shareAccentHex,
                    isOn: $allowAnonymousMessages
                )
                divider
                ruleRow(
                    String(localized: "share.link.create.permission.send_images", defaultValue: "Images", bundle: .main),
                    icon: "photo.fill",
                    iconColor: MeeshyColors.indigo300Hex,
                    isOn: $allowAnonymousImages
                )
                divider
                ruleRow(
                    String(localized: "share.link.create.permission.send_files", defaultValue: "Fichiers", bundle: .main),
                    icon: "paperclip",
                    iconColor: MeeshyColors.trackingAccentHex,
                    isOn: $allowAnonymousFiles
                )
                divider
                ruleRow(
                    String(localized: "share.link.create.permission.view_history", defaultValue: "Historique", bundle: .main),
                    icon: "clock.fill",
                    iconColor: MeeshyColors.communityAccentHex,
                    isOn: $allowViewHistory
                )
            }
        }
    }

    // MARK: - Section: Limites

    /// « Expire » en crans (24 h · 7 j · 30 j · Jamais, K04) et « Nombre d'entrées » au pas-à-pas du kit (K53) :
    /// planche `Lien-Creer`. Le plafond reste débrayable : un lien sans limite garde son chemin.
    private var limitsSection: some View {
        formSection(title: String(localized: "share.link.create.section.limits", defaultValue: "Limites", bundle: .main), icon: "gauge.with.dots.needle.bottom.50percent",
                    subtitle: String(localized: "share.link.create.section.limits.subtitle", defaultValue: "Nombre d’utilisations et durée du lien", bundle: .main)) {
            VStack(spacing: 0) {
                LinkExpiryPicker(notches: LinkExpiryNotch.shareNotches, selection: expiry, onChange: { expiry = $0 })
                    .padding(MeeshySpacing.mdPlus)
                    .background(rowBackground)
                divider
                MeeshyToggleRow(
                    content: MeeshyToggleRowContent(
                        title: LinkCreationCopy.entries,
                        subtitle: maxUsesEnabled
                            ? nil
                            : String(localized: "share.link.create.unlimited", defaultValue: "Illimité", bundle: .main),
                        accessory: .toggle(isOn: maxUsesEnabled)
                    ),
                    action: { maxUsesEnabled.toggle() },
                    leading: { iconBadge("person.2.fill", color: MeeshyColors.shareAccentHex) },
                    titleAccessory: { MeeshyToggleRowNoSlot() },
                    trailing: { MeeshyToggleRowNoSlot() }
                )
                .background(rowBackground)

                if maxUsesEnabled {
                    divider
                    MeeshyStepper(
                        value: maxUsesValue,
                        range: ShareLinkDraft.entriesRange,
                        label: LinkCreationCopy.entries,
                        spokenValue: String(localized: "share.link.create.max_uses", defaultValue: "^[\(maxUsesValue) utilisation](inflect: true) maximum", bundle: .main),
                        step: draft.entriesStep,
                        decrementLabel: LinkCreationCopy.lessEntries,
                        incrementLabel: LinkCreationCopy.moreEntries,
                        tint: accent,
                        onChange: { maxUsesValue = $0 }
                    )
                    .frame(maxWidth: .infinity)
                    .padding(MeeshySpacing.mdPlus)
                    .background(rowBackground)
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .top)))
                }
            }
        }
    }

    // MARK: - Section: Langues autorisées

    /// « Langues autorisées · Toutes » (planche `Lien-Creer`) : la rangée du kit (K06) dit le choix ; ouverte, la
    /// bascule « Toutes » et les puces des langues (K04). La passerelle accepte la liste à la création.
    private var languagesSection: some View {
        formSection(title: LinkCreationCopy.languages, icon: "character.bubble") {
            VStack(spacing: 0) {
                MeeshyToggleRow(LinkCreationCopy.languages, systemImage: "character.bubble",
                                accessory: .value(languagesSummary), tint: accent,
                                action: { showsLanguages.toggle() })
                    .background(rowBackground)
                if showsLanguages {
                    divider
                    VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                        MeeshyToggleRow(LinkCreationCopy.allLanguages, accessory: .toggle(isOn: languages.isEmpty), tint: accent,
                                        action: { setAllLanguages(!languages.isEmpty) })
                        if !languages.isEmpty {
                            MeeshyChipRow(
                                languageCodes.map { MeeshyChip(id: $0, title: LanguageData.autonym(for: $0)) },
                                selection: Set(languages),
                                label: LinkCreationCopy.languages,
                                mode: .multiple,
                                layout: .wrap,
                                surface: .theme,
                                size: .compact,
                                onChange: { _, code in toggleLanguage(code) }
                            )
                        }
                    }
                    .padding(MeeshySpacing.mdPlus)
                    .background(rowBackground)
                }
            }
        }
    }

    private var languagesSummary: String {
        languages.isEmpty ? LinkCreationCopy.allLanguages : languages.map { LanguageData.autonym(for: $0) }.joined(separator: ", ")
    }

    private var languageCodes: [String] {
        LanguageData.quickTranslationCodes + languages.filter { !LanguageData.quickTranslationCodes.contains($0) }
    }

    private func setAllLanguages(_ all: Bool) {
        var next = draft
        next.setAllLanguages(all, fallback: Locale.current.language.languageCode?.identifier ?? "fr")
        languages = next.languages
    }

    private func toggleLanguage(_ code: String) {
        var next = draft
        next.toggleLanguage(code)
        languages = next.languages
    }

    /// Le brouillon que la feuille compose : il dit ce qui part et ce que le billet montre (#19502).
    private var draft: ShareLinkDraft {
        var draft = ShareLinkDraft()
        draft.conversationId = selectedConversation?.id
        draft.conversationName = selectedConversation?.name
        draft.name = linkName
        draft.description = linkDescription
        draft.slug = customSlug
        draft.expiry = expiry
        draft.limitsEntries = maxUsesEnabled
        draft.maxEntries = maxUsesValue
        draft.acceptsGuests = !requireAccount
        draft.asksNickname = requireNickname
        draft.asksEmail = requireEmail
        draft.asksBirthday = requireBirthday
        draft.allowsMessages = allowAnonymousMessages
        draft.allowsImages = allowAnonymousImages
        draft.allowsFiles = allowAnonymousFiles
        draft.guestsSeeHistory = allowViewHistory
        draft.languages = languages
        return draft
    }

    // MARK: - Bouton créer

    private var createButton: some View {
        VStack(spacing: MeeshySpacing.md) {
            if let error = errorMessage {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(MeeshyColors.error)
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(MeeshyColors.error)
                }
                .padding(.horizontal, MeeshySpacing.xl)
            }

            MeeshySplitActionButton(
                String(localized: "share.link.create.button.create", defaultValue: "Créer et copier le lien", bundle: .main),
                phase: isCreating
                    ? .busy(progress: nil, title: String(localized: "share.link.create.button.creating", defaultValue: "Création en cours…", bundle: .main))
                    : .ready,
                width: .fill,
                isEnabled: draft.canCreate,
                action: create
            )
            .padding(.horizontal, MeeshySpacing.xl)
        }
    }

    // MARK: - Helpers UI

    private var rowBackground: some View {
        MeeshyColors.surfaceFill(isDark: isDark)
    }

    private var divider: some View {
        Divider()
            .background(MeeshyColors.hairline(isDark: isDark))
    }

    private func formSection<Content: View>(
        title: String,
        icon: String,
        subtitle: String? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: icon)
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(accent)
                    .accessibilityHidden(true)
                Text(title.uppercased())
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(theme.textSecondary)
                    .accessibilityAddTraits(.isHeader)
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.top, MeeshySpacing.lg)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(title)
            .accessibilityAddTraits(.isHeader)

            if let subtitle {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(theme.textMuted)
                    .padding(.horizontal, MeeshySpacing.xl)
            }

            content()
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .stroke(MeeshyColors.hairline(isDark: isDark), lineWidth: 1)
                )
                .padding(.horizontal, MeeshySpacing.lg)
        }
    }

    private func formField(_ label: String, placeholder: String, text: Binding<String>, input: MeeshyFieldInput) -> some View {
        LinksFormField(label: label, prompt: placeholder, text: text, input: input)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.md)
            .background(rowBackground)
    }

    /// Une règle du lien : la ligne du kit, l'icône en tête, la bascule au bout.
    /// Une note (i) se pose À CÔTÉ de la ligne, jamais dans son bouton.
    private func ruleRow(
        _ title: String,
        note: MeeshyInfoNote? = nil,
        icon: String,
        iconColor: String,
        isOn: Binding<Bool>
    ) -> some View {
        MeeshyInfoNoted(note: note, openNoteID: $openNoteID, tint: theme.textSecondary) {
            MeeshyToggleRow(
                content: MeeshyToggleRowContent(title: title, accessory: .toggle(isOn: isOn.wrappedValue)),
                action: { isOn.wrappedValue.toggle() },
                leading: { iconBadge(icon, color: iconColor) },
                titleAccessory: { MeeshyToggleRowNoSlot() },
                trailing: { MeeshyToggleRowNoSlot() }
            )
        }
        .padding(.trailing, note == nil ? 0 : MeeshySpacing.mdPlus)
        .background(rowBackground)
    }

    private func iconBadge(_ icon: String, color: String) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: MeeshyRadius.xs)
                .fill(Color(hex: color).opacity(MeeshyOpacity.light))
                .frame(width: MeeshyControlSize.compact, height: MeeshyControlSize.compact)
            Image(systemName: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color(hex: color))
        }
        .accessibilityHidden(true)
    }

    private func conversationTypeIcon(_ type: Conversation.ConversationType) -> some View {
        let (icon, color): (String, String) = switch type {
        case .group:     ("person.3.fill", MeeshyColors.shareAccentHex)
        case .community: ("person.3.sequence.fill", MeeshyColors.communityAccentHex)
        case .channel:   ("megaphone.fill", MeeshyColors.trackingAccentHex)
        case .public:    ("globe", MeeshyColors.indigo300Hex)
        case .broadcast:  ("megaphone.fill", MeeshyColors.trackingAccentHex)
        default:         ("bubble.left.and.bubble.right.fill", MeeshyColors.shareAccentHex)
        }
        return iconBadge(icon, color: color)
    }

    // MARK: - Action

    private func create() {
        guard let req = draft.request(now: Date()) else { return }
        isCreating = true
        errorMessage = nil

        Task {
            do {
                let created = try await ShareLinkService.shared.createShareLink(request: req)
                await MainActor.run {
                    HapticFeedback.success()
                    LinksClipboard.copy(created.joinUrl, message: LinkCreationCopy.copied)
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

// MARK: - Conversation Picker Sheet

private struct ConversationPickerSheet: View {
    let conversations: [Conversation]
    @Binding var selected: Conversation?
    @Binding var isPresented: Bool

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @State private var search: String = ""

    private var filtered: [Conversation] {
        guard !search.isEmpty else { return conversations }
        return conversations.filter { $0.name.localizedCaseInsensitiveContains(search) }
    }

    private var grouped: [(label: String, items: [Conversation])] {
        let groups: [(label: String, types: [Conversation.ConversationType])] = [
            (String(localized: "share.link.create.picker.section.groups", defaultValue: "Groupes", bundle: .main), [.group]),
            (String(localized: "share.link.create.picker.section.communities", defaultValue: "Communautés", bundle: .main), [.community]),
            (String(localized: "share.link.create.picker.section.channels_public", defaultValue: "Canaux & Public", bundle: .main), [.channel, .public, .global]),
        ]
        let base = filtered   // UN filtre de recherche par rendu, pas un par section
        return groups.compactMap { g in
            let items = base.filter { g.types.contains($0.type) }
            return items.isEmpty ? nil : (label: g.label, items: items)
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()
                List {
                    ForEach(grouped, id: \.label) { section in
                        Section(section.label) {
                            ForEach(section.items) { conv in
                                Button {
                                    selected = conv
                                    isPresented = false
                                } label: {
                                    HStack(spacing: MeeshySpacing.md) {
                                        Text(conv.name)
                                            .foregroundStyle(theme.textPrimary)
                                        Spacer()
                                        if selected?.id == conv.id {
                                            // Selection is conveyed to VoiceOver by the
                                            // `.isSelected` trait below; the glyph is decorative.
                                            Image(systemName: "checkmark.circle.fill")
                                                .foregroundColor(MeeshyColors.shareAccent)
                                                .accessibilityHidden(true)
                                        }
                                    }
                                }
                                .accessibilityElement(children: .combine)
                                .accessibilityAddTraits(selected?.id == conv.id ? .isSelected : [])
                            }
                        }
                    }
                    if filtered.isEmpty {
                        AdaptiveContentUnavailableView(
                            String(localized: "share.link.create.picker.empty.title", defaultValue: "Aucun groupe : créez-en un pour partager un lien.", bundle: .main),
                            systemImage: "bubble.left.and.bubble.right"
                        )
                    }
                }
                .scrollContentBackground(.hidden)
                .searchable(text: $search, prompt: String(localized: "share.link.create.picker.search", defaultValue: "Rechercher un groupe…", bundle: .main))
            }
            .navigationTitle(String(localized: "share.link.create.picker.title", defaultValue: "Choisir une conversation", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) { isPresented = false }
                        .foregroundColor(MeeshyColors.shareAccent)
                }
            }
        }
    }
}

// MARK: - ConversationType display helper

private extension MeeshyConversation.ConversationType {
    var displayLabel: String {
        switch self {
        case .direct:    String(localized: "conversationType.direct", defaultValue: "Message direct", bundle: .main)
        case .group:     String(localized: "conversationType.group", defaultValue: "Groupe", bundle: .main)
        case .public:    String(localized: "conversationType.public", defaultValue: "Public", bundle: .main)
        case .global:    String(localized: "conversationType.global", defaultValue: "Globale", bundle: .main)
        case .community: String(localized: "conversationType.community", defaultValue: "Communauté", bundle: .main)
        case .channel:   String(localized: "conversationType.channel", defaultValue: "Canal", bundle: .main)
        case .bot:       String(localized: "conversationType.bot", defaultValue: "Bot", bundle: .main)
        case .broadcast: String(localized: "conversationType.broadcast", defaultValue: "Communication", bundle: .main)
        }
    }
}

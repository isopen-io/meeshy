import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le formulaire d'édition d'un lien (#7797). Il couvre TOUS les champs que
/// `PATCH /links/:linkId` accepte et que la carte « Configuration » montre :
/// nom interne, message d'invitation, expiration, utilisations max, personnes
/// en même temps, conditions d'entrée, langues autorisées, droits des invités.
///
/// Il n'écrit que le BROUILLON ; « Enregistrer » le confie au ViewModel, qui
/// l'applique d'abord à l'écran puis au serveur.
struct ShareLinkEditForm: View {
    @Binding var draft: ShareLinkSettings
    let isActive: Bool
    let canSave: Bool
    let isSaving: Bool
    let isDark: Bool
    let onSave: () -> Void
    let onToggleActive: () -> Void
    let onDelete: () -> Void

    private static let languageChoices = LanguageData.quickTranslationCodes

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            Text(ShareLinkDetailCopy.editTitle)
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .heavy, design: .rounded))
                .foregroundStyle(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                .accessibilityAddTraits(.isHeader)

            group {
                LinksFormField(label: ShareLinkDetailCopy.nameField, prompt: nil, text: $draft.name)
                LinksFormField(label: ShareLinkDetailCopy.messageField, prompt: nil, text: $draft.description, input: .paragraph)
            }

            sectionTitle(ShareLinkDetailCopy.limits)
            group {
                toggleRow(ShareLinkDetailCopy.expiration, isOn: hasExpiry)
                if let expiresAt = draft.expiresAt {
                    DatePicker(
                        ShareLinkDetailCopy.expires,
                        selection: Binding(get: { expiresAt }, set: { draft.expiresAt = $0 }),
                        in: Date()...,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                }
                limitField(ShareLinkDetailCopy.maxUsesField, value: $draft.maxUses)
                limitField(ShareLinkDetailCopy.maxConcurrentField, value: $draft.maxConcurrentUsers)
                if !draft.isValid {
                    Text(ShareLinkDetailCopy.invalidLimits)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundStyle(MeeshyColors.errorStrong)
                }
            }

            sectionTitle(ShareLinkDetailCopy.entryConditions)
            group {
                toggleRow(ShareLinkDetailCopy.requireAccount, isOn: $draft.requireAccount)
                toggleRow(ShareLinkDetailCopy.requireNickname, isOn: $draft.requireNickname)
                toggleRow(ShareLinkDetailCopy.requireEmail, isOn: $draft.requireEmail)
                toggleRow(ShareLinkDetailCopy.requireBirthday, isOn: $draft.requireBirthday)
            }

            sectionTitle(ShareLinkDetailCopy.allowedLanguages)
            group {
                toggleRow(ShareLinkDetailCopy.allLanguages, isOn: allLanguages)
                if !draft.allowedLanguages.isEmpty {
                    languageChips
                }
            }

            sectionTitle(ShareLinkDetailCopy.guestRights)
            group {
                toggleRow(InviteLandingCopy.rightMessages, isOn: $draft.guestRights.messages)
                toggleRow(ShareLinkDetailCopy.historyRight, isOn: $draft.guestRights.history)
                toggleRow(InviteLandingCopy.rightImages, isOn: $draft.guestRights.images)
                toggleRow(InviteLandingCopy.rightFiles, isOn: $draft.guestRights.files)
            }

            actions
        }
        .tint(MeeshyColors.indigo500)
    }

    // MARK: - Bindings

    private var hasExpiry: Binding<Bool> {
        Binding(
            get: { draft.expiresAt != nil },
            set: { draft.expiresAt = $0 ? (draft.expiresAt ?? Date().addingTimeInterval(7 * 86_400)) : nil }
        )
    }

    /// « Toutes » = liste vide côté serveur. La décocher sans rien choisir
    /// voudrait encore dire « toutes » : on présélectionne donc la langue de
    /// l'interface, pour que la restriction soit visible dès qu'on la demande.
    private var allLanguages: Binding<Bool> {
        Binding(
            get: { draft.allowedLanguages.isEmpty },
            set: { all in
                draft.allowedLanguages = all ? [] : [Locale.current.language.languageCode?.identifier ?? "fr"]
            }
        )
    }

    private var languageCodes: [String] {
        Self.languageChoices + draft.allowedLanguages.filter { !Self.languageChoices.contains($0) }
    }

    private var languageChips: some View {
        MeeshyChipRow(
            languageCodes.map { MeeshyChip(id: $0, title: LanguageData.autonym(for: $0)) },
            selection: Set(draft.allowedLanguages),
            label: ShareLinkDetailCopy.allowedLanguages,
            mode: .multiple,
            layout: .wrap,
            surface: .theme,
            onChange: { _, code in toggleLanguage(code) }
        )
    }

    /// La dernière langue ne se retire pas : une liste vide voudrait dire
    /// « toutes », l'inverse de ce que la personne est en train de restreindre.
    private func toggleLanguage(_ code: String) {
        guard draft.allowedLanguages.contains(code) else {
            draft.allowedLanguages.append(code)
            return
        }
        guard draft.allowedLanguages.count > 1 else { return }
        draft.allowedLanguages.removeAll { $0 == code }
    }

    // MARK: - Pieces

    private func group<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) { content() }
            .font(MeeshyFont.relative(MeeshyFont.bodySize))
            .foregroundStyle(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(MeeshySpacing.lg)
            .inviteCardSurface(isDark: isDark)
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .heavy))
            .scriptSafeTracking(1.1)
            .textCase(.uppercase)
            .foregroundStyle(isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo600)
            .padding(.top, MeeshySpacing.sm)
            .accessibilityAddTraits(.isHeader)
    }

    /// Une bascule du formulaire : la ligne du kit, qui se touche tout entière.
    private func toggleRow(_ title: String, isOn: Binding<Bool>) -> some View {
        MeeshyToggleRow(title, accessory: .toggle(isOn: isOn.wrappedValue)) {
            isOn.wrappedValue.toggle()
        }
        .padding(.horizontal, -MeeshySpacing.lg)
    }

    /// Un champ numérique où VIDE veut dire « illimité » — la valeur que la
    /// passerelle reçoit alors en `null` explicite.
    private func limitField(_ label: String, value: Binding<Int?>) -> some View {
        LinksFormField(
            label: label,
            prompt: ShareLinkDetailCopy.unlimited,
            text: Binding(
                get: { value.wrappedValue.map(String.init) ?? "" },
                set: { value.wrappedValue = Int($0.filter(\.isNumber)) }
            ),
            input: .numeric
        )
    }

    private var actions: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            MeeshySplitActionButton(
                ShareLinkDetailCopy.save,
                phase: isSaving ? .busy(progress: nil, title: ShareLinkDetailCopy.save) : .ready,
                width: .fill,
                isEnabled: canSave,
                action: onSave
            )
            .accessibilityIdentifier("share-link-save")

            HStack(spacing: MeeshySpacing.smPlus) {
                secondaryButton(isActive ? ShareLinkDetailCopy.disable : ShareLinkDetailCopy.activate,
                                color: isActive ? MeeshyColors.warning : MeeshyColors.successDeep,
                                action: onToggleActive)
                secondaryButton(ShareLinkDetailCopy.delete, color: MeeshyColors.errorStrong, action: onDelete)
            }
        }
        .padding(.top, MeeshySpacing.sm)
    }

    private func secondaryButton(_ title: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                .foregroundStyle(color)
                .frame(maxWidth: .infinity, minHeight: 48)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                        .stroke(color.opacity(0.6), lineWidth: MeeshyBorder.emphasis)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

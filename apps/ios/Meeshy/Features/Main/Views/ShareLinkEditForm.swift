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
                .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                .accessibilityAddTraits(.isHeader)

            group {
                labeledField(ShareLinkDetailCopy.nameField) {
                    TextField("", text: $draft.name)
                        .textInputAutocapitalization(.sentences)
                        .accessibilityLabel(ShareLinkDetailCopy.nameField)
                }
                labeledField(ShareLinkDetailCopy.messageField) {
                    TextField("", text: $draft.description, axis: .vertical)
                        .lineLimit(2...6)
                        .accessibilityLabel(ShareLinkDetailCopy.messageField)
                }
            }

            sectionTitle(ShareLinkDetailCopy.limits)
            group {
                Toggle(ShareLinkDetailCopy.expiration, isOn: hasExpiry)
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
                        .foregroundColor(MeeshyColors.errorStrong)
                }
            }

            sectionTitle(ShareLinkDetailCopy.entryConditions)
            group {
                Toggle(ShareLinkDetailCopy.requireAccount, isOn: $draft.requireAccount)
                Toggle(ShareLinkDetailCopy.requireNickname, isOn: $draft.requireNickname)
                Toggle(ShareLinkDetailCopy.requireEmail, isOn: $draft.requireEmail)
                Toggle(ShareLinkDetailCopy.requireBirthday, isOn: $draft.requireBirthday)
            }

            sectionTitle(ShareLinkDetailCopy.allowedLanguages)
            group {
                Toggle(ShareLinkDetailCopy.allLanguages, isOn: allLanguages)
                if !draft.allowedLanguages.isEmpty {
                    languageChips
                }
            }

            sectionTitle(ShareLinkDetailCopy.guestRights)
            group {
                Toggle(InviteLandingCopy.rightMessages, isOn: $draft.guestRights.messages)
                Toggle(ShareLinkDetailCopy.historyRight, isOn: $draft.guestRights.history)
                Toggle(InviteLandingCopy.rightImages, isOn: $draft.guestRights.images)
                Toggle(InviteLandingCopy.rightFiles, isOn: $draft.guestRights.files)
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
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: MeeshySpacing.sm)], alignment: .leading, spacing: MeeshySpacing.sm) {
            ForEach(languageCodes, id: \.self) { code in
                let selected = draft.allowedLanguages.contains(code)
                Button {
                    toggleLanguage(code)
                } label: {
                    Text(verbatim: LanguageData.autonym(for: code))
                        .font(MeeshyFont.relative(14, weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .foregroundColor(selected ? .white : (isDark ? MeeshyColors.indigo100 : MeeshyColors.indigo900))
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background(Capsule().fill(selected ? MeeshyColors.indigo500 : (isDark ? MeeshyColors.indigo900.opacity(0.6) : MeeshyColors.indigo50)))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
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
            .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(MeeshySpacing.lg)
            .inviteCardSurface(isDark: isDark)
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .heavy))
            .kerning(1.1)
            .textCase(.uppercase)
            .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo600)
            .padding(.top, MeeshySpacing.sm)
            .accessibilityAddTraits(.isHeader)
    }

    private func labeledField<Field: View>(_ label: String, @ViewBuilder field: () -> Field) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral500)
                .accessibilityHidden(true)
            field()
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                        .fill(isDark ? MeeshyColors.indigo900.opacity(0.55) : MeeshyColors.indigo50)
                )
        }
    }

    /// Un champ numérique où VIDE veut dire « illimité » — la valeur que la
    /// passerelle reçoit alors en `null` explicite.
    private func limitField(_ label: String, value: Binding<Int?>) -> some View {
        HStack {
            Text(label)
            Spacer(minLength: MeeshySpacing.md)
            TextField(
                ShareLinkDetailCopy.unlimited,
                text: Binding(
                    get: { value.wrappedValue.map(String.init) ?? "" },
                    set: { value.wrappedValue = Int($0.filter(\.isNumber)) }
                )
            )
            .keyboardType(.numberPad)
            .multilineTextAlignment(.trailing)
            .frame(maxWidth: 120)
            .accessibilityLabel(label)
        }
    }

    private var actions: some View {
        VStack(spacing: 10) {
            Button(action: onSave) {
                ZStack {
                    Text(ShareLinkDetailCopy.save).opacity(isSaving ? 0 : 1)
                    if isSaving { ProgressView().tint(.white) }
                }
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .heavy))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity, minHeight: 54)
                .background(
                    LinearGradient(colors: [MeeshyColors.indigo500, MeeshyColors.purple600], startPoint: .topLeading, endPoint: .bottomTrailing)
                )
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .opacity(canSave || isSaving ? 1 : 0.45)
            }
            .buttonStyle(.plain)
            .disabled(!canSave)
            .accessibilityIdentifier("share-link-save")

            HStack(spacing: 10) {
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
                .foregroundColor(color)
                .frame(maxWidth: .infinity, minHeight: 48)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                        .stroke(color.opacity(0.6), lineWidth: 1.5)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

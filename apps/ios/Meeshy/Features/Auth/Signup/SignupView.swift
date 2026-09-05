import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// L'inscription, en UN écran.
///
/// Elle remplace un assistant de huit étapes (#5218). Ce qui a disparu n'est pas
/// du confort mais du COÛT : trois vérifications réseau à une seconde de
/// temporisation chacune, un pseudo à inventer, un nom à découper en deux, une
/// confirmation de mot de passe, une case à cocher, et une pause d'une seconde
/// après le succès. Rien de tout cela n'était exigé par la passerelle — elle
/// dérive pseudo, prénom et nom du seul nom affiché.
///
/// **Aucune attente ne précède la saisie ni ne la suit** : pas d'`asyncAfter`,
/// pas de `debounce`, pas de délai d'auto-focus. Le bouton s'active dès que les
/// trois champs requis sont valides, localement.
struct SignupView: View {
    // Aucun `@EnvironmentObject` : l'écran ne lit pas `AuthManager`. Il passe
    // par `SignupRegistering`, ce qui est précisément ce qui rend sa suite
    // exécutable — et un objet d'environnement non lu impose quand même sa
    // présence à tous les hôtes (SwiftUI le résout au montage).
    @StateObject private var viewModel = SignupViewModel()
    @StateObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    /// Appelé dès que la session est appliquée — sans pause.
    var onComplete: (() -> Void)?
    /// Ramène à la connexion, depuis le pied de page ou depuis un refus
    /// « adresse déjà utilisée ».
    var onSwitchToLogin: (() -> Void)?

    @FocusState private var focusedField: SignupField?
    @State private var isShowingLanguageSheet = false
    @State private var isShowingCountryPicker = false
    @State private var isShowingTerms = false
    @State private var isShowingPrivacy = false

    var body: some View {
        ZStack {
            theme.backgroundGradient
                .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                    header
                    displayNameField
                    emailField
                    phoneField
                    passwordField
                    languageChip
                    submitSection
                    switchToLoginRow
                }
                .padding(.horizontal, MeeshySpacing.xl)
                .padding(.top, MeeshySpacing.xxl)
                .padding(.bottom, MeeshySpacing.xxxl)
                .iPadFormWidth()
            }
            // Le clavier suit le doigt et remonte si on relâche avant la fin —
            // le mécanisme système, jamais un `DragGesture.onEnded` maison
            // (directive porteur 2026-08-30).
            .scrollDismissesKeyboard(.interactively)
        }
        .safeAreaInset(edge: .top) { closeBar }
        .sheet(isPresented: $isShowingLanguageSheet) { languageSheet }
        .sheet(isPresented: $isShowingTerms) { TermsOfServiceView() }
        .sheet(isPresented: $isShowingPrivacy) { PrivacyPolicyView() }
    }

    // MARK: - Chrome

    private var closeBar: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .meeshyTapTarget()
            }
            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.top, MeeshySpacing.sm)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "auth.signup.title", defaultValue: "Créer votre compte", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.titleSize + 4, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Text(String(localized: "auth.signup.subtitle", defaultValue: "Vous lirez tout le monde dans votre langue.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.bodySize))
                .foregroundColor(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Nom affiché

    private var displayNameField: some View {
        fieldBlock(
            field: .displayName,
            label: String(localized: "auth.signup.name.label", defaultValue: "Nom affiché", bundle: .main)
        ) {
            TextField(
                String(localized: "auth.signup.name.placeholder", defaultValue: "Comment vous appeler ?", bundle: .main),
                text: $viewModel.form.displayName
            )
            .textContentType(.name)
            .textInputAutocapitalization(.words)
            .autocorrectionDisabled()
            .submitLabel(.next)
            .focused($focusedField, equals: .displayName)
            .onSubmit { focusedField = .email }
            .foregroundColor(theme.textPrimary)
        }
    }

    // MARK: - E-mail

    private var emailField: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            fieldBlock(
                field: .email,
                label: String(localized: "auth.signup.email.label", defaultValue: "Adresse e-mail", bundle: .main)
            ) {
                // `.emailAddress` fait aussi office d'IDENTIFIANT pour le
                // trousseau : Apple accepte `.username` OU `.emailAddress` comme
                // champ de compte associé à un `.newPassword`. Il n'y a plus de
                // pseudo à saisir — l'adresse EST l'identifiant de connexion.
                TextField(
                    String(localized: "auth.signup.email.placeholder", defaultValue: "vous@exemple.com", bundle: .main),
                    text: $viewModel.form.email
                )
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.next)
                .focused($focusedField, equals: .email)
                .onSubmit { focusedField = .phoneNumber }
                .foregroundColor(theme.textPrimary)
            }

            if viewModel.emailAlreadyRegistered {
                Button {
                    HapticFeedback.light()
                    onSwitchToLogin?()
                } label: {
                    Text(String(localized: "auth.signup.email.signIn", defaultValue: "Se connecter", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundColor(MeeshyColors.indigo500)
                        .frame(minHeight: 44)
                }
                .accessibilityHint(String(localized: "auth.signup.email.signIn.hint", defaultValue: "Ouvre l'écran de connexion", bundle: .main))
            }
        }
    }

    // MARK: - Téléphone
    //
    // Jamais annoncé « facultatif », jamais d'astérisque : le laisser vide est
    // le chemin nominal, et le NOMMER facultatif fait croire qu'il y a une
    // décision à prendre. Vide ⇒ absent de la charge (`SignupForm`).

    private var phoneField: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(String(localized: "auth.signup.phone.label", defaultValue: "Téléphone", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(theme.textMuted)

            HStack(spacing: MeeshySpacing.sm) {
                Button {
                    HapticFeedback.light()
                    isShowingCountryPicker = true
                } label: {
                    HStack(spacing: MeeshySpacing.xs) {
                        Text(viewModel.form.country.flag)
                        Text(viewModel.form.country.dialCode)
                            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                        Image(systemName: "chevron.down")
                            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                            .foregroundColor(theme.textMuted)
                            .accessibilityHidden(true)
                    }
                    .padding(.horizontal, MeeshySpacing.md)
                    .frame(minHeight: 48)
                    .background(inputSurface(isFocused: false))
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(CountryPicker.accessibilityLabel(for: viewModel.form.country))
                .accessibilityHint(String(localized: "auth.signup.phone.country.hint", defaultValue: "Changer de pays", bundle: .main))

                TextField(
                    String(localized: "auth.signup.phone.placeholder", defaultValue: "Numéro de téléphone", bundle: .main),
                    text: $viewModel.form.phoneDigits
                )
                .textContentType(.telephoneNumber)
                .keyboardType(.phonePad)
                .focused($focusedField, equals: .phoneNumber)
                .foregroundColor(theme.textPrimary)
                .padding(.horizontal, MeeshySpacing.lg)
                .frame(minHeight: 48)
                .background(inputSurface(isFocused: focusedField == .phoneNumber))
                .accessibilityLabel(String(localized: "auth.signup.phone.label", defaultValue: "Téléphone", bundle: .main))
            }

            errorRow(for: .phoneNumber)
        }
        .sheet(isPresented: $isShowingCountryPicker) {
            SignupCountrySheet(selection: $viewModel.form.country)
        }
    }

    // MARK: - Mot de passe
    //
    // UNE saisie. La confirmation ne protège de rien qu'un champ révélable ne
    // protège mieux : elle double la frappe et double les fautes.
    //
    // `.passwordRules(UITextInputPasswordRules(…))` n'est PAS posée : aucun site
    // du dépôt n'emploie cette API et la cible est iOS 16. La règle vit dans
    // `SignupForm.passwordMinLength`, seule source du minimum.

    private var passwordField: some View {
        fieldBlock(
            field: .password,
            label: String(localized: "auth.signup.password.label", defaultValue: "Mot de passe", bundle: .main)
        ) {
            SecureField(
                String(localized: "auth.signup.password.placeholder", defaultValue: "6 caractères minimum", bundle: .main),
                text: $viewModel.form.password
            )
            .textContentType(.newPassword)
            .submitLabel(.go)
            .focused($focusedField, equals: .password)
            .onSubmit { attemptSubmit() }
            .foregroundColor(theme.textPrimary)
        }
    }

    // MARK: - Pastille de langue

    private var languageChip: some View {
        Button {
            HapticFeedback.light()
            isShowingLanguageSheet = true
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                Text(viewModel.form.systemLanguageFlag)
                    .accessibilityHidden(true)
                Text(languageChipTitle)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                    .foregroundColor(theme.textSecondary)
                Text(String(localized: "auth.signup.language.change", defaultValue: "Changer", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo500)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .frame(minHeight: 48)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(theme.inputBackground)
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(languageChipTitle)
        .accessibilityHint(String(localized: "auth.signup.language.hint", defaultValue: "Changer la langue de lecture", bundle: .main))
        .accessibilityAddTraits(.isSelected)
    }

    private var languageChipTitle: String {
        String(
            format: String(localized: "auth.signup.language.chip", defaultValue: "Vous lirez Meeshy en %@", bundle: .main),
            viewModel.form.systemLanguageNativeName
        )
    }

    private var languageSheet: some View {
        NavigationStack {
            ScrollView {
                LanguageSelector(
                    title: String(localized: "auth.signup.language.selector", defaultValue: "Langue de lecture", bundle: .main),
                    selectedId: $viewModel.form.systemLanguage
                )
                .padding(MeeshySpacing.xl)
            }
            .background(theme.backgroundSecondary.ignoresSafeArea())
            .navigationTitle(String(localized: "auth.signup.language.selector", defaultValue: "Langue de lecture", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done", defaultValue: "Terminé", bundle: .main)) {
                        isShowingLanguageSheet = false
                    }
                }
            }
        }
    }

    // MARK: - Envoi

    private var submitSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            if let banner = viewModel.bannerError {
                HStack(alignment: .top, spacing: MeeshySpacing.sm) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(MeeshyColors.error)
                        .accessibilityHidden(true)
                    Text(banner)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                        .foregroundColor(MeeshyColors.error)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(MeeshySpacing.md)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(MeeshyColors.error.opacity(0.12))
                )
                .accessibilityElement(children: .combine)
            }

            Button(action: attemptSubmit) {
                ZStack {
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .fill(MeeshyColors.brandGradient)
                        .frame(minHeight: 52)

                    if viewModel.isSubmitting {
                        ProgressView().tint(.white)
                    } else {
                        Text(submitTitle)
                            .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
            }
            .disabled(!viewModel.canSubmit)
            .opacity(viewModel.canSubmit ? 1 : 0.6)
            .bounceOnTap()
            .accessibilityLabel(submitTitle)
            .accessibilityValue(viewModel.isSubmitting
                                ? String(localized: "auth.signup.submit.inProgress", defaultValue: "Création en cours", bundle: .main)
                                : "")

            legalNotice
        }
    }

    private var submitTitle: String {
        String(localized: "auth.signup.submit", defaultValue: "Créer mon compte", bundle: .main)
    }

    private var legalNotice: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(String(localized: "auth.signup.legal", defaultValue: "En continuant, vous acceptez les conditions d'utilisation et la politique de confidentialité.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                .foregroundColor(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: MeeshySpacing.lg) {
                Button {
                    isShowingTerms = true
                } label: {
                    Text(String(localized: "settings.terms", defaultValue: "Conditions d'utilisation", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundColor(MeeshyColors.indigo500)
                        .frame(minHeight: 44)
                }
                Button {
                    isShowingPrivacy = true
                } label: {
                    Text(String(localized: "settings.privacy_policy", defaultValue: "Politique de confidentialité", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundColor(MeeshyColors.indigo500)
                        .frame(minHeight: 44)
                }
            }
        }
    }

    private var switchToLoginRow: some View {
        Button {
            HapticFeedback.light()
            onSwitchToLogin?()
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Text(String(localized: "auth.signup.haveAccount", defaultValue: "Déjà un compte ?", bundle: .main))
                    .foregroundColor(theme.textMuted)
                Text(String(localized: "auth.signup.signIn", defaultValue: "Se connecter", bundle: .main))
                    .foregroundColor(MeeshyColors.indigo500)
            }
            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .accessibilityLabel(String(localized: "auth.signup.signIn", defaultValue: "Se connecter", bundle: .main))
    }

    // MARK: - Action

    private func attemptSubmit() {
        guard viewModel.canSubmit else { return }
        focusedField = nil
        Task {
            let created = await viewModel.submit()
            if created {
                HapticFeedback.success()
                // IMMÉDIATEMENT : le wizard remplacé s'accordait une seconde de
                // félicitations avant de laisser entrer. Une pause posée sur un
                // succès est une lenteur, donc un bug (CLAUDE.md § roadmap).
                onComplete?()
                dismiss()
            } else {
                HapticFeedback.error()
            }
        }
    }

    // MARK: - Composition d'un champ

    private func fieldBlock<Content: View>(
        field: SignupField,
        label: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(theme.textMuted)

            content()
                .padding(.horizontal, MeeshySpacing.lg)
                .frame(minHeight: 48)
                .background(inputSurface(isFocused: focusedField == field))
                .accessibilityLabel(label)

            errorRow(for: field)
        }
    }

    /// Le refus se pose SOUS son champ, en `.footnote`, et VoiceOver le lit
    /// comme un texte à part entière — un message d'erreur muet ne corrige rien.
    @ViewBuilder
    private func errorRow(for field: SignupField) -> some View {
        if let message = viewModel.error(for: field) {
            Text(message)
                .font(.footnote)
                .foregroundColor(MeeshyColors.error)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel(message)
        }
    }

    private func inputSurface(isFocused: Bool) -> some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.md)
            .fill(theme.inputBackground)
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .stroke(
                        isFocused ? MeeshyColors.indigo500.opacity(0.6) : theme.inputBorder.opacity(0.3),
                        lineWidth: 1
                    )
            )
    }
}

// MARK: - Sélecteur de pays

/// La feuille de choix du pays.
///
/// `CountryPicker` (SDK) est un COUPLE bouton + champ : il porte sa propre
/// saisie de numéro, que cet écran a déjà. Seule sa LISTE est réutilisable, et
/// c'est elle — `CountryPicker.countries`, 242 indicatifs, priorité incluse — que
/// la feuille présente.
struct SignupCountrySheet: View {
    @Binding var selection: CountryCode
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    private var filtered: [CountryCode] {
        guard !searchText.isEmpty else { return CountryPicker.countries }
        let needle = searchText.lowercased()
        return CountryPicker.countries.filter {
            $0.name.lowercased().contains(needle)
                || $0.dialCode.contains(needle)
                || $0.id.lowercased().contains(needle)
        }
    }

    var body: some View {
        NavigationStack {
            List(filtered) { country in
                Button {
                    selection = country
                    dismiss()
                } label: {
                    HStack {
                        Text(country.flag)
                        Text(country.name)
                            .foregroundStyle(.primary)
                        Spacer()
                        Text(country.dialCode)
                            .foregroundStyle(.secondary)
                    }
                    .frame(minHeight: 44)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(CountryPicker.accessibilityLabel(for: country))
                .accessibilityAddTraits(country.id == selection.id ? [.isSelected] : [])
            }
            .searchable(
                text: $searchText,
                prompt: String(localized: "auth.signup.phone.country.search", defaultValue: "Rechercher un pays", bundle: .main)
            )
            .navigationTitle(String(localized: "auth.signup.phone.country.title", defaultValue: "Pays", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) { dismiss() }
                }
            }
        }
    }
}

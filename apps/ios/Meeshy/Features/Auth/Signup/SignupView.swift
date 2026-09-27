import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// L'inscription, en phases vivantes (#8288).
///
/// Elle remplace un assistant de huit étapes (#5218), puis un écran d'un seul
/// tenant ; la directive porteur du 2026-09-27 la réagence en quatre temps :
///
/// 1. le téléphone, dans un verre liquide qui ondule à la frappe
///    (`SignupView+Phone.swift`), et « Continuer avec l'e-mail seulement » ;
/// 2. l'adresse ;
/// 3. la carte d'identité en verre : nom affiché et @pseudo pré-dérivés et
///    modifiables, refus, « Valider mon compte maintenant »
///    (`SignupView+Card.swift`) ;
/// 4. le code à 6 chiffres DANS la carte ; le code juste — ou le lien ouvert —
///    lance le feu d'artifice, et « S'inscrire » devient « Parler aux autres ».
///
/// La loi des phases est `SignupPhases` ; aucune seconde machine : l'inscription
/// (`SignupRegistering`), le code (`EmailVerificationViewModel`), « Est-ce vous ? »,
/// le feu d'artifice (`ArrivalFireworksCanvas`) et l'onboarding existent déjà.
///
/// **Aucune attente ne précède la saisie ni ne la suit** : pas d'`asyncAfter`,
/// pas de `debounce`, pas de délai d'auto-focus.
struct SignupView: View {
    // Aucun `@EnvironmentObject` : l'écran ne lit pas `AuthManager` (il n'en
    // INJECTE un qu'à la feuille du lien de connexion, qui le déclare). Il passe
    // par `SignupRegistering`, ce qui est précisément ce qui rend sa suite
    // exécutable.
    @StateObject var viewModel = SignupViewModel()
    @StateObject var theme = ThemeManager.shared
    @Environment(\.dismiss) var dismiss
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion

    /// Appelé dès que la session est appliquée — sans pause.
    var onComplete: (() -> Void)?
    /// Ramène à la connexion depuis le pied de page, avec l'adresse déjà tapée
    /// quand elle est complète (#8216) — l'hôte la préremplit.
    var onSwitchToLogin: ((_ email: String?) -> Void)?
    /// Une session TENUE est à ouvrir (#8059, #8288) — la carte l'a validée, ou
    /// « S'inscrire » entre sans code. L'hôte referme l'inscription et ouvre la
    /// session dans SON `onDismiss` : l'ouvrir plus tôt démonte l'écran qui
    /// présente l'inscription et la laisse orpheline. `nil` ⇒ ouverte aussitôt.
    var onVerified: ((@escaping ProvenSessionOpener) -> Void)?

    @FocusState var focusedField: SignupField?
    @State var isShowingLanguageSheet = false
    @State var isShowingCountryPicker = false
    /// Le champ dont le (i) est DÉPLIÉ — un seul à la fois (#6441).
    @State var expandedHint: SignupField?
    @State var isPasswordWhyExpanded = false
    @State var isPasswordRevealed = false
    @State var isShowingTerms = false
    @State var isShowingPrivacy = false
    @State var isShowingForgotPassword = false
    @State var provenSessionOpener: ProvenSessionOpener?
    /// L'instant où la carte a validé le compte — l'horloge du feu d'artifice.
    @State var celebrationStart = Date()

    /// Les états de l'écran sont `internal` pour ses extensions de phase
    /// (`SignupView+Phone.swift`, `SignupView+Card.swift`) : l'initialiseur est
    /// écrit à la main pour que les hôtes n'en voient que les trois rappels.
    init(
        onComplete: (() -> Void)? = nil,
        onSwitchToLogin: ((_ email: String?) -> Void)? = nil,
        onVerified: ((@escaping ProvenSessionOpener) -> Void)? = nil
    ) {
        self.onComplete = onComplete
        self.onSwitchToLogin = onSwitchToLogin
        self.onVerified = onVerified
    }

    var reducesMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userForcedReduceMotion)
    }

    /// Une phase qui paraît : un ressort vif, ou un fondu sous « Réduire les
    /// animations ».
    private var phaseAnimation: Animation {
        reducesMotion ? .easeOut(duration: 0.2) : .spring(response: 0.42, dampingFraction: 0.8)
    }

    private var phaseTransition: AnyTransition {
        reducesMotion ? .opacity : .opacity.combined(with: .move(edge: .bottom)).combined(with: .scale(scale: 0.97))
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient
                .ignoresSafeArea()

            // La croix vit dans SA zone (#8080) : empilée au-dessus du
            // défilement, jamais en inset sans fond sous lequel le formulaire
            // glissait.
            VStack(spacing: 0) {
                closeBar
                ScrollView {
                    VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                        header
                        phoneField
                        if viewModel.progress.emailShown {
                            emailField
                                .transition(phaseTransition)
                        }
                        if viewModel.progress.cardShown {
                            identityCard
                                .transition(phaseTransition)
                            if case .editing = viewModel.card {
                                languageChip
                            }
                        }
                        submitSection
                        switchToLoginRow
                    }
                    .animation(phaseAnimation, value: viewModel.progress)
                    .animation(phaseAnimation, value: viewModel.phase)
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
        }
        // Le mot de passe paraît quand l'identité est DÉFINIE (#7897) et ne se
        // referme plus : corriger son adresse ne fait pas disparaître ce
        // qu'on y a tapé.
        .adaptiveOnChange(of: viewModel.form.isIdentityDefined, initial: true) { _, defini in
            guard defini, !isPasswordRevealed else { return }
            withAnimation(phaseAnimation) { isPasswordRevealed = true }
        }
        // LE COMPTE VALIDÉ (#8288) — le code juste ou le lien ouvert : le feu
        // d'artifice part de maintenant, et la réussite se sent et s'entend.
        .adaptiveOnChange(of: viewModel.phase) { _, phase in
            guard phase == .verified else { return }
            celebrationStart = Date()
            focusedField = nil
            HapticFeedback.success()
            UIAccessibility.post(
                notification: .announcement,
                argument: String(localized: "auth.signup.card.verified", defaultValue: "Compte validé !", bundle: .main)
            )
        }
        // UNE ALERTE, JAMAIS UN BLOCAGE (#8040) : sans numéro, dire à quoi il
        // sert ; « Continuer quand même » crée le compte comme avant.
        .alert(
            String(localized: "auth.signup.phoneNudge.title", defaultValue: "Continuer sans numéro ?", bundle: .main),
            isPresented: $viewModel.isPhoneNudgePresented
        ) {
            Button(String(localized: "auth.signup.phoneNudge.addPhone", defaultValue: "Ajouter mon numéro", bundle: .main), role: .cancel) {
                focusedField = viewModel.addPhoneInstead()
            }
            Button(String(localized: "auth.signup.phoneNudge.continue", defaultValue: "Continuer quand même", bundle: .main)) {
                continueWithoutPhone()
            }
        } message: {
            Text(String(localized: "auth.signup.phoneNudge.message", defaultValue: "Votre numéro sécurise votre compte et permet de le récupérer si vous perdez l’accès à votre e-mail.", bundle: .main))
        }
        .sheet(isPresented: $isShowingLanguageSheet) { languageSheet }
        .sheet(isPresented: $isShowingTerms) { TermsOfServiceView() }
        .sheet(isPresented: $isShowingPrivacy) { PrivacyPolicyView() }
        .sheet(isPresented: $isShowingForgotPassword) {
            MeeshyForgotPasswordView(prefilledEmail: viewModel.loginEmail ?? "")
        }
        // #8216 — le code et le lien sont PARTIS : l'attente de la connexion
        // par e-mail, la même machine, ouverte sur son écran d'attente.
        .sheet(item: $viewModel.signInLink, onDismiss: handOffProvenSession) { sent in
            MagicLinkView(onVerified: { provenSessionOpener = $0 }, alreadySent: sent)
                .environmentObject(AuthManager.shared)
        }
    }

    private func handOffProvenSession() {
        guard let open = provenSessionOpener else { return }
        provenSessionOpener = nil
        guard let onVerified else { return open() }
        onVerified(open)
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

    // MARK: - Phase 2 — l'adresse

    /// L'AVERTISSEMENT DE VALIDATION, derrière un (i) (#6626). Replié n'est
    /// pas perdu : le champ le porte en `accessibilityHint`, et le (i) le déplie.
    private var emailHint: AuthInfoHint {
        AuthInfoHint(
            text: String(
                localized: "auth.signup.email.verificationNotice",
                defaultValue: "Nous vous enverrons un lien à cette adresse : il faudra l’ouvrir pour valider votre compte.",
                bundle: .main
            ),
            buttonLabel: String(
                localized: "auth.signup.email.hintLabel",
                defaultValue: "Pourquoi un lien",
                bundle: .main
            )
        )
    }

    private var emailField: some View {
        fieldBlock(
            field: .email,
            label: String(localized: "auth.signup.email.label", defaultValue: "Adresse e-mail", bundle: .main),
            hint: emailHint
        ) {
            // `.emailAddress` fait aussi office d'IDENTIFIANT pour le trousseau.
            TextField(
                String(localized: "auth.signup.email.placeholder", defaultValue: "vous@exemple.com", bundle: .main),
                text: $viewModel.form.email
            )
            .textContentType(.emailAddress)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.done)
            .focused($focusedField, equals: .email)
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

    // MARK: - « S'inscrire », puis « Parler aux autres »

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

            Button(action: attemptPrimary) {
                ZStack {
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .fill(MeeshyColors.brandGradient)
                        .frame(minHeight: 52)

                    if viewModel.isSubmitting {
                        ProgressView().tint(.white)
                    } else {
                        Text(primaryTitle)
                            .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
            }
            .disabled(!isPrimaryEnabled)
            .opacity(isPrimaryEnabled ? 1 : 0.6)
            .bounceOnTap()
            .accessibilityLabel(primaryTitle)
            .accessibilityValue(viewModel.isSubmitting
                                ? String(localized: "auth.signup.submit.inProgress", defaultValue: "Création en cours", bundle: .main)
                                : "")
            .accessibilityIdentifier("auth.signup.primary")

            legalNotice
        }
    }

    private var isPrimaryEnabled: Bool {
        switch viewModel.primaryAction {
        case .talk: return true
        case .signUp(let enabled): return enabled
        }
    }

    private var primaryTitle: String {
        switch viewModel.primaryAction {
        case .talk:
            return String(localized: "auth.signup.talk", defaultValue: "Parler aux autres", bundle: .main)
        case .signUp:
            return String(localized: "auth.signup.submit", defaultValue: "S’inscrire", bundle: .main)
        }
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
            onSwitchToLogin?(viewModel.loginEmail)
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

    /// Le bouton principal : « Parler aux autres » ouvre la session validée ;
    /// « S'inscrire » entre avec le compte déjà créé par la carte, ou crée le
    /// compte — l'inscription sans code est permise (#8238).
    func attemptPrimary() {
        switch viewModel.primaryAction {
        case .talk:
            enterWithCreatedAccount()
        case .signUp(let enabled):
            guard enabled else { return }
            if case .awaitingCode = viewModel.card { return enterWithCreatedAccount() }
            attemptSubmit()
        }
    }

    /// Le compte existe : sa session TENUE s'ouvre, IMMÉDIATEMENT — sans pause.
    private func enterWithCreatedAccount() {
        guard let open = viewModel.sessionOpener() else { return }
        focusedField = nil
        guard let onVerified else {
            open()
            onComplete?()
            return dismiss()
        }
        onVerified(open)
    }

    private func attemptSubmit() {
        guard viewModel.canSubmit else { return }
        focusedField = nil
        Task {
            switch await viewModel.requestSubmit() {
            case .created: land(created: true)
            case .rejected: land(created: false)
            // L'alerte EST le retour : aucune haptique d'échec pour une
            // question posée (#8040).
            case .phoneNudged: break
            }
        }
    }

    private func continueWithoutPhone() {
        Task { land(created: await viewModel.continueWithoutPhone()) }
    }

    private func land(created: Bool) {
        guard created else {
            HapticFeedback.error()
            return
        }
        HapticFeedback.success()
        // Un compte qui attend son code l'attend DANS la carte (#8288).
        if case .awaitingCode = viewModel.card { return }
        // IMMÉDIATEMENT : une pause posée sur un succès est une lenteur, donc
        // un bug (CLAUDE.md § roadmap).
        onComplete?()
        dismiss()
    }

    // MARK: - Composition d'un champ

    func fieldBlock<Content: View>(
        field: SignupField,
        label: String,
        hint: AuthInfoHint? = nil,
        labelsContent: Bool = true,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(theme.textMuted)

            HStack(spacing: 0) {
                // Un contenu qui porte plusieurs éléments (le champ de mot de
                // passe et son œil, #8054) se libelle lui-même.
                content()
                    .modifier(FieldBlockAccessibility(label: label, hint: hint?.text ?? "", applies: labelsContent))
                if let hint {
                    AuthInfoHintButton(hint: hint, isExpanded: hintExpansion(for: field), tint: theme.textMuted)
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .frame(minHeight: 48)
            .background(inputSurface(isFocused: focusedField == field))

            errorRow(for: field)
            if let hint {
                AuthInfoHintText(hint: hint, isExpanded: expandedHint == field, color: theme.textSecondary)
            }
        }
    }

    /// LE DÉTAIL DERRIÈRE UN (i) (#6441) — un seul (i) déplié à la fois.
    func hintExpansion(for field: SignupField) -> Binding<Bool> {
        Binding(
            get: { expandedHint == field },
            set: { expandedHint = $0 ? field : nil }
        )
    }

    /// Le refus se pose SOUS son champ, en `.footnote`, et VoiceOver le lit
    /// comme un texte à part entière — un message d'erreur muet ne corrige rien.
    @ViewBuilder
    func errorRow(for field: SignupField) -> some View {
        if let message = viewModel.error(for: field) {
            Text(message)
                .font(.footnote)
                .foregroundColor(MeeshyColors.error)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel(message)
        }
    }

    func inputSurface(isFocused: Bool) -> some View {
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

private struct FieldBlockAccessibility: ViewModifier {
    let label: String
    let hint: String
    let applies: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if applies {
            content.accessibilityLabel(label).accessibilityHint(hint)
        } else {
            content
        }
    }
}

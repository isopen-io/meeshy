import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Phases 3 et 4 — la carte d'identité, en verre liquide (#8288)
//
// Elle paraît quand l'adresse est cohérente et porte, dans l'ordre : le nom
// affiché et le @pseudo pré-dérivés et modifiables, les refus qui la visent
// (pseudo pris, « Est-ce vous ? »), le mot de passe facultatif, et « Valider
// mon compte maintenant » — qui crée le compte et fait paraître le code DANS
// la carte (`EmailCodeEntry`, la saisie de l'écran du code, jamais une
// seconde). Le code juste, ou le lien ouvert ailleurs, lance le feu
// d'artifice de l'arrivée (`ArrivalFireworksCanvas`).

extension SignupView {

    var identityCard: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            Text(String(localized: "auth.signup.card.title", defaultValue: "Votre compte", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            switch viewModel.card {
            case .editing:
                derivedIdentityBlock
                if viewModel.showsEmailTakenActions {
                    emailTakenActions
                }
                if isPasswordRevealed {
                    passwordField
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
                validateNowButton
            case .awaitingCode(let step):
                codeStep(step)
            case .verified:
                verifiedStep
            }
        }
        .padding(MeeshySpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .adaptiveLiquidGlass(in: Self.cardShape)
        .overlay(
            Self.cardShape
                .stroke(theme.inputBorder.opacity(0.25), lineWidth: 1)
                .allowsHitTesting(false)
        )
        .overlay {
            if isCelebrating {
                ArrivalFireworksCanvas(startDate: celebrationStart, stopsAfterShow: true)
                    .clipShape(Self.cardShape)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("auth.signup.card")
    }

    static var cardShape: RoundedRectangle { RoundedRectangle(cornerRadius: 26, style: .continuous) }

    /// Le feu d'artifice se tire quand le compte vient d'être validé — jamais
    /// sous « Réduire les animations », où la coche seule dit la réussite.
    private var isCelebrating: Bool {
        guard case .verified = viewModel.card else { return false }
        return !reducesMotion
    }

    // MARK: Identité

    /// CE QUE L'INSCRIPTION VA CRÉER — montré, modifiable, et ENVOYÉ (#6479,
    /// refait par #7897) : deux SAISIES déjà remplies depuis l'adresse, qui la
    /// suivent en direct tant qu'on ne les touche pas. Prénom et nom restent
    /// dérivés par la passerelle. Le chemin nominal reste ZÉRO geste.
    var derivedIdentityBlock: some View {
        let form = viewModel.form
        var sansNom = form
        sansNom.displayName = nil
        var sansPseudo = form
        sansPseudo.username = nil

        return VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            identityInput(
                field: .displayName,
                label: String(localized: "auth.signup.identity.displayName", defaultValue: "Nom affiché", bundle: .main),
                prefix: nil,
                placeholder: sansNom.effectiveDisplayName,
                text: Binding(
                    get: { viewModel.form.displayName ?? viewModel.form.effectiveDisplayName },
                    set: { viewModel.form.displayName = $0 }
                )
            )

            identityInput(
                field: .username,
                label: String(localized: "auth.signup.identity.username", defaultValue: "Pseudo", bundle: .main),
                prefix: "@",
                placeholder: sansPseudo.effectiveUsername,
                text: Binding(
                    get: { viewModel.form.username ?? viewModel.form.effectiveUsername },
                    set: { viewModel.form.username = $0 }
                )
            )

            if !viewModel.usernameSuggestions.isEmpty {
                HStack(spacing: MeeshySpacing.xs) {
                    ForEach(viewModel.usernameSuggestions, id: \.self) { candidat in
                        Button {
                            HapticFeedback.light()
                            viewModel.form.username = candidat
                        } label: {
                            Text("@\(candidat)")
                                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                                .foregroundColor(MeeshyColors.indigo500)
                                .padding(.horizontal, MeeshySpacing.md)
                                .frame(minHeight: 44)
                                .background(inputSurface(isFocused: false))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    /// Une saisie d'identité, TOUJOURS ouverte (#7897) : un toucher suffit
    /// pour modifier. Le filigrane rend la dérivation quand le champ est vidé.
    private func identityInput(
        field: SignupField,
        label: String,
        prefix: String?,
        placeholder: String,
        text: Binding<String>
    ) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)
            HStack(spacing: MeeshySpacing.xs) {
                if let prefix {
                    Text(prefix)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .regular))
                        .foregroundColor(theme.textMuted)
                        .accessibilityHidden(true)
                }
                TextField(placeholder.isEmpty ? label : placeholder, text: text)
                    .textContentType(prefix == nil ? .nickname : .username)
                    .textInputAutocapitalization(prefix == nil ? .words : .never)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: field)
                    .foregroundColor(theme.textPrimary)
                    .accessibilityLabel(label)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .frame(minHeight: 48)
            .background(inputSurface(isFocused: focusedField == field))

            errorRow(for: field)
        }
    }

    // MARK: Refus — l'adresse déjà utilisée (#8216)

    /// L'ADRESSE EST DÉJÀ UTILISÉE — ce qu'on peut faire, en UN geste (#8216),
    /// désormais DANS la carte (#8288). Quand la passerelle sert le détenteur
    /// MASQUÉ (#8214), la carte demande d'abord « Est-ce vous ? ». Miroir web :
    /// `EmailTakenActions` (`apps/web/src/components/email-taken-actions.tsx`).
    @ViewBuilder
    var emailTakenActions: some View {
        if let owner = viewModel.emailOwner {
            emailOwnerCard(owner)
        } else {
            recoveryActions(sendLabel: String(localized: "auth.signup.email.sendSignInLink", defaultValue: "Recevoir un lien de connexion", bundle: .main))
        }
    }

    private func recoveryActions(sendLabel: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: MeeshySpacing.lg) { sendSignInLinkButton(sendLabel); forgotPasswordButton }
                VStack(alignment: .leading, spacing: 0) { sendSignInLinkButton(sendLabel); forgotPasswordButton }
            }
            if let error = viewModel.signInLinkError {
                Text(error)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func emailOwnerCard(_ owner: APIRejection.EmailOwner) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "auth.signup.email.isItYou", defaultValue: "Est-ce vous ?", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            HStack(spacing: MeeshySpacing.md) {
                MeeshyAvatar(
                    name: owner.maskedDisplayName,
                    context: .userListItem,
                    accentColor: DynamicColorGenerator.colorForName(owner.maskedUsername),
                    avatarURL: owner.avatar
                )
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(verbatim: owner.maskedDisplayName)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    Text(verbatim: "@\(owner.maskedUsername)")
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                        .foregroundColor(theme.textSecondary)
                }
                .lineLimit(1)
            }
            .accessibilityElement(children: .combine)

            recoveryActions(sendLabel: String(localized: "auth.signup.email.itsMe", defaultValue: "C’est moi — récupérer mon compte", bundle: .main))

            Button {
                HapticFeedback.light()
                Task { await viewModel.claimEmail() }
            } label: {
                Text(String(localized: "auth.signup.email.notMe", defaultValue: "Ce n’est pas moi", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .frame(minHeight: 44)
            }
            .disabled(viewModel.isSubmitting)
            .accessibilityHint(Self.claimNote)
            .accessibilityIdentifier("auth.signup.email.notMe")

            Text(Self.claimNote)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                .foregroundColor(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(MeeshySpacing.md)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(theme.inputBackground))
    }

    private static var claimNote: String {
        String(localized: "auth.signup.email.notMe.note", defaultValue: "Le code envoyé à cette adresse sera demandé pour l’obtenir.", bundle: .main)
    }

    private func sendSignInLinkButton(_ label: String) -> some View {
        Button {
            HapticFeedback.light()
            Task { await viewModel.requestSignInLink() }
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                if viewModel.isRequestingSignInLink {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "wand.and.stars")
                        .accessibilityHidden(true)
                }
                Text(label)
            }
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            .foregroundColor(MeeshyColors.indigo500)
            .frame(minHeight: 44)
        }
        .disabled(viewModel.isRequestingSignInLink)
        .accessibilityHint(String(localized: "auth.signup.email.sendSignInLink.hint", defaultValue: "Envoie un code et un lien de connexion à cette adresse", bundle: .main))
        .accessibilityIdentifier("auth.signup.email.sendSignInLink")
    }

    private var forgotPasswordButton: some View {
        Button {
            HapticFeedback.light()
            isShowingForgotPassword = true
        } label: {
            Text(String(localized: "auth.signup.email.forgotPassword", defaultValue: "Mot de passe oublié ?", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .frame(minHeight: 44)
        }
    }

    // MARK: Mot de passe
    //
    // UNE saisie, FACULTATIVE depuis #6424 sans le dire (#6582 web, #7897) : le
    // bouton actif sans lui le prouve. Il paraît quand l'identité est DÉFINIE,
    // et sa conséquence se déplie sous « Pourquoi mettre un mot de passe
    // maintenant ? » (directive porteur 2026-09-25).

    var passwordWhyDetail: String {
        String(
            localized: "auth.signup.password.why.detail",
            defaultValue: "Vous pouvez activer votre mot de passe dès maintenant si vous le souhaitez. Sans mot de passe, vous vous connecterez toujours à partir d’un e-mail reçu dans votre boîte.",
            bundle: .main
        )
    }

    var passwordField: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            fieldBlock(
                field: .password,
                label: String(localized: "auth.signup.password.label", defaultValue: "Mot de passe", bundle: .main),
                labelsContent: false
            ) {
                MeeshyPasswordField(
                    String(localized: "auth.signup.password.placeholder", defaultValue: "6 caractères minimum", bundle: .main),
                    text: $viewModel.form.password,
                    role: .new,
                    focus: $focusedField,
                    equals: .password,
                    accessibilityLabel: String(localized: "auth.signup.password.label", defaultValue: "Mot de passe", bundle: .main),
                    eyeColor: theme.textMuted
                )
                .submitLabel(.go)
                .onSubmit { attemptPrimary() }
                .foregroundColor(theme.textPrimary)
            }

            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.32, dampingFraction: 0.8)) {
                    isPasswordWhyExpanded.toggle()
                }
            } label: {
                HStack(spacing: MeeshySpacing.xs) {
                    Text(String(
                        localized: "auth.signup.password.why",
                        defaultValue: "Pourquoi mettre un mot de passe maintenant ?",
                        bundle: .main
                    ))
                    Image(systemName: "chevron.down")
                        .rotationEffect(.degrees(isPasswordWhyExpanded ? 180 : 0))
                        .accessibilityHidden(true)
                }
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo500)
                .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityHint(passwordWhyDetail)

            if isPasswordWhyExpanded {
                Text(passwordWhyDetail)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                .foregroundColor(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    // MARK: Phase 4 — valider maintenant, le code, le compte validé

    /// « Valider mon compte maintenant » — crée le compte en TENANT sa session,
    /// et fait paraître le code dans la carte.
    private var validateNowButton: some View {
        Button {
            focusedField = nil
            Task {
                if await viewModel.validateNow() {
                    HapticFeedback.light()
                } else {
                    HapticFeedback.error()
                }
            }
        } label: {
            ZStack {
                if viewModel.isValidating {
                    ProgressView().tint(MeeshyColors.indigo500)
                } else {
                    Text(String(localized: "auth.signup.card.validateNow", defaultValue: "Valider mon compte maintenant", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(MeeshyColors.indigo500.opacity(0.12))
                    .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.md).stroke(MeeshyColors.indigo500.opacity(0.45), lineWidth: 1))
            )
        }
        .buttonStyle(.plain)
        .disabled(!viewModel.form.canSubmit || viewModel.isValidating || viewModel.isSubmitting)
        .opacity(viewModel.form.canSubmit ? 1 : 0.6)
        .accessibilityLabel(String(localized: "auth.signup.card.validateNow", defaultValue: "Valider mon compte maintenant", bundle: .main))
        .accessibilityValue(viewModel.isValidating
                            ? String(localized: "auth.signup.submit.inProgress", defaultValue: "Création en cours", bundle: .main)
                            : "")
        .accessibilityIdentifier("auth.signup.card.validateNow")
    }

    @ViewBuilder
    private func codeStep(_ step: SignupCodeStep) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            Text(String(
                format: String(
                    localized: "auth.signup.card.code.lead",
                    defaultValue: "Entrez le code à 6 chiffres envoyé à %@, ou ouvrez le lien reçu.",
                    bundle: .main
                ),
                step.email
            ))
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
            .foregroundColor(theme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)

            if let entry = viewModel.codeEntry {
                EmailCodeEntry(viewModel: entry)
            }
        }
    }

    private var verifiedStep: some View {
        VStack(spacing: MeeshySpacing.sm) {
            ZStack {
                Circle()
                    .fill(MeeshyColors.success.opacity(0.16))
                    .frame(width: 72, height: 72)
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(.largeTitle).weight(.semibold))
                    .foregroundStyle(MeeshyColors.success)
            }
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            .accessibilityHidden(true)

            Text(String(localized: "auth.signup.card.verified", defaultValue: "Compte validé !", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
            Text(String(localized: "auth.signup.card.verified.lead", defaultValue: "Tout est prêt : vos proches vous lisent dans votre langue.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("auth.signup.card.verified")
    }
}

import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Phase 1 — le téléphone d'abord, en verre liquide (#8288)
//
// REQUIS par l'écran (#9343, directive porteur 2026-10-04) — par l'écran
// seul : la passerelle accepte toujours une adresse sans numéro. Rien ne le
// passe ; l'adresse ne paraît qu'à un numéro plausible, et le refus se dit
// SOUS le champ, annoncé à VoiceOver.

extension SignupView {

    /// CE QUE LE NUMÉRO OUVRE — et rien d'autre (#6441). Les deux usages sont
    /// MESURÉS, pas promis : identifiant de connexion (`AuthService.ts:158`) et
    /// découverte par un contact qui l'a au carnet (`contacts-match.ts`).
    /// AFFICHÉ sous le champ, plus replié derrière un (i) (#8842) : une raison
    /// qu'il faut aller chercher ne convainc personne.
    var phoneBenefit: String {
        String(
            localized: "auth.signup.phone.benefit",
            defaultValue: "Il vous permettra de vous connecter, et à vos proches de vous retrouver.",
            bundle: .main
        )
    }

    /// Le numéro et le pays dans UNE barre de verre liquide qui ondule à chaque
    /// frappe — l'effet de la barre du composeur universel (`TypingWave`). Sous
    /// « Réduire les animations », rien ne bouge.
    var phoneField: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
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
                    .padding(.horizontal, MeeshySpacing.sm)
                    .frame(minHeight: 48)
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(CountryPicker.accessibilityLabel(for: viewModel.form.country))
                .accessibilityHint(String(localized: "auth.signup.phone.country.hint", defaultValue: "Changer de pays", bundle: .main))

                Rectangle()
                    .fill(theme.textMuted.opacity(MeeshyOpacity.medium))
                    .frame(width: 1, height: 24)
                    .accessibilityHidden(true)

                TextField(
                    String(localized: "auth.signup.phone.placeholder", defaultValue: "Numéro de téléphone", bundle: .main),
                    text: $viewModel.form.phoneDigits
                )
                .textContentType(.telephoneNumber)
                .keyboardType(.phonePad)
                .focused($focusedField, equals: .phoneNumber)
                .foregroundColor(theme.textPrimary)
                .accessibilityLabel(String(localized: "auth.signup.phone.label", defaultValue: "Téléphone", bundle: .main))
                .accessibilityHint(phoneBenefit)
                .accessibilityIdentifier("auth.signup.phone")
            }
            .padding(.leading, MeeshySpacing.sm)
            .padding(.trailing, MeeshySpacing.md)
            .frame(minHeight: 56)
            .adaptiveLiquidGlass(in: Self.phoneGlassShape)
            .overlay(
                Self.phoneGlassShape
                    .stroke(
                        focusedField == .phoneNumber ? MeeshyColors.indigo500.opacity(0.6) : theme.inputBorder.opacity(MeeshyOpacity.medium),
                        lineWidth: focusedField == .phoneNumber ? 1.5 : 1
                    )
                    .allowsHitTesting(false)
            )
            .typingWave(on: viewModel.form.phoneDigits, reduceMotion: reducesMotion)
            .accessibilityElement(children: .contain)

            errorRow(for: .phoneNumber)
                .accessibilityIdentifier("auth.signup.phone.error")

            // Le champ porte déjà la phrase en `accessibilityHint` : la lire une
            // seconde fois au balayage n'apprendrait rien.
            Text(phoneBenefit)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                .foregroundColor(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityHidden(true)
        }
        .sheet(isPresented: $isShowingCountryPicker) {
            SignupCountrySheet(selection: $viewModel.form.country)
        }
        // Le champ QUITTÉ avec une saisie : son refus se dit désormais (#9343).
        .adaptiveOnChange(of: focusedField) { previous, current in
            guard previous == .phoneNumber, current != .phoneNumber else { return }
            viewModel.notePhoneFieldLeft()
        }
        // Le refus qui PARAÎT s'annonce : VoiceOver ne le lirait sinon qu'au
        // balayage, et l'utilisateur ne saurait pas pourquoi rien n'avance.
        .adaptiveOnChange(of: viewModel.error(for: .phoneNumber)) { _, message in
            guard let message else { return }
            UIAccessibility.post(notification: .announcement, argument: message)
        }
    }

    static var phoneGlassShape: RoundedRectangle { RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus, style: .continuous) }
}

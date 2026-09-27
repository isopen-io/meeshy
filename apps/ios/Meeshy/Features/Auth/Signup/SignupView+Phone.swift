import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Phase 1 — le téléphone d'abord, en verre liquide (#8288)
//
// Jamais annoncé « facultatif », jamais d'astérisque : le lien discret
// « Continuer avec l'e-mail seulement » le dit par le geste, et le NOMMER
// facultatif ferait croire qu'il y a une décision à prendre. Vide ⇒ absent de
// la charge (`SignupForm`).

extension SignupView {

    /// CE QUE LE NUMÉRO OUVRE — et rien d'autre (#6441). Les deux usages sont
    /// MESURÉS, pas promis : identifiant de connexion (`AuthService.ts:158`) et
    /// découverte par un contact qui l'a au carnet (`contacts-match.ts`).
    var phoneHint: AuthInfoHint {
        AuthInfoHint(
            text: String(
                localized: "auth.signup.phone.benefit",
                defaultValue: "Il vous permettra de vous connecter, et à vos proches de vous retrouver.",
                bundle: .main
            ),
            buttonLabel: String(
                localized: "auth.signup.phone.hintLabel",
                defaultValue: "À quoi sert le numéro",
                bundle: .main
            )
        )
    }

    /// Le numéro, le pays et le (i) dans UNE barre de verre liquide qui ondule
    /// à chaque frappe — l'effet de la barre du composeur universel
    /// (`TypingWave`). Sous « Réduire les animations », rien ne bouge.
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
                    .fill(theme.textMuted.opacity(0.3))
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
                .accessibilityHint(phoneHint.text)
                .accessibilityIdentifier("auth.signup.phone")

                AuthInfoHintButton(hint: phoneHint, isExpanded: hintExpansion(for: .phoneNumber), tint: theme.textMuted)
            }
            .padding(.leading, MeeshySpacing.sm)
            .padding(.trailing, MeeshySpacing.md)
            .frame(minHeight: 56)
            .adaptiveLiquidGlass(in: Self.phoneGlassShape)
            .overlay(
                Self.phoneGlassShape
                    .stroke(
                        focusedField == .phoneNumber ? MeeshyColors.indigo500.opacity(0.6) : theme.inputBorder.opacity(0.25),
                        lineWidth: focusedField == .phoneNumber ? 1.5 : 1
                    )
                    .allowsHitTesting(false)
            )
            .typingWave(on: viewModel.form.phoneDigits, reduceMotion: reducesMotion)
            .accessibilityElement(children: .contain)

            errorRow(for: .phoneNumber)
            AuthInfoHintText(hint: phoneHint, isExpanded: expandedHint == .phoneNumber, color: theme.textSecondary)

            if !viewModel.progress.emailShown {
                skipPhoneButton
                    .transition(.opacity)
            }
        }
        .sheet(isPresented: $isShowingCountryPicker) {
            SignupCountrySheet(selection: $viewModel.form.country)
        }
    }

    static var phoneGlassShape: RoundedRectangle { RoundedRectangle(cornerRadius: 22, style: .continuous) }

    /// « Continuer avec l'e-mail seulement » — discret, et il disparaît une fois
    /// l'adresse parue : il n'y a plus rien à passer (décision porteur 2026-09-27).
    private var skipPhoneButton: some View {
        Button {
            HapticFeedback.light()
            viewModel.skipPhone()
            focusedField = .email
        } label: {
            Text(String(localized: "auth.signup.phone.skip", defaultValue: "Continuer avec l’e-mail seulement", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .underline()
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("auth.signup.phone.skip")
    }
}

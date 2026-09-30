import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Phase 1 — le téléphone d'abord, en verre liquide (#8288)
//
// Jamais annoncé « facultatif », jamais d'astérisque : « Plus tard → », posé
// sur la ligne du libellé, le dit par le geste (#8842), et le NOMMER
// facultatif ferait croire qu'il y a une décision à prendre. Vide ⇒ absent de
// la charge (`SignupForm`).

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
            HStack(alignment: .center, spacing: MeeshySpacing.sm) {
                Text(String(localized: "auth.signup.phone.label", defaultValue: "Téléphone", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)

                Spacer(minLength: MeeshySpacing.sm)

                if !viewModel.progress.emailShown {
                    laterButton
                        .transition(.opacity)
                }
            }

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
                        focusedField == .phoneNumber ? MeeshyColors.indigo500.opacity(0.6) : theme.inputBorder.opacity(0.25),
                        lineWidth: focusedField == .phoneNumber ? 1.5 : 1
                    )
                    .allowsHitTesting(false)
            )
            .typingWave(on: viewModel.form.phoneDigits, reduceMotion: reducesMotion)
            .accessibilityElement(children: .contain)

            errorRow(for: .phoneNumber)

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
    }

    static var phoneGlassShape: RoundedRectangle { RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus, style: .continuous) }

    /// « Plus tard → » — sur la ligne du libellé, aligné en fin (#8842), et il
    /// disparaît une fois l'adresse parue : il n'y a plus rien à passer
    /// (décision porteur 2026-09-27). `arrow.right` se retourne seul en RTL.
    private var laterButton: some View {
        Button {
            HapticFeedback.light()
            viewModel.skipPhone()
            focusedField = .email
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Text(String(localized: "auth.signup.phone.later", defaultValue: "Plus tard", bundle: .main))
                Image(systemName: "arrow.right")
                    .accessibilityHidden(true)
            }
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
            .foregroundColor(theme.textSecondary)
            .padding(.leading, MeeshySpacing.sm)
            .frame(minWidth: 44, minHeight: 44, alignment: .trailing)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "auth.signup.phone.later.a11y", defaultValue: "Plus tard, continuer sans numéro", bundle: .main))
        .accessibilityIdentifier("auth.signup.phone.skip")
    }
}

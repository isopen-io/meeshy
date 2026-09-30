import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Proposition du numéro avant la recherche de contacts (#8843)

/// Avant de chercher ses contacts, un compte SANS numéro se voit proposer d'en
/// ajouter un, avec la raison : ses proches le retrouvent grâce à lui, et il
/// pourra s'en servir pour se connecter.
///
/// Jamais bloquante : « Plus tard », le glissement vers le bas et le numéro
/// vérifié ferment tous la feuille, et la fermeture — quelle qu'elle soit —
/// RELANCE la recherche demandée (`onDismiss` du modificateur). Le flux SMS
/// est celui de la Sécurité (`PhoneChangeFlowModel`), jamais un second.
struct PhonePromptSheet: View {
    @StateObject private var flow = PhoneChangeFlowModel()
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focusedField: Field?
    private var theme: ThemeManager { ThemeManager.shared }

    private enum Field: Hashable {
        case phone
        case code
    }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: MeeshySpacing.lg) {
                header
                if flow.step == .codeSent {
                    codeStep
                } else {
                    phoneStep
                }
                if let error = flow.error {
                    Text(error)
                        .font(.footnote.weight(.medium))
                        .foregroundColor(MeeshyColors.error)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                laterButton
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.top, MeeshySpacing.xl)
            .padding(.bottom, MeeshySpacing.lg)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(theme.backgroundPrimary.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .onAppear { focusedField = .phone }
    }

    // MARK: - En-tête : ce que le numéro ouvre

    private var header: some View {
        VStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "person.crop.circle.badge.plus")
                .font(.system(.largeTitle).weight(.semibold))
                .foregroundStyle(MeeshyColors.brandGradient)
                .accessibilityHidden(true)

            Text(String(localized: "contacts.phonePrompt.title", defaultValue: "Ajoute ton numéro", bundle: .main))
                .font(.title3.weight(.bold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)

            Text(String(localized: "contacts.phonePrompt.benefit", defaultValue: "Tes proches te retrouvent sur Meeshy grâce à ton numéro. Tu pourras aussi t’en servir pour te connecter.", bundle: .main))
                .font(.subheadline)
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Étape 1 — le numéro

    private var phoneStep: some View {
        VStack(spacing: MeeshySpacing.md) {
            TextField("+33 6 12 34 56 78", text: $flow.newPhone)
                .font(.body.weight(.medium))
                .foregroundColor(theme.textPrimary)
                .textContentType(.telephoneNumber)
                .keyboardType(.phonePad)
                .focused($focusedField, equals: .phone)
                .padding(.horizontal, MeeshySpacing.md)
                .frame(minHeight: 50)
                .background(fieldBackground)
                .accessibilityLabel(String(localized: "settings.security.phone", defaultValue: "Téléphone", bundle: .main))

            primaryButton(
                title: String(localized: "contacts.phonePrompt.add", defaultValue: "Recevoir le code par SMS", bundle: .main),
                isBusy: flow.isSending,
                isEnabled: flow.canSend
            ) {
                Task {
                    await flow.sendCode()
                    if flow.step == .codeSent { focusedField = .code }
                }
            }
        }
    }

    // MARK: - Étape 2 — le code reçu

    private var codeStep: some View {
        VStack(spacing: MeeshySpacing.md) {
            Label(String(localized: "settings.security.phone.code_sent", defaultValue: "Code envoyé par SMS", bundle: .main), systemImage: "ellipsis.message.fill")
                .font(.footnote.weight(.medium))
                .foregroundColor(MeeshyColors.success)

            TextField(String(localized: "settings.security.phone.code_placeholder", defaultValue: "Code à 6 chiffres", bundle: .main), text: $flow.code)
                .font(.system(.title3, design: .monospaced).weight(.semibold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .focused($focusedField, equals: .code)
                .padding(.horizontal, MeeshySpacing.md)
                .frame(minHeight: 50)
                .background(fieldBackground)

            primaryButton(
                title: String(localized: "common.verify", defaultValue: "Vérifier", bundle: .main),
                isBusy: flow.isVerifying,
                isEnabled: flow.canVerify
            ) {
                Task {
                    guard await flow.verifyCode() else { return }
                    dismiss()
                }
            }

            Button {
                HapticFeedback.light()
                flow.beginEditing()
                focusedField = .phone
            } label: {
                Text(String(localized: "common.edit", defaultValue: "Modifier", bundle: .main))
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(MeeshyColors.indigo500)
                    .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - « Plus tard » — jamais bloquant

    private var laterButton: some View {
        Button {
            HapticFeedback.light()
            dismiss()
        } label: {
            Text(String(localized: "contacts.phonePrompt.later", defaultValue: "Plus tard", bundle: .main))
                .font(.subheadline.weight(.semibold))
                .foregroundColor(theme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "contacts.phonePrompt.later.a11y", defaultValue: "Plus tard, chercher mes contacts sans ajouter de numéro", bundle: .main))
        .accessibilityIdentifier("contacts.phonePrompt.later")
    }

    // MARK: - Pièces

    private var fieldBackground: some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
            .fill(theme.textMuted.opacity(MeeshyOpacity.subtle))
    }

    private func primaryButton(title: String, isBusy: Bool, isEnabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.medium()
            action()
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                if isBusy {
                    ProgressView().tint(.white)
                }
                Text(title)
                    .font(.body.weight(.bold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(
                Capsule().fill(isEnabled ? MeeshyColors.indigo500 : MeeshyColors.indigo500.opacity(0.4))
            )
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
    }
}

// MARK: - Le passage obligé des gestes qui cherchent des contacts

extension View {
    /// Présente `PhonePromptSheet` tant que `isPresented` est vrai, puis
    /// CONTINUE la recherche à la fermeture, quelle qu'en soit la cause. Le
    /// geste hôte décide seul d'ouvrir la feuille, via
    /// `PhonePromptPolicy.shouldOffer(user:)` : un compte qui a déjà un numéro
    /// lance la recherche directement.
    func phonePromptBeforeContactSearch(isPresented: Binding<Bool>, onContinue: @escaping () -> Void) -> some View {
        sheet(isPresented: isPresented, onDismiss: onContinue) {
            PhonePromptSheet()
        }
    }
}

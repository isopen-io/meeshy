import SwiftUI
import MeeshySDK
import MeeshyUI

/// La feuille « Validez votre compte » (#8239). Ce qu'elle offre suit ce qui
/// MANQUE : « Recevoir le code » puis sa saisie SUR PLACE (`EmailCodeEntry`, la
/// machine de l'écran du code, jamais une seconde) ; « Ajouter mon numéro »
/// ouvre le parcours existant (`SecurityView`, section Téléphone). « Plus tard »
/// ferme — aussi par Échap au clavier matériel (`.cancelAction`).
struct ActivationInviteView: View {
    @ObservedObject var model: ActivationInviteViewModel
    @State private var showsPhoneFlow = false
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MeeshySpacing.xxl) {
                header
                proofs
                if let email = model.email, model.missing.contains(.email) {
                    ActivationEmailStep(email: email) { model.prove(.email) }
                }
                if model.missing.contains(.phone) {
                    phoneStep
                }
                if model.isComplete {
                    Text(String(localized: "activation.complete", defaultValue: "Votre compte est validé. Merci !", bundle: .main))
                        .font(.body.weight(.semibold))
                        .foregroundStyle(MeeshyColors.success)
                }
                closeButton
            }
            .padding(MeeshySpacing.xxl)
            .iPadFormWidth()
        }
        .background(theme.backgroundPrimary.ignoresSafeArea())
        .sheet(isPresented: $showsPhoneFlow) {
            SecurityView().environmentObject(AuthManager.shared)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            Text(String(localized: "activation.invite.title", defaultValue: "Validez votre compte", bundle: .main))
                .font(.system(.title2, design: .rounded).weight(.bold))
                .foregroundStyle(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text(lead)
                .font(.subheadline)
                .foregroundStyle(theme.textSecondary)
        }
    }

    private var lead: String {
        switch model.daysLeft {
        case .none, .some(0):
            return String(localized: "activation.invite.lead", defaultValue: "Validez votre compte pour continuer à l’utiliser sans interruption.", bundle: .main)
        case .some(1):
            return String(localized: "activation.invite.daysLeft.one", defaultValue: "Il vous reste 1 jour pour valider votre compte. Ensuite, la connexion demandera un code.", bundle: .main)
        case .some(let days):
            return String(format: String(localized: "activation.invite.daysLeft", defaultValue: "Il vous reste %lld jours pour valider votre compte. Ensuite, la connexion demandera un code.", bundle: .main), days)
        }
    }

    @ViewBuilder
    private var proofs: some View {
        if model.proven.contains(.email) {
            proofLine(String(localized: "activation.email.done", defaultValue: "Adresse vérifiée ✓", bundle: .main))
        }
        if model.proven.contains(.phone) {
            proofLine(String(localized: "activation.phone.done", defaultValue: "Numéro vérifié ✓", bundle: .main))
        }
    }

    private func proofLine(_ text: String) -> some View {
        Text(text)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(MeeshyColors.success)
    }

    private var phoneStep: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            Text(String(localized: "activation.phone.label", defaultValue: "Ajoutez un numéro pour sécuriser et récupérer votre compte", bundle: .main))
                .font(.body.weight(.semibold))
                .foregroundStyle(theme.textPrimary)
            Button {
                showsPhoneFlow = true
            } label: {
                Label(String(localized: "activation.phone.add", defaultValue: "Ajouter mon numéro", bundle: .main), systemImage: "phone.badge.plus")
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .foregroundStyle(theme.textPrimary)
                    .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).stroke(MeeshyColors.indigo400.opacity(MeeshyOpacity.strong), lineWidth: MeeshyBorder.emphasis))
            }
            .buttonStyle(.plain)
        }
    }

    private var closeButton: some View {
        Button {
            model.dismiss()
        } label: {
            Text(model.isComplete
                 ? String(localized: "activation.close", defaultValue: "Fermer", bundle: .main)
                 : String(localized: "activation.later", defaultValue: "Plus tard", bundle: .main))
                .font(.body.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 44)
                .foregroundStyle(MeeshyColors.indigo400)
        }
        .buttonStyle(.plain)
        .keyboardShortcut(.cancelAction)
    }
}

/// L'adresse : « Recevoir le code » (`POST /auth/resend-verification`), puis la
/// saisie du code dans la feuille. L'utilisateur est déjà connecté : la session
/// que rend la preuve n'est PAS rouverte, seul le compte passe à `done`.
///
/// La garde de l'e-mail (#8365) la réutilise avec `sendsOnAppear` : le code
/// part dès l'ouverture, sans geste.
struct ActivationEmailStep: View {
    let onProven: () -> Void
    private let sendsOnAppear: Bool
    @StateObject private var code: EmailVerificationViewModel
    @State private var sent = false
    private var theme: ThemeManager { ThemeManager.shared }

    init(email: String, sendsOnAppear: Bool = false, onProven: @escaping () -> Void) {
        self.onProven = onProven
        self.sendsOnAppear = sendsOnAppear
        _code = StateObject(wrappedValue: EmailVerificationViewModel(email: email))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            Text(String(localized: "activation.email.label", defaultValue: "Confirmez votre adresse e-mail", bundle: .main))
                .font(.body.weight(.semibold))
                .foregroundStyle(theme.textPrimary)
            if sent {
                Text(String(format: String(localized: "activation.email.sent", defaultValue: "Code envoyé à %@. Saisissez-le ci-dessous.", bundle: .main), code.email))
                    .font(.footnote)
                    .foregroundStyle(theme.textSecondary)
                EmailCodeEntry(viewModel: code)
            } else {
                if let error = code.error {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(MeeshyColors.error)
                }
                sendButton
            }
        }
        .task {
            guard sendsOnAppear, !sent, !code.isResending else { return }
            await code.resendCode()
        }
        .onReceive(code.$resendSuccess.filter { $0 }) { _ in sent = true }
        .onReceive(code.$verificationSuccess.filter { $0 }.first()) { _ in
            onProven()
            Task { await AuthManager.shared.checkExistingSession() }
        }
    }

    private var sendButton: some View {
        Button {
            Task { await code.resendCode() }
        } label: {
            Text(code.isResending
                 ? String(localized: "activation.email.sending", defaultValue: "Envoi…", bundle: .main)
                 : String(localized: "activation.email.send", defaultValue: "Recevoir le code", bundle: .main))
                .font(.body.weight(.bold))
                .frame(maxWidth: .infinity, minHeight: 48)
                .foregroundStyle(.white)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(MeeshyColors.brandGradient))
        }
        .buttonStyle(.plain)
        .disabled(code.isResending)
    }
}

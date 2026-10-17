import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// Ce que dit la question « Se connecter en tant que @x ? » (#10872, #10880) —
/// le contrat de la réponse `requiresConfirmation` de la passerelle (`id`,
/// `username`, `displayName`, `avatar`), mis en mots une seule fois.
nonisolated struct LinkSignInConfirmationContent: Equatable {
    let title: String
    let message: String
    let handle: String
    /// `nil` quand il manque, est blanc, ou répète le @nom.
    let displayName: String?
    /// `nil` ⇒ l'avatar se rend en initiales.
    let avatarURL: String?
    let avatarName: String
    let accountAccessibilityLabel: String

    init(account: LinkSignInAccount, signedIn current: MeeshyUser?) {
        let handle = "@\(account.username)"
        let name = account.displayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let avatar = account.avatar?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.handle = handle
        self.displayName = name.isEmpty || name == account.username ? nil : name
        self.avatarURL = Self.isMeeshyHosted(avatar) ? avatar : nil
        self.avatarName = self.displayName ?? account.username
        self.accountAccessibilityLabel = AccountReplacementAlert.label(displayName: account.displayName, username: account.username)
        self.title = String(localized: "signInLink.deviceConfirm.title", defaultValue: "Se connecter en tant que \(handle) ?", bundle: .main)
        self.message = Self.message(incomingLabel: accountAccessibilityLabel, signedIn: current)
    }

    /// L'avatar est choisi par le compte du lien : il ne se charge que depuis
    /// Meeshy — une URL libre pisterait celui qui ouvre le lien, au moment où
    /// il l'ouvre. Ailleurs, les initiales.
    private static func isMeeshyHosted(_ avatar: String) -> Bool {
        if avatar.hasPrefix("/") && !avatar.hasPrefix("//") { return true }
        guard let url = URL(string: avatar), url.scheme?.lowercased() == "https",
              url.user == nil, let host = url.host?.lowercased() else { return false }
        return host == "meeshy.me" || host.hasSuffix(".meeshy.me")
    }

    private static func message(incomingLabel: String, signedIn current: MeeshyUser?) -> String {
        guard let current, !current.username.isEmpty else {
            return String(localized: "signInLink.deviceConfirm.message", defaultValue: "Ce lien de connexion n'a pas été demandé depuis cet appareil. Il ouvre le compte \(incomingLabel).\n\nNe continuez que si ce compte vous appartient.", bundle: .main)
        }
        let currentLabel = AccountReplacementAlert.label(displayName: current.displayName, username: current.username)
        return String(localized: "signInLink.deviceConfirm.messageReplacing", defaultValue: "Ce lien de connexion n'a pas été demandé depuis cet appareil. Il ouvre le compte \(incomingLabel), à la place de \(currentLabel) qui est ouvert (il restera au sélecteur de comptes).\n\nNe continuez que si ce compte vous appartient.", bundle: .main)
    }
}

/// La feuille de la question (#10880) : le compte du lien se VOIT — avatar,
/// @nom, nom affiché — comme sur le web. « Annuler » est l'action mise en
/// avant et celle du clavier : un lien qu'on n'a pas demandé se refuse d'un
/// geste.
struct LinkSignInConfirmationView: View {
    let content: LinkSignInConfirmationContent
    let onAnswer: (Bool) -> Void

    @Environment(\.colorScheme) private var colorScheme
    @AccessibilityFocusState private var titleFocused: Bool
    /// « Se connecter » ne s'arme qu'un instant après l'apparition : la
    /// feuille monte après un aller-retour réseau, sous un doigt qui tapait
    /// peut-être déjà ailleurs.
    @State private var armed = false
    static let armingDelay: Duration = .milliseconds(700)

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Image(systemName: "exclamationmark.shield.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(MeeshyColors.warning)
                    .accessibilityHidden(true)
                    .padding(.top, 8)

                Text(content.title)
                    .font(.title3.bold())
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityFocused($titleFocused)

                accountCard

                Text(content.message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)

                answers
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 24)
        }
        .accessibilityIdentifier("signInLink.confirmation")
        .onAppear { titleFocused = true }
        .task {
            try? await Task.sleep(for: Self.armingDelay)
            armed = true
        }
    }

    private var accountCard: some View {
        HStack(spacing: 14) {
            MeeshyAvatar(
                name: content.avatarName,
                context: .custom(56),
                avatarURL: content.avatarURL,
                enablePulse: false,
                isDark: colorScheme == .dark
            )
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(content.handle)
                    .font(.body.bold())
                    .lineLimit(1)
                if let displayName = content.displayName {
                    Text(displayName)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(uiColor: .secondarySystemBackground))
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(content.accountAccessibilityLabel)
        .accessibilityIdentifier("signInLink.confirmation.account")
    }

    private var answers: some View {
        VStack(spacing: 12) {
            Button { onAnswer(false) } label: {
                Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                    .font(.body.bold())
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(MeeshyColors.brandGradient, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.defaultAction)
            .accessibilityIdentifier("signInLink.confirmation.cancel")

            Button { onAnswer(true) } label: {
                Text(String(localized: "signInLink.deviceConfirm.confirm", defaultValue: "Se connecter", bundle: .main))
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(Color.secondary.opacity(0.5), lineWidth: 1)
                    )
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!armed)
            .opacity(armed ? 1 : 0.5)
            .accessibilityIdentifier("signInLink.confirmation.confirm")
        }
    }
}

/// Posée par UIKit depuis le contrôleur le plus haut, comme l'alerte qu'elle
/// remplace (#10880) : une feuille SwiftUI accrochée à la racine ne se
/// présente pas quand une autre l'est déjà.
///
/// Même contrat de réponse que `AccountReplacementAlert` (#10450, #10463) :
/// UNE réponse, toujours — « non » pour une feuille refermée sans bouton,
/// `.unavailable` si elle n'a pas pu se présenter.
@MainActor
final class LinkSignInConfirmationSheet: LinkSignInConfirming {
    nonisolated deinit {}
    static let shared = LinkSignInConfirmationSheet()

    private static let unansweredDismissalGrace: Duration = .milliseconds(500)

    func confirmSignIn(as account: LinkSignInAccount, signedIn current: MeeshyUser?) async -> AccountReplacementDecision {
        guard let top = Self.topMostController() else { return .unavailable }
        let content = LinkSignInConfirmationContent(account: account, signedIn: current)
        return await withCheckedContinuation { continuation in
            let answer = AccountReplacementAnswer(continuation)
            let presented = PresentedSheet()
            let sheet = LinkSignInConfirmationHostingController(rootView: LinkSignInConfirmationView(content: content) { accepted in
                answer.give(accepted ? .accepted : .declined)
                presented.controller?.dismiss(animated: true)
            })
            presented.controller = sheet
            sheet.modalPresentationStyle = .pageSheet
            if let presentation = sheet.sheetPresentationController {
                presentation.detents = [.medium(), .large()]
                presentation.prefersGrabberVisible = true
            }
            sheet.onDisappear = { [weak sheet] in
                Task { @MainActor [weak sheet] in
                    try? await Task.sleep(for: Self.unansweredDismissalGrace)
                    guard sheet?.presentingViewController == nil else { return }
                    answer.give(.declined)
                }
            }
            top.present(sheet, animated: true) { [weak sheet] in
                if sheet?.presentingViewController == nil { answer.give(.unavailable) }
            }
            if sheet.presentingViewController == nil { answer.give(.unavailable) }
        }
    }

    private static func topMostController() -> UIViewController? {
        var top = DeviceLayout.activeWindow?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}

/// La feuille présentée, que ses boutons referment sans la retenir.
@MainActor
private final class PresentedSheet {
    nonisolated deinit {}
    weak var controller: UIViewController?
}

/// La feuille qui dit quand elle a QUITTÉ l'écran — un bouton touché, ou un
/// glissement vers le bas.
final class LinkSignInConfirmationHostingController: UIHostingController<LinkSignInConfirmationView> {
    nonisolated deinit {}
    var onDisappear: (() -> Void)?

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        onDisappear?()
    }
}

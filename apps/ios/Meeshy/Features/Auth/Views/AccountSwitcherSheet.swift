import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Ce qu'une rangée de compte DIT (#8286)

/// Le compte actuel, un compte GARDÉ (qui s'ouvre sans mot de passe), ou un
/// compte déconnecté (qui le redemande). La même loi pour l'écran de connexion
/// et pour « Changer de compte ».
enum SavedAccountStatus: Equatable {
    case current
    case signedIn
    case signedOut

    static func of(_ account: SavedAccount, activeId: String?, isPreserved: Bool) -> SavedAccountStatus {
        if account.id == activeId { return .current }
        return isPreserved ? .signedIn : .signedOut
    }

    var opensWithoutPassword: Bool { self == .signedIn }

    var label: String? {
        switch self {
        case .current: return String(localized: "accounts.row.current", defaultValue: "Compte actuel", bundle: .main)
        case .signedIn: return String(localized: "accounts.row.signed_in", defaultValue: "Connecté", bundle: .main)
        case .signedOut: return nil
        }
    }
}

// MARK: - L'intention remise à l'écran de connexion

/// Quitter le compte actuel pour se connecter à un AUTRE démonte les réglages
/// avant que `LoginView` n'existe : l'intention l'y attend ici, en mémoire
/// vive, et ne sert qu'une fois (motif `LoginEmailHandoff`).
@MainActor
final class LoginAccountHandoff {
    nonisolated deinit {}

    enum Intent: Equatable {
        /// Ouvrir le formulaire d'un nouveau compte, pas le sélecteur.
        case addAccount
        /// Ouvrir la saisie du mot de passe de CE compte.
        case account(id: String)
    }

    static let shared = LoginAccountHandoff()

    private var held: Intent?

    init() {}

    func hold(_ intent: Intent) { held = intent }

    func take() -> Intent? {
        defer { held = nil }
        return held
    }
}

// MARK: - La rangée

/// Avatar, nom, @pseudo — et l'état du compte quand il en a un à dire.
struct SavedAccountRow: View {
    let account: SavedAccount
    let status: SavedAccountStatus
    let textPrimary: Color
    let textMuted: Color
    let fill: Color
    let stroke: Color

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            MeeshyAvatar(
                name: account.shortName,
                context: .custom(44),
                kind: .user,
                avatarURL: account.avatarURL,
                enablePulse: false
            )
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: MeeshySpacing.xs / 2) {
                Text(account.shortName)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundColor(textPrimary)
                Text(verbatim: "@\(account.username)")
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .regular))
                    .foregroundColor(textMuted)
            }

            Spacer(minLength: MeeshySpacing.sm)

            if let label = status.label {
                HStack(spacing: MeeshySpacing.xs) {
                    if status == .current {
                        Image(systemName: "checkmark")
                            .accessibilityHidden(true)
                    }
                    Text(label)
                }
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo500)
            } else {
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundColor(textMuted.opacity(0.5))
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
        .frame(minHeight: 60)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(fill)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .stroke(stroke, lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(status == .current ? [.isSelected] : [.isButton])
    }
}

// MARK: - La feuille « Changer de compte »

/// Garde les sessions : passer à un compte gardé ne demande aucun mot de passe,
/// revenir au précédent non plus. Un compte déconnecté, ou un compte à
/// ajouter, mène à la connexion — le compte actuel reste gardé.
struct AccountSwitcherSheet: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: MeeshySpacing.md) {
                    ForEach(authManager.savedAccounts) { account in
                        let status = SavedAccountStatus.of(
                            account,
                            activeId: authManager.currentUser?.id,
                            isPreserved: authManager.hasPreservedSession(for: account.id)
                        )
                        Button { choose(account, status: status) } label: {
                            SavedAccountRow(
                                account: account,
                                status: status,
                                textPrimary: theme.textPrimary,
                                textMuted: theme.textMuted,
                                fill: theme.inputBackground,
                                stroke: theme.inputBorder.opacity(0.3)
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(status == .current)
                    }

                    Button(action: addAccount) {
                        Label(String(localized: "accounts.add", defaultValue: "Ajouter un compte", bundle: .main),
                              systemImage: "plus")
                            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                            .foregroundColor(MeeshyColors.indigo500)
                            .frame(maxWidth: .infinity, minHeight: 52)
                    }
                    .accessibilityIdentifier("accounts.add")
                }
                .padding(MeeshySpacing.lg)
            }
            .background(theme.backgroundGradient.ignoresSafeArea())
            .navigationTitle(String(localized: "settings.switchAccount.title", defaultValue: "Changer de compte", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", bundle: .main)) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func choose(_ account: SavedAccount, status: SavedAccountStatus) {
        HapticFeedback.light()
        if status.opensWithoutPassword {
            dismiss()
            Task { await authManager.switchAccount(to: account.id) }
            return
        }
        LoginAccountHandoff.shared.hold(.account(id: account.id))
        dismiss()
        Task { await authManager.suspendActiveSession() }
    }

    private func addAccount() {
        HapticFeedback.light()
        LoginAccountHandoff.shared.hold(.addAccount)
        dismiss()
        Task { await authManager.suspendActiveSession() }
    }
}

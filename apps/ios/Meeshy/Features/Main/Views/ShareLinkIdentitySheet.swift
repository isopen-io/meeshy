import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le choix en attente sur un lien de partage.
struct ShareLinkIdentityChoice: Identifiable {
    /// `linkId` du lien tapé — l'identité de la feuille, un lien à la fois.
    let identifier: String
    let conversationId: String
    let conversationTitle: String?
    /// Une session invitée dort déjà sur ce lien : la branche anonyme la
    /// REPREND au lieu d'en ouvrir une seconde.
    let resumesGuestSession: Bool

    var id: String { identifier }
}

/// « Vous entrez sous quel nom ? »
///
/// L'app rejoignait silencieusement avec le compte présent. Un lien reçu dans
/// un groupe qu'on ne connaît pas engageait donc le compte réel — nom, photo,
/// historique — sans que rien ne le demande, et une jointure ne se défait pas
/// d'un geste.
///
/// Deux branches, jamais trois : le compte, ou l'anonymat. L'annulation est un
/// geste, pas un bouton — la feuille se referme sans rien engager.
struct ShareLinkIdentitySheet: View {
    let choice: ShareLinkIdentityChoice
    let accountDisplayName: String
    let accountUsername: String?
    let onContinueWithAccount: () -> Void
    let onJoinAnonymously: () -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            header

            VStack(spacing: 12) {
                identityOption(
                    testId: "share-link-identity-account",
                    icon: "person.crop.circle.fill",
                    tint: MeeshyColors.indigo500,
                    title: String(
                        localized: "shareLink.identity.account.title",
                        defaultValue: "Continuer en tant que \(accountDisplayName)",
                        bundle: .main
                    ),
                    subtitle: accountUsername.map { "@\($0)" } ?? String(
                        localized: "shareLink.identity.account.subtitle",
                        defaultValue: "Votre compte, votre historique",
                        bundle: .main
                    ),
                    action: {
                        dismiss()
                        onContinueWithAccount()
                    }
                )

                identityOption(
                    testId: "share-link-identity-anonymous",
                    icon: "theatermasks.fill",
                    tint: Color.purple,
                    title: choice.resumesGuestSession
                        ? String(
                            localized: "shareLink.identity.anonymous.resume",
                            defaultValue: "Reprendre en anonyme",
                            bundle: .main
                        )
                        : String(
                            localized: "shareLink.identity.anonymous.title",
                            defaultValue: "Rejoindre sans compte",
                            bundle: .main
                        ),
                    subtitle: String(
                        localized: "shareLink.identity.anonymous.subtitle",
                        defaultValue: "Votre compte reste en dehors de cette conversation",
                        bundle: .main
                    ),
                    action: {
                        dismiss()
                        onJoinAnonymously()
                    }
                )
            }

            Spacer(minLength: 0)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.backgroundPrimary.ignoresSafeArea())
        .presentationDetents([.height(320)])
        .presentationDragIndicator(.visible)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(String(
                localized: "shareLink.identity.title",
                defaultValue: "Rejoindre la conversation",
                bundle: .main
            ))
            .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold, design: .rounded))
            .foregroundColor(theme.textPrimary)

            if let title = choice.conversationTitle, !title.isEmpty {
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular, design: .rounded))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }
        }
    }

    private func identityOption(
        testId: String,
        icon: String,
        tint: Color,
        title: String,
        subtitle: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(tint)
                    .frame(width: 40, height: 40)
                    .background(tint.opacity(0.12))
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                        .multilineTextAlignment(.leading)
                    Text(subtitle)
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .regular, design: .rounded))
                        .foregroundColor(theme.textSecondary)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.forward")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textSecondary.opacity(0.6))
            }
            .padding(14)
            .background(theme.backgroundSecondary)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(testId)
    }
}

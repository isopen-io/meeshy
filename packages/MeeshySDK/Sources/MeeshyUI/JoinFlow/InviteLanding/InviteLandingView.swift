import SwiftUI
import MeeshySDK

/// La page d'accueil d'une invitation (#7795), la même avec ou sans compte :
/// qui invite et son message, la carte du groupe et son adresse, ce qu'on y
/// parle, ce qu'un invité anonyme pourra faire, puis les choix.
///
/// Un building block : il reçoit le lien déjà résolu et rend ses choix par
/// `onChoice` — rejoindre, se connecter, créer un compte restent l'affaire de
/// l'hôte (`JoinFlowSheet` sans compte, l'app avec un compte).
public struct InviteLandingView: View {
    let info: ShareLinkInfo
    let isSignedIn: Bool
    let resumesGuestSession: Bool
    let accountInitials: String?
    let onChoice: (InviteLandingChoice) -> Void
    let onClose: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var now = Date()

    public init(
        info: ShareLinkInfo,
        isSignedIn: Bool,
        resumesGuestSession: Bool = false,
        accountInitials: String? = nil,
        onChoice: @escaping (InviteLandingChoice) -> Void,
        onClose: @escaping () -> Void
    ) {
        self.info = info
        self.isSignedIn = isSignedIn
        self.resumesGuestSession = resumesGuestSession
        self.accountInitials = accountInitials
        self.onChoice = onChoice
        self.onClose = onClose
    }

    private var isDark: Bool { colorScheme == .dark }

    public var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                InviteInviterHeader(creator: info.creator, message: info.description, isDark: isDark)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .padding(.top, MeeshySpacing.lg)
                InviteGroupCard(conversation: info.conversation, address: info.address, isDark: isDark)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.top, 22)
                InviteGroupFacts(stats: info.stats, shares: info.spokenLanguageShares, isDark: isDark)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.top, MeeshySpacing.lg)
                InviteGuestTermsCard(info: info, now: now, isDark: isDark)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.top, 10)
            }
            .padding(.bottom, MeeshySpacing.xxl)
        }
        .safeAreaInset(edge: .top, spacing: 0) { header }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            InviteChoicesPanel(
                choices: info.landingChoices(isSignedIn: isSignedIn, now: now),
                isSignedIn: isSignedIn,
                requireAccount: info.requireAccount,
                resumesGuestSession: resumesGuestSession,
                accountInitials: accountInitials,
                isDark: isDark,
                onChoice: onChoice
            )
        }
        .background(background.ignoresSafeArea())
        .accessibilityIdentifier("invite-landing")
    }

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                onClose()
            } label: {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                    .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.indigo600)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(isDark ? MeeshyColors.indigo900.opacity(0.7) : Color.white))
                    .shadow(color: MeeshyColors.indigo900.opacity(isDark ? 0 : 0.1), radius: 8, y: 4)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(InviteLandingCopy.close)
            Spacer()
            Text(InviteLandingCopy.headerTitle)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
                .scriptSafeTracking(1)
                .textCase(.uppercase)
                .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo500)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            Color.clear.frame(width: 44, height: 44)
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.md)
        .padding(.bottom, MeeshySpacing.xs)
        .background(
            (isDark ? MeeshyColors.indigo950 : MeeshyColors.indigo50)
                .opacity(0.94)
                .ignoresSafeArea(edges: .top)
        )
    }

    private var background: some View {
        LinearGradient(
            colors: isDark
                ? [MeeshyColors.indigo950, Color.black]
                : [MeeshyColors.indigo50, Color.white],
            startPoint: .top,
            endPoint: .center
        )
    }
}

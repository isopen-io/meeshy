import SwiftUI
import MeeshySDK

/// Le pied de page : l'action principale en dégradé de la marque, les autres
/// en contour. L'ordre et la présence de chaque choix viennent de
/// `ShareLinkInvitationTerms.choices` — la vue ne décide rien.
struct InviteChoicesPanel: View {
    let choices: [InviteLandingChoice]
    let isSignedIn: Bool
    let requireAccount: Bool
    let resumesGuestSession: Bool
    let accountInitials: String?
    let isDark: Bool
    let onChoice: (InviteLandingChoice) -> Void

    private var primary: InviteLandingChoice? { choices.first }
    private var secondary: [InviteLandingChoice] { Array(choices.dropFirst()) }

    var body: some View {
        VStack(spacing: 10) {
            if let primary {
                if requireAccount && !isSignedIn { notice(InviteLandingCopy.accountRequired) }
                primaryButton(primary)
                if primary == .joinAnonymously && !isSignedIn { caption(InviteLandingCopy.anonymousCaptionSignedOut) }
                secondaryButtons
                if isSignedIn && secondary.contains(.joinAnonymously) { caption(InviteLandingCopy.anonymousCaptionSignedIn) }
            } else {
                notice(InviteLandingCopy.closed)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, 18)
        .padding(.bottom, MeeshySpacing.md)
        .background(
            (isDark ? MeeshyColors.indigo950 : Color.white)
                .opacity(0.94)
                .background(.ultraThinMaterial)
                .ignoresSafeArea(edges: .bottom)
        )
        .overlay(alignment: .top) {
            Rectangle()
                .fill(isDark ? MeeshyColors.indigo800.opacity(0.55) : MeeshyColors.indigo100)
                .frame(height: 1)
        }
    }

    @ViewBuilder
    private var secondaryButtons: some View {
        if secondary.count == 2 {
            HStack(spacing: 10) { ForEach(secondary, id: \.self, content: secondaryButton) }
        } else {
            ForEach(secondary, id: \.self, content: secondaryButton)
        }
    }

    private func title(_ choice: InviteLandingChoice) -> String {
        InviteLandingCopy.title(for: choice, isSignedIn: isSignedIn, resumesGuestSession: resumesGuestSession)
    }

    private func primaryButton(_ choice: InviteLandingChoice) -> some View {
        Button {
            HapticFeedback.medium()
            onChoice(choice)
        } label: {
            HStack(spacing: 10) {
                if choice == .joinWithAccount, let initials = accountInitials, !initials.isEmpty {
                    Text(verbatim: initials)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .heavy))
                        .foregroundColor(MeeshyColors.indigo600)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(Color.white))
                        .accessibilityHidden(true)
                }
                Text(title(choice))
                    .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .heavy))
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity, minHeight: 56)
            .padding(.horizontal, MeeshySpacing.lg)
            .background(
                LinearGradient(colors: [MeeshyColors.indigo500, MeeshyColors.purple600], startPoint: .topLeading, endPoint: .bottomTrailing)
            )
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: MeeshyColors.indigo500.opacity(isDark ? 0.2 : 0.35), radius: 12, y: 8)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("invite-landing-\(identifier(choice))")
    }

    private func secondaryButton(_ choice: InviteLandingChoice) -> some View {
        Button {
            HapticFeedback.light()
            onChoice(choice)
        } label: {
            Text(title(choice))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.85)
                .foregroundColor(isDark ? MeeshyColors.indigo100 : MeeshyColors.indigo900)
                .frame(maxWidth: .infinity, minHeight: 48)
                .padding(.horizontal, MeeshySpacing.sm)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                        .fill(isDark ? Color.clear : Color.white)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                        .stroke(isDark ? MeeshyColors.indigo700 : MeeshyColors.indigo200, lineWidth: 1.5)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("invite-landing-\(identifier(choice))")
    }

    private func caption(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.subheadSize))
            .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral500)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func notice(_ text: String) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "info.circle.fill")
                .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo600)
                .accessibilityHidden(true)
            Text(text)
                .foregroundColor(isDark ? MeeshyColors.indigo100 : MeeshyColors.indigo900)
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(MeeshyFont.relative(14, weight: .medium))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                .fill(isDark ? MeeshyColors.indigo900.opacity(0.6) : MeeshyColors.indigo50)
        )
        .accessibilityElement(children: .combine)
    }

    private func identifier(_ choice: InviteLandingChoice) -> String {
        switch choice {
        case .joinWithAccount: return "account"
        case .joinAnonymously: return "anonymous"
        case .signIn: return "sign-in"
        case .signUp: return "sign-up"
        }
    }
}

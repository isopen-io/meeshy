import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'en-tête d'une face de MA fiche (planches `Moi-Actions`, `Moi-Liens`) : mon avatar, le nom de la face en grand,
/// mon pseudo dessous, et à droite le geste propre à la face. Posé sur la bannière vivante du kit (K27) en voile — le
/// dégradé de ma teinte, ses orbes, le fondu vers le fond —, bord à bord, muette pour VoiceOver.
struct ProfileFaceHeader<Trailing: View>: View {
    let user: MeeshyUser?
    let title: String
    let accentColor: String
    let identifier: String
    let trailing: Trailing

    init(user: MeeshyUser?, title: String, accentColor: String, identifier: String,
         @ViewBuilder trailing: () -> Trailing) {
        self.user = user
        self.title = title
        self.accentColor = accentColor
        self.identifier = identifier
        self.trailing = trailing()
    }

    /// La hauteur de l'en-tête des planches.
    static var height: Double { 150 }

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            identity
            Spacer(minLength: 0)
            trailing
        }
        .padding(.bottom, MeeshySpacing.sm)
        .frame(maxWidth: .infinity, minHeight: Self.height, alignment: .bottomLeading)
        .background(alignment: .bottom) {
            MeeshyLivingBanner(tint: Color(hex: accentColor), mode: .veil, height: Self.height)
                .padding(.horizontal, -MeeshySpacing.lg)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    private var identity: some View {
        HStack(spacing: MeeshySpacing.md) {
            MeeshyAvatar(name: user?.displayName ?? user?.username ?? "", context: .custom(40),
                         accentColor: accentColor, avatarURL: user?.avatar, thumbHash: user?.avatarThumbHash)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.largeTitleSize, weight: .heavy, design: .rounded))
                    .foregroundStyle(theme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                if let handle = ProfileActionsCopy.handle(of: user) {
                    Text(handle)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium, design: .monospaced))
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }
}

extension ProfileFaceHeader where Trailing == EmptyView {
    init(user: MeeshyUser?, title: String, accentColor: String, identifier: String) {
        self.init(user: user, title: title, accentColor: accentColor, identifier: identifier, trailing: { EmptyView() })
    }
}

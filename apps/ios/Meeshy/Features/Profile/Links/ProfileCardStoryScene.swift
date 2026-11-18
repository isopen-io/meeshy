import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Mettre en story » (planche `Carte-Profil`) : ma carte posée au centre d'une scène 9:16, à la couleur de ma fiche.
/// Le QR porte l'adresse de ma VITRINE, qui dure autant que la story ; jamais le jeton bref d'une invitation.
struct ProfileCardStoryScene: View {
    static let size = CGSize(width: 360, height: 640)

    let link: ProfileLink
    let displayName: String?
    let accent: Color

    var body: some View {
        ZStack {
            LinearGradient(colors: [accent, accent.opacity(0.55)], startPoint: .top, endPoint: .bottom)
            MeeshyCodeCard(payload: link.url.absoluteString, label: ProfileLinksCopy.qrLabel, caption: link.displayText,
                           tint: accent, style: .plain, size: .large, tilt: .none, boostsBrightness: false,
                           center: { EmptyView() }, header: { identity })
                .padding(MeeshySpacing.xl)
        }
        .frame(width: Self.size.width, height: Self.size.height)
        .environment(\.colorScheme, .light)
    }

    private var identity: some View {
        VStack(spacing: 2) {
            Text(displayName ?? link.username)
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold, design: .rounded))
            Text(verbatim: "@\(link.username)")
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, design: .monospaced))
                .foregroundStyle(.secondary)
        }
    }
}

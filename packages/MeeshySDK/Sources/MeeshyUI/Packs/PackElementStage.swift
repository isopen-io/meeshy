import SwiftUI
import MeeshySDK

// MARK: - Un élément POSÉ sur ce qu'il décore (#16268)

/// Celui ou celle qui essaie la décoration : son avatar, sa bannière et le décor qu'il porte.
public struct PackStageWearer: Equatable, Sendable {
    public let name: String
    public let avatarURL: String?
    public let accentHex: String
    public let bannerURL: String?
    public let bannerThumbHash: String?
    public let decor: ServedProfileDecor?

    public init(name: String, avatarURL: String? = nil, accentHex: String = MeeshyColors.brandPrimaryHex,
                bannerURL: String? = nil, bannerThumbHash: String? = nil, decor: ServedProfileDecor? = nil) {
        self.name = name
        self.avatarURL = avatarURL
        self.accentHex = accentHex
        self.bannerURL = bannerURL
        self.bannerThumbHash = bannerThumbHash
        self.decor = decor
    }

    /// Le compte connecté, ou un essayeur sans visage hors session.
    public static var current: PackStageWearer {
        guard let user = AuthManager.shared.currentUser else { return PackStageWearer(name: "Meeshy") }
        return PackStageWearer(name: user.displayName ?? user.username, avatarURL: user.avatar,
                               accentHex: user.profileAccentHex, bannerURL: user.banner,
                               bannerThumbHash: user.bannerThumbHash, decor: user.profileDecor)
    }
}

/// **L'élément sur son support** : un contour sur MON avatar, une bannière ou un cadre sur MA bannière,
/// un fond derrière une conversation. Il s'anime s'il est dynamique, sauf dans une vignette.
struct PackElementStage: View {
    let element: PackElement
    let wearer: PackStageWearer
    var animates: Bool = true
    var compact: Bool = false

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        GeometryReader { geo in
            content(in: geo.size)
                .frame(width: geo.size.width, height: geo.size.height)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(element.name)
    }

    @ViewBuilder
    private func content(in size: CGSize) -> some View {
        switch element.art {
        case .avatarRing(let design):
            let side = min(size.width, size.height) * (compact ? 0.62 : 0.5)
            MeeshyAvatar(name: wearer.name, context: .custom(side), accentColor: wearer.accentHex, avatarURL: wearer.avatarURL)
                .avatarRing(design, avatarSize: side, animates: animates)
        case .banner(let design):
            profileHeader(width: min(size.width, compact ? size.width : 520)) {
                BannerDesignView(design: design, isDark: isDark, accentHex: wearer.accentHex, animates: animates)
            }
        case .bannerFrame(let design):
            profileHeader(width: min(size.width, compact ? size.width : 520)) {
                wornBanner
                    .overlay { BannerFrameView(design: design, animates: animates).equatable() }
            }
        case .wallpaper(let design):
            BannerDesignView(design: design, isDark: isDark, accentHex: wearer.accentHex, animates: animates)
                .frame(width: size.width, height: size.height)
                .overlay { if !compact { PackSampleConversation(accentHex: wearer.accentHex) } }
        case .sticker(let sticker):
            MeeStickerFilmView(sticker: sticker, side: min(size.width, size.height) * (compact ? 0.8 : 0.6),
                               animates: animates,
                               pixelCap: compact ? MeeStickerFilmView.gridPixelCap : 720)
        }
    }

    /// Une bannière 3:1 et, sous elle, l'avatar qui la chevauche — comme la fiche de profil.
    private func profileHeader<Banner: View>(width: CGFloat, @ViewBuilder banner: () -> Banner) -> some View {
        let bannerHeight = width / 3
        let avatar = bannerHeight * 0.55
        return VStack(spacing: 0) {
            Color.clear
                .frame(width: width, height: bannerHeight)
                .overlay { banner() }
                .clipShape(RoundedRectangle(cornerRadius: compact ? MeeshyRadius.sm : MeeshyRadius.md))
            if !compact {
                MeeshyAvatar(name: wearer.name, context: .custom(avatar), accentColor: wearer.accentHex, avatarURL: wearer.avatarURL)
                    .overlay(Circle().stroke(Color(uiColor: .systemBackground), lineWidth: 3))
                    .offset(y: -avatar / 2)
                    .padding(.bottom, -avatar / 2)
                Text(wearer.name)
                    .font(MeeshyFont.relative(17, weight: .semibold, design: .rounded))
                    .foregroundStyle(.primary)
                    .padding(.top, MeeshySpacing.sm)
            }
        }
    }

    /// Ma bannière actuelle — la photo gagne, puis le design porté, sinon le dégradé du profil.
    @ViewBuilder
    private var wornBanner: some View {
        switch ProfileDecorResolver.bannerPaint(photo: wearer.bannerURL, decor: wearer.decor?.banner) {
        case .photo(let url):
            CachedBannerImage(urlString: url, thumbHash: wearer.bannerThumbHash, fallbackColor: wearer.accentHex, height: 120)
        case .design(let design):
            BannerDesignView(design: design, isDark: isDark, accentHex: wearer.accentHex, animates: animates)
        case .plain:
            LinearGradient(colors: [Color(hex: wearer.accentHex).opacity(0.3), MeeshyColors.indigo300.opacity(0.2)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }
}

/// Trois bulles factices : un fond se juge derrière une conversation, pas seul.
struct PackSampleConversation: View {
    let accentHex: String

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
            Spacer(minLength: 0)
            bubble(String(localized: "shop.viewer.bubble.1", defaultValue: "Salut ! Tu as vu ce fond ?", bundle: .module), mine: false)
            bubble(String(localized: "shop.viewer.bubble.2", defaultValue: "Oui, il est superbe 😍", bundle: .module), mine: true)
            bubble(String(localized: "shop.viewer.bubble.3", defaultValue: "On le garde pour notre conversation ?", bundle: .module), mine: false)
        }
        .padding(MeeshySpacing.lg)
        .padding(.bottom, 180)
        .accessibilityHidden(true)
    }

    private func bubble(_ text: String, mine: Bool) -> some View {
        HStack {
            if mine { Spacer(minLength: 60) }
            Text(text)
                .font(MeeshyFont.relative(15))
                .foregroundStyle(mine ? Color.white : Color.primary)
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, MeeshySpacing.sm)
                .background {
                    RoundedRectangle(cornerRadius: 18)
                        .fill(mine ? AnyShapeStyle(Color(hex: accentHex)) : AnyShapeStyle(.regularMaterial))
                }
            if !mine { Spacer(minLength: 60) }
        }
    }
}

/// Un pack que l'appareil ne sait pas encore peindre : le dire, dessiné, jamais une page vide.
struct PackDownloadRequiredView: View {
    var compact: Bool = false

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "arrow.down.circle.dotted")
                .font(MeeshyFont.relative(compact ? 28 : 48, weight: .regular))
                .foregroundStyle(MeeshyColors.indigo500)
            Text(String(localized: "shop.viewer.download.title", defaultValue: "Téléchargement requis", bundle: .module))
                .font(MeeshyFont.relative(compact ? 13 : 17, weight: .semibold, design: .rounded))
            if !compact {
                Text(String(localized: "shop.viewer.download.body", defaultValue: "Installe ce pack pour voir ses éléments.", bundle: .module))
                    .font(MeeshyFont.relative(14))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(MeeshySpacing.lg)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(Color.primary.opacity(0.05)))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("shop.downloadRequired")
    }
}

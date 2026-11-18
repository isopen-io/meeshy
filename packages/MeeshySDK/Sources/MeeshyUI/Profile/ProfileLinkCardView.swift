import SwiftUI
import MeeshySDK

/// **La carte d'un lien de fiche dépliée dans une bulle** (#19519, planche `Apercu-Lien` § 2 « Dans une conversation
/// Meeshy ») — faite du kit : la carte K43 `preview` en bulle, sa mini-bannière à l'accent servi, l'avatar en
/// emblème, le nom, le pseudo, la bio dans la langue du lecteur marquée K51, puis « Voir la vitrine » · « Écrire »
/// (K40).
///
/// Agnostique : elle reçoit sa face (`ProfileLinkCardFace`) et deux gestes ; l'app décide ce qu'ils ouvrent.
public struct ProfileLinkCardView: View {
    private let face: ProfileLinkCardFace
    private let onOpen: () -> Void
    private let onWrite: (() -> Void)?

    @State private var isShowingOriginal = false
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.locale) private var locale

    public init(face: ProfileLinkCardFace, onOpen: @escaping () -> Void, onWrite: (() -> Void)? = nil) {
        self.face = face
        self.onOpen = onOpen
        self.onWrite = onWrite
    }

    private var isDark: Bool { colorScheme == .dark }
    private var accent: Color { Color(hex: face.accentHex) }

    public var body: some View {
        MeeshyGroupCard(
            surface: .raised, layout: .preview, tint: accent, isBubble: true,
            label: ProfileLinkCardCopy.cardLabel(name: face.name, handle: face.handleText),
            accessory: { EmptyView() },
            media: { ProfileLinkCardBanner(accent: accent) },
            emblem: { avatar },
            content: { identity },
            footer: { actions }
        )
        .accessibilityIdentifier("profile-link-card")
    }

    private var avatar: some View {
        MeeshyAvatar(name: face.name, context: .custom(52), accentColor: face.accentHex,
                     avatarURL: face.avatarURL, thumbHash: face.avatarThumbHash, presenceState: face.presence,
                     isDark: isDark, onTap: onOpen)
            .padding(4)
            .background(Circle().fill(MeeshyColors.backgroundSecondary(isDark: isDark)))
            .accessibilityLabel(ProfileLinkCardCopy.openShowcase)
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            VStack(alignment: .leading, spacing: 0) {
                Text(face.name)
                    .font(MeeshyFont.relative(18, weight: .bold, design: .rounded))
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                    .lineLimit(2)
                Text(face.handleText)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium, design: .monospaced))
                    .foregroundStyle(accent)
                    .lineLimit(1)
            }
            .accessibilityElement(children: .combine)
            if let bio = face.bio { bioBlock(bio) }
        }
        .padding(.horizontal, CGFloat(MeeshyGroupCardRecipe.dividerInset))
        .padding(.top, MeeshySpacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func bioBlock(_ bio: ProfileLinkBio) -> some View {
        Text(bio.text(showingOriginal: isShowingOriginal))
            .font(MeeshyFont.relative(MeeshyFont.subheadSize))
            .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("profile-link-card.bio")
        if let translation = bio.translation {
            MeeshyTranslationMark(
                sourceLanguageName: TranslationLanguagePhrase.phrase(code: translation.originalLanguage, role: .source,
                                                                     locale: locale),
                originalLanguageName: TranslationLanguagePhrase.phrase(code: translation.originalLanguage,
                                                                       role: .original, locale: locale),
                isShowingOriginal: isShowingOriginal,
                onToggle: { isShowingOriginal.toggle() },
                tint: accent
            )
            .accessibilityIdentifier("profile-link-card.translationMark")
        }
    }

    private var actions: some View {
        HStack(spacing: MeeshySpacing.sm) {
            MeeshyButton(ProfileLinkCardCopy.openShowcase, kind: .accent, size: .s44, width: .fill, tint: accent,
                         action: { onOpen() })
                .layoutPriority(1.4)
                .accessibilityIdentifier("profile-link-card.open")
            if let onWrite {
                MeeshyButton(ProfileLinkCardCopy.write, systemImage: "bubble.left", kind: .tinted, size: .s44,
                             width: .fill, tint: accent, action: { onWrite() })
                    .accessibilityIdentifier("profile-link-card.write")
            }
        }
    }
}

/// La mini-bannière de la carte : le dégradé de l'accent et ses deux orbes, sans texte.
struct ProfileLinkCardBanner: View {
    let accent: Color

    var body: some View {
        ZStack {
            LinearGradient(colors: [accent, accent.opacity(0.55)], startPoint: .topLeading, endPoint: .bottomTrailing)
            Circle().fill(Color.white.opacity(0.35)).frame(width: 90, height: 90).blur(radius: 18)
                .offset(x: -110, y: -24)
            Circle().fill(accent.opacity(0.8)).frame(width: 80, height: 80).blur(radius: 18)
                .offset(x: 110, y: 12)
        }
        .frame(height: 62)
        .clipped()
        .accessibilityHidden(true)
    }
}

/// La carte neutre (#19519) : inconnue, cachée, désactivée ou bloquée — la MÊME pour toutes, rien de la personne.
public struct ProfileLinkClosedCard: View {
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    public var body: some View {
        let isDark = colorScheme == .dark
        MeeshyGroupCard(surface: .dashed, layout: .content) {
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "person.crop.circle.badge.questionmark")
                    .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .semibold))
                    .foregroundStyle(MeeshyColors.textMuted(isDark: isDark))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(ProfileLinkCardCopy.closedTitle)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    Text(ProfileLinkCardCopy.closedHint)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                        .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(MeeshySpacing.md)
            .accessibilityElement(children: .combine)
        }
        .accessibilityIdentifier("profile-link-card.closed")
    }
}

/// Le squelette, sur cache VIDE seulement : la silhouette de la carte, sans texte.
public struct ProfileLinkCardSkeleton: View {
    public init() {}

    public var body: some View {
        MeeshyGroupCard(surface: .raised, layout: .preview) {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                MeeshySkeleton(shape: .card(aspect: 4.5, radius: 0))
                MeeshySkeleton(shape: .circle(diameter: 52))
                MeeshySkeleton(shape: .line(widthRatio: 0.5))
                MeeshySkeleton(shape: .line(widthRatio: 0.9))
                MeeshySkeleton(shape: .pill(width: 160))
            }
            .padding(.bottom, MeeshySpacing.md)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ProfileLinkCardCopy.loading)
    }
}

enum ProfileLinkCardCopy {
    static let openShowcase = String(localized: "profile.linkCard.open", defaultValue: "Voir la vitrine", bundle: .module)
    static let write = String(localized: "profile.linkCard.write", defaultValue: "Écrire", bundle: .module)
    static let closedTitle = String(localized: "profile.linkCard.closed.title", defaultValue: "Profil indisponible",
                                    bundle: .module)
    static let closedHint = String(localized: "profile.linkCard.closed.hint",
                                   defaultValue: "Ce profil n'existe pas ou ne s'ouvre pas pour toi.", bundle: .module)
    static let loading = String(localized: "profile.linkCard.loading", defaultValue: "Chargement du profil",
                                bundle: .module)

    static func cardLabel(name: String, handle: String) -> String {
        let format = String(localized: "profile.linkCard.label", defaultValue: "Profil de %1$@, %2$@", bundle: .module)
        return String(format: format, name, handle)
    }
}

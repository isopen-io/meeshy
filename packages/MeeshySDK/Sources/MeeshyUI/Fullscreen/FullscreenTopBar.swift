import SwiftUI

/// **La barre haute du plein écran — la même géographie pour tous** (#8878).
///
/// `[✕] [identité] ··· [actions de fin]` : la porte de sortie au bord de DÉBUT de
/// lecture, l'identité de l'auteur juste après elle quand la surface la place en haut
/// (story), le menu « ⋯ » au bord de FIN. La barre respecte la zone sûre ; le voile
/// (`FullscreenScrims`) et le média, eux, l'ignorent.
public struct FullscreenTopBar<Leading: View, Trailing: View>: View {

    private let tone: FullscreenChromeTone
    private let onClose: () -> Void
    private let leading: Leading
    private let trailing: Trailing

    public init(tone: FullscreenChromeTone = .onMedia,
                onClose: @escaping () -> Void,
                @ViewBuilder leading: () -> Leading,
                @ViewBuilder trailing: () -> Trailing) {
        self.tone = tone
        self.onClose = onClose
        self.leading = leading()
        self.trailing = trailing()
    }

    public var body: some View {
        HStack(spacing: FullscreenChromeMetrics.barSpacing) {
            FullscreenCloseButton(tone: tone, action: onClose)
            leading
            Spacer(minLength: 0)
            trailing
        }
        .padding(.horizontal, FullscreenTopBarLayout.horizontalPadding)
        .padding(.top, FullscreenChromeMetrics.topInset)
    }
}

public extension FullscreenTopBar where Leading == EmptyView {
    init(tone: FullscreenChromeTone = .onMedia,
         onClose: @escaping () -> Void,
         @ViewBuilder trailing: () -> Trailing) {
        self.init(tone: tone, onClose: onClose, leading: { EmptyView() }, trailing: trailing)
    }
}

public extension FullscreenTopBar where Leading == EmptyView, Trailing == EmptyView {
    init(tone: FullscreenChromeTone = .onMedia, onClose: @escaping () -> Void) {
        self.init(tone: tone, onClose: onClose, leading: { EmptyView() }, trailing: { EmptyView() })
    }
}

/// La marge latérale de la barre : le DISQUE visible tombe sur la gouttière du chrome,
/// sa cible déborde vers le bord.
public nonisolated enum FullscreenTopBarLayout {
    public static var horizontalPadding: CGFloat {
        FullscreenChromeMetrics.edgeInset
            - (FullscreenChromeMetrics.tapTarget - FullscreenChromeMetrics.discDiameter) / 2
    }
}

/// **Qui a publié, et quand** — avatar, nom, date — posé sur le média.
///
/// L'avatar est fourni par l'hôte (en général `MeeshyAvatar`, dont il choisit le
/// contexte et la couleur d'accent) ; `accessory` porte ce que la surface ajoute sous
/// le nom (crédit d'un son, attribution d'une republication).
public struct FullscreenIdentityRow<Avatar: View, Accessory: View>: View {

    private let name: String
    private let subtitle: String?
    private let avatar: Avatar
    private let accessory: Accessory

    public init(name: String,
                subtitle: String? = nil,
                @ViewBuilder avatar: () -> Avatar,
                @ViewBuilder accessory: () -> Accessory) {
        self.name = name
        self.subtitle = subtitle
        self.avatar = avatar()
        self.accessory = accessory()
    }

    public var body: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            avatar
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    Text(name)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundStyle(MeeshyColors.mediaChromeForeground)
                        .lineLimit(1)
                    if let subtitle {
                        Text(subtitle)
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                            .foregroundStyle(MeeshyColors.mediaChromeTertiary)
                            .lineLimit(1)
                    }
                }
                accessory
            }
            .legibleOverCanvas()
        }
        .accessibilityElement(children: .combine)
    }
}

public extension FullscreenIdentityRow where Accessory == EmptyView {
    init(name: String,
         subtitle: String? = nil,
         @ViewBuilder avatar: () -> Avatar) {
        self.init(name: name, subtitle: subtitle, avatar: avatar, accessory: { EmptyView() })
    }
}

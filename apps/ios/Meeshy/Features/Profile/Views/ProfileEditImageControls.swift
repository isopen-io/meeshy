import SwiftUI
import UIKit
import PhotosUI
import MeeshySDK
import MeeshyUI

/// Ce que disent les commandes d'image de l'édition de ma vitrine (planche `Moi-Edition`, #19548).
enum ProfileEditImageCopy {
    static var changeBanner: String {
        String(localized: "profile.edit.banner.change", defaultValue: "Changer la bannière", bundle: .main)
    }

    static var changePhoto: String {
        String(localized: "profile.avatar.edit", defaultValue: "Modifier la photo de profil", bundle: .main)
    }

    static var photo: String {
        String(localized: "profile.edit.photo", defaultValue: "Photo", bundle: .main)
    }

    static var retouch: String {
        String(localized: "profile.edit.retouch", defaultValue: "Retoucher", bundle: .main)
    }

    static var retouchNeedsPhoto: String {
        String(localized: "profile.edit.retouch.noPhoto", defaultValue: "Ajoute d'abord une photo", bundle: .main)
    }

    static var retouchFailed: String {
        String(localized: "profile.edit.retouch.failed", defaultValue: "Impossible d'ouvrir ta photo. Réessaie.", bundle: .main)
    }

    static var decor: String {
        String(localized: "profile.edit.decor", defaultValue: "Décor", bundle: .main)
    }

    static var decorTileHint: String {
        String(localized: "profile.edit.decor.hint", defaultValue: "Ouvre le choix du décor", bundle: .main)
    }

    static var myPacks: String {
        String(localized: "profile.packs.mine", defaultValue: "Mes packs", bundle: .main)
    }

    static var none: String {
        String(localized: "profile.decor.none", defaultValue: "Aucun", bundle: .main)
    }

    static var image: String {
        String(localized: "profile.decor.image", defaultValue: "Image", bundle: .main)
    }

    static func sideTitle(_ side: ProfileDecorSide) -> String {
        switch side {
        case .avatarRing:
            return String(localized: "profile.decor.ring.section", defaultValue: "Contour d'avatar", bundle: .main)
        case .banner:
            return String(localized: "profile.decor.banner.section", defaultValue: "Bannière", bundle: .main)
        case .bannerFrame:
            return String(localized: "profile.decor.frame.section", defaultValue: "Cadre de bannière", bundle: .main)
        }
    }
}

// MARK: - Retoucher

/// « Retoucher » rouvre la retouche sur ma photo ACTUELLE : il se refuse, en disant pourquoi, tant que je n'en ai pas.
enum ProfileEditRetouch {
    static func disabledReason(avatar: String?) -> String? {
        (avatar ?? "").isEmpty ? ProfileEditImageCopy.retouchNeedsPhoto : nil
    }

    /// Ma photo actuelle, lue dans le magasin d'images des avatars : celui qui la peint déjà, donc sans réseau la
    /// plupart du temps.
    static func currentPhoto(_ avatar: String?,
                             loader: any MediaImageLoading = CoordinatorImageLoader.images) async -> UIImage? {
        guard let avatar, !avatar.isEmpty else { return nil }
        let resolved = MeeshyConfig.resolveMediaURL(avatar)?.absoluteString ?? avatar
        return await loader.image(for: resolved)
    }
}

// MARK: - Photo · Retoucher · Décor

/// La rangée des trois commandes sous mon avatar, en édition : les boutons libellés du kit (K40). En grand texte,
/// elle passe en colonne plutôt que de tronquer un libellé.
struct ProfileEditImageCommands: View {
    let retouchDisabledReason: String?
    let isRetouchLoading: Bool
    let onPhoto: () -> Void
    let onRetouch: () -> Void
    let onDecor: () -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: MeeshySpacing.sm) { commands }
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) { commands }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var commands: some View {
        MeeshyButton(ProfileEditImageCopy.photo, systemImage: "camera", kind: .outline, size: .s44,
                     action: onPhoto)
            .accessibilityIdentifier("profile.edit.photo")
        MeeshyButton(ProfileEditImageCopy.retouch, systemImage: "wand.and.stars", kind: .outline, size: .s44,
                     isPending: isRetouchLoading, disabledReason: retouchDisabledReason, action: onRetouch)
            .accessibilityIdentifier("profile.edit.retouch")
        MeeshyButton(ProfileEditImageCopy.decor, systemImage: "paintpalette", kind: .outline, size: .s44,
                     action: onDecor)
            .accessibilityIdentifier("profile.edit.decor")
    }
}

// MARK: - Ce que les commandes présentent

/// Ce que les commandes d'image de l'édition présentent : le sélecteur de ma photo (l'appareil photo et « Photo »),
/// celui de ma bannière, et la feuille du décor (« Décor » et ses vignettes). Une image choisie suit le chemin de
/// toujours : la retouche, puis l'envoi.
struct ProfileEditImagePresentations: ViewModifier {
    @Binding var avatarPickerShown: Bool
    @Binding var bannerPickerShown: Bool
    @Binding var decorShown: Bool
    @Binding var avatarItem: PhotosPickerItem?
    @Binding var bannerItem: PhotosPickerItem?
    let user: MeeshyUser?
    let onOpenShop: (PackDomain) -> Void

    func body(content: Content) -> some View {
        content
            .photosPicker(isPresented: $avatarPickerShown, selection: $avatarItem, matching: .images)
            .photosPicker(isPresented: $bannerPickerShown, selection: $bannerItem, matching: .images)
            .modifier(ProfileDecorSheetPresentation(isPresented: $decorShown, user: user, onOpenShop: onOpenShop,
                                                    onPickBanner: { bannerItem = $0 }))
    }
}

// MARK: - Le décor, en édition

/// Les trois vignettes du décor : le côté, et ce qui y est équipé. La photo de bannière passe devant les fonds
/// (#10933) : la vignette Bannière dit alors « Image ».
enum ProfileEditDecorTiles {
    static func make(decor: ServedProfileDecor?, bannerPhoto: String?, language: String) -> [MeeshyTile<ProfileDecorSide>] {
        ProfileDecorSide.allCases.map { side in
            MeeshyTile(id: side, title: ProfileEditImageCopy.sideTitle(side),
                       subtitle: equipped(side, decor: decor, bannerPhoto: bannerPhoto, language: language),
                       hint: ProfileEditImageCopy.decorTileHint)
        }
    }

    private static func equipped(_ side: ProfileDecorSide, decor: ServedProfileDecor?, bannerPhoto: String?,
                                 language: String) -> String {
        if side == .banner, !(bannerPhoto ?? "").isEmpty { return ProfileEditImageCopy.image }
        guard let item = decor?[side] else { return ProfileEditImageCopy.none }
        return designName(item.item, side: side, language: language) ?? item.item
    }

    private static func designName(_ key: String, side: ProfileDecorSide, language: String) -> String? {
        switch side {
        case .avatarRing: return AvatarRingCatalog.shared.ringName(key, language: language)
        case .banner: return AppearanceCatalog.shared.designName(key, language: language)
        case .bannerFrame: return BannerFrameCatalog.shared.frameName(key, language: language)
        }
    }
}

/// La section « Décor » de l'édition : l'en-tête du kit (K44) avec « Mes packs », et les trois vignettes (K19) qui
/// ouvrent la feuille du décor. Le décor s'applique dès qu'on le choisit : il ne passe pas par « Enregistrer ».
struct ProfileEditDecorSection: View {
    let user: MeeshyUser?
    let accentHex: String
    let isDark: Bool
    let onOpenDecor: () -> Void
    let onOpenMyPacks: () -> Void

    static let tileSize = CGSize(width: 108, height: 104)

    private var language: String { user?.systemLanguage ?? "fr" }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileEditImageCopy.decor, lead: { EmptyView() }, accessory: {
                MeeshyButton(ProfileEditImageCopy.myPacks, kind: .text, size: .s44, tint: Color(hex: accentHex),
                             action: onOpenMyPacks)
            })
            MeeshyTileStrip(
                ProfileEditDecorTiles.make(decor: user?.profileDecor, bannerPhoto: user?.banner, language: language),
                selection: nil, label: ProfileEditImageCopy.decor, layout: .grid(columns: 3),
                tileSize: Self.tileSize, surface: .theme,
                onSelect: { _ in onOpenDecor() },
                preview: { tile, _ in
                    ProfileEditDecorPreview(side: tile.id, user: user, accentHex: accentHex, isDark: isDark)
                }
            )
        }
        .accessibilityIdentifier("profile.edit.decorSection")
    }
}

/// Ce qu'une vignette du décor montre : mon avatar dans son contour, ma bannière, ou ma bannière sous son cadre —
/// les mêmes dessins que la fiche.
struct ProfileEditDecorPreview: View {
    let side: ProfileDecorSide
    let user: MeeshyUser?
    let accentHex: String
    let isDark: Bool

    private static let avatarSide: CGFloat = 56

    var body: some View {
        switch side {
        case .avatarRing:
            MeeshyAvatar(name: user?.displayName ?? user?.username ?? "?", context: .custom(Self.avatarSide),
                         accentColor: accentHex, avatarURL: user?.avatar)
                .avatarRing(ProfileDecorResolver.ring(user?.profileDecor?.avatarRing), avatarSize: Self.avatarSide)
        case .banner:
            banner
        case .bannerFrame:
            banner.overlay {
                if let frame = ProfileOwnBanner.frame(of: user) {
                    BannerFrameView(design: frame).equatable()
                }
            }
        }
    }

    private var banner: some View {
        ProfileBannerPaintView(paint: ProfileOwnBanner.paint(of: user), thumbHash: user?.bannerThumbHash,
                               accentHex: accentHex, isDark: isDark, height: ProfileEditDecorSection.tileSize.height)
    }
}

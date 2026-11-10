import SwiftUI
import PhotosUI
import MeeshySDK
import MeeshyUI

// MARK: - Carte « Montre-toi » (#17236)

/// La carte « Montre-toi » : un aperçu du profil TEL QUE LES AUTRES LE VERRONT
/// — bannière, avatar qui la chevauche, nom et pseudo — où chaque image se
/// touche pour être choisie, retouchée et envoyée. Le sélecteur, la retouche
/// de la capture caméra (`EntityImageRetouch`, formats `.avatar` / `.banner`,
/// #17251) et l'envoi (`ProfileImageUploading`) sont ceux de l'écran Profil.
///
/// Tant qu'aucune image n'est posée, la seule sortie est « Plus tard », au
/// premier plan — jamais un « Continuer » inerte (même règle que la carte 4).
struct OnboardingProfileCard: View {
    @ObservedObject var model: OnboardingViewModel
    @ObservedObject var profile: OnboardingProfileModel
    let isDark: Bool

    @State private var avatarItem: PhotosPickerItem?
    @State private var bannerItem: PhotosPickerItem?
    @State private var avatarForEditor: UIImage?
    @State private var bannerForEditor: UIImage?

    var body: some View {
        OnboardingCardLayout(
            title: String(localized: "onboarding.profile.title", bundle: .main),
            message: String(localized: "onboarding.profile.body", bundle: .main),
            isDark: isDark,
            primary: primary,
            secondary: secondary,
            illustration: { EmptyView() },
            content: {
                VStack(spacing: MeeshySpacing.lg) {
                    OnboardingProfileBenefits(isDark: isDark)
                    preview
                    if !profile.failedSlots.isEmpty { failureNotice }
                }
            }
        )
        .modifier(OnboardingProfilePicker(item: $avatarItem, image: $avatarForEditor, format: .avatar) { edited in
            Task { await profile.choose(edited, for: .avatar) }
        })
        .modifier(OnboardingProfilePicker(item: $bannerItem, image: $bannerForEditor, format: .banner) { edited in
            Task { await profile.choose(edited, for: .banner) }
        })
    }

    private var primary: OnboardingAction {
        let chosen = profile.hasChosenImage
        let title = chosen
            ? String(localized: "onboarding.continue", bundle: .main)
            : String(localized: "onboarding.later", bundle: .main)
        return OnboardingAction(
            title: title,
            identifier: chosen ? "onboarding.profile.continue" : "onboarding.profile.later"
        ) {
            Task { await model.continueFromProfile() }
        }
    }

    private var secondary: OnboardingAction? {
        guard profile.hasChosenImage else { return nil }
        return OnboardingAction(title: String(localized: "onboarding.later", bundle: .main),
                                identifier: "onboarding.profile.skip") {
            Task { await model.later() }
        }
    }

    // MARK: L'aperçu

    /// Les deux sélecteurs sont FRÈRES, jamais l'un dans l'autre (#17251) :
    /// toucher l'avatar n'ouvre que le sien, et rien n'enchaîne sur la bannière.
    private var preview: some View {
        let banner = profile.banner.shown
        let bannerUploading = profile.banner.isUploading
        let name = model.userDisplayName
        let avatarURL = model.userAvatarURL
        let avatar = profile.avatar.shown
        let avatarUploading = profile.avatar.isUploading
        let dark = isDark
        return VStack(spacing: MeeshySpacing.sm) {
            ZStack(alignment: .bottom) {
                PhotosPicker(selection: $bannerItem, matching: .images) {
                    OnboardingProfileBannerTile(image: banner, isUploading: bannerUploading)
                }
                .buttonStyle(.plain)
                .disabled(profile.banner.isUploading)
                .accessibilityLabel(String(localized: "onboarding.profile.banner.pick", bundle: .main))
                .accessibilityIdentifier("onboarding.profile.banner")
                .padding(.bottom, OnboardingProfileAvatarTile.size / 2)
                PhotosPicker(selection: $avatarItem, matching: .images) {
                    OnboardingProfileAvatarTile(name: name, avatarURL: avatarURL, image: avatar,
                                                isUploading: avatarUploading, isDark: dark)
                }
                .buttonStyle(.plain)
                .disabled(profile.avatar.isUploading)
                .accessibilityLabel(String(localized: "onboarding.profile.avatar.pick", bundle: .main))
                .accessibilityIdentifier("onboarding.profile.avatar")
            }
            identity
        }
    }

    private var identity: some View {
        VStack(spacing: MeeshySpacing.xxs) {
            Text(verbatim: model.userDisplayName)
                .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
            if let username = model.userHandle {
                Text(verbatim: "@" + username)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
            }
        }
        .multilineTextAlignment(.center)
        .accessibilityElement(children: .combine)
    }

    private var failureNotice: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Label(String(localized: "onboarding.profile.failed", bundle: .main), systemImage: "exclamationmark.circle.fill")
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundStyle(MeeshyColors.error)
            Spacer(minLength: MeeshySpacing.sm)
            Button {
                Task { await profile.retryFailed() }
            } label: {
                Text(String(localized: "onboarding.profile.retry", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundStyle(MeeshyColors.indigo500)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("onboarding.profile.retry")
        }
    }
}

// MARK: - Les deux bénéfices

private struct OnboardingProfileBenefits: View {
    let isDark: Bool

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: MeeshySpacing.sm) { chips }
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) { chips }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var chips: some View {
        chip(String(localized: "onboarding.profile.benefit.visibility", bundle: .main), symbol: "eye.fill")
        chip(String(localized: "onboarding.profile.benefit.contacts", bundle: .main), symbol: "person.2.fill")
    }

    private func chip(_ title: String, symbol: String) -> some View {
        Label(title, systemImage: symbol)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            .foregroundStyle(MeeshyColors.indigo500)
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.xs)
            .background(Capsule().fill(MeeshyColors.indigo500.opacity(isDark ? 0.18 : 0.1)))
    }
}

// MARK: - La bannière et l'avatar

private struct OnboardingProfileBannerTile: View {
    let image: UIImage?
    let isUploading: Bool

    var body: some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
            .fill(MeeshyColors.brandGradient)
            .aspectRatio(3, contentMode: .fit)
            .overlay {
                if let image {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    Label(String(localized: "onboarding.profile.banner.add", bundle: .main), systemImage: "photo.fill")
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }
            .overlay(alignment: .topTrailing) {
                if isUploading { OnboardingProfileProgress().padding(MeeshySpacing.sm) }
            }
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
    }
}

private struct OnboardingProfileAvatarTile: View {
    static let size: CGFloat = 96

    let name: String
    let avatarURL: String?
    let image: UIImage?
    let isUploading: Bool
    let isDark: Bool

    var body: some View {
        face
            .frame(width: Self.size, height: Self.size)
            .clipShape(Circle())
            .overlay(Circle().stroke(MeeshyColors.backgroundPrimary(isDark: isDark), lineWidth: 4))
            .overlay {
                if isUploading { OnboardingProfileProgress() }
            }
            .overlay(alignment: .bottomTrailing) { badge }
            .contentShape(Circle())
    }

    @ViewBuilder
    private var face: some View {
        if let image {
            Image(uiImage: image).resizable().scaledToFill()
        } else {
            MeeshyAvatar(name: name.isEmpty ? "?" : name, context: .profileBanner,
                         accentColor: DynamicColorGenerator.colorForName(name), avatarURL: avatarURL)
                .frame(width: Self.size, height: Self.size)
        }
    }

    private var badge: some View {
        Image(systemName: image == nil && avatarURL == nil ? "plus" : "camera.fill")
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: 30, height: 30)
            .background(Circle().fill(MeeshyColors.brandGradient))
            .overlay(Circle().stroke(MeeshyColors.backgroundPrimary(isDark: isDark), lineWidth: 2))
            .accessibilityHidden(true)
    }
}

/// L'envoi en cours : une pastille discrète, jamais un voile sur l'image.
private struct OnboardingProfileProgress: View {
    var body: some View {
        ProgressView()
            .tint(.white)
            .padding(MeeshySpacing.xs)
            .background(Circle().fill(Color.black.opacity(0.45)))
            .accessibilityLabel(String(localized: "onboarding.profile.uploading", bundle: .main))
    }
}

// MARK: - Choisir puis retoucher, comme l'écran Profil

/// Annuler la retouche ne pose aucune image et n'envoie rien (#17251).
private struct OnboardingProfilePicker: ViewModifier {
    @Binding var item: PhotosPickerItem?
    @Binding var image: UIImage?
    let format: EntityImageFormat
    let onAccept: (UIImage) -> Void

    func body(content: Content) -> some View {
        content
            .adaptiveOnChange(of: item) { _, newItem in
                guard let newItem else { return }
                Task {
                    guard let data = try? await PickedMedia.loadImageData(newItem),
                          let picked = UIImage(data: data) else { return }
                    image = picked
                }
            }
            .fullScreenCover(item: $image) { picked in
                EntityImageRetouch(image: picked, format: format, onDone: { edited in
                    image = nil
                    item = nil
                    onAccept(edited)
                }, onCancel: {
                    image = nil
                    item = nil
                })
            }
    }
}

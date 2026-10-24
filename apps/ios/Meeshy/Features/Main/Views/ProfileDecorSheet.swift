import Combine
import PhotosUI
import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - Le décor de mon profil (#10632, spec §§ 5.5, 9, 10.2)

/// **Équiper un contour d'avatar et une bannière de design**, visibles des
/// autres. Le sélecteur ne liste que les packs INSTALLÉS et POSSÉDÉS (§ 9) ;
/// ce qu'on n'a pas se trouve dans la vitrine unique (« Plus dans la
/// boutique »). Équiper est optimiste : le choix s'écrit au toucher, le serveur
/// confirme, un refus rétablit LE CÔTÉ touché — jamais l'autre.
@MainActor
final class ProfileDecorModel: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var state: ProfileDecorState
    @Published private(set) var rings: [ProfileDecorOptions.OptionGroup<AvatarRingDesign>]
    @Published private(set) var banners: [ProfileDecorOptions.OptionGroup<AppearanceDesign>]
    /// Les cadres posés SUR la bannière (#10936) : avant la lecture, les packs installés d'office (#11165).
    @Published private(set) var frames: [ProfileDecorOptions.OptionGroup<BannerFrameDesign>]
    @Published private(set) var failed = false

    private let service: any ProfileDecorProviding
    private let installedPacks: @Sendable @concurrent (PackDomain) async -> [ShopPack]?
    private let userId: @MainActor () -> String?
    private let publish: @MainActor (ServedProfileDecor) -> Void
    private var subscription: AnyCancellable?
    /// Le numéro du DERNIER choix de chaque côté : une réponse plus ancienne,
    /// arrivée après lui, ne l'écrase ni ne le rétablit.
    private var latestChoice: [ProfileDecorSide: Int] = [:]
    /// Ce que le serveur a accepté en dernier : un refus y revient, jamais à un choix optimiste.
    private var accepted: ServedProfileDecor
    private var acceptedChoice: [ProfileDecorSide: Int] = [:]

    init(
        decor: ServedProfileDecor?,
        service: any ProfileDecorProviding = ProfileDecorService.shared,
        installedPacks: @escaping @Sendable @concurrent (PackDomain) async -> [ShopPack]? = { domain in
            try? await PackService<ShopPack>(domain: domain).installed()
        },
        userId: @escaping @MainActor () -> String? = { AuthManager.shared.currentUser?.id },
        publish: @escaping @MainActor (ServedProfileDecor) -> Void = { decor in
            guard let user = AuthManager.shared.currentUser else { return }
            AuthManager.shared.currentUser = user.withProfileDecor(decor)
        },
        center: NotificationCenter = .default
    ) {
        self.state = ProfileDecorState(decor: decor ?? .empty)
        self.accepted = decor ?? .empty
        self.rings = ProfileDecorOptions.rings(installed: nil)
        self.banners = ProfileDecorOptions.banners(installed: nil)
        self.frames = ProfileDecorOptions.bannerFrames(installed: nil)
        self.service = service
        self.installedPacks = installedPacks
        self.userId = userId
        self.publish = publish
        self.subscription = center.publisher(for: .profileDecorUpdated)
            .compactMap { $0.object as? ProfileDecorUpdatedEvent }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in MainActor.assumeIsolated { self?.receive(event) } }
    }

    /// La liste des packs installés fait foi dès qu'elle est lue ; avant, les packs installés d'office.
    func load() async {
        let installed = installedPacks
        async let ringPacks = installed(.avatarRing)
        async let bannerPacks = installed(.banner)
        async let framePacks = installed(.bannerFrame)
        let (installedRings, installedBanners, installedFrames) = await (ringPacks, bannerPacks, framePacks)
        rings = ProfileDecorOptions.rings(installed: installedRings)
        banners = ProfileDecorOptions.banners(installed: installedBanners)
        frames = ProfileDecorOptions.bannerFrames(installed: installedFrames)
    }

    /// Le choix en cours d'un côté (`nil` = aucun).
    func current(_ side: ProfileDecorSide) -> ProfileDecorRef? {
        state.decor[side]?.ref
    }

    func equip(_ ref: ProfileDecorRef?, side: ProfileDecorSide) async {
        guard current(side) != ref else { return }
        failed = false
        let choice = (latestChoice[side] ?? 0) + 1
        latestChoice[side] = choice
        let item = ref.map { ServedProfileDecorItem(pack: $0.pack, item: $0.item, origin: .builtin, contract: nil) }
        state.equip(item, side: side)
        publish(state.decor)
        let outcome: Result<ServedProfileDecor, Error>
        do {
            outcome = .success(try await service.update(ProfileDecorWrite(side: side, choice: ref)))
        } catch {
            outcome = .failure(error)
        }
        if case .success(let served) = outcome, choice > (acceptedChoice[side] ?? 0) {
            acceptedChoice[side] = choice
            accepted[side] = served[side]
        }
        guard latestChoice[side] == choice else { return }
        switch outcome {
        case .success(let served):
            accepted = served
            state.confirm(served)
        case .failure:
            state.rollback(side: side, to: accepted[side])
            failed = true
        }
        publish(state.decor)
    }

    private func receive(_ event: ProfileDecorUpdatedEvent) {
        guard let id = userId(), event.userId == id else { return }
        accepted = event.decor
        state.apply(event: event, myUserId: id)
    }
}

// MARK: - La feuille

struct ProfileDecorSheet: View {
    @StateObject private var model: ProfileDecorModel
    let avatarURL: String?
    let name: String
    /// La couleur du profil (#10754) : le sélecteur peint l'avatar et les bannières comme la fiche.
    let accentHex: String
    /// La photo de bannière actuelle (#11165) : la tuile « Image » la montre, et les cadres se posent dessus.
    let bannerURL: String?
    let bannerThumbHash: String?
    let onOpenShop: (PackDomain) -> Void
    /// L'image choisie par la tuile « Image » : le profil la retouche puis la téléverse, comme son bouton « Modifier ».
    let onPickBanner: (PhotosPickerItem) -> Void

    @State private var pickedBanner: PhotosPickerItem?
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    private var language: String { AuthManager.shared.currentUser?.systemLanguage ?? "fr" }

    init(
        decor: ServedProfileDecor?,
        avatarURL: String?,
        name: String,
        accentHex: String = MeeshyColors.brandPrimaryHex,
        bannerURL: String? = nil,
        bannerThumbHash: String? = nil,
        onOpenShop: @escaping (PackDomain) -> Void,
        onPickBanner: @escaping (PhotosPickerItem) -> Void = { _ in }
    ) {
        _model = StateObject(wrappedValue: ProfileDecorModel(decor: decor))
        self.avatarURL = avatarURL
        self.name = name
        self.accentHex = accentHex
        self.bannerURL = bannerURL
        self.bannerThumbHash = bannerThumbHash
        self.onOpenShop = onOpenShop
        self.onPickBanner = onPickBanner
    }

    private var bannerChoice: ProfileBannerChoice {
        ProfileBannerChoice(photo: bannerURL, design: model.current(.banner))
    }

    /// Ce que la bannière peint avec le choix en cours : les cadres se montrent posés DESSUS (#10932).
    private var currentBannerPaint: ProfileBannerPaint {
        ProfileDecorResolver.bannerPaint(photo: bannerURL, decor: model.state.decor.banner)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                    ringSection
                    bannerSection
                    frameSection
                    if model.failed {
                        Text(errorMessage)
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                            .foregroundColor(MeeshyColors.error)
                    }
                }
                .padding(MeeshySpacing.lg)
            }
            .background(theme.backgroundGradient.ignoresSafeArea())
            .navigationTitle(String(localized: "profile.decor.title", defaultValue: "Contour et bannière", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "profile.decor.done", defaultValue: "Terminé", bundle: .main)) { dismiss() }
                }
            }
        }
        .task { await model.load() }
        .adaptiveOnChange(of: pickedBanner) { _, item in
            guard let item else { return }
            onPickBanner(item)
        }
        .adaptiveOnChange(of: model.failed) { _, failed in
            guard failed else { return }
            UIAccessibility.post(notification: .announcement, argument: errorMessage)
        }
    }

    private var errorMessage: String {
        String(localized: "profile.decor.error", defaultValue: "Impossible d'enregistrer ce choix. Réessayez.", bundle: .main)
    }

    // MARK: Contours

    private var ringSection: some View {
        let title = String(localized: "profile.decor.ring.section", defaultValue: "Contour d'avatar", bundle: .main)
        return VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            header(title)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: MeeshySpacing.md)], spacing: MeeshySpacing.md) {
                ringTile(ref: nil, design: nil, label: noneLabel)
                ForEach(ProfileDecorOptions.flattened(model.rings)) { entry in
                    ringTile(ref: entry.ref, design: entry.design, label: AvatarRingCatalog.shared.ringName(entry.design.key, language: language) ?? entry.design.key)
                }
            }
            shopLink(.avatarRing)
        }
        .decorSection(title)
    }

    private func ringTile(ref: ProfileDecorRef?, design: AvatarRingDesign?, label: String) -> some View {
        let selected = model.current(.avatarRing) == ref
        return Button {
            HapticFeedback.light()
            Task { await model.equip(ref, side: .avatarRing) }
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                MeeshyAvatar(name: name, context: .custom(56), accentColor: accentHex, avatarURL: avatarURL)
                    .avatarRing(design, avatarSize: 56)
                    .frame(width: 68, height: 68)
                Text(label)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
            }
            .padding(MeeshySpacing.xs)
            .frame(maxWidth: .infinity)
            .background(DecorTileOutline(selected: selected))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    // MARK: Bannières

    private var bannerSection: some View {
        let title = String(localized: "profile.decor.banner.section", defaultValue: "Bannière", bundle: .main)
        return VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            header(title)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: MeeshySpacing.md)], spacing: MeeshySpacing.md) {
                imageTile
                ForEach(ProfileDecorOptions.flattened(model.banners)) { entry in
                    bannerTile(ref: entry.ref, design: entry.design, label: AppearanceCatalog.shared.designName(entry.design.key, language: language) ?? entry.design.key)
                }
            }
            if bannerChoice.photoHidesDesigns {
                Text(String(localized: "profile.decor.image.hidesDesigns", defaultValue: "Ton image de bannière passe devant les fonds.", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
            shopLink(.banner)
        }
        .decorSection(title)
    }

    /// « Image » (#11165) : la bannière actuelle si l'on en a une, sinon un glyphe ; le toucher ouvre la sélection d'image.
    private var imageTile: some View {
        let choice = bannerChoice
        let label = imageLabel
        let tile = ProfileBannerImageTile(
            preview: choice.imagePreview,
            thumbHash: bannerThumbHash,
            accentHex: accentHex,
            label: label,
            selected: choice.imageSelected,
            textColor: theme.textPrimary
        )
        return PhotosPicker(selection: $pickedBanner, matching: .images) { tile }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
            .accessibilityHint(String(localized: "profile.decor.image.hint", defaultValue: "Choisir une image de bannière", bundle: .main))
            .accessibilityAddTraits(choice.imageSelected ? [.isButton, .isSelected] : .isButton)
    }

    private func bannerTile(ref: ProfileDecorRef, design: AppearanceDesign, label: String) -> some View {
        let selected = bannerChoice.isSelected(ref)
        return Button {
            HapticFeedback.light()
            Task { await model.equip(ref, side: .banner) }
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                BannerDesignView(design: design, isDark: theme.mode.isDark, accentHex: accentHex)
                .aspectRatio(3, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
                Text(label)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
            }
            .padding(MeeshySpacing.xs)
            .background(DecorTileOutline(selected: selected))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    // MARK: Cadres de bannière (#10936)

    /// Le cadre se pose SUR la bannière, centre transparent : la tuile le montre sur le fond du profil.
    private var frameSection: some View {
        let title = String(localized: "profile.decor.frame.section", defaultValue: "Cadre de bannière", bundle: .main)
        return VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            header(title)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: MeeshySpacing.md)], spacing: MeeshySpacing.md) {
                frameTile(ref: nil, design: nil, label: noneLabel)
                ForEach(ProfileDecorOptions.flattened(model.frames)) { entry in
                    frameTile(ref: entry.ref, design: entry.design, label: BannerFrameCatalog.shared.frameName(entry.design.key, language: language) ?? entry.design.key)
                }
            }
            shopLink(.bannerFrame)
        }
        .decorSection(title)
    }

    private func frameTile(ref: ProfileDecorRef?, design: BannerFrameDesign?, label: String) -> some View {
        let selected = model.current(.bannerFrame) == ref
        let paint = currentBannerPaint
        let isDark = theme.mode.isDark
        return Button {
            HapticFeedback.light()
            Task { await model.equip(ref, side: .bannerFrame) }
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                Color.clear
                .aspectRatio(3, contentMode: .fit)
                .overlay {
                    ProfileBannerPaintView(paint: paint, thumbHash: bannerThumbHash, accentHex: accentHex, isDark: isDark, height: 64)
                }
                .overlay {
                    if let design {
                        BannerFrameView(design: design)
                            .equatable()
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
                Text(label)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
            }
            .padding(MeeshySpacing.xs)
            .background(DecorTileOutline(selected: selected))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    // MARK: Briques

    private var noneLabel: String {
        String(localized: "profile.decor.none", defaultValue: "Aucun", bundle: .main)
    }

    /// La tuile qui choisit une IMAGE de bannière (#11165) — elle gagne toujours sur les fonds.
    private var imageLabel: String {
        String(localized: "profile.decor.image", defaultValue: "Image", bundle: .main)
    }

    private func header(_ title: String) -> some View {
        Text(title)
            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
            .foregroundColor(theme.textPrimary)
            .accessibilityAddTraits(.isHeader)
    }

    private func shopLink(_ domain: PackDomain) -> some View {
        Button {
            HapticFeedback.light()
            onOpenShop(domain)
        } label: {
            Label(String(localized: "profile.decor.shop", defaultValue: "Plus dans la boutique", bundle: .main), systemImage: "bag")
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo500)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
    }

}

private extension View {
    /// Une section du décor est un CONTENEUR nommé pour VoiceOver (#10715) : chaque tuile
    /// s'entend avec son côté (« Contour d'avatar » / « Bannière »), pas seulement l'en-tête
    /// — miroir du `radiogroup` nommé du web.
    func decorSection(_ title: String) -> some View {
        accessibilityElement(children: .contain)
            .accessibilityLabel(title)
    }
}

// MARK: - L'entrée depuis mon profil

/// Une rangée du profil qui ouvre la feuille. Elle porte sa propre présentation :
/// `ProfileView` n'y ajoute que la ligne qui la monte.
struct ProfileDecorEntry: View {
    let user: MeeshyUser?
    /// « Plus dans la boutique » : le profil décide de la navigation.
    let onOpenShop: (PackDomain) -> Void
    /// L'image choisie par la tuile « Image » (#11165), remise au profil une fois la feuille FERMÉE :
    /// sa retouche plein écran ne peut pas se présenter par-dessus une feuille encore ouverte.
    var onPickBanner: (PhotosPickerItem) -> Void = { _ in }

    @State private var showSheet = false
    @State private var pendingBanner: PhotosPickerItem?
    private var theme: ThemeManager { ThemeManager.shared }

    /// `profile:decor-updated` venu d'un AUTRE de mes appareils : la règle vit au SDK
    /// (`MeeshyUser.applying`), et c'est le socket qui repeint mon compte — quel que soit
    /// l'écran ouvert, cette rangée affichée ou non (#10715).
    static func user(_ user: MeeshyUser?, applying event: ProfileDecorUpdatedEvent) -> MeeshyUser? {
        user?.applying(event)
    }

    var body: some View {
        Button {
            HapticFeedback.light()
            showSheet = true
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "circle.dashed")
                    .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .medium))
                    .foregroundColor(MeeshyColors.indigo300)
                    .frame(width: 28, height: 28)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(String(localized: "profile.decor.title", defaultValue: "Contour et bannière", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    Text(String(localized: "profile.decor.subtitle", defaultValue: "Visibles de tous sur ton profil", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                Spacer()
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(theme.surface(tint: MeeshyColors.indigo300Hex, intensity: 0.08)))
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showSheet, onDismiss: handOverPickedBanner) {
            ProfileDecorSheet(
                decor: user?.profileDecor,
                avatarURL: user?.avatar,
                name: user?.displayName ?? user?.username ?? "?",
                accentHex: user?.profileAccentHex ?? MeeshyColors.brandPrimaryHex,
                bannerURL: user?.banner,
                bannerThumbHash: user?.bannerThumbHash,
                onOpenShop: { domain in
                    showSheet = false
                    onOpenShop(domain)
                },
                onPickBanner: { item in
                    pendingBanner = item
                    showSheet = false
                }
            )
        }
    }

    private func handOverPickedBanner() {
        guard let item = pendingBanner else { return }
        pendingBanner = nil
        onPickBanner(item)
    }
}

// MARK: - La bannière de MON profil

/// L'image de bannière de mon profil — elle gagne toujours ; la bannière de design
/// équipée ne se peint qu'en son absence (#10632, #10933).
struct ProfileOwnBanner: View {
    let user: MeeshyUser?
    let accentColor: String
    let isDark: Bool

    static func paint(of user: MeeshyUser?) -> ProfileBannerPaint {
        ProfileDecorResolver.bannerPaint(photo: user?.banner, decor: user?.profileDecor?.banner)
    }

    /// La photo que le toucher ouvre en plein écran : celle qui est peinte, design équipé ou non.
    static func openablePhoto(of user: MeeshyUser?) -> String? {
        guard case .photo(let url) = paint(of: user) else { return nil }
        return url
    }

    /// Le cadre équipé (#10935), posé PAR-DESSUS ce que `paint` peint — jamais à sa place.
    static func frame(of user: MeeshyUser?) -> BannerFrameDesign? {
        ProfileDecorResolver.bannerFrame(user?.profileDecor?.bannerFrame)
    }

    var body: some View {
        ProfileBannerPaintView(paint: Self.paint(of: user), thumbHash: user?.bannerThumbHash, accentHex: accentColor, isDark: isDark, height: 120)
            .overlay {
                if let frame = Self.frame(of: user) {
                    BannerFrameView(design: frame)
                        .equatable()
                }
            }
    }
}

/// Ce qu'une bannière peint — la photo, le design ou le dégradé du profil —, sans son cadre :
/// la fiche et les tuiles de cadre du sélecteur montrent la même chose (#11165).
struct ProfileBannerPaintView: View {
    let paint: ProfileBannerPaint
    let thumbHash: String?
    let accentHex: String
    let isDark: Bool
    let height: CGFloat

    var body: some View {
        switch paint {
        case .design(let design):
            BannerDesignView(design: design, isDark: isDark, accentHex: accentHex)
        case .photo(let bannerURL):
            CachedBannerImage(urlString: bannerURL, thumbHash: thumbHash, fallbackColor: accentHex, height: height)
        case .plain:
            LinearGradient(
                colors: [Color(hex: accentHex).opacity(0.3), MeeshyColors.indigo300.opacity(0.2)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}

/// Le liseré d'une tuile choisie : une vue de valeur, pour se poser dans l'étiquette d'un bouton
/// sans appeler de méthode isolée au fil principal (Xcode 27, isolation par région).
struct DecorTileOutline: View {
    let selected: Bool

    var body: some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.md)
            .stroke(selected ? MeeshyColors.indigo500 : Color.clear, lineWidth: 2)
    }
}

/// La tuile « Image » (#11165) : des valeurs seules, pour vivre dans l'étiquette d'un `PhotosPicker`.
struct ProfileBannerImageTile: View {
    let preview: String?
    let thumbHash: String?
    let accentHex: String
    let label: String
    let selected: Bool
    let textColor: Color

    var body: some View {
        VStack(spacing: MeeshySpacing.xs) {
            Color.clear
                .aspectRatio(3, contentMode: .fit)
                .overlay {
                    if let preview {
                        CachedBannerImage(urlString: preview, thumbHash: thumbHash, fallbackColor: accentHex, height: 64)
                    } else {
                        ZStack {
                            MeeshyColors.indigo500.opacity(0.12)
                            Image(systemName: "photo.badge.plus")
                                .font(MeeshyFont.relative(MeeshyIconSize.xl, weight: .medium))
                                .foregroundColor(MeeshyColors.indigo500)
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(textColor)
                .lineLimit(1)
        }
        .padding(MeeshySpacing.xs)
        .background(DecorTileOutline(selected: selected))
        .contentShape(Rectangle())
    }
}

/// La rangée « Bannière » du sélecteur (#11165) : la photo gagne toujours sur les fonds (#10933), donc
/// la tuile « Image » est le choix visible dès qu'une photo existe, et aucun fond n'est montré choisi.
struct ProfileBannerChoice: Equatable {
    let photo: String?
    let design: ProfileDecorRef?

    private var hasPhoto: Bool { !(photo ?? "").isEmpty }

    /// La bannière actuelle que la tuile « Image » montre ; `nil` ⇒ un glyphe.
    var imagePreview: String? { hasPhoto ? photo : nil }
    var imageSelected: Bool { hasPhoto || design == nil }
    var photoHidesDesigns: Bool { hasPhoto }

    func isSelected(_ ref: ProfileDecorRef) -> Bool { !hasPhoto && design == ref }
}

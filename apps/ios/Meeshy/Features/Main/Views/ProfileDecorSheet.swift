import Combine
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
        let (installedRings, installedBanners) = await (ringPacks, bannerPacks)
        rings = ProfileDecorOptions.rings(installed: installedRings)
        banners = ProfileDecorOptions.banners(installed: installedBanners)
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
    let onOpenShop: (PackDomain) -> Void

    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    private var language: String { AuthManager.shared.currentUser?.systemLanguage ?? "fr" }

    init(decor: ServedProfileDecor?, avatarURL: String?, name: String, onOpenShop: @escaping (PackDomain) -> Void) {
        _model = StateObject(wrappedValue: ProfileDecorModel(decor: decor))
        self.avatarURL = avatarURL
        self.name = name
        self.onOpenShop = onOpenShop
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                    ringSection
                    bannerSection
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
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            header(String(localized: "profile.decor.ring.section", defaultValue: "Contour d'avatar", bundle: .main))
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: MeeshySpacing.md)], spacing: MeeshySpacing.md) {
                ringTile(ref: nil, design: nil, label: noneLabel)
                ForEach(model.rings, id: \.pack) { group in
                    ForEach(Array(group.items.enumerated()), id: \.offset) { _, entry in
                        ringTile(ref: entry.ref, design: entry.design, label: AvatarRingCatalog.shared.ringName(entry.design.key, language: language) ?? entry.design.key)
                    }
                }
            }
            shopLink(.avatarRing)
        }
    }

    private func ringTile(ref: ProfileDecorRef?, design: AvatarRingDesign?, label: String) -> some View {
        let selected = model.current(.avatarRing) == ref
        return Button {
            HapticFeedback.light()
            Task { await model.equip(ref, side: .avatarRing) }
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                MeeshyAvatar(name: name, context: .custom(56), accentColor: MeeshyColors.brandPrimaryHex, avatarURL: avatarURL)
                    .avatarRing(design, avatarSize: 56)
                    .frame(width: 68, height: 68)
                Text(label)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
            }
            .padding(MeeshySpacing.xs)
            .frame(maxWidth: .infinity)
            .background(selectionBackground(selected))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    // MARK: Bannières

    private var bannerSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            header(String(localized: "profile.decor.banner.section", defaultValue: "Bannière", bundle: .main))
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: MeeshySpacing.md)], spacing: MeeshySpacing.md) {
                bannerTile(ref: nil, design: nil, label: noneLabel)
                ForEach(model.banners, id: \.pack) { group in
                    ForEach(Array(group.items.enumerated()), id: \.offset) { _, entry in
                        bannerTile(ref: entry.ref, design: entry.design, label: AppearanceCatalog.shared.designName(entry.design.key, language: language) ?? entry.design.key)
                    }
                }
            }
            shopLink(.banner)
        }
    }

    private func bannerTile(ref: ProfileDecorRef?, design: AppearanceDesign?, label: String) -> some View {
        let selected = model.current(.banner) == ref
        return Button {
            HapticFeedback.light()
            Task { await model.equip(ref, side: .banner) }
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                Group {
                    if let design {
                        BannerDesignView(design: design, isDark: theme.mode.isDark, accentHex: MeeshyColors.brandPrimaryHex)
                    } else {
                        Color(hex: MeeshyColors.brandPrimaryHex).opacity(0.12)
                    }
                }
                .aspectRatio(3, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
                Text(label)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
            }
            .padding(MeeshySpacing.xs)
            .background(selectionBackground(selected))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    // MARK: Briques

    private var noneLabel: String {
        String(localized: "profile.decor.none", defaultValue: "Aucun", bundle: .main)
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
                .foregroundColor(Color(hex: MeeshyColors.brandPrimaryHex))
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
    }

    private func selectionBackground(_ selected: Bool) -> some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.md)
            .stroke(selected ? Color(hex: MeeshyColors.brandPrimaryHex) : Color.clear, lineWidth: 2)
    }
}

// MARK: - L'entrée depuis mon profil

/// Une rangée du profil qui ouvre la feuille. Elle porte sa propre présentation :
/// `ProfileView` n'y ajoute que la ligne qui la monte.
struct ProfileDecorEntry: View {
    let user: MeeshyUser?
    /// « Plus dans la boutique » : le profil décide de la navigation.
    let onOpenShop: (PackDomain) -> Void

    @State private var showSheet = false
    private var theme: ThemeManager { ThemeManager.shared }

    /// `profile:decor-updated` venu d'un AUTRE de mes appareils, feuille ouverte ou non :
    /// mon compte repeint ; l'événement d'un autre compte ne touche rien (`nil`).
    static func user(_ user: MeeshyUser?, applying event: ProfileDecorUpdatedEvent) -> MeeshyUser? {
        guard let user, user.id == event.userId, user.profileDecor != event.decor else { return nil }
        return user.withProfileDecor(event.decor)
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
        .onReceive(NotificationCenter.default.publisher(for: .profileDecorUpdated).receive(on: DispatchQueue.main)) { notification in
            guard let event = notification.object as? ProfileDecorUpdatedEvent,
                  let repainted = Self.user(AuthManager.shared.currentUser, applying: event) else { return }
            AuthManager.shared.currentUser = repainted
        }
        .sheet(isPresented: $showSheet) {
            ProfileDecorSheet(
                decor: user?.profileDecor,
                avatarURL: user?.avatar,
                name: user?.displayName ?? user?.username ?? "?",
                onOpenShop: { domain in
                    showSheet = false
                    onOpenShop(domain)
                }
            )
        }
    }
}

// MARK: - La bannière de MON profil

/// L'image de bannière de mon profil, ou la bannière de design équipée qui PRIME
/// sur elle (#10632). Extraite de `ProfileView` : décor absent = rendu historique.
struct ProfileOwnBanner: View {
    let user: MeeshyUser?
    let accentColor: String
    let isDark: Bool

    var body: some View {
        if let design = ProfileDecorResolver.banner(user?.profileDecor?.banner) {
            BannerDesignView(design: design, isDark: isDark, accentHex: accentColor)
        } else if let bannerURL = user?.banner, !bannerURL.isEmpty {
            CachedBannerImage(urlString: bannerURL, thumbHash: user?.bannerThumbHash, fallbackColor: accentColor, height: 120)
        } else {
            LinearGradient(
                colors: [Color(hex: accentColor).opacity(0.3), MeeshyColors.indigo300.opacity(0.2)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}

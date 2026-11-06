import SwiftUI
import MeeshySDK

// MARK: - La page d'un éditeur : son identité et tout son catalogue (#16433)

/// Ce que l'app montre quand on touche le profil qui édite : le SDK ne connaît ni le routeur ni les
/// dépendances du profil, l'app lui remet la feuille à présenter.
public struct PackOwnerProfileKey: EnvironmentKey {
    public static let defaultValue: ((PackPublisherOwner) -> AnyView)? = nil
}

extension EnvironmentValues {
    public var packOwnerProfile: ((PackPublisherOwner) -> AnyView)? {
        get { self[PackOwnerProfileKey.self] }
        set { self[PackOwnerProfileKey.self] = newValue }
    }
}

extension View {
    /// La feuille de profil qu'ouvre « Édité par @x » dans la boutique.
    public func packOwnerProfile(_ sheet: @escaping (PackPublisherOwner) -> AnyView) -> some View {
        environment(\.packOwnerProfile, sheet)
    }
}

/// **La page d'un éditeur** : son nom de boutique et sa vérification tout de suite (la vitrine les
/// porte), puis le profil Meeshy qui l'édite et son site quand la passerelle les sert, et tout son
/// catalogue rangé par catégorie — chaque pack ouvre sa fiche.
struct PublisherPageView: View {
    let publisher: PackPublisherRef
    let context: (PackDomain) -> PackShowcaseContext
    let onRoute: (PackShowcaseRoute) -> Void
    var service: any PackPublisherProviding = PackPublisherService.shared

    @Environment(\.packOwnerProfile) private var ownerProfile
    @State private var page: PackPublisherPage?
    @State private var loaded = false
    @State private var shownOwner: PackPublisherOwner?

    private var catalogue: PackShopState { context(.sticker).catalogue }
    private var language: String { context(.sticker).language }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                identity
                ownerSection
                catalogueSections
            }
            .padding(MeeshySpacing.lg)
        }
        .navigationTitle(publisher.name)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: publisher.slug) {
            page = try? await service.page(slug: publisher.slug)
            loaded = true
        }
        .sheet(item: $shownOwner) { owner in
            if let ownerProfile { ownerProfile(owner) }
        }
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            HStack(spacing: MeeshySpacing.sm) {
                Text(publisher.name)
                    .font(MeeshyFont.relative(22, weight: .bold, design: .rounded))
                    .accessibilityAddTraits(.isHeader)
                if publisher.verified {
                    Image(systemName: "checkmark.seal.fill")
                        .font(MeeshyFont.relative(18))
                        .foregroundStyle(MeeshyColors.indigo500)
                        .accessibilityLabel(String(localized: "shop.publisher.verified", defaultValue: "éditeur vérifié", bundle: .module))
                }
            }
            if publisher.official {
                Text(String(localized: "shop.publisher.official", defaultValue: "Éditeur officiel de Meeshy", bundle: .module))
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            if let website = page?.website, let url = URL(string: website), url.scheme == "https" {
                Link(destination: url) {
                    Label(url.host ?? website, systemImage: "safari")
                        .font(MeeshyFont.relative(13, weight: .medium))
                        .frame(minHeight: 44, alignment: .leading)
                }
                .accessibilityIdentifier("shop.publisher.website")
            }
        }
    }

    @ViewBuilder
    private var ownerSection: some View {
        if let owner = page?.owner {
            Button {
                HapticFeedback.light()
                shownOwner = owner
            } label: {
                HStack(spacing: MeeshySpacing.md) {
                    MeeshyAvatar(name: owner.displayName ?? owner.username, context: .custom(44), avatarURL: owner.avatar)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(String(localized: "shop.publisher.editedBy", defaultValue: "Édité par", bundle: .module))
                            .font(MeeshyFont.relative(12))
                            .foregroundStyle(.secondary)
                        Text(owner.displayName ?? owner.username)
                            .font(MeeshyFont.relative(15, weight: .semibold))
                            .foregroundStyle(.primary)
                        Text("@" + owner.username)
                            .font(MeeshyFont.relative(12))
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.forward")
                        .foregroundStyle(.tertiary)
                        .accessibilityHidden(true)
                }
                .padding(MeeshySpacing.md)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(Color.primary.opacity(0.05)))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(ownerProfile == nil)
            .accessibilityElement(children: .combine)
            .accessibilityHint(String(localized: "shop.publisher.profile.hint", defaultValue: "Ouvre son profil", bundle: .module))
            .accessibilityIdentifier("shop.publisher.owner")
        } else if !loaded {
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(Color.primary.opacity(0.05))
                .frame(height: 68)
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private var catalogueSections: some View {
        let sections = PublisherCatalogue.sections(of: publisher.slug, in: catalogue)
        Text(String(localized: "shop.publisher.catalogue", defaultValue: "Son catalogue", bundle: .module))
            .font(MeeshyFont.relative(17, weight: .semibold))
            .accessibilityAddTraits(.isHeader)
        if sections.isEmpty {
            Text(String(localized: "shop.empty", defaultValue: "Rien à découvrir ici pour l’instant.", bundle: .module))
                .font(MeeshyFont.relative(13))
                .foregroundStyle(.secondary)
        }
        ForEach(sections) { section in
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                Text(UnifiedShopView.title(of: section.domain))
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityAddTraits(.isHeader)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 88), spacing: MeeshySpacing.md)], spacing: MeeshySpacing.md) {
                    ForEach(section.packs) { pack in
                        PackCatalogueTile(row: UnifiedShopView.row(pack, language: language)) {
                            onRoute(.pack(PackDetailTarget(domain: section.domain, slug: pack.slug)))
                        }
                    }
                }
            }
        }
    }
}

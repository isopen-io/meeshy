import SwiftUI
import MeeshySDK

// MARK: - La fiche d'un pack (#16268)

/// **La fiche d'un pack**, ouverte en touchant sa rangée : sa couverture, son éditeur, son état, son
/// poids et son prix quand ils existent, le bouton Installer / Retirer, puis ses éléments en grille —
/// chacun s'ouvre en plein écran.
struct PackDetailView: View {
    @ObservedObject var model: PackShowcaseModel
    let target: PackDetailTarget
    let context: PackShowcaseContext
    /// Ouvre une page de la pile : l'éditeur, un autre de ses packs (#16433).
    let onRoute: (PackShowcaseRoute) -> Void

    private var row: PackRow? { context.row(target.slug) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                if let row { header(row) }
                elementsSection
                if let publisher = row?.publisher { samePublisher(publisher) }
            }
            .padding(MeeshySpacing.lg)
        }
        .navigationTitle(row?.name ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: target) { await model.prepare(domain: target.domain, pack: target.slug) }
    }

    // MARK: L'éditeur (#16315, #16433)

    private func publisherLink(_ publisher: PackPublisherRef) -> some View {
        Button {
            HapticFeedback.light()
            onRoute(.publisher(publisher))
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                PackPublisherLabel(publisher: publisher, size: 13)
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(String(localized: "shop.publisher.open.hint", defaultValue: "Ouvre la page de l’éditeur", bundle: .module))
        .accessibilityIdentifier("shop.detail.publisher")
    }

    @ViewBuilder
    private func samePublisher(_ publisher: PackPublisherRef) -> some View {
        let entries = PublisherCatalogue.entries(of: publisher.slug, in: context.catalogue,
                                                 excluding: PackCatalogueEntry(domain: target.domain, slug: target.slug))
        if !entries.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                Text(String(localized: "shop.detail.samePublisher", defaultValue: "Du même éditeur", bundle: .module))
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .accessibilityAddTraits(.isHeader)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: MeeshySpacing.md) {
                        ForEach(entries) { entry in
                            if let pack = context.catalogue.pack(entry.domain, entry.slug) {
                                PackCatalogueTile(row: UnifiedShopView.row(pack, language: context.language)) {
                                    onRoute(.pack(PackDetailTarget(domain: entry.domain, slug: entry.slug)))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: En-tête

    private func header(_ row: PackRow) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            HStack(alignment: .top, spacing: MeeshySpacing.md) {
                PackCoverView(cover: row.cover, side: 72)
                    .frame(width: 72, height: 72)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    Text(row.name)
                        .font(MeeshyFont.relative(20, weight: .bold, design: .rounded))
                        .accessibilityAddTraits(.isHeader)
                    if let publisher = row.publisher {
                        publisherLink(publisher)
                        if !row.author.isEmpty, row.author != publisher.name {
                            Text(String(format: String(localized: "shop.detail.author", defaultValue: "Auteur : %@", bundle: .module), row.author))
                                .font(MeeshyFont.relative(12))
                                .foregroundStyle(.secondary)
                        }
                    } else if !row.author.isEmpty {
                        Text(String(format: String(localized: "sticker.sheet.pack.by", defaultValue: "par %@", bundle: .module), row.author))
                            .font(MeeshyFont.relative(13))
                            .foregroundStyle(.secondary)
                    }
                    facts(row)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if !row.description.isEmpty {
                Text(row.description)
                    .font(MeeshyFont.relative(14))
                    .foregroundStyle(.secondary)
            }
            if let unlock = row.unlockText {
                Label(unlock, systemImage: row.locked ? "lock.fill" : "clock")
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            if PackShopView.showsLocked(row) {
                Text(PackUnlockCopy.lockedTitle)
                    .font(MeeshyFont.relative(13, weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
            } else if !row.installed || row.removable {
                PackInstallButton(row: row, busy: context.pending.contains(row.slug), onToggle: context.onToggle)
            }
        }
    }

    private func facts(_ row: PackRow) -> some View {
        let parts = [Self.availabilityText(PackDetailFacts.availability(row)),
                     PackDetailFacts.weightText(row),
                     PackDetailFacts.priceText(row)].compactMap { $0 }
        return Text(parts.joined(separator: " · "))
            .font(MeeshyFont.relative(12, weight: .medium))
            .foregroundStyle(.secondary)
            .accessibilityIdentifier("shop.detail.facts")
    }

    static func availabilityText(_ availability: PackAvailability) -> String {
        switch availability {
        case .bundled:
            String(localized: "shop.detail.bundled", defaultValue: "Inclus dans l’app", bundle: .module)
        case .installed:
            String(localized: "shop.detail.installed", defaultValue: "Installé", bundle: .module)
        case .toDownload:
            String(localized: "shop.detail.toDownload", defaultValue: "À télécharger", bundle: .module)
        }
    }

    // MARK: Éléments

    @ViewBuilder
    private var elementsSection: some View {
        Text(String(localized: "shop.detail.elements", defaultValue: "Dans ce pack", bundle: .module))
            .font(MeeshyFont.relative(15, weight: .semibold))
            .accessibilityAddTraits(.isHeader)
        switch model.elements(domain: target.domain, pack: target.slug) {
        case .ready(let elements):
            LazyVGrid(columns: [GridItem(.adaptive(minimum: Self.tileMinimum(target.domain)), spacing: MeeshySpacing.md)],
                      spacing: MeeshySpacing.md) {
                ForEach(Array(elements.enumerated()), id: \.element.id) { index, element in
                    tile(element, index: index)
                }
            }
        case .loading:
            LazyVGrid(columns: [GridItem(.adaptive(minimum: Self.tileMinimum(target.domain)), spacing: MeeshySpacing.md)],
                      spacing: MeeshySpacing.md) {
                ForEach(0..<6, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(Color.primary.opacity(0.06))
                        .aspectRatio(Self.tileAspect(target.domain), contentMode: .fit)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(PackLoadingView.title)
            .accessibilityIdentifier("shop.detail.loading")
        case .downloadRequired:
            PackDownloadRequiredView()
        }
    }

    static func tileMinimum(_ domain: PackDomain) -> CGFloat {
        switch domain {
        case .banner, .bannerFrame: 150
        default: 96
        }
    }

    private func tile(_ element: PackElement, index: Int) -> some View {
        Button {
            HapticFeedback.light()
            model.openViewer(domain: target.domain, slug: target.slug, index: index)
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                PackElementStage(element: element, wearer: context.wearer, animates: false, compact: true)
                    .aspectRatio(Self.tileAspect(target.domain), contentMode: .fit)
                    .background(RoundedRectangle(cornerRadius: MeeshyRadius.sm).fill(Color.primary.opacity(0.04)))
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
                Text(element.name)
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(element.name)
        .accessibilityHint(String(localized: "shop.detail.tile.hint", defaultValue: "Ouvre en plein écran", bundle: .module))
        .accessibilityIdentifier("shop.detail.tile.\(element.item)")
    }

    static func tileAspect(_ domain: PackDomain) -> CGFloat {
        switch domain {
        case .banner, .bannerFrame: 3
        case .wallpaper: 0.75
        case .gloryFrame: SceneShape.aspect
        default: 1
        }
    }
}

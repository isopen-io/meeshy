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

    @Environment(\.dismiss) private var dismiss

    private var row: PackRow? { context.row(target.slug) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                    if let row { header(row) }
                    elementsSection
                }
                .padding(MeeshySpacing.lg)
            }
            .navigationTitle(row?.name ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "shop.detail.done", defaultValue: "Terminé", bundle: .module)) { dismiss() }
                }
            }
        }
        .task(id: target) { await model.prepare(domain: target.domain, pack: target.slug) }
        .fullScreenCover(item: viewerBinding) { _ in
            PackElementViewer(model: model, context: context) { model.viewer = nil }
        }
    }

    /// La fiche porte SON plein écran : une feuille ouverte ne laisse pas la boutique en présenter un.
    private var viewerBinding: Binding<PackViewerTarget?> {
        Binding(get: { model.viewer }, set: { model.viewer = $0 })
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
                    if !row.author.isEmpty {
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
        case .gloryFrame: 9.0 / 16.0
        default: 1
        }
    }
}

import SwiftUI
import MeeshySDK

// MARK: - La Boutique des packs (#9190)

/// **La Boutique : installer ou retirer un pack d'un geste** (#9190, suite iOS
/// de la `StickerShop` du web).
///
/// Une vue PARAMÉTRÉE : elle reçoit la liste, l'état d'installation déjà
/// optimiste et ce que fait le bouton. La mise à jour optimiste, son retour en
/// arrière et le cache vivent dans l'app (`StickerPackStore`) — la vue ne
/// parle à aucun service.
///
/// Proposer un pack depuis iOS est hors périmètre : le web le fait, avec son
/// éditeur de zones.
public struct StickerPackShopView: View {

    let packs: [StickerPack]?
    let pending: Set<String>
    /// Le dernier geste a été refusé et annulé : la Boutique le DIT, sans
    /// quoi le bouton revenu en arrière aurait l'air d'un tap perdu.
    let showsFailure: Bool
    let onToggle: (StickerPack) -> Void

    public init(packs: [StickerPack]?, pending: Set<String>, showsFailure: Bool,
                onToggle: @escaping (StickerPack) -> Void) {
        self.packs = packs
        self.pending = pending
        self.showsFailure = showsFailure
        self.onToggle = onToggle
    }

    static let coverSide: CGFloat = 56

    public var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            if showsFailure {
                Text(String(localized: "sticker.shop.failed",
                            defaultValue: "Le pack n’a pas pu changer d’état. Réessaie.", bundle: .module))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(MeeshyColors.error)
            }
            if let packs {
                ForEach(packs) { pack in
                    row(pack)
                }
            } else {
                // Cache vide au premier lancement : des rangées fantômes, jamais
                // un indicateur au milieu d'une feuille vide.
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color.primary.opacity(0.06))
                        .frame(height: Self.coverSide + 16)
                }
                .accessibilityHidden(true)
            }
        }
    }

    private func row(_ pack: StickerPack) -> some View {
        HStack(spacing: 12) {
            cover(pack)
                .frame(width: Self.coverSide, height: Self.coverSide)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(pack.name)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                Text(String(format: String(localized: "sticker.sheet.pack.by", defaultValue: "par %@",
                                           bundle: .module), pack.author))
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                if !pack.description.isEmpty {
                    Text(pack.description)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            toggleButton(pack)
        }
        .accessibilityElement(children: .contain)
    }

    private func toggleButton(_ pack: StickerPack) -> some View {
        let busy = pending.contains(pack.slug)
        let label = pack.installed
            ? String(localized: "sticker.shop.remove", defaultValue: "Retirer", bundle: .module)
            : String(localized: "sticker.shop.install", defaultValue: "Installer", bundle: .module)
        return Button {
            HapticFeedback.light()
            onToggle(pack)
        } label: {
            Text(label)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(pack.installed ? Color.primary : Color.white)
                .padding(.horizontal, 14)
                .frame(minHeight: 32)
                .background {
                    if pack.installed {
                        Capsule().fill(Color.primary.opacity(0.08))
                    } else {
                        Capsule().fill(MeeshyColors.brandGradient)
                    }
                }
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .opacity(busy ? 0.6 : 1)
        .accessibilityLabel("\(label) \(pack.name)")
    }

    @ViewBuilder
    private func cover(_ pack: StickerPack) -> some View {
        if let cast = MeeStickerCatalog.cast(forPackSlug: pack.slug),
           let sticker = MeeStickerCatalog.stickers(of: cast).first {
            MeeStickerFilmView(sticker: sticker, side: Self.coverSide,
                               pixelCap: MeeStickerFilmView.gridPixelCap)
        } else {
            CachedAsyncImage(url: pack.coverUrl ?? pack.items.first?.fileUrl,
                             targetSize: CGSize(width: Self.coverSide, height: Self.coverSide),
                             showsStatusOverlays: false, autoLoad: true) {
                RoundedRectangle(cornerRadius: 12).fill(Color.primary.opacity(0.06))
            }
            .scaledToFit()
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
}

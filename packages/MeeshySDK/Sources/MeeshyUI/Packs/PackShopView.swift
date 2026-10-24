import SwiftUI
import UIKit
import ImageIO
import MeeshySDK

// MARK: - La Boutique des packs, de n'importe quel domaine (#9190, #10150)

/// Ce qui illustre un pack dans la Boutique.
public enum PackCover: Hashable, Sendable {
    /// Un pack intégré de Mee et Meo : son premier film, dessiné par le client.
    case mee(slug: String)
    /// Un pack de tiers : son image servie comme tout média.
    case remote(String?)
    /// Un pack officiel : son fichier adressé par contenu, lu par
    /// `ContentAddressedStore` — jamais `CachedAsyncImage`.
    case stored(PackAssetFile)
    case none
}

/// **Une rangée de la Boutique, en VALEUR** : la vue ne connaît ni le domaine,
/// ni le service, ni le magasin — l'app projette chaque pack sur une rangée.
public struct PackRow: Identifiable, Hashable, Sendable {
    public let slug: String
    public let name: String
    public let author: String
    public let description: String
    public let installed: Bool
    /// Un pack non retirable (inclus, atmosphère choisie) n'offre pas « Retirer ».
    public let removable: Bool
    public let cover: PackCover
    /// « Rang Ambassadeur uniquement » — la loi d'usage, déjà traduite.
    public let usageText: String?
    /// En Meeshes ; `nil` = gratuit (#10632).
    public let price: Int?
    /// Un pack payant non possédé s'ACHÈTE ; les autres s'installent.
    public let owned: Bool
    /// Le serveur dit que le pack n'est pas encore débloqué : ni « Installer » ni « Acheter » (S21, #11276).
    public let locked: Bool
    /// Ce qui reste à débloquer, en une ligne déjà traduite ; `nil` = rien à dire.
    public let unlockText: String?

    public var id: String { slug }

    /// Le geste du bouton : acheter d'abord, installer ensuite.
    public var needsPurchase: Bool { price != nil && !owned }

    public init(slug: String, name: String, author: String = "", description: String = "",
                installed: Bool, removable: Bool = true, cover: PackCover = .none, usageText: String? = nil,
                price: Int? = nil, owned: Bool = true, locked: Bool = false, unlockText: String? = nil) {
        self.slug = slug
        self.name = name
        self.author = author
        self.description = description
        self.installed = installed
        self.removable = removable
        self.cover = cover
        self.usageText = usageText
        self.price = price
        self.owned = owned
        self.locked = locked
        self.unlockText = unlockText
    }
}

/// **La Boutique : installer ou retirer un pack d'un geste** — généralisée de
/// la Boutique des stickers (#9190), elle sert aussi celle des cadres (#10150).
///
/// Une vue PARAMÉTRÉE : elle reçoit les rangées, l'état d'installation déjà
/// optimiste et ce que fait le bouton. La mise à jour optimiste, son retour en
/// arrière et le cache vivent dans l'app (`PackStore`).
public struct PackShopView: View {

    let rows: [PackRow]?
    let pending: Set<String>
    /// Le dernier geste a été refusé et annulé : la Boutique le DIT, sans
    /// quoi le bouton revenu en arrière aurait l'air d'un tap perdu.
    let showsFailure: Bool
    /// Le message d'un refus précis (solde insuffisant…) ; à défaut, le message générique.
    let failureText: String?
    let onToggle: (String) -> Void
    /// Le pack à mettre en avant (lien profond depuis la fiche d'un sticker, #10703) :
    /// sa rangée est centrée une fois les rangées lues et marquée d'un contour.
    let focusedSlug: String?

    public init(rows: [PackRow]?, pending: Set<String>, showsFailure: Bool, failureText: String? = nil,
                focusedSlug: String? = nil, onToggle: @escaping (String) -> Void) {
        self.focusedSlug = focusedSlug
        self.rows = rows
        self.pending = pending
        self.showsFailure = showsFailure
        self.failureText = failureText
        self.onToggle = onToggle
    }

    static let coverSide: CGFloat = 56

    /// Le pack mis en avant n'existe que s'il figure parmi les rangées lues : un slug
    /// inconnu ne marque ni ne fait défiler rien.
    static func focusTarget(_ focusedSlug: String?, in rows: [PackRow]?) -> String? {
        guard let focusedSlug, rows?.contains(where: { $0.slug == focusedSlug }) == true else { return nil }
        return focusedSlug
    }

    public var body: some View {
        ScrollViewReader { proxy in
            shelf
                .task(id: Self.focusTarget(focusedSlug, in: rows)) {
                    guard let target = Self.focusTarget(focusedSlug, in: rows) else { return }
                    proxy.scrollTo(target, anchor: .center)
                }
        }
    }

    private var shelf: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            if showsFailure {
                Text(failureText ?? String(localized: "sticker.shop.failed",
                            defaultValue: "Le pack n’a pas pu changer d’état. Réessaie.", bundle: .module))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(MeeshyColors.error)
            }
            if let rows {
                ForEach(rows) { row in
                    rowView(row)
                }
            } else {
                // Cache vide au premier lancement : des rangées fantômes, jamais
                // un indicateur au milieu d'une feuille vide.
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .fill(Color.primary.opacity(0.06))
                        .frame(height: Self.coverSide + 16)
                }
                .accessibilityHidden(true)
            }
        }
    }

    private func rowView(_ row: PackRow) -> some View {
        HStack(spacing: 12) {
            PackCoverView(cover: row.cover, side: Self.coverSide)
                .frame(width: Self.coverSide, height: Self.coverSide)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.name)
                    .font(MeeshyFont.relative(15, weight: .semibold, design: .rounded))
                if !row.author.isEmpty {
                    Text(String(format: String(localized: "sticker.sheet.pack.by", defaultValue: "par %@",
                                               bundle: .module), row.author))
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                if let usage = row.usageText {
                    Label(usage, systemImage: "checkmark.seal")
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .foregroundStyle(MeeshyColors.indigo500)
                }
                if Self.showsOwned(row) {
                    Label(String(localized: "shop.owned", defaultValue: "Possédé", bundle: .module),
                          systemImage: "checkmark.seal.fill")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("shop.owned.\(row.slug)")
                }
                if !row.description.isEmpty {
                    Text(row.description)
                        .font(MeeshyFont.relative(12))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                if let unlock = row.unlockText {
                    Label(unlock, systemImage: row.locked ? "lock.fill" : "clock")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("shop.unlock.\(row.slug)")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if Self.showsLocked(row) {
                lockedBadge(row)
            } else if !row.installed || row.removable {
                toggleButton(row)
            }
        }
        .padding(row.slug == focusedSlug ? 6 : 0)
        .overlay {
            if row.slug == focusedSlug {
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .stroke(MeeshyColors.indigo500, lineWidth: 2)
                    .accessibilityHidden(true)
            }
        }
        .id(row.slug)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(row.slug == focusedSlug ? .isSelected : [])
    }

    /// Un pack pas encore débloqué ne s'installe ni ne s'achète : « À débloquer » prend la place du bouton.
    /// Installé, il se retire toujours.
    static func showsLocked(_ row: PackRow) -> Bool {
        row.locked && !row.installed
    }

    private func lockedBadge(_ row: PackRow) -> some View {
        Text(PackUnlockCopy.lockedTitle)
            .font(MeeshyFont.relative(13, weight: .semibold, design: .rounded))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .accessibilityIdentifier("shop.locked.\(row.slug)")
    }

    /// Un pack PAYANT que je possède le dit (« Possédé ») ; un pack gratuit n'a rien à déclarer.
    static func showsOwned(_ row: PackRow) -> Bool {
        row.price != nil && row.owned
    }

    /// Le titre du bouton d'une rangée : acheter d'abord, installer ensuite.
    static func buttonTitle(for row: PackRow) -> String {
        if let price = row.price, row.needsPurchase {
            return String(format: String(localized: "shop.buy.price", defaultValue: "Acheter · %lld", bundle: .module), price)
        }
        return row.installed
            ? String(localized: "sticker.shop.remove", defaultValue: "Retirer", bundle: .module)
            : String(localized: "sticker.shop.install", defaultValue: "Installer", bundle: .module)
    }

    /// Ce que VoiceOver lit : le geste, le pack et, pour un achat, son prix EN MEESHES.
    static func voiceOverLabel(for row: PackRow) -> String {
        guard let price = row.price, row.needsPurchase else { return "\(buttonTitle(for: row)) \(row.name)" }
        return String(format: String(localized: "shop.buy.a11y", defaultValue: "Acheter %1$@ pour %2$lld Meeshes",
                                     bundle: .module), row.name, price)
    }

    private func toggleButton(_ row: PackRow) -> some View {
        let busy = pending.contains(row.slug)
        let label = Self.buttonTitle(for: row)
        return Button {
            HapticFeedback.light()
            onToggle(row.slug)
        } label: {
            Text(label)
                .font(MeeshyFont.relative(13, weight: .semibold, design: .rounded))
                .foregroundStyle(row.installed ? Color.primary : Color.white)
                .padding(.horizontal, 14)
                .frame(minHeight: 32)
                .background {
                    if row.installed {
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
        .accessibilityLabel(Self.voiceOverLabel(for: row))
    }
}

/// L'illustration d'un pack, selon ce qui la porte.
struct PackCoverView: View {
    let cover: PackCover
    let side: CGFloat

    var body: some View {
        switch cover {
        case .mee(let slug):
            if let cast = MeeStickerCatalog.cast(forPackSlug: slug),
               let sticker = MeeStickerCatalog.stickers(of: cast).first {
                MeeStickerFilmView(sticker: sticker, side: side, pixelCap: MeeStickerFilmView.gridPixelCap)
            } else {
                placeholder
            }
        case .remote(let url):
            CachedAsyncImage(url: url, targetSize: CGSize(width: side, height: side),
                             showsStatusOverlays: false, autoLoad: true) {
                placeholder
            }
            .scaledToFit()
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        case .stored(let file):
            StoredPackImage(file: file, maxPixelSize: Int(side * 3))
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        case .none:
            placeholder
        }
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.smPlus).fill(Color.primary.opacity(0.06))
    }
}

// MARK: - Une image de pack officiel, lue sur l'appareil

/// **Un fichier de pack officiel, vérifié puis affiché** : lu par
/// `ContentAddressedStore` (disque d'abord, réseau une fois), décodé et réduit
/// HORS du fil principal. Un fichier introuvable ou altéré garde la place
/// vide : rien de faux ne s'affiche.
public struct StoredPackImage: View {
    let file: PackAssetFile
    let maxPixelSize: Int
    let store: ContentAddressedStore

    @State private var image: UIImage?

    public init(file: PackAssetFile, maxPixelSize: Int, store: ContentAddressedStore = .shared) {
        self.file = file
        self.maxPixelSize = maxPixelSize
        self.store = store
    }

    public var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
            } else {
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus).fill(Color.primary.opacity(0.06))
            }
        }
        .task(id: file) {
            guard let data = try? await store.data(for: file) else { return }
            image = await PackImageDecoder.thumbnail(data, maxPixelSize: maxPixelSize)
        }
    }
}

/// Les vignettes de la boutique passent par le sous-échantillonneur unique
/// (#11923) : mêmes règles que tout le reste, orientation EXIF comprise.
nonisolated enum PackImageDecoder {
    @concurrent
    static func thumbnail(_ data: Data, maxPixelSize: Int) async -> UIImage? {
        ImageDownsampler.thumbnail(data: data, maxPixelSize: CGFloat(maxPixelSize), decodeImmediately: true)
            .map { UIImage(cgImage: $0) }
    }
}

import Foundation

// MARK: - Les packs de fonds que le sélecteur propose (#10708, spec §§ 9, 11)
//
// Le sélecteur ne montre que ce que le lecteur POSSÈDE et a INSTALLÉ (`/packs/wallpaper/installed`),
// comme le web. Les dessins des packs `builtin` sont embarqués : le serveur ne dit que QUELS packs
// sont installés. Pure et sans réseau — l'écran lit la liste, cette règle décide.

public enum WallpaperPackOptions {

    /// Ce que le réseau a répondu, traduit pour la règle : une liste, « ce serveur ne connaît pas ce domaine »
    /// (ancien serveur, 404 ⇒ aucun pack, le sélecteur se réduit à Signature, gamme et photo), ou une panne
    /// (on ne conclut RIEN : les packs installés d'office).
    public static func installedList(from result: Result<[ShopPack], Error>) -> [ShopPack]? {
        switch result {
        case .success(let packs):
            return packs
        case .failure(let error):
            guard PackHTTPStatus.code(of: error) == 404 else { return nil }
            return []
        }
    }

    /// `installed == nil` (pas encore lue, ou panne) : les packs installés d'office.
    public static func packs(installed: [ShopPack]?, catalog: AppearanceCatalog = .shared) -> [AppearanceDesignPack] {
        guard let installed else { return catalog.wallpaperPacks.filter(\.installedByDefault) }
        let usable = Set(installed.filter { $0.installed && $0.isOwned }.map(\.slug))
        return catalog.wallpaperPacks.filter { usable.contains($0.slug) }
    }
}

import Foundation

extension Bundle {
    /// **Le catalogue des mots de l'écran de partage** — celui de l'APP, dans les
    /// deux cibles qui montent l'écran (#10947).
    ///
    /// Dans l'app, c'est le bundle principal. Dans l'extension de partage, le
    /// bundle principal est l'`.appex`, logé dans `Meeshy.app/PlugIns/` : on
    /// remonte de deux crans jusqu'à l'app qui le contient, et on y lit
    /// `Localizable` — un seul vocabulaire, jamais une copie des clés dans le
    /// catalogue de l'extension qui pourrait en diverger.
    nonisolated static let meeshyShare: Bundle = containingApp(of: .main)

    nonisolated static func containingApp(of bundle: Bundle) -> Bundle {
        guard bundle.bundleURL.pathExtension == "appex" else { return bundle }
        let app = bundle.bundleURL.deletingLastPathComponent().deletingLastPathComponent()
        return Bundle(url: app) ?? bundle
    }
}

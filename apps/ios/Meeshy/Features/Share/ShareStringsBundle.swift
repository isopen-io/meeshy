import Foundation
import MeeshySDK

extension Bundle {
    /// **Le catalogue des mots de l'écran de partage** — celui de l'APP, dans les
    /// deux cibles qui montent l'écran (#10947).
    ///
    /// Dans l'app, c'est le bundle principal. Dans l'extension de partage, le
    /// bundle principal est l'`.appex`, logé dans `Meeshy.app/PlugIns/` : on
    /// remonte de deux crans jusqu'à l'app qui le contient, et on y lit
    /// `Localizable` — un seul vocabulaire, jamais une copie des clés dans le
    /// catalogue de l'extension qui pourrait en diverger.
    ///
    /// Et dans la langue que l'APP a publiée dans le groupe d'app, pas celle de
    /// l'appareil : l'override `AppleLanguages` posé au lancement de l'app
    /// n'atteint pas le processus de l'extension (#11515).
    nonisolated static let meeshyShare: Bundle = shareCatalog(in: containingApp(of: .main))

    nonisolated static func containingApp(of bundle: Bundle) -> Bundle {
        guard bundle.bundleURL.pathExtension == "appex" else { return bundle }
        let app = bundle.bundleURL.deletingLastPathComponent().deletingLastPathComponent()
        return Bundle(url: app) ?? bundle
    }

    nonisolated static func shareCatalog(
        in app: Bundle,
        store: InterfaceLanguageProviding = AppGroupInterfaceLanguageStore(),
        devicePreferred: [String] = Locale.preferredLanguages
    ) -> Bundle {
        InterfaceLanguageResolver.bundle(for: app, store: store, devicePreferred: devicePreferred)
    }
}

extension Locale {
    /// La locale du catalogue de partage : celle de l'`.lproj` que la langue
    /// publiée par l'app a élu (`Bundle.shareCatalog`), sinon celle de
    /// l'appareil — pour qu'un nombre formaté parle la langue des mots qui
    /// l'entourent.
    nonisolated static func shareCatalog(_ bundle: Bundle = .meeshyShare) -> Locale {
        guard bundle.bundleURL.pathExtension == "lproj" else { return .current }
        return Locale(identifier: bundle.bundleURL.deletingPathExtension().lastPathComponent)
    }
}

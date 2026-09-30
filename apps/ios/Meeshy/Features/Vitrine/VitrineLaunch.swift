#if DEBUG
import Foundation

/// Mode vitrine App Store (#8855) : `-MeeshyVitrine <scène>` ouvre un VRAI écran de l'app,
/// rempli d'un contenu fictif, sans serveur. Absent de l'app publiée.
///
/// ```
/// xcrun simctl launch <udid> me.meeshy.app -MeeshyVitrine global \
///     -AppleLanguages "(fr)" -AppleLocale fr_FR \
///     -meeshy_selected_environment custom -meeshy_custom_host http://127.0.0.1:9
/// ```
nonisolated enum VitrineScene: String, CaseIterable, Sendable {
    case global
    case progression
    case lien

    /// La scène « lien » montre ce que voit un invité SANS compte.
    var ouvreUneSession: Bool { self != .lien }
}

nonisolated enum VitrineLaunch {
    static let argument = "-MeeshyVitrine"

    static func scene(in arguments: [String] = ProcessInfo.processInfo.arguments) -> VitrineScene? {
        guard let index = arguments.firstIndex(of: argument), arguments.indices.contains(index + 1) else { return nil }
        return VitrineScene(rawValue: arguments[index + 1])
    }

    static var isActive: Bool { scene() != nil }

    /// Là où le script de capture dépose les fixtures et attend le signal « prêt ».
    static var dossier: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("vitrine", isDirectory: true)
    }

    static var fichierFixtures: URL { dossier.appendingPathComponent("fixtures.json") }

    /// Là où le script de capture dépose les photos et les vocaux.
    static var dossierMedias: URL { dossier.appendingPathComponent("medias", isDirectory: true) }

    static var marqueurPret: URL { dossier.appendingPathComponent("pret.txt") }
}
#endif

import Foundation

/// Which catalog a `String(localized:)` call actually resolves against.
///
/// An app extension is a SEPARATE BUNDLE: a call in its sources resolves against
/// the catalog shipped INSIDE it, never the host app's. A call passing
/// `bundle: .module` resolves against the SDK's own catalog, wherever the source
/// file lives — and MeeshyUI contains sources of both kinds, so the file path
/// alone does not answer the question.
///
/// **Extracted at 271i.** The map lived inside `LocalizationConsistencyTests`,
/// which meant a second guard could only get at it by copying it. Two copies of
/// this map is the exact defect 270i fixed *inside* one copy: a target that is
/// not named falls back to the app catalog SILENTLY, so a stale copy mis-measures
/// without ever going red. `test_everyPerTargetCatalogIsMapped` reads the file
/// system and keeps this one honest.
enum LocalizationCatalogMap {

    static let appCatalogPath = "apps/ios/Meeshy/Localizable.xcstrings"
    static let sdkCatalogPath = "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings"

    /// Path fragment identifying a target → the catalog that target ships.
    static let byTargetFragment: [String: String] = [
        "/MeeshyShareExtension/": "apps/ios/MeeshyShareExtension/Localizable.xcstrings",
        "/MeeshyNotificationExtension/": "apps/ios/MeeshyNotificationExtension/Localizable.xcstrings",
        "/MeeshyWidgets/": "apps/ios/MeeshyWidgets/Localizable.xcstrings",
    ]

    /// The catalog repo-path a call in `file` resolves against.
    static func catalogPath(resolvedFor file: URL, isModuleBundle: Bool) -> String {
        if isModuleBundle { return sdkCatalogPath }
        for (fragment, path) in byTargetFragment where file.path.contains(fragment) {
            return path
        }
        return appCatalogPath
    }
}

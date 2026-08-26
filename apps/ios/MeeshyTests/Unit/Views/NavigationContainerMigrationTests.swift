import XCTest
@testable import Meeshy

/// `NavigationView` is deprecated since iOS 16 and — critically — defaults to the
/// double-column style. On a regular-width environment (iPad, and the iPad share
/// sheet) a single-child `NavigationView` therefore renders as a split view whose
/// detail column is empty, hiding the sheet's own content and, in the toolbar case,
/// misplacing its only dismiss affordance.
///
/// The app's deployment floor is iOS 16.0 (`project.yml`), so `NavigationStack` is
/// available unconditionally — no availability guard, no compatibility shim.
///
/// This suite sweeps every SwiftUI source of the iOS app targets and pins the exact
/// set of files still using the deprecated container, so that (a) the migrated files
/// cannot regress and (b) no new `NavigationView` can be introduced unnoticed.
@MainActor
final class NavigationContainerMigrationTests: XCTestCase {

    /// `apps/ios/` — four levels up from `MeeshyTests/Unit/Views/<this file>`.
    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    /// Source trees compiled into the shipping iOS app targets.
    private let scannedTargets = ["Meeshy", "MeeshyShareExtension", "MeeshyNotificationExtension"]

    /// Files still declaring a `NavigationView { … }` container, by file name.
    private func filesUsingDeprecatedContainer() throws -> Set<String> {
        var offenders: Set<String> = []
        for target in scannedTargets {
            let root = iosRoot.appendingPathComponent(target)
            guard let walker = FileManager.default.enumerator(atPath: root.path) else { continue }
            for case let relativePath as String in walker where relativePath.hasSuffix(".swift") {
                let source = try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
                // `NavigationViewStyle` / `.navigationViewStyle` are distinct APIs — match the container only.
                if source.contains("NavigationView {") {
                    offenders.insert((relativePath as NSString).lastPathComponent)
                }
            }
        }
        return offenders
    }

    // MARK: - Migrated in 214i

    func test_emojiPickerSheet_usesNavigationStack() throws {
        try assertMigrated("Meeshy/Features/Main/Views/EmojiPickerSheet.swift")
    }

    func test_voiceProfileAddSamplesSheet_usesNavigationStack() throws {
        try assertMigrated("Meeshy/Features/Main/Views/VoiceProfileManageView.swift")
    }

    func test_shareExtensionContactPicker_usesNavigationStack() throws {
        try assertMigrated("MeeshyShareExtension/ShareViewController.swift")
    }

    // MARK: - Migrated in 220i — RE-VISÉ au lot 4.8

    /// **La raison d'origine, portée sur la surface qui a remplacé l'écran.**
    ///
    /// 220i avait migré `StatusComposerView` de `NavigationView` vers
    /// `NavigationStack` parce qu'un `NavigationView` à un seul enfant s'effondre
    /// en split view au largeur régulière (iPad) : le détail y est vide et la
    /// feuille disparaît derrière lui. Le fichier est retiré par le lot 4.8, et
    /// le mood est servi par le meuble, qui n'a AUCUN conteneur de navigation —
    /// il peint son titre et sa croix lui-même.
    ///
    /// La garde ne peut donc pas exiger `NavigationStack {` ici : ce serait
    /// exiger un conteneur que la nouvelle forme n'a pas. Elle garde sa moitié
    /// OPPOSABLE — le conteneur déprécié reste interdit — et la double par ce qui
    /// remplace la barre : le titre et la sortie, peints par la surface. Sans
    /// cette seconde moitié, retirer le chrome à la main laisserait une feuille
    /// sans titre ni congé, et rien ne le dirait.
    func test_moodComposer_hostsItsChromeWithoutAnyNavigationContainer() throws {
        let surfacePath = "Meeshy/Features/Main/Composer/ComposerMoodSurface.swift"
        let hostPath = "Meeshy/Features/Main/Composer/MeeshyComposerHost.swift"

        for path in [surfacePath, hostPath] {
            let source = try String(contentsOf: iosRoot.appendingPathComponent(path), encoding: .utf8)
            XCTAssertFalse(
                source.contains("NavigationView {"),
                "\(path) must not use the deprecated NavigationView container: with its default " +
                "double-column style it collapses to an empty detail pane at regular width (iPad)."
            )
        }

        let surface = try String(contentsOf: iosRoot.appendingPathComponent(surfacePath), encoding: .utf8)
        XCTAssertTrue(
            surface.contains("ComposerMoodCopy.title"),
            "La surface doit peindre son TITRE : il vivait en `navigationTitle`, et le perdre en chemin " +
            "laisserait `status.composer.title` sans lecteur et la feuille sans en-tête."
        )
        XCTAssertTrue(
            surface.contains("let onClose: () -> Void"),
            "La surface doit peindre sa SORTIE : sans barre de navigation, personne d'autre ne pose la croix."
        )
    }

    private func assertMigrated(_ path: String, file: StaticString = #filePath, line: UInt = #line) throws {
        let source = try String(contentsOf: iosRoot.appendingPathComponent(path), encoding: .utf8)
        XCTAssertFalse(
            source.contains("NavigationView {"),
            "\(path) must not use the deprecated NavigationView container: with its default " +
            "double-column style it collapses to an empty detail pane at regular width (iPad).",
            file: file, line: line
        )
        XCTAssertTrue(
            source.contains("NavigationStack {"),
            "\(path) must host its content in a NavigationStack (available unconditionally at the " +
            "iOS 16.0 deployment floor).",
            file: file, line: line
        )
    }

    // MARK: - The debt is paid — this is now a regression guard

    /// 220i migrated `StatusComposerView`, the last holdout, so the expectation
    /// is now the empty set — et elle l'est restée après le retrait de ce
    /// fichier au lot 4.8 : le balayage porte sur l'arbre, pas sur une liste. From here this test has changed character: it no
    /// longer pins tolerated debt, it forbids the container outright. Any new
    /// `NavigationView` anywhere in the shipping targets turns it red.
    func test_noNavigationViewRemains() throws {
        XCTAssertEqual(
            try filesUsingDeprecatedContainer(), [],
            "NavigationView is deprecated since iOS 16 and defaults to the double-column style, " +
            "which collapses to an empty detail pane at regular width (iPad). Use NavigationStack — " +
            "it is available unconditionally at the iOS 16.0 deployment floor."
        )
    }
}

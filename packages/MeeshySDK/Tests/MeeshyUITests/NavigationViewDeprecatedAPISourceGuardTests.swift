import XCTest

/// Garde de source : `Sources/MeeshyUI/` ne doit plus utiliser `NavigationView`,
/// soft-dépréciée depuis iOS 16 au profit de `NavigationStack` (le plancher de
/// déploiement du SDK est iOS 16.0+, cf. `packages/MeeshySDK/CLAUDE.md`).
///
/// Cinq écrans modaux (`VoiceProfileWizardView`, `VoiceProfileManageView`,
/// `UnifiedPostComposer`, `CodeViewerView`, `DocumentViewerView`) instanciaient
/// `NavigationView { <une seule vue enfant> }` — aucun n'exploite le mode
/// master/detail (`NavigationView` ne bascule en `.doubleColumn` sur iPad que
/// lorsque DEUX vues enfants distinctes sont fournies ; ici il n'y en a qu'une),
/// donc la migration vers `NavigationStack { ... }` est un remplacement
/// comportementalement identique — mêmes `.navigationTitle`/`.toolbar`/
/// `ToolbarItemPlacement`, aucun changement visuel iPad ou iPhone.
///
/// Garde GLOBALE sur tout `Sources/MeeshyUI/` (récursif), pas un test par
/// fichier nommé un par un : un futur nouvel écran qui réintroduirait
/// `NavigationView` par copier-coller d'un vieux snippet doit être détecté sans
/// qu'on ait à se souvenir de l'ajouter à une liste — cf.
/// `reference_source_guard_fixed_char_windows_rot` et le commentaire de
/// `ComposerSourceGuard.allStorySources()` sur le même principe. Réutilise
/// `ComposerSourceGuard.stripComments`/`.packageRoot` (même target de test,
/// déjà éprouvés) plutôt que de redupliquer un scanner de commentaires.
final class NavigationViewDeprecatedAPISourceGuardTests: XCTestCase {

    // MARK: - Test réel (fichiers du repo)

    func test_meeshyUI_doesNotUseDeprecatedNavigationView() throws {
        let violations = try Self.allMeeshyUISources()
            .filter { Self.containsNavigationViewToken($0.code) }
            .map(\.path)

        XCTAssertTrue(
            violations.isEmpty,
            "NavigationView (soft-dépréciée iOS 16+) trouvée dans : \(violations.joined(separator: ", ")) — migrer vers NavigationStack"
        )
    }

    // MARK: - Méta-tests de la garde elle-même

    /// Contrôle positif : sans ce test, une garde cassée (mauvais chemin,
    /// détection trop étroite) resterait verte pour toujours et ne
    /// protégerait rien — elle doit réellement détecter le motif banni.
    func test_guardDetectsTheBannedPattern() {
        let sample = """
        struct Fake: View {
            var body: some View {
                NavigationView {
                    Text("x")
                }
            }
        }
        """
        XCTAssertTrue(Self.containsNavigationViewToken(sample))
    }

    /// Contrôle négatif : la forme corrigée (`NavigationStack`) ne doit
    /// jamais déclencher l'alerte, y compris quand le mot apparaît en
    /// commentaire (documentant par exemple une migration passée).
    func test_guardAcceptsNavigationStackAndIgnoresComments() {
        let sample = """
        struct Fake: View {
            var body: some View {
                // migré depuis NavigationView le 2026-08-11
                NavigationStack {
                    Text("x")
                }
            }
        }
        """
        let stripped = ComposerSourceGuard.stripComments(sample)
        XCTAssertFalse(Self.containsNavigationViewToken(stripped))
    }

    /// Non-régression : une future `NavigationViewModel`/type dont le nom
    /// CONTIENT le mot ne doit pas déclencher un faux positif (frontière de
    /// mot obligatoire des deux côtés).
    func test_guardIgnoresLongerIdentifiersContainingTheToken() {
        let sample = "let vm: NavigationViewModel = NavigationViewModel()"
        XCTAssertFalse(Self.containsNavigationViewToken(sample))
    }

    // MARK: - Helpers

    private static func allMeeshyUISources() throws -> [(path: String, code: String)] {
        let root = ComposerSourceGuard.packageRoot.appendingPathComponent("Sources/MeeshyUI")
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { return [] }
        var out: [(path: String, code: String)] = []
        for case let url as URL in walker where url.pathExtension == "swift" {
            let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
            let raw = try String(contentsOf: url, encoding: .utf8)
            out.append((relative, ComposerSourceGuard.stripComments(raw)))
        }
        return out.sorted { $0.path < $1.path }
    }

    /// `true` si `code` contient le token `NavigationView` avec une frontière
    /// de mot des deux côtés (ni lettre/chiffre/underscore avant, ni après) —
    /// exclut `NavigationViewModel`, `SomeNavigationView`, etc.
    private static func containsNavigationViewToken(_ code: String) -> Bool {
        let needle = "NavigationView"
        var searchStart = code.startIndex
        while let range = code.range(of: needle, range: searchStart..<code.endIndex) {
            let beforeOK = range.lowerBound == code.startIndex || !code[code.index(before: range.lowerBound)].isWordCharacter
            let afterOK = range.upperBound == code.endIndex || !code[range.upperBound].isWordCharacter
            if beforeOK && afterOK { return true }
            searchStart = range.upperBound
        }
        return false
    }
}

private extension Character {
    var isWordCharacter: Bool { isLetter || isNumber || self == "_" }
}

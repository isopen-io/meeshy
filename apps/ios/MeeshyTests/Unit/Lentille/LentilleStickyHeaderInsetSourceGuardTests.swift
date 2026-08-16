import XCTest
@testable import Meeshy

/// R-a (réserve tracée Porte V1, `tasks/lentille-workshop-execution.md` §8) :
/// « `.safeAreaInset` inconditionnel — un inset de la liste Lentille est
/// appliqué même drapeau OFF ». Re-preuve : avant ce correctif,
/// `ConversationListView.swift` montait `.safeAreaInset(edge: .top, spacing: 0)`
/// SANS AUCUNE garde de drapeau — seule la hauteur passée
/// (`stickyHeaderInset`) retombait à `0` sous drapeau OFF. Un
/// `safeAreaInset(height: 0)` reste un modificateur monté dans l'arbre de
/// vue (il continue de composer `GeometryProxy.safeAreaInsets` pour le
/// contenu défilant) — ce n'est PAS bit-à-bit identique à l'absence du
/// modificateur, contrairement à ce que documentait le commentaire du site
/// d'appel à l'époque (« hauteur 0 ⇒ inset inerte »).
///
/// Le correctif introduit `LentilleStickyHeaderInsetModifier`
/// (`ConversationListView.swift`, scope privé au fichier) : `isEnabled ==
/// false` ⇒ `body(content:)` renvoie `content` SANS AUCUNE chaîne de
/// modificateur ajoutée — le modificateur lui-même n'est plus monté,
/// pas seulement sa hauteur mise à zéro.
///
/// **Pourquoi une garde source plutôt qu'un montage `UIHostingController`.**
/// Ce fichier de tâche s'exécute sans toolchain Swift local (proof-by-reading
/// + tests laissés au CI macOS) — la garde source est la preuve la plus
/// robuste à formuler sans pouvoir compiler soi-même : elle relit le texte
/// APRÈS édition et prouve structurellement que l'appel nu
/// `.safeAreaInset(edge: .top, spacing: 0)` a disparu du site d'appel
/// (`mainContentZStack`) au profit d'un `.modifier(...)` conditionnel, et
/// que la branche OFF du modificateur ne chaîne plus rien après `content`.
final class LentilleStickyHeaderInsetSourceGuardTests: XCTestCase {

    // MARK: - Localisation de la source

    private func viewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationListView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    // MARK: - Le site d'appel n'expose plus AUCUN `.safeAreaInset` nu

    /// Avant le correctif, `mainContentZStack` chaînait
    /// `.safeAreaInset(edge: .top, spacing: 0) { … }` directement sur le
    /// conteneur de défilement — inconditionnel. Ce témoin échouerait si la
    /// régression revenait : la SEULE occurrence légitime de
    /// `.safeAreaInset(edge: .top` doit désormais vivre à l'INTÉRIEUR du
    /// corps du modificateur (`LentilleStickyHeaderInsetModifier.body`),
    /// jamais directement chaînée sur `MeeshyRefreshableScroll`.
    func test_mainContentZStack_neverChainsSafeAreaInsetDirectly() throws {
        let stripped = AppSourceGuard.stripComments(try viewSource())
        XCTAssertTrue(
            stripped.contains(".modifier(LentilleStickyHeaderInsetModifier("),
            "le site d'appel de l'inset sticky doit passer par " +
            "`.modifier(LentilleStickyHeaderInsetModifier(...))` — la garde d'ancrage a disparu, " +
            "vérifier qu'un autre agent n'a pas réintroduit `.safeAreaInset` en direct sur " +
            "`mainContentZStack`."
        )

        // Exactement UNE occurrence de l'appel réel `.safeAreaInset(edge: .top`
        // dans tout le fichier — celle du CORPS du modificateur (branche ON).
        // Une seconde occurrence signalerait un second site non gardé par le
        // drapeau ; une occurrence ZÉRO signalerait que le modificateur a
        // perdu sa branche ON (régression inverse, tout aussi grave).
        XCTAssertEqual(
            occurrences(of: ".safeAreaInset(edge: .top", in: stripped), 1,
            "`ConversationListView.swift` doit contenir EXACTEMENT une occurrence de " +
            "`.safeAreaInset(edge: .top` — celle du corps de " +
            "`LentilleStickyHeaderInsetModifier.body(content:)`, dans sa branche `if isEnabled`. " +
            "Zéro : la branche ON a disparu. Plus d'une : un second site échappe au drapeau (R-a)."
        )
    }

    // MARK: - Le corps du modificateur est bien gardé par le drapeau

    func test_modifierBody_guardsSafeAreaInsetBehindTheFlag() throws {
        let stripped = AppSourceGuard.stripComments(try viewSource())
        guard let modifierRange = stripped.range(of: "struct LentilleStickyHeaderInsetModifier") else {
            XCTFail("LentilleStickyHeaderInsetModifier introuvable dans ConversationListView.swift — le correctif R-a a-t-il été retiré ?")
            return
        }
        let bodyText = String(stripped[modifierRange.lowerBound...])

        // Le `if isEnabled` doit précéder l'appel `.safeAreaInset` dans le
        // texte de la déclaration du modificateur — sinon la garde n'a
        // aucun effet réel sur ce chemin.
        guard let ifRange = bodyText.range(of: "if isEnabled"),
              let insetRange = bodyText.range(of: ".safeAreaInset(edge: .top") else {
            XCTFail("le corps de LentilleStickyHeaderInsetModifier doit contenir à la fois `if isEnabled` et `.safeAreaInset(edge: .top` (R-a).")
            return
        }
        XCTAssertLessThan(
            ifRange.lowerBound, insetRange.lowerBound,
            "`if isEnabled` doit précéder `.safeAreaInset(edge: .top` dans le corps du " +
            "modificateur — l'inset doit être STRICTEMENT dans la branche ON, jamais posé " +
            "avant le test du drapeau."
        )
    }

    /// Témoin le plus direct de « zéro modificateur ajouté » : la branche
    /// `else` du modificateur doit renvoyer `content` SEUL — aucune
    /// ponctuation `.` derrière ce mot sur la même ligne logique (qui
    /// trahirait un modificateur chaîné dessus, même inerte).
    func test_modifierBody_elseBranchReturnsContentAlone_noChainedModifier() throws {
        let stripped = AppSourceGuard.stripComments(try viewSource())
        guard let modifierRange = stripped.range(of: "struct LentilleStickyHeaderInsetModifier") else {
            XCTFail("LentilleStickyHeaderInsetModifier introuvable dans ConversationListView.swift.")
            return
        }
        let bodyText = String(stripped[modifierRange.lowerBound...])
        guard let elseRange = bodyText.range(of: "} else {") else {
            XCTFail("le corps de LentilleStickyHeaderInsetModifier doit contenir une branche `else` explicite (R-a : la branche OFF, pas un simple early-return).")
            return
        }
        let afterElse = bodyText[elseRange.upperBound...]
        guard let lineEnd = afterElse.firstIndex(of: "\n") else {
            XCTFail("impossible de délimiter la ligne suivant `} else {`.")
            return
        }
        let elseLine = afterElse[afterElse.startIndex..<lineEnd].trimmingCharacters(in: .whitespaces)
        XCTAssertEqual(
            elseLine, "content",
            "la branche `else` de `LentilleStickyHeaderInsetModifier.body(content:)` doit être " +
            "EXACTEMENT `content` — tout suffixe (`.foo(...)`) serait un modificateur ajouté " +
            "même drapeau OFF, exactement le défaut re-prouvé par R-a. Trouvé : « \(elseLine) »."
        )
    }

    // MARK: - `isEnabled` est injecté, jamais lu en interne (testabilité, leçon résidu UserDefaults)

    func test_modifier_takesIsEnabledAsAStoredProperty_neverReadsTheGlobalFlagInternally() throws {
        let stripped = AppSourceGuard.stripComments(try viewSource())
        guard let modifierRange = stripped.range(of: "struct LentilleStickyHeaderInsetModifier") else {
            XCTFail("LentilleStickyHeaderInsetModifier introuvable dans ConversationListView.swift.")
            return
        }
        let declEnd = stripped.range(of: "func body(content: Content)", range: modifierRange.lowerBound..<stripped.endIndex)
        let declarationHead = declEnd.map { String(stripped[modifierRange.lowerBound..<$0.lowerBound]) } ?? ""

        XCTAssertTrue(
            declarationHead.contains("let isEnabled: Bool"),
            "LentilleStickyHeaderInsetModifier doit déclarer `isEnabled` comme propriété STOCKÉE " +
            "injectée — jamais relire `LentilleFeatureFlag.isLentilleListEnabled` en interne, " +
            "pour rester testable sans écrire dans `UserDefaults.standard`."
        )
        XCTAssertFalse(
            declarationHead.contains("LentilleFeatureFlag"),
            "le TYPE du modificateur ne doit référencer `LentilleFeatureFlag` nulle part avant " +
            "sa méthode `body` — la résolution du drapeau reste au SITE D'APPEL " +
            "(`.modifier(LentilleStickyHeaderInsetModifier(isEnabled: LentilleFeatureFlag." +
            "isLentilleListEnabled, …))`), jamais dans le modificateur lui-même."
        )
    }

    // MARK: - Garde d'ensemble (leçon 257) — cette suite lit vraiment le fichier

    func test_guardActuallyLoadsTheFile_neverSilentlyEmpty() throws {
        let source = try viewSource()
        XCTAssertFalse(
            source.isEmpty,
            "LentilleStickyHeaderInsetSourceGuardTests n'a chargé AUCUN contenu depuis " +
            "ConversationListView.swift — vérifier le chemin résolu depuis #filePath avant de " +
            "faire confiance à cette suite (leçon 257 : une garde qui charge zéro contenu " +
            "passe toujours au vert sans avoir rien vérifié)."
        )
    }
}

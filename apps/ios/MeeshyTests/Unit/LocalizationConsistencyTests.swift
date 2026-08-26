import XCTest

/// Bidirectional consistency between the localization catalogs and the code.
///
/// Guards the `splash.tagline`-class bug where an identifier key referenced in
/// code renders RAW on screen because it does not resolve in the app's
/// development language (`en`): the app's `developmentRegion` is `en`, so a key
/// missing its `en` entry falls back to the key string itself, never to `fr`.
///
/// A second axis, added in 220i: a key carrying an inline `defaultValue:` can
/// never render raw, so the check above deliberately skips it — but that
/// `defaultValue` is written in the catalog's source language (`fr`). A key that
/// exists ONLY as a `defaultValue` therefore renders **French** on the six other
/// locales the app ships. Those calls look localized and are not, which is why
/// the backlog below is pinned and only ever allowed to shrink.
///
/// Scope: IDENTIFIER keys only (dot/underscore, no spaces — e.g.
/// `call.ended.missed`). Natural-text / format keys (`"Annuler"`, `"%@ membres"`)
/// are excluded on purpose — they never render as a raw identifier, and Xcode
/// normalizes interpolation (`"\(x) membres"` in code → `"%@ membres"` in the
/// catalog), which makes them unverifiable by static source scanning.
///
/// Runs purely in-process (no subprocess — `Process` is unavailable on iOS) by
/// reading the source tree relative to this file. A command-line mirror lives at
/// `apps/ios/scripts/check_localization.py`.
@MainActor
final class LocalizationConsistencyTests: XCTestCase {

    // Targets whose `String(localized:)` calls resolve against the app's main
    // bundle (default / `bundle: .main`), plus the SDK — its code references
    // both the app catalog (`.main`) and its own catalog (`.module`). The old
    // `apps/ios/MeeshyIntents` root was recabled into `apps/ios/Meeshy/Features/Intents/`
    // on 2026-06-24 (cf. apps/ios/CLAUDE.md § App Extensions) — already
    // covered by the `apps/ios/Meeshy` root below, so it was dropped here.
    private static let sourceRoots = [
        "apps/ios/Meeshy",
        "apps/ios/MeeshyNotificationExtension",
        "apps/ios/MeeshyWidgets",
        "apps/ios/MeeshyShareExtension",
        "apps/ios/MeeshyContextMenu",
        "packages/MeeshySDK/Sources",
    ]

    private static let appCatalogPath = "apps/ios/Meeshy/Localizable.xcstrings"
    private static let sdkCatalogPath = "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings"

    /// Documented exceptions. Keep empty; add a key only with a justifying comment.
    private static let orphanAllowlist: Set<String> = []
    private static let rawAllowlist: Set<String> = []

    // MARK: - Tests

    func test_everyUsedIdentifierKeyResolvesInDevelopmentLanguage() throws {
        let env = try makeEnvironment()

        var violations: [String] = []
        for file in env.sourceFiles {
            let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            for call in localizedCalls(in: text) {
                guard isIdentifier(call.key),
                      !call.hasDefaultValue,
                      !Self.rawAllowlist.contains(call.key) else { continue }
                let catalog = call.isModuleBundle ? env.sdkKeysWithEn : env.appKeysWithEn
                if !catalog.contains(call.key) {
                    violations.append("\(call.isModuleBundle ? "[SDK] " : "[APP] ")\(call.key)  (\(file.lastPathComponent))")
                }
            }
        }
        violations = Array(Set(violations)).sorted()
        XCTAssertTrue(
            violations.isEmpty,
            "These identifier keys are used without a defaultValue but have no `en` "
            + "entry in their catalog, so they render RAW (e.g. `splash.tagline`):\n"
            + violations.joined(separator: "\n")
        )
    }

    func test_everyAppCatalogIdentifierKeyIsReferencedInCode() throws {
        let env = try makeEnvironment()

        // A clean quoted identifier token is matched even inside string
        // interpolation, so this is immune to the nested-literal pitfalls that
        // break naive literal extraction.
        let quotedTokens = quotedIdentifierTokens(in: env.combinedSource)

        let orphans = env.appIdentifierKeys
            .filter { !Self.orphanAllowlist.contains($0) && !quotedTokens.contains($0) }
            .sorted()

        XCTAssertTrue(
            orphans.isEmpty,
            "These app-catalog identifier keys are never referenced in code (dead keys):\n"
            + orphans.joined(separator: "\n")
        )
    }

    // MARK: - Translation completeness (added 220i)

    /// Screens whose every app-bundle identifier key is translated in all shipped
    /// locales. Additive list: an iteration that finishes localizing a screen adds
    /// its path here so the screen can never silently regress to French-only.
    private static let fullyLocalizedScreens = [
        // Lot 4.6 — la surface qui SERT les six déclencheurs du mood. Elle a été
        // ajoutée ici dès sa présentation, et non au retrait de l'écran
        // historique : la liste est ADDITIVE, et l'écran que les auteurs voient
        // ne doit à aucun moment sortir du cliquet.
        //
        // Lot 4.8 — `StatusComposerView.swift` a quitté cette liste AVEC le
        // fichier, et pas une ligne avant : la remplaçante était déjà là, si
        // bien qu'aucun écran n'est sorti du cliquet entre les deux lots.
        "apps/ios/Meeshy/Features/Main/Composer/ComposerMoodSurface.swift",
        // 225i — the registration step flow: the first screens a new account ever
        // sees, and the largest single-file gap in the catalog when it was pinned.
        "apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift",
        // 226i — share-link creation, the largest remaining gap after 225i (55 keys).
        "apps/ios/Meeshy/Features/Main/Views/CreateShareLinkView.swift",
    ]

    /// Keys exempt from `fullyLocalizedScreens`, each with the reason it is not
    /// simply a missing translation. Keep this list as short as the truth allows.
    private static let untranslatableKeys: Set<String> = [
        // 225i — the in-app terms of use. Product/legal copy: it is not a UI label
        // an iteration may translate on its own authority, and a machine rendering
        // of terms a user is asked to ACCEPT is worse than an honest source-language
        // one. Needs a reviewed translation, tracked outside the UI/UX track.
        "onboarding.step.recap.terms.body",
    ]

    func test_fullyLocalizedScreensStayTranslatedInEveryShippedLocale() throws {
        let env = try makeEnvironment()

        var violations: [String] = []
        for path in Self.fullyLocalizedScreens {
            let url = env.repoRoot.appendingPathComponent(path)
            let catalog = env.catalog(resolvedFor: url)
            let text = try String(contentsOf: url, encoding: .utf8)
            for call in localizedCalls(in: text) {
                guard isIdentifier(call.key), !call.isModuleBundle,
                      !Self.untranslatableKeys.contains(call.key) else { continue }
                let missing = catalog.requiredLocales.subtracting(catalog.translations[call.key] ?? [])
                guard !missing.isEmpty else { continue }
                violations.append("\(call.key)  (\(url.lastPathComponent) → missing \(missing.sorted().joined(separator: ", ")))")
            }
        }
        violations = Array(Set(violations)).sorted()
        XCTAssertTrue(
            violations.isEmpty,
            "These keys belong to a screen pinned as fully localized but lack a translation. "
            + "Their defaultValue is source-language only, so those locales render French:\n"
            + violations.joined(separator: "\n")
        )
    }

    /// Added 225i. A pinned screen carries each string TWICE: as the inline
    /// `defaultValue:` the compiler bakes in, and as the catalog's source-language
    /// entry. Nothing makes them agree, so a later edit to one alone silently splits
    /// the screen in two — French users read the code literal, the six translated
    /// locales are generated from the catalog one. This also pins the 225i repair
    /// itself: 13 of these keys held ENGLISH text in a `fr`-source `defaultValue`,
    /// so French users read English until the catalog `fr` entry was added beside it.
    func test_fullyLocalizedScreenDefaultValuesMatchTheCatalogSourceLanguage() throws {
        let env = try makeEnvironment()

        var violations: [String] = []
        for path in Self.fullyLocalizedScreens {
            let url = env.repoRoot.appendingPathComponent(path)
            let catalog = env.catalog(resolvedFor: url)
            let text = try String(contentsOf: url, encoding: .utf8)
            for call in localizedCalls(in: text) {
                guard isIdentifier(call.key), !call.isModuleBundle,
                      !Self.untranslatableKeys.contains(call.key),
                      let inline = call.defaultValue,
                      // Xcode rewrites `"… \(x)"` to `"… %@"` on extraction, so an
                      // interpolated default legitimately differs from its catalog
                      // entry (cf. the natural-text exclusion in this file's header).
                      !inline.contains("\\(") else { continue }
                let catalogSource = catalog.sourceValues[call.key]
                guard catalogSource != inline else { continue }
                violations.append(
                    "\(call.key)  (\(url.lastPathComponent))\n"
                    + "      code: \(inline)\n"
                    + "   catalog: \(catalogSource ?? "<no \(catalog.sourceLanguage) entry>")"
                )
            }
        }
        violations = Array(Set(violations)).sorted()
        XCTAssertTrue(
            violations.isEmpty,
            "On a pinned screen the inline defaultValue and the catalog's "
            + "\(env.appCatalog.sourceLanguage) entry are the same string rendered by two different "
            + "paths, so they must be identical:\n"
            + violations.joined(separator: "\n")
        )
    }

    /// Added 226i. A pluralized entry stores its text under
    /// `variations.plural.<CLDR category>` and has no flat `stringUnit`, so a reader
    /// that only looks at the flat unit sees NOTHING translated and reports the key as
    /// a gap in every locale. That was silently true of all nine plural entries the
    /// catalog had: fully translated, permanently counted against the backlog, and —
    /// worse — impossible to clear, so no screen holding a pluralized key could ever
    /// be pinned as fully localized.
    func test_pluralizedKeysAreRecognizedAsTranslated() throws {
        let env = try makeEnvironment()

        let pluralKeys = try pluralizedKeys(
            env.repoRoot.appendingPathComponent(Self.appCatalogPath)
        )
        XCTAssertFalse(
            pluralKeys.isEmpty,
            "The catalog is expected to contain pluralized entries; if none remain, this "
            + "guard has nothing to protect and should be reconsidered rather than deleted."
        )

        let unseen = pluralKeys
            .filter { (env.appCatalog.translations[$0] ?? []).isEmpty }
            .sorted()
        XCTAssertTrue(
            unseen.isEmpty,
            "These pluralized keys are translated in the catalog but the reader reports no "
            + "locale for them, so they can never leave the backlog:\n"
            + unseen.joined(separator: "\n")
        )
    }

    /// Keys with at least one locale expressed as plural variations.
    private func pluralizedKeys(_ url: URL) throws -> [String] {
        let json = try JSONSerialization.jsonObject(with: try Data(contentsOf: url)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any] ?? [:]
        return strings.compactMap { key, value in
            let localizations = (value as? [String: Any])?["localizations"] as? [String: Any] ?? [:]
            let hasPlural = localizations.values.contains {
                ($0 as? [String: Any])?["variations"] != nil
            }
            return hasPlural ? key : nil
        }
    }

    func test_untranslatedKeyBacklogDoesNotGrow() throws {
        let env = try makeEnvironment()

        var untranslated: Set<String> = []
        for file in env.sourceFiles {
            let catalog = env.catalog(resolvedFor: file)
            let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            for call in localizedCalls(in: text) {
                guard isIdentifier(call.key), !call.isModuleBundle else { continue }
                if !catalog.requiredLocales.isSubset(of: catalog.translations[call.key] ?? []) {
                    untranslated.insert(call.key)
                }
            }
        }

        // Pinned at the 226i measurement: 1669 at 220i, −63 for the onboarding step
        // flow (225i), then −54 for share-link creation and −7 once pluralized keys
        // stopped being miscounted (226i). RE-MEASURED at 224i when the scan became
        // per-target: unchanged, because the five share-extension keys are currently
        // duplicated into the app catalog as well, so they were already counted as
        // translated — the per-target scan and the 226i gains therefore compose.
        // The number must only ever go DOWN: a failure means a new key was introduced
        // with a `defaultValue` alone, which ships the source language to every other
        // locale. Add the catalog entry — with its translations, to the catalog of
        // the target that OWNS the key — instead of raising the ceiling.
        let backlogCeiling = 1545
        XCTAssertLessThanOrEqual(
            untranslated.count, backlogCeiling,
            "\(untranslated.count) identifier keys are untranslated in at least one shipped "
            + "locale (ceiling \(backlogCeiling)). Add the missing entries to the catalog of the "
            + "target that owns them."
        )
    }

    // MARK: - Libellés de menu contextuel d'avatar

    /// **Un littéral nu passé à `AvatarContextMenuItem(label:)` est invisible
    /// aux deux axes ci-dessus.** Ils ne scannent que les appels
    /// `String(localized:)` ; `label` est une `String` rendue TELLE QUELLE
    /// (`MeeshyAvatar.AvatarContextMenuItem.label`), donc un littéral y sort
    /// dans la langue source pour les sept locales, sans qu'aucun test ne
    /// rougisse.
    ///
    /// La garde vise le BLOC d'appel — le couple `label:` … `icon:` qui
    /// identifie ce constructeur —, jamais le fichier : un `label:` alimenté
    /// par `String(localized:)` ou par une constante de copie
    /// (`StoryTrayCopy.viewProfile`) passe sans réserve.
    func test_avatarContextMenuLabels_areNeverBareLiterals() throws {
        let env = try makeEnvironment()

        var violations: [String] = []
        for file in env.sourceFiles {
            guard let text = try? String(contentsOf: file, encoding: .utf8) else { continue }
            for literal in Self.bareContextMenuLabels(in: text) {
                violations.append("\(file.lastPathComponent) : label: \"\(literal)\"")
            }
        }
        violations.sort()
        XCTAssertTrue(
            violations.isEmpty,
            "Ces libellés de menu contextuel d'avatar sont des littéraux nus : ils "
            + "s'affichent dans la langue source quelle que soit l'interface choisie. "
            + "Les passer par `String(localized:…, bundle:)`, avec l'entrée au catalogue "
            + "du bundle qui les résout :\n"
            + violations.joined(separator: "\n")
        )
    }

    /// **Contre-épreuve de la garde négative ci-dessus.** Une garde qui ne
    /// reconnaît plus la forme qu'elle interdit passe au vert en ayant perdu sa
    /// protection. Ces vecteurs prouvent qu'elle rougirait si un littéral nu
    /// revenait — sur une ligne comme sur plusieurs — et qu'elle ne condamne
    /// pas les deux formes légitimes.
    func test_bareContextMenuLabelScanner_recognizesTheFormItForbids() {
        let forbiddenInline = """
        items.append(AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill", action: onViewProfile))
        """
        XCTAssertEqual(Self.bareContextMenuLabels(in: forbiddenInline), ["Voir le profil"])

        let forbiddenMultiline = """
        AvatarContextMenuItem(
            label: "Voir la story",
            icon: "play.circle.fill"
        ) { onViewStory() }
        """
        XCTAssertEqual(Self.bareContextMenuLabels(in: forbiddenMultiline), ["Voir la story"])

        let localizedCall = """
        AvatarContextMenuItem(
            label: String(localized: "avatar.menu.view_profile", defaultValue: "Voir le profil", bundle: .module),
            icon: "person.fill"
        ) { onViewProfile() }
        """
        XCTAssertEqual(Self.bareContextMenuLabels(in: localizedCall), [])

        let namedConstant = """
        AvatarContextMenuItem(label: StoryTrayCopy.viewProfile, icon: "person.fill") { }
        """
        XCTAssertEqual(Self.bareContextMenuLabels(in: namedConstant), [])

        let roleBetweenLabelAndIcon = """
        AvatarContextMenuItem(label: "Voir le profil", role: .destructive, icon: "person.fill") { }
        """
        XCTAssertEqual(Self.bareContextMenuLabels(in: roleBetweenLabelAndIcon), ["Voir le profil"])
    }

    /// Littéraux nus passés en `label:` d'un `AvatarContextMenuItem`. Le couple
    /// `label:` suivi d'`icon:` est ce qui identifie ce constructeur : il
    /// attrape aussi bien `AvatarContextMenuItem(label:…)` que le
    /// `.init(label:…)` des sites qui laissent le type se déduire. Tolère un
    /// `role: …,` intercalé entre les deux (l'ordre déclaré de l'initialiseur
    /// est `label:icon:role:action:`, mais la garde ne dépend pas de cet ordre
    /// pour rester correcte si le paramètre bouge).
    private static func bareContextMenuLabels(in source: String) -> [String] {
        let ns = source as NSString
        guard let regex = try? NSRegularExpression(
            pattern: #"label:\s*"((?:[^"\\]|\\.)*)"\s*,\s*(?:role:\s*[^,]+,\s*)?icon:"#
        ) else { return [] }
        var found: [String] = []
        regex.enumerateMatches(in: source, range: NSRange(location: 0, length: ns.length)) { match, _, _ in
            if let match, match.numberOfRanges > 1 {
                found.append(ns.substring(with: match.range(at: 1)))
            }
        }
        return found
    }

    // MARK: - Environment

    /// One catalog, indexed. Added 224i, when the single-catalog model started
    /// reporting correctly-localized extension strings as untranslated.
    private struct CatalogIndex {
        /// Key → locales whose string unit is in the `translated` state.
        let translations: [String: Set<String>]
        /// Shipped locales minus THIS catalog's source language.
        let requiredLocales: Set<String>
        /// This catalog's source language — `fr` for the app, `en` for the share extension.
        let sourceLanguage: String
        /// Key → its value in the source language, when it has a flat one.
        let sourceValues: [String: String]
    }

    private struct Environment {
        /// An app extension is a SEPARATE BUNDLE: a `String(localized:)` in its sources
        /// resolves against ITS `Localizable.xcstrings`, never the host app's. Checking
        /// those sources against the app catalog reports keys as untranslated while they
        /// are in fact fully translated in the catalog shipping beside them.
        /// Path fragment → the catalog that target actually resolves against.
        ///
        /// Declared HERE rather than on the enclosing suite on purpose: the suite is
        /// `@MainActor`, so a static of its own would be actor-isolated and unreadable
        /// from `catalog(resolvedFor:)`, which is nonisolated — a nested type does not
        /// inherit the enclosing type's global actor.
        static let catalogByTargetFragment: [String: String] = [
            "/MeeshyShareExtension/": "apps/ios/MeeshyShareExtension/Localizable.xcstrings",
            "/MeeshyNotificationExtension/": "apps/ios/MeeshyNotificationExtension/Localizable.xcstrings",
        ]

        let repoRoot: URL
        let sourceFiles: [URL]
        let combinedSource: String
        let appIdentifierKeys: [String]
        let appKeysWithEn: Set<String>
        let sdkKeysWithEn: Set<String>
        /// Catalog repo-path → its index. Always contains the app catalog.
        let catalogs: [String: CatalogIndex]
        let appCatalogPath: String

        /// The catalog the given source file's bundle resolves against.
        func catalog(resolvedFor file: URL) -> CatalogIndex {
            for (fragment, catalogPath) in Self.catalogByTargetFragment
            where file.path.contains(fragment) {
                if let index = catalogs[catalogPath] { return index }
            }
            return appCatalog
        }

        /// Force-unwrap-free accessor: the app catalog is always loaded.
        var appCatalog: CatalogIndex {
            catalogs[appCatalogPath]
                ?? CatalogIndex(translations: [:], requiredLocales: [], sourceLanguage: "fr", sourceValues: [:])
        }
    }

    private func makeEnvironment() throws -> Environment {
        let repoRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // repo root

        let appCatalog = repoRoot.appendingPathComponent(Self.appCatalogPath)
        let sdkCatalog = repoRoot.appendingPathComponent(Self.sdkCatalogPath)
        guard FileManager.default.fileExists(atPath: appCatalog.path),
              FileManager.default.fileExists(atPath: sdkCatalog.path) else {
            throw XCTSkip("Localization catalogs not reachable from \(repoRoot.path) — source tree unavailable")
        }

        let appKeys = try loadCatalog(appCatalog)
        let sdkKeys = try loadCatalog(sdkCatalog)

        var files: [URL] = []
        for root in Self.sourceRoots {
            files.append(contentsOf: swiftFiles(under: repoRoot.appendingPathComponent(root)))
        }
        guard !files.isEmpty else {
            throw XCTSkip("No Swift sources found — source tree unavailable")
        }

        let combined = files
            .compactMap { try? String(contentsOf: $0, encoding: .utf8) }
            .joined(separator: "\n")

        // Index the app catalog plus every per-target catalog. Each is measured
        // against the shipped locales minus ITS OWN source language, which differs:
        // the app catalog is authored in `fr`, the share extension's in `en`.
        let shipped = try shippedLocales(repoRoot: repoRoot)
        var catalogs: [String: CatalogIndex] = [:]
        for path in [Self.appCatalogPath] + Environment.catalogByTargetFragment.values {
            let url = repoRoot.appendingPathComponent(path)
            guard FileManager.default.fileExists(atPath: url.path) else { continue }
            let language = try sourceLanguage(url)
            catalogs[path] = CatalogIndex(
                translations: try loadTranslations(url),
                requiredLocales: shipped.subtracting([language]),
                sourceLanguage: language,
                sourceValues: try values(url, locale: language)
            )
        }

        return Environment(
            repoRoot: repoRoot,
            sourceFiles: files,
            combinedSource: combined,
            appIdentifierKeys: appKeys.keys.filter(isIdentifier),
            appKeysWithEn: Set(appKeys.filter { $0.value }.keys),
            sdkKeysWithEn: Set(sdkKeys.filter { $0.value }.keys),
            catalogs: catalogs,
            appCatalogPath: Self.appCatalogPath
        )
    }

    /// Key → its flat string-unit value in `locale`. Plural variations have no single
    /// value and are absent, which keeps them out of the source-parity check.
    private func values(_ url: URL, locale: String) throws -> [String: String] {
        let json = try JSONSerialization.jsonObject(with: try Data(contentsOf: url)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any] ?? [:]
        var result: [String: String] = [:]
        for (key, value) in strings {
            let localizations = (value as? [String: Any])?["localizations"] as? [String: Any]
            let unit = (localizations?[locale] as? [String: Any])?["stringUnit"] as? [String: Any]
            if let text = unit?["value"] as? String { result[key] = text }
        }
        return result
    }

    /// Locales the app actually ships — read from `Info.plist`, not hard-coded.
    private func shippedLocales(repoRoot: URL) throws -> Set<String> {
        let url = repoRoot.appendingPathComponent("apps/ios/Meeshy/Info.plist")
        let plist = try PropertyListSerialization.propertyList(from: try Data(contentsOf: url), format: nil)
        let locales = (plist as? [String: Any])?["CFBundleLocalizations"] as? [String]
        return Set(locales ?? [])
    }

    private func sourceLanguage(_ url: URL) throws -> String {
        let json = try JSONSerialization.jsonObject(with: try Data(contentsOf: url)) as? [String: Any]
        return json?["sourceLanguage"] as? String ?? "fr"
    }

    /// Key → locales whose string unit is explicitly `translated` (a stale or
    /// needs-review unit is not a shipped translation).
    ///
    /// A pluralized key carries no flat `stringUnit`: its text lives under
    /// `variations.plural.<CLDR category>`. Reading only the flat unit reported every
    /// such key as untranslated in EVERY locale even when fully translated — the nine
    /// plural entries the catalog already had were all counted as gaps (fixed 226i).
    private func loadTranslations(_ url: URL) throws -> [String: Set<String>] {
        let json = try JSONSerialization.jsonObject(with: try Data(contentsOf: url)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any] ?? [:]
        var result: [String: Set<String>] = [:]
        for (key, value) in strings {
            let localizations = (value as? [String: Any])?["localizations"] as? [String: Any] ?? [:]
            var translated: Set<String> = []
            for (locale, payload) in localizations {
                if isTranslated(payload) { translated.insert(locale) }
            }
            result[key] = translated
        }
        return result
    }

    /// Whether one locale's payload is a shipped translation: either a flat string
    /// unit marked `translated`, or a set of plural variations whose EVERY category is
    /// marked `translated` — one stale category leaves the key partly untranslated for
    /// the counts that select it, so `allSatisfy` is deliberate rather than `contains`.
    private func isTranslated(_ payload: Any?) -> Bool {
        guard let payload = payload as? [String: Any] else { return false }
        if let unit = payload["stringUnit"] as? [String: Any] {
            return unit["state"] as? String == "translated"
        }
        guard let plural = (payload["variations"] as? [String: Any])?["plural"] as? [String: Any],
              !plural.isEmpty else { return false }
        return plural.values.allSatisfy { category in
            ((category as? [String: Any])?["stringUnit"] as? [String: Any])?["state"] as? String == "translated"
        }
    }

    /// Returns every key in a `.xcstrings` catalog mapped to whether it has an
    /// `en` localization (flat string unit or plural variations).
    private func loadCatalog(_ url: URL) throws -> [String: Bool] {
        let data = try Data(contentsOf: url)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let strings = json?["strings"] as? [String: Any] ?? [:]
        var result: [String: Bool] = [:]
        for (key, value) in strings {
            let localizations = (value as? [String: Any])?["localizations"] as? [String: Any]
            result[key] = localizations?["en"] != nil
        }
        return result
    }

    private func swiftFiles(under directory: URL) -> [URL] {
        guard let enumerator = FileManager.default.enumerator(
            at: directory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else { return [] }
        var files: [URL] = []
        for case let url as URL in enumerator {
            let path = url.path
            if path.contains("/Build/") || path.contains("/.build/") { continue }
            if url.pathExtension == "swift" { files.append(url) }
        }
        return files
    }

    // MARK: - Source scanning

    private func isIdentifier(_ key: String) -> Bool {
        guard !key.contains(" "), key.contains(".") || key.contains("_") else { return false }
        return key.allSatisfy { $0.isLetter || $0.isNumber || $0 == "." || $0 == "_" || $0 == "-" }
    }

    private struct LocalizedCall {
        let key: String
        let hasDefaultValue: Bool
        let isModuleBundle: Bool
        /// The inline `defaultValue:` when it is a single-line literal. `nil` for a
        /// multi-line `"""` block, which this scanner deliberately does not read.
        let defaultValue: String?
    }

    /// Finds each `String(localized: "…" …)` call and reports its key plus
    /// whether the call carries a `defaultValue:` and/or `bundle: .module`.
    /// The call segment is delimited by a string-aware balanced-paren scan so
    /// parentheses inside string literals don't end it prematurely.
    private func localizedCalls(in source: String) -> [LocalizedCall] {
        let marker = "String(localized:"
        let ns = source as NSString
        let stringPrefixLength = ("String" as NSString).length
        var calls: [LocalizedCall] = []
        var searchStart = 0
        while searchStart < ns.length {
            let found = ns.range(
                of: marker,
                options: [],
                range: NSRange(location: searchStart, length: ns.length - searchStart)
            )
            if found.location == NSNotFound { break }

            let openParen = found.location + stringPrefixLength
            var i = openParen
            var depth = 0
            var inString = false
            var escaped = false
            var end = ns.length - 1
            while i < ns.length {
                // Skip UTF-16 surrogate halves (emoji/flags) — they are never
                // one of the control characters we track, and UnicodeScalar
                // rejects them.
                guard let scalar = UnicodeScalar(ns.character(at: i)) else { i += 1; continue }
                let c = Character(scalar)
                if inString {
                    if escaped { escaped = false }
                    else if c == "\\" { escaped = true }
                    else if c == "\"" { inString = false }
                } else {
                    if c == "\"" { inString = true }
                    else if c == "(" { depth += 1 }
                    else if c == ")" { depth -= 1; if depth == 0 { end = i; break } }
                }
                i += 1
            }

            let segment = ns.substring(with: NSRange(location: found.location, length: end - found.location + 1))
            if let key = firstKey(in: segment) {
                calls.append(LocalizedCall(
                    key: key,
                    hasDefaultValue: segment.contains("defaultValue:"),
                    isModuleBundle: segment.contains(".module"),
                    defaultValue: inlineDefaultValue(in: segment)
                ))
            }
            searchStart = end + 1
        }
        return calls
    }

    /// The inline `defaultValue:` literal of a call segment, when it is written on
    /// one line. A multi-line `"""` block yields `nil` rather than the empty string
    /// the naive single-quote regex would report for its opening delimiter.
    private func inlineDefaultValue(in segment: String) -> String? {
        guard segment.range(of: #"defaultValue:\s*""""#, options: .regularExpression) == nil,
              let range = segment.range(
                  of: #"defaultValue:\s*"((?:[^"\\]|\\.)*)""#,
                  options: .regularExpression
              )
        else { return nil }
        let match = segment[range]
        guard let open = match.firstIndex(of: "\""), let close = match.lastIndex(of: "\""), open != close else {
            return nil
        }
        return String(match[match.index(after: open)..<close])
    }

    /// The first quoted string literal after `localized:` in a call segment.
    private func firstKey(in segment: String) -> String? {
        guard let keyRange = segment.range(
            of: #"localized:\s*"([^"]*)""#,
            options: .regularExpression
        ) else { return nil }
        let match = segment[keyRange]
        guard let open = match.firstIndex(of: "\""), let close = match.lastIndex(of: "\""), open != close else {
            return nil
        }
        return String(match[match.index(after: open)..<close])
    }

    /// All clean quoted identifier tokens (`"a11y.foo.bar"`) in the source.
    private func quotedIdentifierTokens(in source: String) -> Set<String> {
        let ns = source as NSString
        guard let regex = try? NSRegularExpression(pattern: #""([A-Za-z0-9_.\-]+)""#) else { return [] }
        var tokens: Set<String> = []
        regex.enumerateMatches(in: source, range: NSRange(location: 0, length: ns.length)) { match, _, _ in
            if let match, match.numberOfRanges > 1 {
                tokens.insert(ns.substring(with: match.range(at: 1)))
            }
        }
        return tokens
    }
}

import XCTest

/// **Un littéral qu'on n'a pas décidé de localiser l'est quand même.**
///
/// `Text(_:)`, `Label(_:systemImage:)`, `Button(_:action:)`, `Toggle(_:isOn:)`,
/// `TextField(_:text:)`, `.navigationTitle(_:)` prennent tous un
/// `LocalizedStringKey`. Un littéral qu'on leur passe devient donc une CLÉ, et
/// Xcode l'extrait dans `Localizable.xcstrings` — sans qu'aucun développeur
/// n'ait écrit `String(localized:)`, ni choisi quoi que ce soit.
///
/// ### Le défaut que ça a produit (#4313)
///
/// La carte « Comment ça marche » de l'onboarding démontre le Prisme
/// Linguistique avec deux lignes : le message ORIGINAL de « Jean-Pierre », en
/// langue étrangère, et sa TRADUCTION sous une icône `translate`. La traduction
/// vient d'un `switch` Swift sur la langue choisie. L'original venait d'un
/// littéral nu — donc du catalogue, donc traduit : `de`, `es` et `pt-BR`
/// l'avaient reçu dans leur propre langue.
///
/// Un utilisateur allemand qui choisit l'allemand — **le chemin nominal** —
/// voyait donc deux phrases allemandes, l'une présentée comme l'original et
/// l'autre comme sa traduction. En espagnol et en portugais les deux ne
/// différaient que par les accents, ce qui a l'air d'une traduction RATÉE
/// plutôt que d'une traduction absente.
///
/// ### Pourquoi aucune garde ne l'a vu
///
/// Toutes les gardes i18n du dépôt s'accrochent à `String(localized:` — le
/// marqueur de `LocalizationConsistencyTests`, le cliquet `fullyLocalizedScreens`
/// (#4309), le ratchet `defaultValue`. **Un littéral nu n'est vu par aucune**,
/// alors qu'il est tout aussi localisé. `OnboardingStepViews.swift` était même
/// ÉPINGLÉ parmi les 43 écrans « fully localized ».
///
/// Et le mécanisme avait déjà été RENCONTRÉ : `FrenchDefaultValueRatchetTests`
/// portait une exception `notAnInterfaceString = ["Jean-Pierre"]`, dont le
/// commentaire décrivait le phénomène exactement — sans le remonter à sa source.
/// Trois lignes plus bas dans le même fichier, le même mécanisme cassait la
/// démonstration du produit.
///
/// ### La règle
///
/// Un littéral nu passé à l'un de ces initialiseurs doit être **soit une CLÉ**
/// (un identifiant à segments, complet dans les sept langues), **soit pas de la
/// prose** (emoji, ponctuation, chiffres). De la PROSE en littéral nu n'a que
/// deux issues légitimes, et la garde force à choisir :
///
/// | l'intention | l'écriture |
/// |---|---|
/// | c'est de l'interface, ça doit voyager | `String(localized:defaultValue:bundle:)` |
/// | c'est une donnée, ça ne doit PAS voyager | `Text(verbatim:)` |
///
/// Un troisième cas n'existe pas — et c'est son existence SILENCIEUSE qui a
/// produit le défaut.
final class LocalizedStringKeyLiteralGuardTests: XCTestCase {

    // MARK: - Ce qui est visé

    /// Les initialiseurs dont le PREMIER argument est un `LocalizedStringKey`.
    ///
    /// Le motif exige le guillemet immédiatement après la parenthèse : c'est ce
    /// qui fait que `Text(verbatim: "…")` — le remède — et
    /// `Text(String(localized: "…"))` — l'autre remède — ne sont pas des sites.
    private static let initialisers: [(name: String, pattern: String)] = [
        ("Text",            #"\bText\(\s*"((?:[^"\\]|\\.)*)"\s*[,)]"#),
        ("Label",           #"\bLabel\(\s*"((?:[^"\\]|\\.)*)"\s*,"#),
        ("Button",          #"\bButton\(\s*"((?:[^"\\]|\\.)*)"\s*[,){]"#),
        ("Toggle",          #"\bToggle\(\s*"((?:[^"\\]|\\.)*)"\s*,"#),
        ("TextField",       #"\bTextField\(\s*"((?:[^"\\]|\\.)*)"\s*,"#),
        ("SecureField",     #"\bSecureField\(\s*"((?:[^"\\]|\\.)*)"\s*,"#),
        ("navigationTitle", #"\.navigationTitle\(\s*"((?:[^"\\]|\\.)*)"\s*\)"#),
    ]

    /// Littéraux qui ressemblent à une clé sans devoir en être une.
    ///
    /// `gate.example.com` est un exemple d'hôte, dans le champ « serveur » de la
    /// connexion : identique dans toutes les langues, volontairement hors
    /// catalogue. Ajouter une entrée ici demande une raison NOMMÉE — pas une
    /// dispense, une explication de pourquoi ce littéral ne voyage pas.
    private static let allowlist: Set<String> = ["gate.example.com"]

    /// Locales livrées, moins la langue source (`fr`) — la même définition que
    /// `LocalizationConsistencyTests`.
    private static let requiredLocales: Set<String> = ["ar", "de", "en", "es", "it", "pt-BR"]

    struct Site: Equatable {
        let line: Int
        let initialiser: String
        let literal: String
    }

    // MARK: - Classification

    /// Un identifiant : pas d'espace, au moins un `.` ou `_`, et rien d'autre
    /// que des lettres, chiffres, `.`, `_`, `-`.
    ///
    /// Reprise à l'identique de `LocalizationConsistencyTests.isIdentifier` : la
    /// même question doit recevoir la même réponse dans les deux gardes, sinon
    /// une clé serait « un identifiant » pour l'une et « de la prose » pour
    /// l'autre.
    static func isIdentifierKey(_ literal: String) -> Bool {
        guard !literal.contains(" "), literal.contains(".") || literal.contains("_") else { return false }
        return literal.allSatisfy { $0.isLetter || $0.isNumber || $0 == "." || $0 == "_" || $0 == "-" }
    }

    /// Emoji, ponctuation, chiffres, symboles — rien qui puisse se traduire.
    ///
    /// Les échappements `\u{…}` sont retirés AVANT de compter : dans le texte
    /// source, `"\u{1F4AD}"` porte les lettres `u`, `F`, `A`, `D`, et un
    /// comptage naïf classerait une bulle de pensée comme de la prose.
    static func isNonProse(_ literal: String) -> Bool {
        let withoutEscapes = literal.replacingOccurrences(
            of: #"\\u\{[0-9A-Fa-f]+\}"#, with: "", options: .regularExpression
        )
        return withoutEscapes.filter(\.isLetter).count < 2
    }

    // MARK: - Balayage

    /// Les littéraux NUS d'un fichier — interpolations exclues.
    ///
    /// `Text("@\(user.username)")` est un `LocalizedStringKey` interpolé : sa
    /// clé est `"@%@"`, c'est une expression de MISE EN FORME, pas un texte
    /// qu'on traduit. Les inclure noierait la règle sous 134 sites dont aucun
    /// n'est le défaut visé.
    static func bareLiterals(in source: String) -> [Site] {
        let lines = DeclarationBodyScanner.mask(source).components(separatedBy: "\n")
        let originals = source.components(separatedBy: "\n")
        var sites: [Site] = []

        for (index, masked) in lines.enumerated() {
            // Une ligne entièrement masquée est un commentaire : on la saute, mais
            // on lit le texte ORIGINAL pour les autres — le masquage vide les
            // chaînes, et ce sont précisément les chaînes qu'on inspecte.
            guard index < originals.count else { break }
            let line = originals[index]
            guard !(masked.trimmingCharacters(in: .whitespaces).isEmpty
                    && !line.trimmingCharacters(in: .whitespaces).isEmpty) else { continue }

            for (name, pattern) in initialisers {
                guard let marker = try? NSRegularExpression(pattern: pattern) else { continue }
                let ns = line as NSString
                marker.enumerateMatches(in: line, range: NSRange(location: 0, length: ns.length)) { match, _, _ in
                    guard let match, match.numberOfRanges > 1 else { return }
                    let group = match.range(at: 1)
                    guard group.location != NSNotFound else { return }
                    let literal = ns.substring(with: group)
                    guard !literal.contains("\\(") else { return }
                    sites.append(Site(line: index + 1, initialiser: name, literal: literal))
                }
            }
        }
        return sites
    }

    // MARK: - Règle 1 — pas de prose en littéral nu

    func test_aucuneProseNEntreAuCatalogueParUnLitteralNu() throws {
        let offenders = try allSites().filter {
            !Self.isNonProse($0.1.literal)
            && !Self.isIdentifierKey($0.1.literal)
            && !Self.allowlist.contains($0.1.literal)
        }

        XCTAssertTrue(
            offenders.isEmpty,
            "Littéral de PROSE passé à un initialiseur `LocalizedStringKey` : Xcode va l'extraire "
            + "en clé de catalogue, et une passe de traduction le fera voyager — c'est ainsi que le "
            + "message d'exemple de l'onboarding s'est retrouvé traduit, cassant la démonstration du "
            + "Prisme (#4313). Choisir :\n"
            + "  • c'est de l'interface  → `String(localized:defaultValue:bundle: .main)`\n"
            + "  • c'est une donnée      → `Text(verbatim:)`\n"
            + offenders.map { "  \($0.0):\($0.1.line) [\($0.1.initialiser)] \"\($0.1.literal)\"" }
                .sorted().joined(separator: "\n")
        )
    }

    // MARK: - Règle 2 — une clé servie nue est une clé COMPLÈTE

    /// Un `Text("une.cle")` est invisible à `fullyLocalizedScreens` : l'écran
    /// peut être épinglé « fully localized » pendant que cette clé-là manque
    /// dans trois langues. La complétude se vérifie donc ici.
    func test_touteCleServieParUnLitteralNuEstCompleteDansLesLanguesLivrees() throws {
        let catalog = try appCatalogLocalizations()

        let incomplete = try allSites()
            .filter { Self.isIdentifierKey($0.1.literal) && !Self.allowlist.contains($0.1.literal) }
            .compactMap { entry -> String? in
                let (file, site) = entry
                guard let locales = catalog[site.literal] else {
                    return "\(file):\(site.line) \"\(site.literal)\" — ABSENTE du catalogue (rendue BRUTE à l'écran)"
                }
                let missing = Self.requiredLocales.subtracting(locales).sorted()
                guard !missing.isEmpty else { return nil }
                return "\(file):\(site.line) \"\(site.literal)\" — manque \(missing.joined(separator: ", "))"
            }
            .sorted()

        XCTAssertTrue(
            incomplete.isEmpty,
            "Ces clés sont servies par un littéral nu, donc hors de portée du cliquet "
            + "`fullyLocalizedScreens`, et elles ne sont pas complètes :\n" + incomplete.joined(separator: "\n")
        )
    }

    // MARK: - Bornes

    func test_leBalayageVoitBienLeDepot() throws {
        XCTAssertGreaterThan(try sources().count, 400, "racine attendue : \(appRoot.path)")
    }

    /// **La borne qui compte.** Les deux règles passeraient au VERT si le
    /// balayage ne trouvait plus aucun site — un motif cassé, un masquage trop
    /// large. Les deux familles légitimes doivent donc rester peuplées, chacune
    /// de son côté : 10 clés et 40 non-prose au 265i.
    func test_leBalayageTrouveBienLesDeuxFamillesLegitimes() throws {
        let sites = try allSites().map { $0.1 }
        XCTAssertGreaterThan(sites.count, 30, "aucun littéral nu trouvé : le motif est cassé")
        XCTAssertGreaterThan(
            sites.filter { Self.isIdentifierKey($0.literal) }.count, 5,
            "les clés servies nues existent (10 au 265i) — un 0 ici signerait un balayage mort"
        )
        XCTAssertGreaterThan(
            sites.filter { Self.isNonProse($0.literal) }.count, 20,
            "les littéraux non-prose existent (40 au 265i)"
        )
    }

    /// Témoins synthétiques : les questions dont la réponse est connue d'avance.
    ///
    /// Le plus important est le troisième — **le remède doit cesser d'être un
    /// site**. Sans lui, la garde pourrait être verte en interdisant une chose
    /// qu'on ne saurait pas réparer.
    func test_leClassifieurRepondCommeAttendu() {
        XCTAssertEqual(
            Self.bareLiterals(in: #"Text("Bonjour tout le monde")"#).map(\.literal),
            ["Bonjour tout le monde"]
        )
        XCTAssertFalse(Self.isNonProse("Bonjour tout le monde"))
        XCTAssertFalse(Self.isIdentifierKey("Bonjour tout le monde"))

        // Le remède : `verbatim:` n'est pas un `LocalizedStringKey`, donc pas un site.
        XCTAssertTrue(Self.bareLiterals(in: #"Text(verbatim: "Jean-Pierre")"#).isEmpty)
        // L'autre remède, pour de l'interface qui doit voyager.
        XCTAssertTrue(
            Self.bareLiterals(in: #"Text(String(localized: "a.b", defaultValue: "Salut", bundle: .main))"#).isEmpty
        )

        // Une clé est une clé ; un emoji n'est pas de la prose.
        XCTAssertTrue(Self.isIdentifierKey("notifications.story.expired.title"))
        XCTAssertTrue(Self.isNonProse(#"\u{1F4AD}"#))
        XCTAssertTrue(Self.isNonProse("+"))
        // …et « Jean-Pierre » n'est PAS une clé : le tiret seul ne fait pas un identifiant.
        XCTAssertFalse(Self.isIdentifierKey("Jean-Pierre"))

        // Une interpolation est une mise en forme, pas un texte à traduire.
        XCTAssertTrue(Self.bareLiterals(in: #"Text("@\(user.username)")"#).isEmpty)

        // Un site EN COMMENTAIRE n'existe pas.
        XCTAssertTrue(Self.bareLiterals(in: #"// Text("Bonjour tout le monde")"#).isEmpty)
    }

    // MARK: - Fichiers

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func sources() throws -> [URL] {
        guard let walker = FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil)
        else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    private func relativePath(_ url: URL) -> String {
        let root = appRoot.standardizedFileURL.pathComponents
        let full = url.standardizedFileURL.pathComponents
        guard full.count > root.count else { return url.lastPathComponent }
        return full.dropFirst(root.count).joined(separator: "/")
    }

    private func allSites() throws -> [(String, Site)] {
        try sources().flatMap { url -> [(String, Site)] in
            let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
            return Self.bareLiterals(in: text).map { (relativePath(url), $0) }
        }
    }

    /// Clé → ensemble des locales déclarées, lu dans le catalogue de l'app.
    private func appCatalogLocalizations() throws -> [String: Set<String>] {
        let url = appRoot.appendingPathComponent("Localizable.xcstrings")
        let data = try Data(contentsOf: url)
        let strings = (try JSONSerialization.jsonObject(with: data) as? [String: Any])?["strings"]
            as? [String: [String: Any]] ?? [:]
        return strings.mapValues { entry in
            Set((entry["localizations"] as? [String: Any])?.keys.map(String.init) ?? [])
        }
    }
}

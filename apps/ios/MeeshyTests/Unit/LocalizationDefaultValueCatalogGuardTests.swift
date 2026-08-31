import XCTest

/// **Un `defaultValue` protège du CRASH, jamais de la LANGUE (#4620).**
///
/// `LocalizationConsistencyTests.test_everyUsedIdentifierKeyResolvesInDevelopmentLanguage`
/// écarte DÉLIBÉRÉMENT les appels qui portent un `defaultValue` — et il a raison
/// pour ce qu'il garde : sans entrée au catalogue, `String(localized:)` rend ce
/// `defaultValue` au lieu de la clé brute, donc rien ne casse à l'écran.
///
/// Mais il le rend **dans les sept locales**. Un lecteur arabophone,
/// germanophone, hispanophone, italophone ou lusophone lit du français, et la
/// garde existante ne peut pas le voir : un appel qui porte un `defaultValue`
/// y est réputé sûr, ce qu'il est pour le crash et pas pour la langue.
///
/// Vingt-huit clés étaient dans ce cas au 2026-08-31 — toutes des COMPTEURS,
/// dont le pluriel était écrit à la main (`lien(s)`, `effet(s)`, `inscrit(s)`)
/// ou absent (`\(n) commentaires`, qui rend « 1 commentaires »). L'arabe a six
/// catégories de pluriel ; aucune n'est atteignable depuis une chaîne composée
/// en Swift. L'une d'elles, `bubble.media.a11y.viewCount`, était un libellé
/// **VoiceOver**.
///
/// Cette garde interdit la vingt-neuvième.
///
/// **Elle vit dans son propre fichier** : `LocalizationConsistencyTests.swift`
/// fait 1251 lignes, au-delà du budget de 800-1100 du `CLAUDE.md` racine, et la
/// directive interdit d'ajouter à un fichier hors budget avant de l'extraire.
final class LocalizationDefaultValueCatalogGuardTests: XCTestCase {

    /// La seule clé POINTÉE encore absente du catalogue, avec sa raison.
    ///
    /// Ce n'est pas un compteur : c'est le texte des conditions d'utilisation,
    /// une trentaine de lignes de prose juridique passées en `defaultValue`
    /// multi-lignes. La traduire relève d'un lot de LOCALISATION JURIDIQUE, pas
    /// d'un correctif de pluriel — et sa version française vit déjà dans le
    /// catalogue sous une clé qui EST son propre texte (famille de #4621).
    private static let attendues: Set<String> = [
        "onboarding.step.recap.terms.body",
    ]

    /// **Chaque cible a SON catalogue, et c'est le `bundle:` qui décide.**
    ///
    /// `apps/ios` en porte quatre — l'app, l'extension de partage, celle de
    /// notification, les widgets — et le SDK un cinquième. Interroger le seul
    /// catalogue de l'app rend six clés `share.*` faussement absentes : elles
    /// vivent dans `MeeshyShareExtension/Localizable.xcstrings`, exactement là
    /// où leur code les cherche.
    ///
    /// Le catalogue d'un fichier est donc celui de son ANCÊTRE le plus proche —
    /// une règle qui ne dérive pas quand une cible s'ajoute, à la différence
    /// d'une liste de racines tenue à la main.
    private static let racineSources = "apps/ios"
    private static let catalogueSDK = "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings"

    /// Répertoires à ne pas balayer : les témoins eux-mêmes (leurs échantillons
    /// contiennent des clés fictives) et les sorties de build.
    private static let exclus = ["MeeshyTests", "MeeshyUIDeviceTests", "Build", ".build", "DerivedData"]

    // MARK: - La garde

    func test_uneCleAvecDefaultValueVitQuandMemeDansLeCatalogue() throws {
        let absentes = try Self.clesPointeesAbsentes()
        let inattendues = absentes.subtracting(Self.attendues).sorted()

        XCTAssertTrue(
            inattendues.isEmpty,
            "Ces clés portent un `defaultValue` mais n'ont AUCUNE entrée au catalogue : "
            + "leur texte français est servi aux sept locales.\n"
            + inattendues.joined(separator: "\n")
        )
    }

    /// Le sens inverse : une entrée d'exemption qui a été traitée doit QUITTER
    /// la liste, sinon elle couvre en silence une clé qui reviendrait absente.
    func test_aucuneExemptionPerimee() throws {
        let absentes = try Self.clesPointeesAbsentes()
        let perimees = Self.attendues.subtracting(absentes).sorted()

        XCTAssertTrue(
            perimees.isEmpty,
            "Ces exemptions ne correspondent plus à rien — les retirer :\n"
            + perimees.joined(separator: "\n")
        )
    }

    // MARK: - Contre-épreuves : la garde doit pouvoir TOMBER

    /// Une garde négative meurt en silence quand son balayage cesse de trouver
    /// quoi que ce soit. Celle-ci prouve d'abord qu'elle LIT du code.
    func test_leBalayageVoitReellementDesAppels() {
        let appels = Self.appelsAvecDefaultValue()
        XCTAssertGreaterThan(
            appels.count, 200,
            "Le balayage ne trouve presque aucun appel `String(localized:…, defaultValue:…)` — "
            + "les racines source ou le motif ont dérivé, et la garde ne garde plus rien."
        )
    }

    /// Et qu'elle SAIT dire non : le motif reconnaît la forme qu'elle interdit.
    func test_leMotifReconnaitLaFormeQuIlInterdit() {
        let echantillon = """
        Text(String(localized: "feed.demo.count", defaultValue: "\\(n) commentaires", bundle: .main))
        """
        XCTAssertEqual(Self.clesDe(echantillon).map(\.cle), ["feed.demo.count"])
    }

    /// Une chaîne SANS `defaultValue` n'est pas du ressort de cette garde —
    /// c'est l'autre qui la couvre. Sans cette contre-épreuve, un motif trop
    /// large ferait doublon et rougirait pour la mauvaise raison.
    func test_leMotifIgnoreLesAppelsSansDefaultValue() {
        let echantillon = """
        Text(String(localized: "feed.demo.autre", bundle: .main))
        """
        XCTAssertTrue(Self.clesDe(echantillon).isEmpty)
    }

    // MARK: - Extraction

    private static func racineDepot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine
    }

    /// Les clés d'un extrait — POINTÉES et portant un `defaultValue`, avec le
    /// catalogue que leur `bundle:` désigne.
    ///
    /// Le motif exige la virgule et `defaultValue:` derrière la clé : c'est ce
    /// qui distingue cette famille de celle que garde l'autre fichier. La
    /// fenêtre de 160 caractères qui suit sert à lire le `bundle:` — un
    /// `.module` vise le catalogue du SDK, jamais celui de la cible hôte.
    static func clesDe(_ texte: String) -> [(cle: String, moduleSDK: Bool)] {
        let motif = try! NSRegularExpression(
            pattern: #"String\(\s*localized:\s*"([^"\\]+)"\s*,\s*defaultValue:"#
        )
        let plage = NSRange(texte.startIndex..., in: texte)
        return motif.matches(in: texte, range: plage).compactMap { m in
            guard let r = Range(m.range(at: 1), in: texte) else { return nil }
            let cle = String(texte[r])
            guard estIdentifiant(cle) else { return nil }
            let apres = texte.index(r.upperBound, offsetBy: 160, limitedBy: texte.endIndex) ?? texte.endIndex
            let fenetre = texte[r.upperBound..<apres]
            return (cle, fenetre.contains("bundle: .module"))
        }
    }

    /// Même règle que `LocalizationConsistencyTests.isIdentifier` : une clé est
    /// un IDENTIFIANT, jamais une phrase. Les phrases françaises servant de clé
    /// sont une famille distincte (#4621), avec son propre lot.
    private static func estIdentifiant(_ cle: String) -> Bool {
        guard !cle.contains(" "), cle.contains(".") || cle.contains("_") else { return false }
        return cle.allSatisfy { $0.isLetter || $0.isNumber || $0 == "." || $0 == "_" || $0 == "-" }
    }

    private static func fichiersSwift() -> [URL] {
        let base = racineDepot().appendingPathComponent(racineSources)
        guard let it = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil) else { return [] }
        var out: [URL] = []
        for cas in it {
            guard let url = cas as? URL else { continue }
            if url.pathComponents.contains(where: { exclus.contains($0) || $0.hasSuffix(".xcodeproj") }) { continue }
            if url.pathExtension == "swift" { out.append(url) }
        }
        return out
    }

    /// Le catalogue d'un fichier : celui de son ANCÊTRE le plus proche.
    private static func catalogueDe(_ fichier: URL) -> URL? {
        var dossier = fichier.deletingLastPathComponent()
        let racine = racineDepot().appendingPathComponent(racineSources).standardizedFileURL
        while dossier.standardizedFileURL.path.hasPrefix(racine.deletingLastPathComponent().path) {
            let candidat = dossier.appendingPathComponent("Localizable.xcstrings")
            if FileManager.default.fileExists(atPath: candidat.path) { return candidat }
            let parent = dossier.deletingLastPathComponent()
            if parent == dossier { break }
            dossier = parent
        }
        return nil
    }

    static func appelsAvecDefaultValue() -> [(cle: String, catalogue: URL?)] {
        let sdk = racineDepot().appendingPathComponent(catalogueSDK)
        return fichiersSwift().flatMap { url -> [(cle: String, catalogue: URL?)] in
            guard let texte = try? String(contentsOf: url, encoding: .utf8) else { return [] }
            let propre = catalogueDe(url)
            return clesDe(texte).map { ($0.cle, $0.moduleSDK ? sdk : propre) }
        }
    }

    /// Aucun cache STATIQUE : sous la concurrence stricte de Swift 6, un
    /// `static var` est un état mutable global et ne compile pas. Le cache est
    /// local à la passe — il n'y a que trois catalogues à lire.
    private static func clesDuCatalogue(_ url: URL) throws -> Set<String> {
        let data = try Data(contentsOf: url)
        guard let racine = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let chaines = racine["strings"] as? [String: Any] else {
            throw NSError(domain: "catalogue", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "`strings` introuvable dans \(url.lastPathComponent) — le catalogue a changé de forme"
            ])
        }
        return Set(chaines.keys)
    }

    private static func clesPointeesAbsentes() throws -> Set<String> {
        var lues: [String: Set<String>] = [:]
        var absentes: Set<String> = []
        for (cle, catalogue) in appelsAvecDefaultValue() {
            guard let catalogue else { continue }
            let connues: Set<String>
            if let deja = lues[catalogue.path] {
                connues = deja
            } else {
                connues = try clesDuCatalogue(catalogue)
                lues[catalogue.path] = connues
            }
            if !connues.contains(cle) { absentes.insert(cle) }
        }
        return absentes
    }
}

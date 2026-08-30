import Foundation

/// Retrait de commentaires PARTAGÉ des gardes de source app-side — port fidèle
/// de `ComposerSourceGuard.stripComments` (SDK, machine à états).
///
/// Les gardes du bundle app portaient chacune leur stripper local, et les plus
/// faibles laissaient passer exactement ce que les leçons
/// `feedback_source_guard_tests_must_strip_comments` et
/// `feedback_read_code_not_comments_for_source_guards` proscrivent :
/// - couper au premier `//` SANS conscience des littéraux tronquait une ligne
///   contenant `"https://…"` — le code inspecté disparaissait de la garde ;
/// - ne filtrer que les lignes COMMENÇANT par `//` laissait un commentaire de
///   fin de ligne citer le symbole cherché et satisfaire l'assertion seul ;
/// - aucun ne fermait un bloc `/* … */` multi-ligne.
///
/// La machine à états traite les quatre modes (code, littéral de chaîne avec
/// échappements, commentaire de ligne, commentaire de bloc) — un seul
/// comportement pour toutes les gardes, aligné sur la référence SDK.
enum AppSourceGuard {

    static func stripComments(_ source: String) -> String {
        enum Mode { case code, string, lineComment, blockComment }
        var mode: Mode = .code
        var result = ""
        var escaped = false
        var pending: Character?   // barre oblique en attente de son second caractère

        for character in source {
            switch mode {
            case .code:
                if let slash = pending {
                    pending = nil
                    if character == "/" { mode = .lineComment; continue }
                    if character == "*" { mode = .blockComment; continue }
                    result.append(slash)
                }
                if character == "/" { pending = "/"; continue }
                if character == "\"" { mode = .string }
                result.append(character)
            case .string:
                result.append(character)
                if escaped { escaped = false; continue }
                if character == "\\" { escaped = true; continue }
                if character == "\"" { mode = .code }
            case .lineComment:
                if character == "\n" { mode = .code; result.append(character) }
            case .blockComment:
                if let star = pending, star == "*", character == "/" {
                    pending = nil
                    mode = .code
                    continue
                }
                pending = character == "*" ? "*" : nil
                if character == "\n" { result.append(character) }
            }
        }
        if let slash = pending, mode == .code { result.append(slash) }
        return result
    }

    /// Variante en LIGNES, pour les gardes qui raisonnent ligne à ligne
    /// (remontée de constructeur, comptages locaux).
    static func strippedLines(_ source: String) -> [String] {
        stripComments(source).components(separatedBy: "\n")
    }

    // MARK: - L'UNITÉ de source d'un type découpé (#4102)

    /// La racine `apps/ios`, lue depuis CE fichier — jamais depuis l'appelant :
    /// une garde qui déménage d'un répertoire ne doit pas déplacer la racine
    /// avec elle.
    private static var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Helpers
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
    }

    /// **Un type découpé garde UNE adresse.**
    ///
    /// `Type.swift` scindé en `Type+Rôle.swift` reste une seule source aux yeux
    /// des gardes. Sans cela, chaque découpage éteint en SILENCE toutes les
    /// gardes négatives du type : elles passent au vert en lisant la moitié qui
    /// ne contient pas l'interdit. C'est le mode de panne exact contre lequel
    /// chaque suite pose déjà un `test_…ReadANonEmptySource` — celui-là attrape
    /// un chemin FAUX, aucun n'attrapait un chemin devenu PARTIEL.
    ///
    /// Le balayage est un GLOB, jamais une liste : une liste de parties se
    /// périme au premier fichier ajouté, et se périme en silence puisque le
    /// résultat reste non vide. `alsoIncluding` ne sert qu'aux compagnons qui ne
    /// portent PAS le nom du type — les règles pures sorties du fichier, qui
    /// n'ont aucune raison de s'appeler `Type+…`.
    static func unitURLs(_ relativeToAppRoot: String,
                         alsoIncluding compagnons: [String] = []) -> [URL] {
        let principal = appRoot.appendingPathComponent(relativeToAppRoot)
        let dossier = principal.deletingLastPathComponent()
        let base = principal.deletingPathExtension().lastPathComponent
        let voisins = (try? FileManager.default.contentsOfDirectory(
            at: dossier, includingPropertiesForKeys: nil)) ?? []
        let parties = voisins
            .filter { $0.pathExtension == "swift"
                && $0.deletingPathExtension().lastPathComponent.hasPrefix(base + "+") }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        return [principal] + parties + compagnons.map(appRoot.appendingPathComponent)
    }

    static func unit(_ relativeToAppRoot: String,
                     alsoIncluding compagnons: [String] = []) throws -> String {
        try unitURLs(relativeToAppRoot, alsoIncluding: compagnons)
            .map { try String(contentsOf: $0, encoding: .utf8) }
            .joined(separator: "\n")
    }

    /// L'unité du meuble du composer : le type, ses trois extensions, et les
    /// règles pures qui en sont sorties au #4102.
    static let composerHostPath = "Meeshy/Features/Main/Composer/MeeshyComposerHost.swift"
    static let composerHostCompanions = ["Meeshy/Features/Main/Composer/ComposerHostRules.swift"]

    static func composerHostURLs() -> [URL] {
        unitURLs(composerHostPath, alsoIncluding: composerHostCompanions)
    }

    static func composerHostSource() throws -> String {
        try unit(composerHostPath, alsoIncluding: composerHostCompanions)
    }
}

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
}

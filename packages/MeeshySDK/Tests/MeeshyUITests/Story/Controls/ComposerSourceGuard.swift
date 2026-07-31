import Foundation

/// Helper PARTAGÉ des gardes de source du chrome composer (T0 du domaine S1).
///
/// Deux services, tous deux imposés par des régressions vécues :
///  1. résoudre un fichier de `Sources/` depuis `#filePath` — aucun chemin
///     absolu en dur, le dépôt étant clonable n'importe où (et les worktrees
///     parallèles vivant en sibling du repo principal) ;
///  2. RETIRER LES COMMENTAIRES avant toute assertion. Une garde qui compte des
///     occurrences dans un fichier commenté valide la documentation, pas le
///     code : c'est exactement ce que proscrivent les leçons
///     `feedback_source_guard_tests_must_strip_comments` et
///     `feedback_read_code_not_comments_for_source_guards`. Ici le risque est
///     concret — les commentaires ajoutés par S1 CITENT les symboles supprimés
///     (`areFabsVisible`, `resolveEffectiveBandState`) pour justifier la
///     contrainte, donc une garde naïve « 0 occurrence » échouerait sur sa
///     propre justification.
enum ComposerSourceGuard {

    /// Racine du package `MeeshySDK`, dérivée de l'emplacement de CE fichier :
    /// `Tests/MeeshyUITests/Story/Controls/ComposerSourceGuard.swift`, soit
    /// 5 composants de chemin sous la racine.
    static let packageRoot: URL = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        return url
    }()

    /// Répertoire des sources du composer story — racine commune de toutes les
    /// gardes du domaine.
    static let storyDirectory: URL =
        packageRoot.appendingPathComponent("Sources/MeeshyUI/Story")

    /// Contenu d'un fichier de `Sources/MeeshyUI/Story/`, COMMENTAIRES RETIRÉS.
    static func source(_ relativePath: String) throws -> String {
        let url = storyDirectory.appendingPathComponent(relativePath)
        return stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// Tous les fichiers Swift de `Sources/MeeshyUI/Story/` (récursif), en
    /// couples `(chemin relatif, code sans commentaires)`. Sert aux gardes
    /// GLOBALES : une garde nommant ses fichiers un par un laisse toujours
    /// passer le prochain doublon (leçon du 4ᵉ jeu de glyphes découvert dans
    /// `ComposerToolSwitcherHeader`).
    static func allStorySources() throws -> [(path: String, code: String)] {
        let root = storyDirectory
        guard let walker = FileManager.default.enumerator(
            at: root, includingPropertiesForKeys: nil) else { return [] }
        var out: [(path: String, code: String)] = []
        for case let url as URL in walker where url.pathExtension == "swift" {
            let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
            out.append((relative, stripComments(try String(contentsOf: url, encoding: .utf8))))
        }
        return out.sorted { $0.path < $1.path }
    }

    /// Nombre d'occurrences NON CHEVAUCHANTES de `needle` dans `haystack`.
    static func occurrences(of needle: String, in haystack: String) -> Int {
        guard !needle.isEmpty else { return 0 }
        var count = 0
        var cursor = haystack.startIndex
        while let range = haystack.range(of: needle, range: cursor..<haystack.endIndex) {
            count += 1
            cursor = range.upperBound
        }
        return count
    }

    /// Retire les commentaires de fin de ligne `// …` ET les commentaires de
    /// bloc `/* … */`. Le scanner suit l'état « dans un littéral de chaîne »
    /// pour ne pas amputer une URL (`https://…`) ni un chemin `file://` écrit
    /// dans du code vivant.
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
}

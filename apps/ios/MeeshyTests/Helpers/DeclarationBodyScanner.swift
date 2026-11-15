import Foundation

/// Extrait le corps `{ … }` d'une déclaration Swift dans un fichier source, en
/// équilibrant les accolades.
///
/// **Pourquoi ce type existe.** Les gardes de source du dépôt découpaient
/// jusqu'ici une fenêtre de N caractères après le marqueur
/// (`prefix(1600)`, `prefix(2000)`, `offsetBy: 1000`). Cette fenêtre est une
/// constante devinée au moment où la garde est écrite : chaque commentaire
/// ajouté au-dessus du code surveillé repousse ce code hors de la fenêtre, et
/// la garde vire au rouge sans qu'aucun comportement n'ait changé.
///
/// Constaté le 2026-08-09 sur six gardes de la voie « appels » :
/// `holdPendingAnswerAction(action)` était à 2 778 caractères pour une fenêtre
/// de 1 600, le garde `callUUID` de `CXEndCallAction` à 2 399 pour 2 000, et
/// `callToggleAccessibility` (renommé `toggleStateAccessibility` au 253i) à
/// **1 001 pour une fenêtre de 1 000** — un
/// caractère d'écart. Dans les trois cas le code de production était correct.
///
/// Un corps équilibré n'a pas de longueur à deviner : il finit là où la
/// déclaration finit.
nonisolated enum DeclarationBodyScanner {

    /// Corps de la première déclaration contenant `marker`, accolade ouvrante
    /// et fermante comprises. `nil` si le marqueur est absent ou si les
    /// accolades ne s'équilibrent pas.
    ///
    /// Les commentaires de ligne et les littéraux de chaîne sont neutralisés
    /// avant le comptage : une accolade dans un commentaire explicatif ou dans
    /// une chaîne ne doit pas déséquilibrer le corps.
    static func body(containing marker: String, in source: String) -> String? {
        guard let markerRange = source.range(of: marker) else { return nil }

        let masked = Array(mask(source))
        let chars = Array(source)
        let markerEnd = source.distance(from: source.startIndex, to: markerRange.upperBound)

        guard let open = (markerEnd..<masked.count).first(where: { masked[$0] == "{" }) else { return nil }

        var depth = 0
        for i in open..<masked.count {
            if masked[i] == "{" { depth += 1 }
            if masked[i] == "}" {
                depth -= 1
                if depth == 0 { return String(chars[open...i]) }
            }
        }
        return nil
    }

    /// Remplace le contenu des commentaires de ligne, des commentaires de bloc
    /// et des chaînes littérales par des espaces, en conservant la longueur —
    /// les index restent donc valides sur la source d'origine.
    ///
    /// Rendu non-`private` au round 4 de la revue Task 6 : c'est le SEUL
    /// masqueur de commentaires+chaînes correct du dépôt (état `inString`
    /// avec gestion des échappements). `ShareSourceCommentStripping`
    /// (`MeeshyTests/Unit/Share/ShareSourceCommentStripping.swift`)
    /// délègue désormais ici plutôt que de réimplémenter sa propre version —
    /// celle-ci ne reconnaissait que `//`/`/* */` et prenait à tort le `//`
    /// d'un littéral `"https://…"` pour un commentaire de ligne, effaçant
    /// tout le reste de la ligne (constaté sur du code réel de production :
    /// `ShareSession.swift`, `ShareViewController.swift`).
    static func mask(_ source: String) -> String {
        var out = ""
        out.reserveCapacity(source.count)

        var inLineComment = false
        var inBlockComment = false
        var inString = false
        var escaped = false
        var previous: Character?

        for character in source {
            var emit = character

            if inLineComment {
                if character == "\n" { inLineComment = false } else { emit = " " }
            } else if inBlockComment {
                if previous == "*" && character == "/" { inBlockComment = false }
                emit = character == "\n" ? "\n" : " "
            } else if inString {
                if escaped { escaped = false }
                else if character == "\\" { escaped = true }
                else if character == "\"" { inString = false }
                if inString || character == "\\" { emit = " " }
            } else if previous == "/" && character == "/" {
                inLineComment = true
                out.removeLast()
                out.append(" ")
                emit = " "
            } else if previous == "/" && character == "*" {
                inBlockComment = true
                out.removeLast()
                out.append(" ")
                emit = " "
            } else if character == "\"" {
                inString = true
            }

            out.append(emit)
            previous = character
        }
        return out
    }
}

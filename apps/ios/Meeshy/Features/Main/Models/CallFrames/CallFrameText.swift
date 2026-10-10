import CoreGraphics
import Foundation

/// Une personne de l'appel, moi compris — le nom qu'on voit déjà dans l'appel, et son @pseudo s'il est connu.
nonisolated struct CallFramePerson: Equatable, Sendable {
    let id: String
    let name: String
    let handle: String?
    let isSelf: Bool
}

/// Les deux couleurs d'accent de la conversation (hex), pour le fond `accent`.
nonisolated struct CallFrameAccent: Equatable, Hashable, Sendable {
    let primary: String
    let secondary: String
}

/// Ce que le cadre écrit hors des visages : le nom du groupe (en groupe seulement), la date déjà formatée, l'accent de la conversation.
nonisolated struct CallFrameTexts: Equatable, Hashable, Sendable {
    let groupName: String?
    let isGroup: Bool
    let date: String
    let accentHex: CallFrameAccent?
}

nonisolated struct CallFrameFittedText: Equatable, Sendable {
    let text: String
    let size: CGFloat
}

/// **LES MOTS D'UN CADRE** — le portage de `apps/web/src/lib/calls/frames/frame-text.ts`
/// (spec § 4.5 et § 5.3) : ce que le titre, le sous-titre et les noms ÉCRIVENT,
/// en fonctions pures. La mesure du texte est injectée, pour que la règle se prouve sans CoreText.
nonisolated enum CallFrameText {
    /// L'UNIQUE graphie de la marque dans un cadre : en minuscules, jamais passée en capitales.
    static let brandWord = "meeshy"
    static let visibleNames = 3
    static let minShare: CGFloat = 0.6
    static let ellipsis = "…"

    private static func trimmed(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func hasText(_ value: String?) -> Bool {
        guard let value else { return false }
        return !trimmed(value).isEmpty
    }

    /// « Awa » · « Awa & Karim » · « Awa, Karim & Lina » · « Awa, Karim, Lina + 2 ».
    static func namesText(_ people: [CallFramePerson]) -> String {
        let names = people.map { trimmed($0.name) }.filter { !$0.isEmpty }
        guard names.count > 1 else { return names.first ?? "" }
        if names.count <= visibleNames {
            return "\(names.dropLast().joined(separator: ", ")) & \(names[names.count - 1])"
        }
        return "\(names.prefix(visibleNames).joined(separator: ", ")) + \(names.count - visibleNames)"
    }

    /// Un pseudo, toujours préfixé d'UN seul « @ ».
    static func handleText(_ handle: String) -> String {
        "@" + String(trimmed(handle).drop(while: { $0 == "@" }))
    }

    /// Le texte d'un titre ou d'un sous-titre. `group` hors groupe (ou sans nom de groupe) ⇒ les noms. La marque ne passe jamais en capitales.
    /// L'heure, le lieu, le monument et l'émotion (#9197) n'écrivent rien tant que leur moteur n'est pas là (doc 06, étape 3.3).
    static func titleText(_ source: CallFrameTitleSource, people: [CallFramePerson], texts: CallFrameTexts, letterCase: CallFrameLetterCase? = nil) -> String {
        let raw: String
        switch source {
        case .group:
            if texts.isGroup, let group = texts.groupName, hasText(group) {
                raw = trimmed(group)
            } else {
                raw = namesText(people)
            }
        case .names: raw = namesText(people)
        case .brand: raw = brandWord
        case .date: raw = trimmed(texts.date)
        case .none: raw = ""
        case .time, .datetime, .place, .landmark, .emotion: raw = ""
        }
        return letterCase == .upper && source != .brand ? raw.uppercased(with: .current) : raw
    }

    /// Les lignes qu'une personne porte sous `show` : le nom, le @pseudo, ou les deux sur deux lignes. Sans pseudo connu, le nom le remplace.
    static func personLines(_ person: CallFramePerson, show: CallFrameNameShow) -> [String] {
        let name = trimmed(person.name)
        let handle = hasText(person.handle) ? person.handle.map(handleText) : nil
        switch show {
        case .none:
            return []
        case .name:
            if !name.isEmpty { return [name] }
            return handle.map { [$0] } ?? []
        case .handle:
            if let handle { return [handle] }
            return name.isEmpty ? [] : [name]
        case .both:
            return [name, handle].compactMap { $0 }.filter { !$0.isEmpty }
        }
    }

    /// Une ligne de la liste des noms (style `list`) : « Awa », « @awa » ou « Awa @awa ».
    static func listEntry(_ person: CallFramePerson, show: CallFrameNameShow) -> String {
        personLines(person, show: show).joined(separator: " ")
    }

    /// Un texte trop long pour `maxWidth` rétrécit jusqu'à 60 % de sa taille, puis se tronque d'une ellipse (§ 5.3)
    /// — coupé entre deux caractères, jamais au milieu d'un caractère composé.
    static func fit(_ text: String, maxWidth: CGFloat, size: CGFloat, measure: (String, CGFloat) -> CGFloat) -> CallFrameFittedText {
        guard !text.isEmpty, maxWidth > 0 else { return CallFrameFittedText(text: maxWidth <= 0 ? "" : text, size: size) }
        let width = measure(text, size)
        guard width > maxWidth else { return CallFrameFittedText(text: text, size: size) }
        let floor = size * minShare
        var fitted = max(floor, (size * maxWidth) / width)
        while fitted > floor, measure(text, fitted) > maxWidth {
            fitted = max(floor, fitted * 0.97)
        }
        if measure(text, fitted) <= maxWidth { return CallFrameFittedText(text: text, size: fitted) }
        let glyphs = Array(text)
        func cut(_ keep: Int) -> String {
            guard keep > 0 else { return ellipsis }
            var kept = String(glyphs.prefix(keep))
            while let last = kept.last, last.isWhitespace { kept.removeLast() }
            return kept + ellipsis
        }
        var low = 0
        var high = glyphs.count - 1
        while low < high {
            let middle = (low + high + 1) / 2
            if measure(cut(middle), fitted) <= maxWidth {
                low = middle
            } else {
                high = middle - 1
            }
        }
        let keep = low
        let empty = keep == 0 && measure(ellipsis, fitted) > maxWidth
        return CallFrameFittedText(text: empty ? "" : cut(keep), size: fitted)
    }
}

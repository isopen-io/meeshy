import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - Les Instants de Mee et Meo (#9069)

/// Un emplacement qu'un Instant écrit — les clés du champ `slots` du message,
/// celles du web (`MeeSlot`).
nonisolated public enum MeeSlot: String, CaseIterable, Hashable, Sendable {
    case message
    case place
    case time
    case weather

    /// Les emplacements d'un message reçu ; une clé qu'aucun Instant n'écrit tombe.
    public static func slots(of raw: [String: String]) -> [MeeSlot: String] {
        Dictionary(uniqueKeysWithValues: raw.compactMap { key, value in
            MeeSlot(rawValue: key).map { ($0, value) }
        })
    }
}

/// **Un Instant** : un Mee ou un Meo qui écrit, au moment de l'envoi, un
/// message, l'heure, le lieu ou la météo.
///
/// Son dessin vient du web, FILMÉ sans ce qui dépend du texte
/// (`apps/web/scripts/mee-ios-instants.ts`) ; l'index dit où et comment iOS
/// redessine ce texte (`MeeInstantOverlay`). Le contrat du message est celui
/// du web : `templateId: "mee.<id>"`, les emplacements saisis, l'emoji de repli.
nonisolated public struct MeeInstant: Hashable, Identifiable, Sendable {

    /// La famille — la section de « Personnalisés », dans l'ordre du web.
    nonisolated public enum Kind: String, CaseIterable, Sendable {
        case message
        case moment
        case lieu
        case meteo
    }

    /// **Le bandeau** (`kit.band`) : sa forme dépend du texte, il se redessine
    /// entier. `main` est la ligne forte, `sub` la ligne douce.
    nonisolated public struct Band: Hashable, Sendable {
        public let main: MeeSlot
        public let sub: MeeSlot?
        public let fill: UInt32
        public let ink: UInt32
        public let stroke: UInt32
    }

    /// **Un texte libre** posé sur un support du film (pancarte, bulle,
    /// cœur) : sa place et sa rotation dans la boîte de vue, sa graisse, sa
    /// couleur, et sa taille selon la longueur saisie — SONDÉES sur le web.
    nonisolated public struct FreeText: Hashable, Sendable {
        nonisolated public enum Anchor: Hashable, Sendable { case start, middle, end }
        nonisolated public struct Size: Hashable, Sendable {
            public let from: Int
            public let size: CGFloat
        }

        public let slot: MeeSlot
        public let x: CGFloat
        public let y: CGFloat
        public let rotation: CGFloat
        public let scale: CGFloat
        public let anchor: Anchor
        public let weight: Int
        public let fill: UInt32
        public let opacity: CGFloat
        public let sizes: [Size]
        /// La longueur au-delà de laquelle le web coupe ; `nil` : jamais.
        public let max: Int?

        public func size(forLength length: Int) -> CGFloat {
            sizes.last { $0.from <= length }?.size ?? sizes.first?.size ?? 12
        }
    }

    public let id: String
    public let kind: Kind
    public let title: String
    public let emoji: String
    public let animated: Bool
    public let slots: [MeeSlot]
    public let defaults: [MeeSlot: String]
    public let band: Band?
    public let texts: [FreeText]

    public var templateId: String { MeeStickerCatalog.templatePrefix + id }

    /// Ce qui PART au fil : les emplacements déclarés, non vides, sans leurs
    /// espaces — la règle du web (`meeSlotsFor`).
    public func sentSlots(_ typed: [MeeSlot: String]) -> [MeeSlot: String] {
        Dictionary(uniqueKeysWithValues: slots.compactMap { slot in
            guard let value = typed[slot]?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
            return (slot, value)
        })
    }

    /// Ce qui S'AFFICHE : la valeur saisie, sinon la valeur par défaut.
    public func shown(_ slot: MeeSlot, in typed: [MeeSlot: String]) -> String? {
        sentSlots(typed)[slot] ?? defaults[slot]
    }

    public func messageSticker(slots typed: [MeeSlot: String]) -> MessageSticker {
        MessageSticker(templateId: templateId,
                       slots: Dictionary(uniqueKeysWithValues: sentSlots(typed).map { ($0.key.rawValue, $0.value) }),
                       emoji: emoji)
    }
}

nonisolated public enum MeeInstantCatalog {

    nonisolated public struct Section: Identifiable, Sendable {
        public let kind: MeeInstant.Kind
        public let instants: [MeeInstant]
        public var id: MeeInstant.Kind { kind }
    }

    private static let byID: [String: MeeInstant] =
        Dictionary(all.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

    public static let sections: [Section] = MeeInstant.Kind.allCases.compactMap { kind in
        let instants = all.filter { $0.kind == kind }
        return instants.isEmpty ? nil : Section(kind: kind, instants: instants)
    }

    /// **Une ligne de la section Instants** : le titre d'une famille, ou une
    /// rangée. Chaque ligne est un enfant DIRECT de la pile de la feuille —
    /// une pile paresseuse imbriquée ne créait pas ses rangées (2026-10-02).
    nonisolated public enum Row: Hashable, Identifiable, Sendable {
        case title(MeeInstant.Kind)
        case instants([MeeInstant])

        public var id: String {
            switch self {
            case .title(let kind): "title.\(kind.rawValue)"
            case .instants(let instants): "row.\(instants.first?.id ?? "")"
            }
        }
    }

    public static func rows(columns: Int) -> [Row] {
        sections.flatMap { section in
            [Row.title(section.kind)] + stride(from: 0, to: section.instants.count, by: columns).map {
                Row.instants(Array(section.instants[$0..<min($0 + columns, section.instants.count)]))
            }
        }
    }

    public static func instant(forTemplateID templateID: String?) -> MeeInstant? {
        guard let templateID, templateID.hasPrefix(MeeStickerCatalog.templatePrefix) else { return nil }
        return byID[String(templateID.dropFirst(MeeStickerCatalog.templatePrefix.count))]
    }
}

// MARK: - Les règles du dessin, rejouées du web

nonisolated public enum MeeInstantText {

    /// `clip` (`apps/web/src/lib/mee/kit.ts`) : on retire les espaces ; au-delà
    /// de `max`, `max - 1` caractères suivis d'une ellipse.
    public static func clip(_ text: String, max: Int) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > max else { return trimmed }
        let kept = String(trimmed.prefix(max - 1))
        return String(kept.reversed().drop(while: \.isWhitespace).reversed()) + "…"
    }
}

/// **Le bandeau d'un Instant** (`kit.band`), dans le repère du dessin
/// (0…200) : une ligne quand la ligne douce manque, deux sinon.
nonisolated public struct MeeInstantBandLayout: Equatable, Sendable {
    public let main: String
    public let sub: String?
    public let rect: CGRect
    public let cornerRadius: CGFloat
    public let mainSize: CGFloat
    public let mainBaseline: CGFloat
    public let subSize: CGFloat = 11.5
    public let subBaseline: CGFloat = 186

    public init(main: String, sub: String?) {
        let top = MeeInstantText.clip(main, max: 20)
        let bottom = sub.map { MeeInstantText.clip($0, max: 28) }.flatMap { $0.isEmpty ? nil : $0 }
        let size: CGFloat = top.count > 14 ? 15 : 19
        self.main = top
        self.sub = bottom
        self.mainSize = size
        if bottom == nil {
            rect = CGRect(x: 14, y: 158, width: 172, height: 34)
            cornerRadius = 17
            mainBaseline = 181 - (19 - size) / 2
        } else {
            rect = CGRect(x: 14, y: 148, width: 172, height: 46)
            cornerRadius = 16
            mainBaseline = 169
        }
    }
}

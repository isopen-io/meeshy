import Foundation
import MeeshySDK

/// L'ordre d'une vitrine et son rangement — purs, pour que le témoin les éprouve sans écran.
enum GameShowcaseRules {

    /// L'ordre PARCOURU : les clés rangées qui existent, puis tout ce que l'ordre ne cite pas, dans l'ordre
    /// servi. C'est `trophies.order`, calculé par la loi (`GameTrophies.orderShowcase`), que l'écran
    /// PARCOURT sans le recalculer.
    static func shelfOrder(_ trophies: GameTrophiesBlock) -> [String] {
        let owned = Set(trophies.items.map(\.key))
        var seen = Set<String>()
        let ordered = trophies.order.filter { owned.contains($0) && seen.insert($0).inserted }
        let rest = trophies.items.map(\.key).filter { !seen.contains($0) }
        return ordered + rest
    }

    /// Monter ou descendre d'un cran ; la même suite quand le geste n'a pas de sens (bord de la vitrine).
    static func moved(_ order: [String], index: Int, delta: Int) -> [String] {
        let target = index + delta
        guard order.indices.contains(index), order.indices.contains(target) else { return order }
        var next = order
        next.swapAt(index, target)
        return next
    }
}

/// LE JEU D'UN AUTRE (#9481, #9387) — ce que SA visibilité autorise, rien sinon. Le serveur décide (`visible`) ;
/// quand il ferme la vitrine à ce lecteur, l'écran ne dit PAS qu'elle existe : il ne dessine rien (une carte
/// « vitrine fermée » apprendrait qu'il y en a une). Un visiteur ne voit que le MOIS d'obtention d'un trophée,
/// jamais le jour (conformité D-3) : une coupe de ligue lui arrive avec une clé au MOIS, et deux coupes identiques
/// du même mois sur UNE ligne comptée. Les clés d'une version plus récente ne se montrent pas : on ne nomme pas ce
/// qu'on ne comprend pas. Le rang, le niveau et le trésor d'un autre ne sont pas servis par le contrat.
enum GameVisitorShowcase {

    struct Entry: Equatable, Identifiable {
        let key: String
        let presentation: GameTrophyPresentation
        let caption: String
        var id: String { key }
    }

    static func entries(_ showcase: UserShowcaseResponse?) -> [Entry] {
        guard let showcase, showcase.visible else { return [] }
        let items = Dictionary(showcase.items.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })
        var seen = Set<String>()
        let ordered = (showcase.order + showcase.items.map(\.key)).filter { items[$0] != nil && seen.insert($0).inserted }
        return ordered.compactMap { key in
            guard let presentation = GameTrophyPresentation.of(key: key), let item = items[key] else { return nil }
            let month = GameWave2Format.month(item.awardedMonth)
            let caption = (item.count ?? 1) < 2
                ? GameText.showcaseAwardedMonth(month: month)
                : GameText.showcaseAwardedMonthCount(month: month, count: GameCopy.formatCount(item.count ?? 1))
            return Entry(key: key, presentation: presentation, caption: caption)
        }
    }
}

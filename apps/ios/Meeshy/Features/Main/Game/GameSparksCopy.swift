import Foundation

/// Les mots des ÉTINCELLES (#10846) — le nom des points du Jeu. Trois nombres : la POCHE (dépensable, toute
/// convertible), le CYCLE (la base du niveau), le TOTAL À VIE ; et le niveau max à vie, qui survit au prestige.
enum GameSparksCopy {

    /// « 976 étincelles » — la poche, lue par VoiceOver.
    static func sparks(_ count: Int) -> String {
        GameCopy.points(count)
    }

    /// La poche, en grand sur la bannière d'une fiche : « 976 ✦ ».
    static func bannerPocket(_ count: Int) -> String {
        String(localized: "game.sparks.banner.pocket", defaultValue: "\(GameCopy.formatCount(count)) ✦", bundle: .main)
    }

    /// Le total à vie, en petit sous la poche : « 12 000 à vie ».
    static func bannerLifetime(_ count: Int) -> String {
        String(localized: "game.sparks.banner.lifetime", defaultValue: "\(GameCopy.formatCount(count)) à vie", bundle: .main)
    }

    /// Le niveau max à vie, en petit sous le niveau : « max 40 ».
    static func bannerLevelMax(_ level: Int) -> String {
        String(localized: "game.sparks.banner.levelMax", defaultValue: "max \(GameCopy.formatCount(level))", bundle: .main)
    }

    /// « 12 000 étincelles gagnées à vie ».
    static func lifetimeAccessibility(_ count: Int) -> String {
        String(localized: "game.sparks.lifetime.a11y",
               defaultValue: "\(GameCopy.formatCount(count)) étincelles gagnées à vie", bundle: .main)
    }

    /// « Niveau max à vie 40 ».
    static func levelMaxAccessibility(_ level: Int) -> String {
        String(localized: "game.sparks.levelMax.a11y", defaultValue: "Niveau max à vie \(GameCopy.formatCount(level))", bundle: .main)
    }

    /// Le libellé court de la poche dans une paire « poche / total » : « En poche ».
    static var pocketLabel: String { String(localized: "game.sparks.pocket.label", defaultValue: "En poche", bundle: .main) }
    /// « Gagnées à vie ».
    static var lifetimeLabel: String { String(localized: "game.sparks.lifetime.label", defaultValue: "Gagnées à vie", bundle: .main) }
    /// « Niveau actuel ».
    static var levelLabel: String { String(localized: "game.sparks.level.label", defaultValue: "Niveau actuel", bundle: .main) }
    /// « Max à vie ».
    static var levelMaxLabel: String { String(localized: "game.sparks.levelMax.label", defaultValue: "Max à vie", bundle: .main) }
}

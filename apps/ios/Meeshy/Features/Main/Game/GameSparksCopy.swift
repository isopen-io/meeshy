import Foundation

/// Les mots des ÉTINCELLES (#10846) — le nom des points du Jeu. Trois nombres : les CONVERTIBLES (la poche, toute
/// dépensable — la seule valeur réelle, #10860, et la base du niveau, #10892), le CYCLE et le RECORD D'ÉTINCELLES (le
/// total cumulé à vie, indicatif) ; et le RECORD DE NIVEAU, qui survit au prestige (vocabulaire porteur 2026-10-17, #10899).
enum GameSparksCopy {

    /// « 976 étincelles » — la poche, lue par VoiceOver.
    static func sparks(_ count: Int) -> String {
        GameCopy.points(count)
    }

    /// La poche, en grand sur la bannière d'une fiche : « 976 ✦ ».
    static func bannerPocket(_ count: Int) -> String {
        String(localized: "game.sparks.banner.pocket", defaultValue: "\(GameCopy.formatCount(count)) ✦", bundle: .main)
    }

    /// Le record d’étincelles, en petit sous la poche : « record 12 000 ».
    static func bannerLifetime(_ count: Int) -> String {
        String(localized: "game.sparks.banner.lifetime", defaultValue: "record \(GameCopy.formatCount(count))", bundle: .main)
    }

    /// Le record de niveau, en petit sous le niveau : « record 40 ».
    static func bannerLevelMax(_ level: Int) -> String {
        String(localized: "game.sparks.banner.levelMax", defaultValue: "record \(GameCopy.formatCount(level))", bundle: .main)
    }

    /// « Record d’étincelles : 12 000 ».
    static func lifetimeAccessibility(_ count: Int) -> String {
        String(localized: "game.sparks.lifetime.a11y",
               defaultValue: "Record d’étincelles : \(GameCopy.formatCount(count))", bundle: .main)
    }

    /// « Record de niveau 40 ».
    static func levelMaxAccessibility(_ level: Int) -> String {
        String(localized: "game.sparks.levelMax.a11y", defaultValue: "Record de niveau \(GameCopy.formatCount(level))", bundle: .main)
    }

    /// Le libellé court de la poche dans une paire « convertibles / record » : « Convertibles ».
    static var pocketLabel: String { String(localized: "game.sparks.pocket.label", defaultValue: "Convertibles", bundle: .main) }
    /// « Record d’étincelles ».
    static var lifetimeLabel: String { String(localized: "game.sparks.lifetime.label", defaultValue: "Record d’étincelles", bundle: .main) }

    /// Le record d'étincelles en valeur : sans Prestige, « 12 000 » ; après un Prestige, le cycle d'abord —
    /// « 4 200 cumulées · record 12 000 ».
    static func cumulValue(cycle: Int, lifetime: Int) -> String {
        guard cycle < lifetime else { return GameCopy.formatCount(lifetime) }
        return cycleAndRecord(cycle: cycle, lifetime: lifetime)
    }

    /// Le record d'étincelles en petit sous les convertibles (porteur 2026-10-17, #10899) : « Record d’étincelles :
    /// 12 000 » ; après un Prestige, « 4 200 cumulées · record 12 000 ».
    static func cumulLine(cycle: Int, lifetime: Int) -> String {
        guard cycle < lifetime else {
            return String(localized: "game.sparks.record.line",
                          defaultValue: "Record d’étincelles : \(GameCopy.formatCount(lifetime))", bundle: .main)
        }
        return cycleAndRecord(cycle: cycle, lifetime: lifetime)
    }

    private static func cycleAndRecord(cycle: Int, lifetime: Int) -> String {
        String(localized: "game.sparks.cumul.record",
               defaultValue: "\(GameCopy.formatCount(cycle)) cumulées · record \(GameCopy.formatCount(lifetime))", bundle: .main)
    }

    /// « Niveau actuel ».
    static var levelLabel: String { String(localized: "game.sparks.level.label", defaultValue: "Niveau actuel", bundle: .main) }
    /// « Record de niveau ».
    static var levelMaxLabel: String { String(localized: "game.sparks.levelMax.label", defaultValue: "Record de niveau", bundle: .main) }

    /// Le record de niveau en petit sous le niveau : « Record de niveau : 40 ».
    static func levelRecordLine(_ level: Int) -> String {
        String(localized: "game.sparks.levelRecord.line",
               defaultValue: "Record de niveau : \(GameCopy.formatCount(level))", bundle: .main)
    }
}

import Foundation

/// Les mots des ÉTINCELLES (#10846) — le nom des points du Jeu. Trois nombres : TA LUMIÈRE (la poche, toute dépensable,
/// la seule valeur réelle, #10860, et la base du niveau, #10892), ce qui a été reçu depuis la dernière renaissance, et
/// ce qui a été REÇU DEPUIS TOUJOURS (indicatif) ; et TA PLUS HAUTE LUMIÈRE, qui survit à la renaissance (épopée § 4).
/// La tête de la fiche des Étincelles lit la poche PAR SON NOM (`GameSparksHeadModel`, #11180).
enum GameSparksCopy {

    /// « 976 étincelles » — la poche, lue par VoiceOver.
    static func sparks(_ count: Int) -> String {
        GameCopy.points(count)
    }

    /// « Ta plus haute lumière : niveau 40 », lu par VoiceOver.
    static func levelMaxAccessibility(_ level: Int) -> String {
        String(localized: "game.sparks.levelMax.a11y", defaultValue: "Ta plus haute lumière : niveau \(GameCopy.formatCount(level))", bundle: .main)
    }

    /// Le libellé court de la poche : « Ta lumière ».
    static var pocketLabel: String { String(localized: "game.sparks.pocket.label", defaultValue: "Ta lumière", bundle: .main) }
    /// « Reçues depuis toujours ».
    static var lifetimeLabel: String { String(localized: "game.sparks.lifetime.label", defaultValue: "Reçues depuis toujours", bundle: .main) }

    /// Ce qui a été reçu, en valeur : sans renaissance, « 12 000 » ; après une renaissance, cet Âge d'abord —
    /// « 4 200 cet Âge · 12 000 en tout ».
    static func cumulValue(cycle: Int, lifetime: Int) -> String {
        guard cycle < lifetime else { return GameCopy.formatCount(lifetime) }
        return cycleAndRecord(cycle: cycle, lifetime: lifetime)
    }

    /// Le « depuis toujours » en petit sous ta lumière (porteur 2026-10-17, #10899 ; épopée § 3.3) : « 12 000 reçues
    /// depuis toujours » ; après une renaissance, « 4 200 cet Âge · 12 000 en tout ».
    static func cumulLine(cycle: Int, lifetime: Int) -> String {
        guard cycle < lifetime else {
            return String(localized: "game.sparks.record.line",
                          defaultValue: "\(GameCopy.formatCount(lifetime)) reçues depuis toujours", bundle: .main)
        }
        return cycleAndRecord(cycle: cycle, lifetime: lifetime)
    }

    private static func cycleAndRecord(cycle: Int, lifetime: Int) -> String {
        String(localized: "game.sparks.cumul.record",
               defaultValue: "\(GameCopy.formatCount(cycle)) cet Âge · \(GameCopy.formatCount(lifetime)) en tout", bundle: .main)
    }

    /// « Niveau actuel ».
    static var levelLabel: String { String(localized: "game.sparks.level.label", defaultValue: "Niveau actuel", bundle: .main) }
    /// « Au plus haut ».
    static var levelMaxLabel: String { String(localized: "game.sparks.levelMax.label", defaultValue: "Au plus haut", bundle: .main) }

    /// Ta plus haute lumière en petit sous le niveau : « Ta plus haute lumière : niveau 40 ».
    static func levelRecordLine(_ level: Int) -> String {
        String(localized: "game.sparks.levelRecord.line",
               defaultValue: "Ta plus haute lumière : niveau \(GameCopy.formatCount(level))", bundle: .main)
    }
}

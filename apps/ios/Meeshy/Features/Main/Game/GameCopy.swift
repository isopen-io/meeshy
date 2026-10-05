import Foundation
import MeeshySDK

/// CE QUE LE JEU DIT (#9383, #9379) — les noms, les accords et les phrases de
/// refus. La loi (`MeeshySDK/Game`) ne prononce rien : elle rend des clés
/// stables, ce fichier les habille — même séparation que `ProgressionCopy`
/// pour les axes. Miroir de `apps/web/src/lib/view/game-copy.ts`, dans les sept
/// langues du catalogue.
///
/// L'accord ne passe jamais par un `== 1` isolé : `isSingular` sait que le
/// français et le portugais lisent zéro au singulier. Les nombres sont formatés
/// par la locale (« 1 221 » en français) AVANT d'entrer dans la phrase, qui ne
/// porte donc qu'un `%@` — d'où une paire de clés `.one` / `.other` plutôt qu'une
/// variation plurielle, qui exigerait un entier nu (« 1221 »).
enum GameCopy {

    // MARK: - Nombres et accords

    /// Le zéro est singulier en français et en portugais (« 0 point »).
    static func isSingular(_ count: Int, languageCode: String? = Locale.current.languageCode) -> Bool {
        if count == 1 { return true }
        return count == 0 && (languageCode == "fr" || languageCode == "pt")
    }

    static func formatCount(_ count: Int) -> String {
        count.formatted(.number)
    }

    static func points(_ count: Int) -> String {
        let number = formatCount(count)
        return isSingular(count)
            ? String(localized: "game.points.one", defaultValue: "\(number) point", bundle: .main)
            : String(localized: "game.points.other", defaultValue: "\(number) points", bundle: .main)
    }

    static func convertiblePoints(_ count: Int) -> String {
        let number = formatCount(count)
        return isSingular(count)
            ? String(localized: "game.points.convertible.one", defaultValue: "\(number) point convertible", bundle: .main)
            : String(localized: "game.points.convertible.other", defaultValue: "\(number) points convertibles", bundle: .main)
    }

    static func meeshes(_ count: Int) -> String {
        if count <= 0 {
            return String(localized: "game.meeshes.none", defaultValue: "Aucune Meesh", bundle: .main)
        }
        let number = formatCount(count)
        return isSingular(count)
            ? String(localized: "game.meeshes.one", defaultValue: "\(number) Meesh", bundle: .main)
            : String(localized: "game.meeshes.other", defaultValue: "\(number) Meeshes", bundle: .main)
    }

    static func days(_ count: Int) -> String {
        let number = formatCount(count)
        return isSingular(count)
            ? String(localized: "game.days.one", defaultValue: "\(number) jour", bundle: .main)
            : String(localized: "game.days.other", defaultValue: "\(number) jours", bundle: .main)
    }

    static func actions(_ count: Int) -> String {
        let number = formatCount(count)
        return isSingular(count)
            ? String(localized: "game.actions.one", defaultValue: "\(number) action", bundle: .main)
            : String(localized: "game.actions.other", defaultValue: "\(number) actions", bundle: .main)
    }

    static func levels(_ count: Int) -> String {
        let number = formatCount(count)
        return isSingular(count)
            ? String(localized: "game.levels.one", defaultValue: "\(number) niveau", bundle: .main)
            : String(localized: "game.levels.other", defaultValue: "\(number) niveaux", bundle: .main)
    }

    // MARK: - Noms

    static func tierName(_ tier: LevelTierKey) -> String {
        switch tier {
        case .etincelle: String(localized: "game.tier.etincelle", defaultValue: "Étincelle", bundle: .main)
        case .lueur: String(localized: "game.tier.lueur", defaultValue: "Lueur", bundle: .main)
        case .lumiere: String(localized: "game.tier.lumiere", defaultValue: "Lumière", bundle: .main)
        case .eclat: String(localized: "game.tier.eclat", defaultValue: "Éclat", bundle: .main)
        case .rayon: String(localized: "game.tier.rayon", defaultValue: "Rayon", bundle: .main)
        case .aurore: String(localized: "game.tier.aurore", defaultValue: "Aurore", bundle: .main)
        case .comete: String(localized: "game.tier.comete", defaultValue: "Comète", bundle: .main)
        case .etoile: String(localized: "game.tier.etoile", defaultValue: "Étoile", bundle: .main)
        case .constellation: String(localized: "game.tier.constellation", defaultValue: "Constellation", bundle: .main)
        case .galaxie: String(localized: "game.tier.galaxie", defaultValue: "Galaxie", bundle: .main)
        }
    }

    static func rankName(_ rank: GloryRank) -> String {
        switch rank {
        case .murmure: String(localized: "game.rank.murmure", defaultValue: "Murmure", bundle: .main)
        case .echo: String(localized: "game.rank.echo", defaultValue: "Écho", bundle: .main)
        case .voix: String(localized: "game.rank.voix", defaultValue: "Voix", bundle: .main)
        case .conteur: String(localized: "game.rank.conteur", defaultValue: "Conteur", bundle: .main)
        case .passeur: String(localized: "game.rank.passeur", defaultValue: "Passeur", bundle: .main)
        case .polyglotte: String(localized: "game.rank.polyglotte", defaultValue: "Polyglotte", bundle: .main)
        case .ambassadeur: String(localized: "game.rank.ambassadeur", defaultValue: "Ambassadeur", bundle: .main)
        case .orateur: String(localized: "game.rank.orateur", defaultValue: "Orateur", bundle: .main)
        case .oracle: String(localized: "game.rank.oracle", defaultValue: "Oracle", bundle: .main)
        case .legende: String(localized: "game.rank.legende", defaultValue: "Légende", bundle: .main)
        case .mythe: String(localized: "game.rank.mythe", defaultValue: "Mythe", bundle: .main)
        }
    }

    static func divisionLabel(_ division: GloryDivision) -> String {
        switch division {
        case .iii: "III"
        case .ii: "II"
        case .i: "I"
        }
    }

    static func rankLabel(_ rank: GloryRank, division: GloryDivision?) -> String {
        guard let division else { return rankName(rank) }
        return "\(rankName(rank)) \(divisionLabel(division))"
    }

    static func treasuryName(_ tier: TreasuryTierKey) -> String {
        switch tier {
        case .bourse: String(localized: "game.treasury.bourse", defaultValue: "Bourse", bundle: .main)
        case .escarcelle: String(localized: "game.treasury.escarcelle", defaultValue: "Escarcelle", bundle: .main)
        case .coffret: String(localized: "game.treasury.coffret", defaultValue: "Coffret", bundle: .main)
        case .coffre: String(localized: "game.treasury.coffre", defaultValue: "Coffre", bundle: .main)
        case .tresor: String(localized: "game.treasury.tresor", defaultValue: "Trésor", bundle: .main)
        case .reserve: String(localized: "game.treasury.reserve", defaultValue: "Réserve", bundle: .main)
        }
    }

    static func flameFormName(_ form: FlameFormKey) -> String {
        switch form {
        case .braise: String(localized: "game.flame.form.braise", defaultValue: "Braise", bundle: .main)
        case .flamme: String(localized: "game.flame.form.flamme", defaultValue: "Flamme", bundle: .main)
        case .brasier: String(localized: "game.flame.form.brasier", defaultValue: "Brasier", bundle: .main)
        case .astre: String(localized: "game.flame.form.astre", defaultValue: "Astre", bundle: .main)
        case .soleil: String(localized: "game.flame.form.soleil", defaultValue: "Soleil", bundle: .main)
        }
    }

    static func editionName(_ edition: MeeshEdition) -> String {
        switch edition {
        case .silver: String(localized: "game.edition.silver", defaultValue: "argent", bundle: .main)
        case .gold: String(localized: "game.edition.gold", defaultValue: "or", bundle: .main)
        case .prism: String(localized: "game.edition.prism", defaultValue: "prisme", bundle: .main)
        }
    }

    static func difficultyName(_ difficulty: MissionDifficulty) -> String {
        switch difficulty {
        case .easy: String(localized: "game.difficulty.easy", defaultValue: "Facile", bundle: .main)
        case .medium: String(localized: "game.difficulty.medium", defaultValue: "Moyenne", bundle: .main)
        case .hard: String(localized: "game.difficulty.hard", defaultValue: "Difficile", bundle: .main)
        case .gold: String(localized: "game.difficulty.gold", defaultValue: "Or", bundle: .main)
        }
    }

    // MARK: - Missions

    /// La mission en clair ; un gabarit que ce client ne connaît pas encore reste « Mission du jour ».
    static func missionTitle(templateKey: String, target: Int) -> String {
        let n = formatCount(target)
        let one = isSingular(target)
        switch templateKey {
        case "react-messages":
            return one
                ? String(localized: "game.mission.react_messages.one", defaultValue: "Réagir à \(n) message", bundle: .main)
                : String(localized: "game.mission.react_messages.other", defaultValue: "Réagir à \(n) messages", bundle: .main)
        case "send-voice":
            return one
                ? String(localized: "game.mission.send_voice.one", defaultValue: "Envoyer un message vocal", bundle: .main)
                : String(localized: "game.mission.send_voice.other", defaultValue: "Envoyer \(n) messages vocaux", bundle: .main)
        case "send-texts":
            return one
                ? String(localized: "game.mission.send_texts.one", defaultValue: "Envoyer \(n) message", bundle: .main)
                : String(localized: "game.mission.send_texts.other", defaultValue: "Envoyer \(n) messages", bundle: .main)
        case "use-stickers":
            return one
                ? String(localized: "game.mission.use_stickers.one", defaultValue: "Envoyer un sticker", bundle: .main)
                : String(localized: "game.mission.use_stickers.other", defaultValue: "Envoyer \(n) stickers", bundle: .main)
        case "send-attachments":
            return one
                ? String(localized: "game.mission.send_attachments.one", defaultValue: "Envoyer une pièce jointe", bundle: .main)
                : String(localized: "game.mission.send_attachments.other", defaultValue: "Envoyer \(n) pièces jointes", bundle: .main)
        case "reply-conversations", "reply-conversations-wide", "gold-reply-conversations":
            return String(localized: "game.mission.reply_conversations", defaultValue: "Répondre dans \(n) conversations différentes", bundle: .main)
        case "comment-text":
            return one
                ? String(localized: "game.mission.comment_text.one", defaultValue: "Écrire un commentaire", bundle: .main)
                : String(localized: "game.mission.comment_text.other", defaultValue: "Écrire \(n) commentaires", bundle: .main)
        case "publish-story":
            return one
                ? String(localized: "game.mission.publish_story.one", defaultValue: "Publier une story", bundle: .main)
                : String(localized: "game.mission.publish_story.other", defaultValue: "Publier \(n) stories", bundle: .main)
        case "publish-post", "publish-posts":
            return one
                ? String(localized: "game.mission.publish_post.one", defaultValue: "Publier un post", bundle: .main)
                : String(localized: "game.mission.publish_post.other", defaultValue: "Publier \(n) posts", bundle: .main)
        case "share-link":
            return one
                ? String(localized: "game.mission.share_link.one", defaultValue: "Partager un lien", bundle: .main)
                : String(localized: "game.mission.share_link.other", defaultValue: "Partager \(n) liens", bundle: .main)
        case "prism-foreign-messages":
            return one
                ? String(localized: "game.mission.prism_foreign_messages.one", defaultValue: "Écrire un message dans une autre langue que la tienne", bundle: .main)
                : String(localized: "game.mission.prism_foreign_messages.other", defaultValue: "Écrire \(n) messages dans une autre langue que la tienne", bundle: .main)
        case "prism-foreign-exchange":
            return String(localized: "game.mission.prism_foreign_exchange", defaultValue: "Écrire \(n) messages dans une autre langue que la tienne", bundle: .main)
        case "voice-comments":
            return one
                ? String(localized: "game.mission.voice_comments.one", defaultValue: "Laisser un commentaire vocal", bundle: .main)
                : String(localized: "game.mission.voice_comments.other", defaultValue: "Laisser \(n) commentaires vocaux", bundle: .main)
        case "publish-reel":
            return one
                ? String(localized: "game.mission.publish_reel.one", defaultValue: "Publier un réel", bundle: .main)
                : String(localized: "game.mission.publish_reel.other", defaultValue: "Publier \(n) réels", bundle: .main)
        case "long-chat":
            return String(localized: "game.mission.long_chat", defaultValue: "Envoyer \(n) messages", bundle: .main)
        case "gold-replies-received":
            return String(localized: "game.mission.gold_replies_received", defaultValue: "Recevoir des réponses de \(n) personnes différentes", bundle: .main)
        default:
            return String(localized: "game.mission.generic", defaultValue: "Mission du jour", bundle: .main)
        }
    }

    // MARK: - Refus

    static func errorMessage(for code: GameErrorCode?) -> String {
        switch code {
        case .insufficientPoints:
            String(localized: "game.error.insufficient_points", defaultValue: "Pas assez de points convertibles pour frapper une Meesh.", bundle: .main)
        case .insufficientMeeshes:
            String(localized: "game.error.insufficient_meeshes", defaultValue: "Il te faut une Meesh de plus pour ça.", bundle: .main)
        case .freezeAtMaximum:
            String(localized: "game.error.freeze_at_maximum", defaultValue: "Tu as déjà deux gels en réserve : c’est le maximum.", bundle: .main)
        case .relightNotAllowed:
            String(localized: "game.error.relight_not_allowed", defaultValue: "La Flamme ne peut pas être rallumée maintenant.", bundle: .main)
        case .missionNotFound:
            String(localized: "game.error.mission_not_found", defaultValue: "Cette mission n’existe plus : l’écran se remet à jour.", bundle: .main)
        case .missionRerollExhausted:
            String(localized: "game.error.mission_reroll_exhausted", defaultValue: "Tu as déjà changé une mission aujourd’hui.", bundle: .main)
        case .missionRerollUnavailable:
            String(localized: "game.error.mission_reroll_unavailable", defaultValue: "Cette mission ne peut pas être changée.", bundle: .main)
        case .missionsLocked:
            String(localized: "game.error.missions_locked", defaultValue: "Les missions s’ouvrent au niveau 5.", bundle: .main)
        case .chestNotReady:
            String(localized: "game.error.chest_not_ready", defaultValue: "Termine d’abord les missions du jour pour ouvrir le coffre.", bundle: .main)
        case nil:
            String(localized: "game.error.generic", defaultValue: "Ça n’a pas abouti — vérifie ta connexion et réessaie.", bundle: .main)
        }
    }

    static func errorMessage(for error: Error) -> String {
        errorMessage(for: GameService.refusal(of: error))
    }

    // MARK: - Les chiffres lus à voix haute

    static func clock(minuteOfDay: Int) -> String {
        String(format: "%02d:%02d", minuteOfDay / 60, minuteOfDay % 60)
    }

    /// « 1 chance sur 6 ».
    static func chance(_ fraction: Double) -> String {
        let denominator = fraction > 0 ? Int((1 / fraction).rounded()) : 0
        return String(localized: "game.chest.chance", defaultValue: "1 chance sur \(formatCount(denominator))", bundle: .main)
    }
}

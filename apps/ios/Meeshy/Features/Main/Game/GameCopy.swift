import Foundation
import MeeshySDK
import MeeshyUI

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
    static func isSingular(_ count: Int, languageCode: String? = Locale.current.language.languageCode?.identifier) -> Bool {
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

    /// « Changer · 1 Meesh » — le prix vient de la loi (`GameMissions.rerollPrice`), jamais du texte (#9705).
    static var rerollLabel: String {
        String(localized: "game.mission.reroll", defaultValue: "Changer · \(meeshes(GameMissions.rerollPrice))", bundle: .main)
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
        case .nebuleuse: String(localized: "game.tier.nebuleuse", defaultValue: "Nébuleuse", bundle: .main)
        case .pulsar: String(localized: "game.tier.pulsar", defaultValue: "Pulsar", bundle: .main)
        case .quasar: String(localized: "game.tier.quasar", defaultValue: "Quasar", bundle: .main)
        case .supernova: String(localized: "game.tier.supernova", defaultValue: "Supernova", bundle: .main)
        case .magnetar: String(localized: "game.tier.magnetar", defaultValue: "Magnétar", bundle: .main)
        case .amas: String(localized: "game.tier.amas", defaultValue: "Amas", bundle: .main)
        case .superamas: String(localized: "game.tier.superamas", defaultValue: "Superamas", bundle: .main)
        case .cosmos: String(localized: "game.tier.cosmos", defaultValue: "Cosmos", bundle: .main)
        case .infini: String(localized: "game.tier.infini", defaultValue: "Infini", bundle: .main)
        case .singularite: String(localized: "game.tier.singularite", defaultValue: "Singularité", bundle: .main)
        }
    }

    /// « quatrième » : le rang du palier, accordé au mot « palier » de la langue (masculin en français
    /// et en espagnol, féminin en italien, portugais, allemand et arabe).
    static func tierOrdinal(_ tier: LevelTierKey) -> String {
        switch tier {
        case .etincelle: String(localized: "game.tier.ordinal.1", defaultValue: "premier", bundle: .main)
        case .lueur: String(localized: "game.tier.ordinal.2", defaultValue: "deuxième", bundle: .main)
        case .lumiere: String(localized: "game.tier.ordinal.3", defaultValue: "troisième", bundle: .main)
        case .eclat: String(localized: "game.tier.ordinal.4", defaultValue: "quatrième", bundle: .main)
        case .rayon: String(localized: "game.tier.ordinal.5", defaultValue: "cinquième", bundle: .main)
        case .aurore: String(localized: "game.tier.ordinal.6", defaultValue: "sixième", bundle: .main)
        case .comete: String(localized: "game.tier.ordinal.7", defaultValue: "septième", bundle: .main)
        case .etoile: String(localized: "game.tier.ordinal.8", defaultValue: "huitième", bundle: .main)
        case .constellation: String(localized: "game.tier.ordinal.9", defaultValue: "neuvième", bundle: .main)
        case .galaxie: String(localized: "game.tier.ordinal.10", defaultValue: "dixième", bundle: .main)
        case .nebuleuse: String(localized: "game.tier.ordinal.11", defaultValue: "onzième", bundle: .main)
        case .pulsar: String(localized: "game.tier.ordinal.12", defaultValue: "douzième", bundle: .main)
        case .quasar: String(localized: "game.tier.ordinal.13", defaultValue: "treizième", bundle: .main)
        case .supernova: String(localized: "game.tier.ordinal.14", defaultValue: "quatorzième", bundle: .main)
        case .magnetar: String(localized: "game.tier.ordinal.15", defaultValue: "quinzième", bundle: .main)
        case .amas: String(localized: "game.tier.ordinal.16", defaultValue: "seizième", bundle: .main)
        case .superamas: String(localized: "game.tier.ordinal.17", defaultValue: "dix-septième", bundle: .main)
        case .cosmos: String(localized: "game.tier.ordinal.18", defaultValue: "dix-huitième", bundle: .main)
        case .infini: String(localized: "game.tier.ordinal.19", defaultValue: "dix-neuvième", bundle: .main)
        case .singularite: String(localized: "game.tier.ordinal.20", defaultValue: "vingtième", bundle: .main)
        }
    }

    // MARK: - Le plafond du niveau (#9688)

    /// Le rang qui OUVRE les niveaux au-delà de ce plafond — dérivé de la loi (`GameGlory.levelCap(forRank:)`) :
    /// le premier rang dont le plafond dépasse celui-ci. Ambassadeur au-delà de 499, Oracle au-delà de 1000 ;
    /// `nil` sans plafond (sans limite, ou un serveur antérieur qui ne le dit pas).
    static func rankOpening(beyond cap: Int?) -> GloryRank? {
        guard let cap else { return nil }
        return GloryRank.ladder.first { rank in GameGlory.levelCap(forRank: rank).map { $0 > cap } ?? true }
    }

    /// La phrase d'un niveau qui ne monte plus : au plafond de son rang, elle nomme le rang qui ouvre la suite ;
    /// sans plafond connu (serveur antérieur, qui s'arrêtait à 100), il est au sommet.
    static func levelTop(cap: Int?) -> String {
        guard let cap, let rank = rankOpening(beyond: cap) else {
            return String(localized: "game.level.top", defaultValue: "Tu es au sommet.", bundle: .main)
        }
        let capText = formatCount(cap)
        let name = rankName(rank)
        return String(
            localized: "game.level.cap.reached",
            defaultValue: "Niveau \(capText) : le plus haut que ton rang ouvre. Le rang \(name) ouvre la suite.",
            bundle: .main
        )
    }

    /// La version courte, pour une puce ou le fait « Prochain niveau » : « s’ouvre au rang Ambassadeur », ou « au sommet ».
    static func levelTopShort(cap: Int?) -> String {
        guard let rank = rankOpening(beyond: cap) else { return GameText.bannerTop }
        let name = rankName(rank)
        return String(localized: "game.level.cap.short", defaultValue: "s’ouvre au rang \(name)", bundle: .main)
    }

    /// Ce que VoiceOver lit sur l'anneau de niveau : « Niveau 34, palier Éclat, quatrième palier ».
    static func levelRingAccessibility(level: Int, tier: LevelTierKey) -> String {
        String(
            localized: "game.level.ring.a11y",
            defaultValue: "Niveau \(formatCount(level)), palier \(tierName(tier)), \(tierOrdinal(tier)) palier",
            bundle: .main
        )
    }

    // MARK: - Les étapes des niveaux (#9706)
    //
    // MIROIR des clés `game.level.step.*` et `game.level.held` du web (`catalog-game-concept-<langue>.ts`) : la MÊME
    // phrase dans les sept langues. Ce qu'une étape demande se dit à l'infinitif, en minuscule : il entre dans une
    // phrase (« Étape du niveau 10 : frapper ta première Meesh »).

    /// Ce que l'étape demande — le nom du rang vient des noms de rang, jamais reformulé.
    static func levelStepGoal(_ step: GameLevelStep) -> String {
        let targetText = formatCount(step.target)
        switch step.kind {
        case .mint:
            return step.target == 1
                ? String(localized: "game.level.step.mint_one", defaultValue: "frapper ta première Meesh", bundle: .main)
                : String(localized: "game.level.step.mint_many", defaultValue: "frapper \(targetText) Meeshes", bundle: .main)
        case .missions:
            return step.target == 1
                ? String(localized: "game.level.step.missions_one", defaultValue: "accomplir une mission du jour", bundle: .main)
                : String(localized: "game.level.step.missions_many", defaultValue: "accomplir \(targetText) missions du jour", bundle: .main)
        case .flame:
            return String(localized: "game.level.step.flame", defaultValue: "tenir une Flamme de \(targetText) jours", bundle: .main)
        case .rank:
            let ruled: GloryRank? = GameLevelSteps.rules.first(where: { $0.level == step.level })?.rank
            let rank = rankName(step.rank ?? ruled ?? .echo)
            return String(localized: "game.level.step.rank", defaultValue: "atteindre le rang \(rank)", bundle: .main)
        }
    }

    /// « Étape du niveau 10 : frapper ta première Meesh ».
    static func levelStepLine(_ step: GameLevelStep) -> String {
        let levelText = formatCount(step.level)
        let what = levelStepGoal(step)
        return String(localized: "game.level.step.line", defaultValue: "Étape du niveau \(levelText) : \(what)", bundle: .main)
    }

    static var levelStepDone: String {
        String(localized: "game.level.step.done", defaultValue: "faite", bundle: .main)
    }

    /// Où en est l'étape : « 0 / 1 » ; pour un rang, la Gloire « Gloire 1 200 / 2 000 ».
    static func levelStepProgress(_ step: GameLevelStep) -> String {
        let ratio = ConceptText.ratio(formatCount(min(step.current, step.target)), formatCount(step.target))
        guard step.kind == .rank else { return ratio }
        return String(localized: "game.rank.glory", defaultValue: "Gloire \(ratio)", bundle: .main)
    }

    /// L'état de l'étape en une ligne : « faite », ou où elle en est.
    static func levelStepState(_ step: GameLevelStep) -> String {
        step.met ? levelStepDone : levelStepProgress(step)
    }

    /// Ce que VoiceOver dit de l'étape : la ligne, puis son état.
    static func levelStepAccessibility(_ step: GameLevelStep) -> String {
        levelStepLine(step) + ", " + levelStepState(step)
    }

    /// Pourquoi le niveau attend : les points sont là, l'étape manque.
    static func levelHeld(_ step: GameLevelStep) -> String {
        let what = levelStepGoal(step)
        let level = formatCount(step.level)
        return String(
            localized: "game.level.held",
            defaultValue: "Tes points ouvrent déjà la suite : \(what) pour passer le niveau \(level).",
            bundle: .main
        )
    }

    static func materialName(_ material: GameMaterial) -> String {
        switch material {
        case .copper: String(localized: "game.material.copper", defaultValue: "Cuivre", bundle: .main)
        case .bronze: String(localized: "game.material.bronze", defaultValue: "Bronze", bundle: .main)
        case .silver: String(localized: "game.material.silver", defaultValue: "Argent", bundle: .main)
        case .gold: String(localized: "game.material.gold", defaultValue: "Or", bundle: .main)
        case .platinum: String(localized: "game.material.platinum", defaultValue: "Platine", bundle: .main)
        case .obsidian: String(localized: "game.material.obsidian", defaultValue: "Obsidienne", bundle: .main)
        case .prism: String(localized: "game.material.prism", defaultValue: "Prisme", bundle: .main)
        case .flame: String(localized: "game.material.flame", defaultValue: "Flamme", bundle: .main)
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
        rankLabel(rank, division5: division.map(GloryDivision5.init(legacy:)))
    }

    /// Le rang et sa division V–I (#9636) ; le Mythe dit sa PLACE quand le serveur la sert : « Mythe n° 42 ».
    static func rankLabel(_ rank: GloryRank, division5: GloryDivision5?, mythic: MythicSeatRef? = nil) -> String {
        if rank == .mythe, let mythic, mythic.isValid {
            return mythicSeatLabel(seat: mythic.number)
        }
        guard let division5 else { return rankName(rank) }
        return "\(rankName(rank)) \(division5.roman)"
    }

    /// Le rang servi par le bloc du jeu : division V–I, ou « Mythe n° 42 ».
    static func rankLabel(_ glory: GameBlock.Glory) -> String {
        rankLabel(glory.rank, division5: glory.shownDivision, mythic: glory.mythicSeat)
    }

    /// Le rang d'un autre, tel que son profil le montre.
    static func rankLabel(_ standing: GameStanding) -> String {
        rankLabel(standing.rank, division5: standing.shownDivision, mythic: standing.mythic)
    }

    static func mythicSeatLabel(seat: Int) -> String {
        let value = formatCount(seat)
        return String(localized: "game.rank.mythe_seat", defaultValue: "Mythe n° \(value)", bundle: .main)
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
        case "react-messages", "duo-reactions":
            return one
                ? String(localized: "game.mission.react_messages.one", defaultValue: "Réagir à \(n) message", bundle: .main)
                : String(localized: "game.mission.react_messages.other", defaultValue: "Réagir à \(n) messages", bundle: .main)
        case "send-voice", "duo-voice":
            return one
                ? String(localized: "game.mission.send_voice.one", defaultValue: "Envoyer un message vocal", bundle: .main)
                : String(localized: "game.mission.send_voice.other", defaultValue: "Envoyer \(n) messages vocaux", bundle: .main)
        case "send-texts", "duo-messages":
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
        case "duo-replies":
            return String(localized: "game.mission.reply_conversations", defaultValue: "Répondre dans \(n) conversations différentes", bundle: .main)
        case "reply-conversations", "reply-conversations-wide", "gold-reply-conversations":
            return one
                ? String(localized: "game.mission.write_conversations.one", defaultValue: "Écrire dans une conversation", bundle: .main)
                : String(localized: "game.mission.write_conversations.other", defaultValue: "Écrire dans \(n) conversations différentes", bundle: .main)
        case "comment-text":
            return one
                ? String(localized: "game.mission.comment_text.one", defaultValue: "Commenter le post de quelqu’un", bundle: .main)
                : String(localized: "game.mission.comment_text.other", defaultValue: "Commenter \(n) posts des autres", bundle: .main)
        case "publish-story", "duo-stories":
            return one
                ? String(localized: "game.mission.publish_story.one", defaultValue: "Publier une story", bundle: .main)
                : String(localized: "game.mission.publish_story.other", defaultValue: "Publier \(n) stories", bundle: .main)
        case "publish-post", "publish-posts":
            return one
                ? String(localized: "game.mission.publish_post.one", defaultValue: "Publier un post", bundle: .main)
                : String(localized: "game.mission.publish_post.other", defaultValue: "Publier \(n) posts", bundle: .main)
        case "share-link":
            return one
                ? String(localized: "game.mission.share_link.one", defaultValue: "Partager un post", bundle: .main)
                : String(localized: "game.mission.share_link.other", defaultValue: "Partager \(n) posts", bundle: .main)
        case "prism-foreign-messages", "duo-prism":
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
        case "react-posts":
            return one
                ? String(localized: "game.mission.react_posts.one", defaultValue: "Réagir à un post", bundle: .main)
                : String(localized: "game.mission.react_posts.other", defaultValue: "Réagir à \(n) posts", bundle: .main)
        case "reply-story":
            return one
                ? String(localized: "game.mission.reply_story.one", defaultValue: "Répondre à une story", bundle: .main)
                : String(localized: "game.mission.reply_story.other", defaultValue: "Répondre à \(n) stories", bundle: .main)
        case "join-community":
            return one
                ? String(localized: "game.mission.join_community.one", defaultValue: "Rejoindre une communauté", bundle: .main)
                : String(localized: "game.mission.join_community.other", defaultValue: "Rejoindre \(n) communautés", bundle: .main)
        case "write-someone-new":
            return one
                ? String(localized: "game.mission.write_someone_new.one", defaultValue: "Écrire à quelqu’un pour la première fois", bundle: .main)
                : String(localized: "game.mission.write_someone_new.other", defaultValue: "Écrire à \(n) personnes pour la première fois", bundle: .main)
        case "start-conversation":
            return one
                ? String(localized: "game.mission.start_conversation.one", defaultValue: "Démarrer une conversation", bundle: .main)
                : String(localized: "game.mission.start_conversation.other", defaultValue: "Démarrer \(n) conversations", bundle: .main)
        case "community-hello":
            return one
                ? String(localized: "game.mission.community_hello.one", defaultValue: "Te présenter dans une communauté", bundle: .main)
                : String(localized: "game.mission.community_hello.other", defaultValue: "Te présenter dans \(n) communautés", bundle: .main)
        case "comment-stranger-post":
            return one
                ? String(localized: "game.mission.comment_stranger_post.one", defaultValue: "Commenter le post public de quelqu’un que tu ne connais pas", bundle: .main)
                : String(localized: "game.mission.comment_stranger_post.other", defaultValue: "Commenter \(n) posts publics de personnes que tu ne connais pas", bundle: .main)
        case "cross-language-chat":
            return one
                ? String(localized: "game.mission.cross_language_chat.one", defaultValue: "Échanger avec quelqu’un qui parle une autre langue", bundle: .main)
                : String(localized: "game.mission.cross_language_chat.other", defaultValue: "Échanger avec \(n) personnes qui parlent une autre langue", bundle: .main)
        case "reply-their-language":
            return one
                ? String(localized: "game.mission.reply_their_language.one", defaultValue: "Répondre à quelqu’un dans sa langue", bundle: .main)
                : String(localized: "game.mission.reply_their_language.other", defaultValue: "Répondre \(n) fois à quelqu’un dans sa langue", bundle: .main)
        case "create-invite-link":
            return one
                ? String(localized: "game.mission.create_invite_link.one", defaultValue: "Créer ton lien d’invitation", bundle: .main)
                : String(localized: "game.mission.create_invite_link.other", defaultValue: "Créer \(n) liens d’invitation", bundle: .main)
        case "invite-contact":
            return one
                ? String(localized: "game.mission.invite_contact.one", defaultValue: "Inviter un contact sur Meeshy", bundle: .main)
                : String(localized: "game.mission.invite_contact.other", defaultValue: "Inviter \(n) contacts sur Meeshy", bundle: .main)
        case "invite-joined":
            return one
                ? String(localized: "game.mission.invite_joined.one", defaultValue: "Faire rejoindre Meeshy à une personne invitée", bundle: .main)
                : String(localized: "game.mission.invite_joined.other", defaultValue: "Faire rejoindre Meeshy à \(n) personnes invitées", bundle: .main)
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
        case .requestIdConflict:
            String(localized: "game.error.request_id_conflict", defaultValue: "Cette demande a déjà servi pour une autre action : réessaie.", bundle: .main)
        case .leagueLocked:
            String(localized: "game.error.league_locked", defaultValue: "Les ligues s’ouvrent au niveau 10.", bundle: .main)
        case .leagueMinor:
            String(localized: "game.error.league_minor", defaultValue: "La ligue publique est réservée aux comptes dont la majorité est vérifiée.", bundle: .main)
        case .leagueConsentRequired:
            String(localized: "game.error.league_consent_required", defaultValue: "Accepte d’abord de rejoindre la ligue publique.", bundle: .main)
        case .leaguePseudonymInvalid:
            String(localized: "game.error.league_pseudonym_invalid", defaultValue: "Ce pseudonyme n’est pas valable : 3 à 20 lettres, chiffres, points, tirets ou tirets bas.", bundle: .main)
        case .leaguePseudonymTaken:
            String(localized: "game.error.league_pseudonym_taken", defaultValue: "Ce pseudonyme est déjà pris.", bundle: .main)
        case .leaguePseudonymForbidden:
            String(localized: "game.error.league_pseudonym_forbidden", defaultValue: "Ce pseudonyme n’est pas permis : ni un nom réservé, ni ton nom.", bundle: .main)
        case .duoLocked:
            String(localized: "game.error.duo_locked", defaultValue: "Le duo s’ouvre au niveau 20, pour vous deux.", bundle: .main)
        case .duoNotFriends:
            String(localized: "game.error.duo_not_friends", defaultValue: "Le duo se joue avec un ami accepté.", bundle: .main)
        case .duoAlreadyActive:
            String(localized: "game.error.duo_already_active", defaultValue: "L’un de vous a déjà un duo cette semaine.", bundle: .main)
        case .duoNotFound:
            String(localized: "game.error.duo_not_found", defaultValue: "Ce duo n’existe plus : l’écran se remet à jour.", bundle: .main)
        case .duoTransitionRefused:
            String(localized: "game.error.duo_transition_refused", defaultValue: "Ce geste n’a pas de sens pour ce duo.", bundle: .main)
        case .seasonNotOpen:
            String(localized: "game.error.season_not_open", defaultValue: "Aucune saison n’est ouverte pour l’instant.", bundle: .main)
        case .seasonStepNotFound:
            String(localized: "game.error.season_step_not_found", defaultValue: "Cette étape n’existe pas.", bundle: .main)
        case .seasonStepLocked:
            String(localized: "game.error.season_step_locked", defaultValue: "Cette étape n’est pas encore atteinte.", bundle: .main)
        case .seasonStepAlreadyClaimed:
            String(localized: "game.error.season_step_already_claimed", defaultValue: "Cette récompense est déjà réclamée.", bundle: .main)
        case .sealAlreadyOwned:
            String(localized: "game.error.seal_already_owned", defaultValue: "Tu as déjà le Sceau de cette saison.", bundle: .main)
        case .prestigeLevelTooLow:
            String(localized: "game.error.prestige_level_too_low", defaultValue: "Le Prestige s’ouvre au niveau 100.", bundle: .main)
        case .prestigeAtMaximum:
            String(localized: "game.error.prestige_at_maximum", defaultValue: "Tu as déjà posé les cinq étoiles du Prestige.", bundle: .main)
        case nil:
            String(localized: "game.error.generic", defaultValue: "Ça n’a pas abouti — vérifie ta connexion et réessaie.", bundle: .main)
        }
    }

    static func errorMessage(for error: Error) -> String {
        errorMessage(for: GameService.refusal(of: error))
    }

    // MARK: - Le minuteur d'une mission (#9539)

    static var personalMissionName: String {
        String(localized: "game.mission.personal", defaultValue: "Pour toi", bundle: .main)
    }

    /// Une durée CALME : des jours et des heures, puis des heures et des minutes, puis des minutes — jamais de secondes.
    static func calmDuration(_ seconds: TimeInterval) -> String {
        let minutes = max(1, Int((seconds / 60).rounded(.up)))
        let days = minutes / (24 * 60)
        let hours = (minutes % (24 * 60)) / 60
        let rest = minutes % 60
        if days >= 1 { return GameText.durationDaysHours(days: formatCount(days), hours: formatCount(hours)) }
        if hours >= 1 {
            let head = GameText.durationHours(hours: formatCount(hours))
            return rest == 0 ? head : head + " " + GameText.durationMinutes(minutes: formatCount(rest))
        }
        return GameText.durationMinutes(minutes: formatCount(minutes))
    }

    /// Ce que dit une carte une fois sa plage passée : « Terminée » (elle était faite) ou « Manquée ». `nil` tant que la
    /// plage court — alors c'est le minuteur qui parle.
    static func missionEnding(_ phase: GameMissionClock.Phase?) -> (text: String, isSuccess: Bool)? {
        switch phase {
        case .finished: (String(localized: "game.mission.finished", defaultValue: "Terminée", bundle: .main), true)
        case .missed: (String(localized: "game.mission.missed", defaultValue: "Manquée", bundle: .main), false)
        default: nil
        }
    }

    /// La ligne du minuteur : « Il reste 1 h 23 min » pendant la plage, « Commence dans 12 min » avant, et pour la mission
    /// personnelle la plage elle-même (« 14:00 – 16:00 ») une fois passée. `nil` quand rien n'est à dire.
    static func missionTimerLine(_ phase: GameMissionClock.Phase?, window: GameMissionWindow?, locale: Locale = .current,
                                 calendar: Calendar = .current) -> String? {
        switch phase {
        case .running(let remaining):
            let left = calmDuration(remaining)
            return String(localized: "game.mission.timer.remaining", defaultValue: "Il reste \(left)", bundle: .main)
        case .upcoming(let startsIn):
            let wait = calmDuration(startsIn)
            return String(localized: "game.mission.timer.starts", defaultValue: "Commence dans \(wait)", bundle: .main)
        case .finished, .missed:
            guard let window, let start = window.start, let end = window.end else { return nil }
            return windowRange(start: start, end: end, locale: locale, calendar: calendar)
        case .done, nil:
            return nil
        }
    }

    /// « 14:00 – 16:00 », écrit par la locale.
    static func windowRange(start: Date, end: Date, locale: Locale = .current, calendar: Calendar = .current) -> String {
        func time(_ date: Date) -> String {
            date.formatted(Date.FormatStyle(date: .omitted, time: .shortened, locale: locale, calendar: calendar, timeZone: calendar.timeZone))
        }
        return time(start) + " – " + time(end)
    }

    // MARK: - Les chiffres lus à voix haute

    /// Une heure du jour, écrite par la locale (chiffres et 12 h / 24 h de l'appareil), jamais à la main.
    static func clock(minuteOfDay: Int, locale: Locale = .current, calendar: Calendar = .current) -> String {
        let midnight = calendar.startOfDay(for: Date(timeIntervalSince1970: 1_790_000_000))
        let moment = calendar.date(byAdding: .minute, value: minuteOfDay, to: midnight) ?? midnight
        return moment.formatted(Date.FormatStyle(date: .omitted, time: .shortened, locale: locale, calendar: calendar, timeZone: calendar.timeZone))
    }

    /// « 1 chance sur 6 ».
    static func chance(_ fraction: Double) -> String {
        let denominator = fraction > 0 ? Int((1 / fraction).rounded()) : 0
        return String(localized: "game.chest.chance", defaultValue: "1 chance sur \(formatCount(denominator))", bundle: .main)
    }
}

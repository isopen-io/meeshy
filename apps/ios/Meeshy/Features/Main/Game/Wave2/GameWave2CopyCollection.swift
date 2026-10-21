import Foundation
import MeeshySDK

// MARK: - Ce que la vague 2 du jeu dit — collection (suite de `GameText`, voir `GameWave2CopyCommon.swift`)

extension GameText {
    static var seasonTitle: String { String(localized: "game2.season.title", defaultValue: "Voyage", bundle: .main) }

    static func seasonHeading(number: String, week: String, total: String) -> String {
        String(localized: "game2.season.heading", defaultValue: "Voyage \(number) · semaine \(week) sur \(total)", bundle: .main)
    }

    static func seasonTheme(theme: String) -> String {
        String(localized: "game2.season.theme", defaultValue: "Thème : \(theme)", bundle: .main)
    }

    static func seasonStars(count: Int) -> String {
        let number = GameCopy.formatCount(count)
        return GameCopy.isSingular(count)
            ? String(localized: "game2.season.stars.one", defaultValue: "\(number) pas", bundle: .main)
            : String(localized: "game2.season.stars.other", defaultValue: "\(number) pas", bundle: .main)
    }

    static func seasonHow(per: String) -> String {
        String(localized: "game2.season.how", defaultValue: "Chaque acte réalisé et chaque alliance te font avancer de quelques pas : \(per) pas mènent à la halte suivante. Tout le voyage est gratuit.", bundle: .main)
    }

    static func seasonToNext(stars: String) -> String {
        String(localized: "game2.season.to_next", defaultValue: "\(stars) jusqu’à la halte suivante", bundle: .main)
    }

    static func seasonStepsLine(steps: String, total: String) -> String {
        String(localized: "game2.season.steps_line", defaultValue: "Halte \(steps) sur \(total)", bundle: .main)
    }

    static var seasonPath: String { String(localized: "game2.season.path", defaultValue: "Chemin gratuit", bundle: .main) }

    static func seasonStep(step: String) -> String {
        String(localized: "game2.season.step", defaultValue: "Halte \(step)", bundle: .main)
    }

    static var seasonStepClaimed: String { String(localized: "game2.season.step.claimed", defaultValue: "réclamée", bundle: .main) }

    static var seasonStepReady: String { String(localized: "game2.season.step.ready", defaultValue: "à réclamer", bundle: .main) }

    static var seasonStepLocked: String { String(localized: "game2.season.step.locked", defaultValue: "à venir", bundle: .main) }

    static var seasonRewardFragment: String { String(localized: "game2.season.reward.fragment", defaultValue: "Un fragment d’étoile", bundle: .main) }

    static var seasonRewardFreeze: String { String(localized: "game2.season.reward.freeze", defaultValue: "Une Veilleuse pour ta Flamme", bundle: .main) }

    static var seasonRewardSeasonCup: String { String(localized: "game2.season.reward.season-cup", defaultValue: "La coupe du voyage", bundle: .main) }

    static func seasonClaim(step: String) -> String {
        String(localized: "game2.season.claim", defaultValue: "Réclamer la halte \(step)", bundle: .main)
    }

    /// La Gloire dite est celle que la passerelle verse (`GameGlory.points.season`), jamais un nombre recopié (#9674).
    static var seasonCompleted: String { seasonCompleted(glory: GameCopy.formatCount(GameGlory.points.season)) }
    static func seasonCompleted(glory: String) -> String {
        String(localized: "game2.season.completed", defaultValue: "Voyage accompli : une coupe, une médaille datée et \(glory) de gloire.", bundle: .main)
    }

    static var seasonNone: String { String(localized: "game2.season.none", defaultValue: "Aucun voyage n’est en cours pour l’instant. Le prochain part bientôt.", bundle: .main) }

    /// « La saison 1 ouvre le 21 décembre 2026. » — la saison à venir (#10014), plutôt qu'un vide.
    static func seasonUpcoming(number: String, date: String) -> String {
        String(localized: "game2.season.upcoming", defaultValue: "Le voyage \(number) part le \(date).", bundle: .main)
    }

    static var seasonSealTitle: String { String(localized: "game2.season.seal.title", defaultValue: "Le Sceau du voyage", bundle: .main) }

    static func seasonSealBody(every: String) -> String {
        String(localized: "game2.season.seal.body", defaultValue: "Le Sceau est purement décoratif : un objet à collectionner toutes les \(every) haltes, qui ne change rien au jeu.", bundle: .main)
    }

    static func seasonSealBuy(price: String) -> String {
        String(localized: "game2.season.seal.buy", defaultValue: "Prendre le Sceau · \(price)", bundle: .main)
    }

    static var seasonSealOwned: String { String(localized: "game2.season.seal.owned", defaultValue: "Tu as le Sceau de ce voyage.", bundle: .main) }

    static var seasonSealCosmetic: String { String(localized: "game2.season.seal.cosmetic", defaultValue: "Objet du Sceau", bundle: .main) }

    static func trophyLeagueCup(cup: String, league: String, date: String) -> String {
        String(localized: "game2.trophy.league-cup", defaultValue: "\(cup) — joute \(league), semaine du \(date)", bundle: .main)
    }

    static func trophySeasonCup(number: String) -> String {
        String(localized: "game2.trophy.season-cup", defaultValue: "Coupe du voyage \(number)", bundle: .main)
    }

    static func trophyPrestige(number: String) -> String {
        String(localized: "game2.trophy.prestige", defaultValue: "Trophée de Renaissance \(number)", bundle: .main)
    }

    static func trophyFlame(days: String) -> String {
        String(localized: "game2.trophy.flame", defaultValue: "Trophée de Flamme, \(days)", bundle: .main)
    }

    static func trophyPlateLeague(league: String, week: String) -> String {
        String(localized: "game2.trophy.plate.league", defaultValue: "\(league) · S\(week)", bundle: .main)
    }

    static func trophyLeagueCupMonth(cup: String, league: String, month: String) -> String {
        String(localized: "game2.trophy.league-cup-month", defaultValue: "\(cup) — joute \(league), \(month)", bundle: .main)
    }

    static func trophyPlateLeagueMonth(league: String, month: String) -> String {
        String(localized: "game2.trophy.plate.league-month", defaultValue: "\(league) · \(month)", bundle: .main)
    }

    static func trophyPlateSeason(number: String) -> String {
        String(localized: "game2.trophy.plate.season", defaultValue: "VOYAGE \(number)", bundle: .main)
    }

    static func trophyPlatePrestige(number: String) -> String {
        String(localized: "game2.trophy.plate.prestige", defaultValue: "RENAISSANCE \(number)", bundle: .main)
    }

    static func trophyPlateFlame(days: String) -> String {
        String(localized: "game2.trophy.plate.flame", defaultValue: "\(days) JOURS", bundle: .main)
    }

    static var showcaseTitle: String { String(localized: "game2.showcase.title", defaultValue: "Tes trophées", bundle: .main) }

    static var showcaseEmpty: String { String(localized: "game2.showcase.empty", defaultValue: "Tes trophées t’attendent. Les coupes de joute et de voyage, les trophées de Renaissance et de Flamme s’y rangent à mesure que tu les gagnes.", bundle: .main) }

    static var showcaseOrderHint: String { String(localized: "game2.showcase.order_hint", defaultValue: "Range tes trophées : monte ou descends chacun d’un cran.", bundle: .main) }

    static func showcaseMoveUp(name: String) -> String {
        String(localized: "game2.showcase.move_up", defaultValue: "Monter : \(name)", bundle: .main)
    }

    static func showcaseMoveDown(name: String) -> String {
        String(localized: "game2.showcase.move_down", defaultValue: "Descendre : \(name)", bundle: .main)
    }

    static func showcaseAwarded(date: String) -> String {
        String(localized: "game2.showcase.awarded", defaultValue: "Obtenu le \(date)", bundle: .main)
    }

    static var showcaseVisibility: String { String(localized: "game2.showcase.visibility", defaultValue: "Qui voit tes trophées", bundle: .main) }

    static var showcaseVisibilityHint: String { String(localized: "game2.showcase.visibility_hint", defaultValue: "Un visiteur ne voit que le mois d’obtention, jamais la date exacte. « Moi seul » cache tes trophées à tous les autres.", bundle: .main) }

    static var atlasTitle: String { String(localized: "game2.atlas.title", defaultValue: "Atlas des langues", bundle: .main) }

    static var atlasIntro: String { String(localized: "game2.atlas.intro", defaultValue: "Chaque langue avec laquelle tu as vraiment échangé — un message envoyé et un reçu avec quelqu’un qui l’écrit — pose un tampon dans ton passeport.", bundle: .main) }

    static func atlasCount(stamped: String, total: String) -> String {
        String(localized: "game2.atlas.count", defaultValue: "\(stamped) langues sur \(total)", bundle: .main)
    }

    static func atlasRemaining(remaining: String) -> String {
        String(localized: "game2.atlas.remaining", defaultValue: "\(remaining) langues à découvrir", bundle: .main)
    }

    static var atlasStamps: String { String(localized: "game2.atlas.stamps", defaultValue: "Tes tampons", bundle: .main) }

    static func atlasStampedOn(date: String) -> String {
        String(localized: "game2.atlas.stamped_on", defaultValue: "Tampon du \(date)", bundle: .main)
    }

    static var atlasPending: String { String(localized: "game2.atlas.pending", defaultValue: "Échanges à moitié faits", bundle: .main) }

    static var atlasPendingSent: String { String(localized: "game2.atlas.pending.sent", defaultValue: "envoyé — il manque un message reçu", bundle: .main) }

    static var atlasPendingReceived: String { String(localized: "game2.atlas.pending.received", defaultValue: "reçu — il manque un message envoyé", bundle: .main) }

    static var atlasEmpty: String { String(localized: "game2.atlas.empty", defaultValue: "Pas encore de tampon. Écris dans une autre langue : dès qu’on te répond, le premier arrive.", bundle: .main) }

    static var atlasPrivacy: String { String(localized: "game2.atlas.privacy", defaultValue: "Ton Atlas est privé par défaut : une langue peut en dire long sur toi. Tu choisis qui le voit. Le jeu garde la langue, les deux sens et la date — jamais l’interlocuteur ni la conversation.", bundle: .main) }

    static var atlasVisibility: String { String(localized: "game2.atlas.visibility", defaultValue: "Qui voit ton Atlas", bundle: .main) }

    static var prestigeTitle: String { String(localized: "game2.prestige.title", defaultValue: "Renaissance", bundle: .main) }

    static func prestigeStars(stars: String, max: String) -> String {
        String(localized: "game2.prestige.stars", defaultValue: "Renaissances : \(stars) sur \(max)", bundle: .main)
    }

    static func prestigeLocked(level: String) -> String {
        String(localized: "game2.prestige.locked", defaultValue: "La Renaissance s’ouvre au niveau 100. Tu es au niveau \(level).", bundle: .main)
    }

    static var prestigeMax: String { String(localized: "game2.prestige.max", defaultValue: "Ta légende a vécu ses cinq renaissances : le sommet du sommet.", bundle: .main) }

    static var prestigeMee: String { String(localized: "game2.prestige.mee", defaultValue: "Niveau 100 : ta lumière peut renaître, ou grandir encore.", bundle: .main) }

    static func prestigeMeo(glory: String) -> String {
        String(localized: "game2.prestige.meo", defaultValue: "En renaissant, ta lumière redevient Étincelle : ton niveau repart à 1 et tes étincelles à 0. Ce que tu as reçu depuis toujours et ta plus haute lumière restent gravés. Tes aïeux t’offrent un nouvel Âge, un trophée numéroté et \(glory) de gloire. Ton rang ne recule jamais.", bundle: .main)
    }

    static func prestigeConfirmTitle(number: String) -> String {
        String(localized: "game2.prestige.confirm.title", defaultValue: "Commencer ta Renaissance \(number) ?", bundle: .main)
    }

    static var prestigeConfirmResets: String { String(localized: "game2.prestige.confirm.resets", defaultValue: "Ce qui repart : ton niveau (à 1) et les étincelles de ta lumière (à 0).", bundle: .main) }

    static var prestigeConfirmKeeps: String { String(localized: "game2.prestige.confirm.keeps", defaultValue: "Ce qui reste : tes étincelles reçues depuis toujours, ta plus haute lumière, ton rang, ta gloire, tes Meeshes, ta Flamme et tes trophées.", bundle: .main) }

    static var prestigeConfirmAccess: String { String(localized: "game2.prestige.confirm.access", defaultValue: "Bonne nouvelle : ta joute (niveau 10) et ton alliance (niveau 20) restent ouvertes, car elles lisent ta plus haute lumière.", bundle: .main) }

    /// Ce que le Prestige NE retire PAS : le consentement à la ligue publique reste enregistré — le niveau record repart à 1, la
    /// ligue (10) et le duo (20) se referment, mais le joueur retrouve sa ligue sans rien reconsentir (décision porteur).
    static var prestigeConfirmConsent: String { String(localized: "game2.prestige.confirm.consent", defaultValue: "Ton accord pour la joute publique reste enregistré : tu retrouves ta joute au niveau 10.", bundle: .main) }

    /// Les lignes de la confirmation, dans l'ordre où elles se lisent : ce qui repart, ce qui reste, la porte qui se referme, et ce
    /// qui survit à cette porte.
    static var prestigeConfirmationLines: [String] {
        [prestigeConfirmResets, prestigeConfirmKeeps, prestigeConfirmAccess, prestigeConfirmConsent]
    }

    static var prestigeGo: String { String(localized: "game2.prestige.go", defaultValue: "Renaître", bundle: .main) }

    static var prestigeStay: String { String(localized: "game2.prestige.stay", defaultValue: "Continuer à briller", bundle: .main) }

    static func prestigeDone(number: String) -> String {
        String(localized: "game2.prestige.done", defaultValue: "Renaissance \(number) ! Ta légende entre dans un nouvel Âge.", bundle: .main)
    }

    static var rarityCommon: String { String(localized: "game2.rarity.common", defaultValue: "Commun", bundle: .main) }

    static var rarityRare: String { String(localized: "game2.rarity.rare", defaultValue: "Rare", bundle: .main) }

    static var rarityEpic: String { String(localized: "game2.rarity.epic", defaultValue: "Épique", bundle: .main) }

    static var rarityLegendary: String { String(localized: "game2.rarity.legendary", defaultValue: "Légendaire", bundle: .main) }

    static var rarityMythic: String { String(localized: "game2.rarity.mythic", defaultValue: "Mythique", bundle: .main) }

    static func rarityShare(percent: String) -> String {
        String(localized: "game2.rarity.share", defaultValue: "\(percent) des comptes", bundle: .main)
    }

    static func rarityAria(name: String, share: String) -> String {
        String(localized: "game2.rarity.aria", defaultValue: "Rareté : \(name), \(share)", bundle: .main)
    }

    static var rarityMeasuring: String { String(localized: "game2.rarity.measuring", defaultValue: "Rareté en cours de mesure", bundle: .main) }

}

// MARK: - La constellation (#10053) — mêmes clés et mêmes textes que le web (`game.constellation.*`)

extension GameText {
    static var constellationTitle: String { String(localized: "game.constellation.title", defaultValue: "Le ciel des aïeux", bundle: .main) }

    static func constellationStars(_ count: Int) -> String {
        let number = GameCopy.formatCount(count)
        return GameCopy.isSingular(count)
            ? String(localized: "game.constellation.stars.one", defaultValue: "\(number) étoile allumée", bundle: .main)
            : String(localized: "game.constellation.stars.other", defaultValue: "\(number) étoiles allumées", bundle: .main)
    }

    static func constellationNext(_ count: Int) -> String {
        let number = GameCopy.formatCount(count)
        return GameCopy.isSingular(count)
            ? String(localized: "game.constellation.next.one", defaultValue: "\(number) fragment d’étoile jusqu’à la prochaine étoile", bundle: .main)
            : String(localized: "game.constellation.next.other", defaultValue: "\(number) fragments d’étoile jusqu’à la prochaine étoile", bundle: .main)
    }

    static var constellationHow: String {
        String(localized: "game.constellation.how", defaultValue: "Dans le ciel de tes aïeux, dix fragments d’étoile allument une étoile. Chacune t’offre une parure de profil, sans avantage de jeu.", bundle: .main)
    }

    static var constellationCosmetics: String { String(localized: "game.constellation.cosmetics", defaultValue: "Parures offertes", bundle: .main) }

    static func constellationCosmetic(kind: String, star: String) -> String {
        String(localized: "game.constellation.cosmetic", defaultValue: "\(kind) · étoile \(star)", bundle: .main)
    }

    static func constellationKind(_ kind: ConstellationCosmeticKind) -> String {
        switch kind {
        case .halo: String(localized: "game.constellation.kind.halo", defaultValue: "Halo", bundle: .main)
        case .frame: String(localized: "game.constellation.kind.frame", defaultValue: "Cadre", bundle: .main)
        case .sparkle: String(localized: "game.constellation.kind.sparkle", defaultValue: "Scintillement", bundle: .main)
        }
    }

    static var constellationVisibility: String {
        String(localized: "game.constellation.visibility", defaultValue: "Ton ciel et ses parures se montrent selon le réglage de tes trophées.", bundle: .main)
    }
}

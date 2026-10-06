import Foundation

// MARK: - Ce que la vague 2 du jeu dit — collection (suite de `GameText`, voir `GameWave2CopyCommon.swift`)

extension GameText {
    static var seasonTitle: String { String(localized: "game2.season.title", defaultValue: "Saison", bundle: .main) }

    static func seasonHeading(number: String, week: String, total: String) -> String {
        String(localized: "game2.season.heading", defaultValue: "Saison \(number) · semaine \(week) sur \(total)", bundle: .main)
    }

    static func seasonTheme(theme: String) -> String {
        String(localized: "game2.season.theme", defaultValue: "Thème : \(theme)", bundle: .main)
    }

    static func seasonStars(count: Int) -> String {
        let number = GameCopy.formatCount(count)
        return GameCopy.isSingular(count)
            ? String(localized: "game2.season.stars.one", defaultValue: "\(count) étoile", bundle: .main)
            : String(localized: "game2.season.stars.other", defaultValue: "\(count) étoiles", bundle: .main)
    }

    static func seasonHow(per: String) -> String {
        String(localized: "game2.season.how", defaultValue: "Les missions du jour et le duo donnent des étoiles : \(per) étoiles ouvrent une étape. Tout le parcours est gratuit.", bundle: .main)
    }

    static func seasonToNext(stars: String) -> String {
        String(localized: "game2.season.to_next", defaultValue: "Encore \(stars) pour l’étape suivante", bundle: .main)
    }

    static func seasonStepsLine(steps: String, total: String) -> String {
        String(localized: "game2.season.steps_line", defaultValue: "Étape \(steps) sur \(total)", bundle: .main)
    }

    static var seasonPath: String { String(localized: "game2.season.path", defaultValue: "Parcours gratuit", bundle: .main) }

    static func seasonStep(step: String) -> String {
        String(localized: "game2.season.step", defaultValue: "Étape \(step)", bundle: .main)
    }

    static var seasonStepClaimed: String { String(localized: "game2.season.step.claimed", defaultValue: "réclamée", bundle: .main) }

    static var seasonStepReady: String { String(localized: "game2.season.step.ready", defaultValue: "à réclamer", bundle: .main) }

    static var seasonStepLocked: String { String(localized: "game2.season.step.locked", defaultValue: "à venir", bundle: .main) }

    static var seasonRewardFragment: String { String(localized: "game2.season.reward.fragment", defaultValue: "Un fragment", bundle: .main) }

    static var seasonRewardFreeze: String { String(localized: "game2.season.reward.freeze", defaultValue: "Un gel de Flamme", bundle: .main) }

    static var seasonRewardSeasonCup: String { String(localized: "game2.season.reward.season-cup", defaultValue: "La coupe de saison", bundle: .main) }

    static func seasonClaim(step: String) -> String {
        String(localized: "game2.season.claim", defaultValue: "Réclamer l’étape \(step)", bundle: .main)
    }

    static var seasonCompleted: String { String(localized: "game2.season.completed", defaultValue: "Parcours terminé : une coupe, un badge daté et 500 de Gloire.", bundle: .main) }

    static var seasonNone: String { String(localized: "game2.season.none", defaultValue: "Aucune saison n’est ouverte pour l’instant. La prochaine commence bientôt.", bundle: .main) }

    static var seasonSealTitle: String { String(localized: "game2.season.seal.title", defaultValue: "Rangée Sceau", bundle: .main) }

    static func seasonSealBody(every: String) -> String {
        String(localized: "game2.season.seal.body", defaultValue: "Le Sceau est purement décoratif : un objet à collectionner toutes les \(every) étapes, qui ne change rien au jeu.", bundle: .main)
    }

    static func seasonSealBuy(price: String) -> String {
        String(localized: "game2.season.seal.buy", defaultValue: "Prendre le Sceau · \(price)", bundle: .main)
    }

    static var seasonSealOwned: String { String(localized: "game2.season.seal.owned", defaultValue: "Tu as le Sceau de cette saison.", bundle: .main) }

    static var seasonSealMissing: String { String(localized: "game2.season.seal.missing", defaultValue: "Il te manque des Meeshes pour le Sceau.", bundle: .main) }

    static var seasonSealCosmetic: String { String(localized: "game2.season.seal.cosmetic", defaultValue: "Objet du Sceau", bundle: .main) }

    static func trophyLeagueCup(cup: String, league: String, date: String) -> String {
        String(localized: "game2.trophy.league-cup", defaultValue: "\(cup) — ligue \(league), semaine du \(date)", bundle: .main)
    }

    static func trophySeasonCup(number: String) -> String {
        String(localized: "game2.trophy.season-cup", defaultValue: "Coupe de la saison \(number)", bundle: .main)
    }

    static func trophyPrestige(number: String) -> String {
        String(localized: "game2.trophy.prestige", defaultValue: "Trophée de Prestige \(number)", bundle: .main)
    }

    static func trophyFlame(days: String) -> String {
        String(localized: "game2.trophy.flame", defaultValue: "Trophée de Flamme, \(days)", bundle: .main)
    }

    static func trophyPlateLeague(league: String, week: String) -> String {
        String(localized: "game2.trophy.plate.league", defaultValue: "\(league) · S\(week)", bundle: .main)
    }

    static func trophyLeagueCupMonth(cup: String, league: String, month: String) -> String {
        String(localized: "game2.trophy.league-cup-month", defaultValue: "\(cup) — ligue \(league), \(month)", bundle: .main)
    }

    static func trophyPlateLeagueMonth(league: String, month: String) -> String {
        String(localized: "game2.trophy.plate.league-month", defaultValue: "\(league) · \(month)", bundle: .main)
    }

    static func trophyPlateSeason(number: String) -> String {
        String(localized: "game2.trophy.plate.season", defaultValue: "SAISON \(number)", bundle: .main)
    }

    static func trophyPlatePrestige(number: String) -> String {
        String(localized: "game2.trophy.plate.prestige", defaultValue: "PRESTIGE \(number)", bundle: .main)
    }

    static func trophyPlateFlame(days: String) -> String {
        String(localized: "game2.trophy.plate.flame", defaultValue: "\(days) JOURS", bundle: .main)
    }

    static var showcaseTitle: String { String(localized: "game2.showcase.title", defaultValue: "Vitrine de trophées", bundle: .main) }

    static var showcaseEmpty: String { String(localized: "game2.showcase.empty", defaultValue: "Ta vitrine est vide. Les coupes de ligue, de saison, de Prestige et de Flamme s’y rangent à mesure que tu les gagnes.", bundle: .main) }

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

    static func showcaseAwardedMonth(month: String) -> String {
        String(localized: "game2.showcase.awarded_month", defaultValue: "Obtenu en \(month)", bundle: .main)
    }

    static func showcaseAwardedMonthCount(month: String, count: String) -> String {
        String(localized: "game2.showcase.awarded_month_count", defaultValue: "Obtenu en \(month) · ×\(count)", bundle: .main)
    }

    static var showcaseVisibility: String { String(localized: "game2.showcase.visibility", defaultValue: "Qui voit ta vitrine", bundle: .main) }

    static var showcaseVisibilityHint: String { String(localized: "game2.showcase.visibility_hint", defaultValue: "Un visiteur ne voit que le mois d’obtention, jamais la date exacte. « Moi seul » ferme la vitrine à tous les autres.", bundle: .main) }

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

    static var prestigeTitle: String { String(localized: "game2.prestige.title", defaultValue: "Prestige", bundle: .main) }

    static func prestigeStars(stars: String, max: String) -> String {
        String(localized: "game2.prestige.stars", defaultValue: "Étoiles : \(stars) sur \(max)", bundle: .main)
    }

    static func prestigeLocked(level: String) -> String {
        String(localized: "game2.prestige.locked", defaultValue: "Le Prestige s’ouvre au niveau 100. Tu es au niveau \(level).", bundle: .main)
    }

    static var prestigeMax: String { String(localized: "game2.prestige.max", defaultValue: "Tu as les cinq étoiles : le sommet du sommet.", bundle: .main) }

    static var prestigeMee: String { String(localized: "game2.prestige.mee", defaultValue: "Tu es au niveau 100 : le sommet ! Tu peux passer en Prestige.", bundle: .main) }

    static func prestigeMeo(glory: String) -> String {
        String(localized: "game2.prestige.meo", defaultValue: "Ton niveau repart à 1 et tes points en poche à 0. En échange : une étoile sur ton anneau, un trophée numéroté et \(glory) de Gloire. Ton rang ne baisse jamais.", bundle: .main)
    }

    static func prestigeConfirmTitle(number: String) -> String {
        String(localized: "game2.prestige.confirm.title", defaultValue: "Passer en Prestige \(number) ?", bundle: .main)
    }

    static var prestigeConfirmResets: String { String(localized: "game2.prestige.confirm.resets", defaultValue: "Ce qui repart : ton niveau (à 1) et tes points en poche (à 0).", bundle: .main) }

    static var prestigeConfirmKeeps: String { String(localized: "game2.prestige.confirm.keeps", defaultValue: "Ce qui reste : ton rang, ta Gloire, tes Meeshes, ta Flamme et tes trophées.", bundle: .main) }

    static var prestigeConfirmAccess: String { String(localized: "game2.prestige.confirm.access", defaultValue: "Attention : ta ligue (niveau 10) et ton duo (niveau 20) se referment tant que ton niveau record n’y est pas revenu.", bundle: .main) }

    static var prestigeGo: String { String(localized: "game2.prestige.go", defaultValue: "Passer en Prestige", bundle: .main) }

    static var prestigeStay: String { String(localized: "game2.prestige.stay", defaultValue: "Rester au sommet", bundle: .main) }

    static func prestigeDone(number: String) -> String {
        String(localized: "game2.prestige.done", defaultValue: "Prestige \(number) ! Une étoile de plus sur ton anneau.", bundle: .main)
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

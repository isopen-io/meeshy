import Foundation

// MARK: - Ce que la vague 2 du jeu dit — league (suite de `GameText`, voir `GameWave2CopyCommon.swift`)

extension GameText {
    static var leagueTitle: String { String(localized: "game2.league.title", defaultValue: "Ligue", bundle: .main) }

    static var leagueNameQuartz: String { String(localized: "game2.league.name.quartz", defaultValue: "Quartz", bundle: .main) }

    static var leagueNameAmbre: String { String(localized: "game2.league.name.ambre", defaultValue: "Ambre", bundle: .main) }

    static var leagueNameJade: String { String(localized: "game2.league.name.jade", defaultValue: "Jade", bundle: .main) }

    static var leagueNameSaphir: String { String(localized: "game2.league.name.saphir", defaultValue: "Saphir", bundle: .main) }

    static var leagueNameRubis: String { String(localized: "game2.league.name.rubis", defaultValue: "Rubis", bundle: .main) }

    static var leagueNameAmethyste: String { String(localized: "game2.league.name.amethyste", defaultValue: "Améthyste", bundle: .main) }

    static var leagueNameDiamant: String { String(localized: "game2.league.name.diamant", defaultValue: "Diamant", bundle: .main) }

    static var leagueNamePrisme: String { String(localized: "game2.league.name.prisme", defaultValue: "Prisme", bundle: .main) }

    static var leagueTabMine: String { String(localized: "game2.league.tab.mine", defaultValue: "Ma ligue", bundle: .main) }

    static var leagueTabFriends: String { String(localized: "game2.league.tab.friends", defaultValue: "Amis", bundle: .main) }

    static func leagueCloses(remaining: String) -> String {
        String(localized: "game2.league.closes", defaultValue: "Se ferme dans \(remaining)", bundle: .main)
    }

    static func leagueWeek(date: String) -> String {
        String(localized: "game2.league.week", defaultValue: "Semaine du \(date)", bundle: .main)
    }

    static func leagueLocked(level: String, current: String) -> String {
        String(localized: "game2.league.locked", defaultValue: "La ligue s’ouvre au niveau \(level) : chaque semaine, tu te mesures à 29 autres joueurs d’activité comparable. Tu es au niveau \(current).", bundle: .main)
    }

    static var leagueMinor: String { String(localized: "game2.league.minor", defaultValue: "La ligue publique n’est pas ouverte pour ton compte. La ligue entre amis, elle, l’est toujours.", bundle: .main) }

    static var leagueConsentTitle: String { String(localized: "game2.league.consent.title", defaultValue: "Rejoindre la ligue publique", bundle: .main) }

    static var leagueConsentShown: String { String(localized: "game2.league.consent.shown", defaultValue: "Ce que les autres voient : ton pseudonyme, ta ligue et ton total de points de la semaine, mis à jour une fois par jour à 4 h.", bundle: .main) }

    static var leagueConsentWho: String { String(localized: "game2.league.consent.who", defaultValue: "Qui le voit : jusqu’à 29 autres joueurs de ta ligue, que tu ne connais pas. Aucun nom, aucune photo, aucune langue.", bundle: .main) }

    static var leagueConsentHow: String { String(localized: "game2.league.consent.how", defaultValue: "Comment on te place : selon les points que tu gagnes, avec des joueurs d’activité comparable.", bundle: .main) }

    static var leagueConsentRisk: String { String(localized: "game2.league.consent.risk", defaultValue: "Un risque à connaître : d’un jour à l’autre, ton total montre que tu as joué ce jour-là.", bundle: .main) }

    static var leagueConsentWithdrawInfo: String { String(localized: "game2.league.consent.withdraw_info", defaultValue: "Tu peux retirer ton accord à tout moment, d’un geste, ici ou dans les réglages. Tes données de ligue sont supprimées au plus tard 4 semaines après.", bundle: .main) }

    static var leagueConsentAccept: String { String(localized: "game2.league.consent.accept", defaultValue: "J’accepte et je rejoins", bundle: .main) }

    static var leagueConsentLeave: String { String(localized: "game2.league.consent.leave", defaultValue: "Quitter la ligue publique", bundle: .main) }

    static var leaguePseudonymLabel: String { String(localized: "game2.league.pseudonym.label", defaultValue: "Pseudonyme de ligue (facultatif)", bundle: .main) }

    static var leaguePseudonymHint: String { String(localized: "game2.league.pseudonym.hint", defaultValue: "3 à 20 caractères. Ni ton nom, ni ton identifiant. Laisse vide : un pseudonyme t’est tiré au sort.", bundle: .main) }

    static var leaguePseudonymDrawn: String { String(localized: "game2.league.pseudonym.drawn", defaultValue: "Ton pseudonyme est tiré au sort : ni ton nom, ni ton identifiant. Il change à chaque saison.", bundle: .main) }

    static var leaguePseudonymSave: String { String(localized: "game2.league.pseudonym.save", defaultValue: "Changer de pseudonyme", bundle: .main) }

    static func leaguePseudonymCurrent(name: String) -> String {
        String(localized: "game2.league.pseudonym.current", defaultValue: "Tu joues sous le nom \(name).", bundle: .main)
    }

    static var leaguePseudonymInvalid: String { String(localized: "game2.league.pseudonym.invalid", defaultValue: "Ce pseudonyme n’est pas valable : 3 à 20 caractères, lettres, chiffres, point, tiret.", bundle: .main) }

    static var leagueWaiting: String { String(localized: "game2.league.waiting", defaultValue: "C’est noté. Un groupe t’est attribué au début de la semaine prochaine.", bundle: .main) }

    static func leagueRankLine(rank: String, size: String) -> String {
        String(localized: "game2.league.rank_line", defaultValue: "Rang \(rank) sur \(size)", bundle: .main)
    }

    static var leagueZonePromotion: String { String(localized: "game2.league.zone.promotion", defaultValue: "Montée", bundle: .main) }

    static var leagueZoneSafe: String { String(localized: "game2.league.zone.safe", defaultValue: "Maintien", bundle: .main) }

    static var leagueZoneRelegation: String { String(localized: "game2.league.zone.relegation", defaultValue: "Descente", bundle: .main) }

    static func leagueToPromotion(points: String) -> String {
        String(localized: "game2.league.to_promotion", defaultValue: "Encore \(points) pour monter", bundle: .main)
    }

    static var leagueInPromotion: String { String(localized: "game2.league.in_promotion", defaultValue: "Tu montes si tu gardes ta place.", bundle: .main) }

    static var leagueAtTop: String { String(localized: "game2.league.at_top", defaultValue: "Tu es au sommet des ligues.", bundle: .main) }

    static var leagueCupGold: String { String(localized: "game2.league.cup.gold", defaultValue: "Coupe d’or", bundle: .main) }

    static var leagueCupSilver: String { String(localized: "game2.league.cup.silver", defaultValue: "Coupe d’argent", bundle: .main) }

    static var leagueCupBronze: String { String(localized: "game2.league.cup.bronze", defaultValue: "Coupe de bronze", bundle: .main) }

    static var leagueSnapshot: String { String(localized: "game2.league.snapshot", defaultValue: "Le classement des autres est figé chaque jour à 4 h : personne ne voit qui joue en ce moment. Seule ta ligne est en direct.", bundle: .main) }

    static var leagueMe: String { String(localized: "game2.league.me", defaultValue: "Toi", bundle: .main) }

    static var leagueEmpty: String { String(localized: "game2.league.empty", defaultValue: "Le groupe se remplit : le classement apparaît dès que les premiers points tombent.", bundle: .main) }

    static var leagueFriendsTitle: String { String(localized: "game2.league.friends.title", defaultValue: "Ligue entre amis", bundle: .main) }

    static var leagueFriendsBody: String { String(localized: "game2.league.friends.body", defaultValue: "Les points de la semaine, entre amis acceptés. Toujours ouverte, sans consentement à donner.", bundle: .main) }

    static var leagueFriendsEmpty: String { String(localized: "game2.league.friends.empty", defaultValue: "Ajoute des amis pour te comparer à eux chaque semaine.", bundle: .main) }

    static var leagueFriendsUnknown: String { String(localized: "game2.league.friends.unknown", defaultValue: "Un ami", bundle: .main) }

    static var duoTitle: String { String(localized: "game2.duo.title", defaultValue: "Mission en duo", bundle: .main) }

    static func duoLocked(level: String, current: String) -> String {
        String(localized: "game2.duo.locked", defaultValue: "La mission en duo s’ouvre au niveau \(level), pour vous deux. Tu es au niveau \(current).", bundle: .main)
    }

    static var duoNone: String { String(localized: "game2.duo.none", defaultValue: "Choisis un ami : si vous finissez chacun votre part dans la semaine, la récompense est doublée.", bundle: .main) }

    static func duoInvite(name: String) -> String {
        String(localized: "game2.duo.invite", defaultValue: "Inviter \(name)", bundle: .main)
    }

    static var duoPick: String { String(localized: "game2.duo.pick", defaultValue: "Choisis un ami", bundle: .main) }

    static var duoNoFriends: String { String(localized: "game2.duo.no_friends", defaultValue: "Il te faut un ami accepté pour jouer en duo.", bundle: .main) }

    static func duoInvitedInviter(name: String) -> String {
        String(localized: "game2.duo.invited.inviter", defaultValue: "Invitation envoyée à \(name). Elle attend sa réponse.", bundle: .main)
    }

    static func duoInvitedInvitee(name: String) -> String {
        String(localized: "game2.duo.invited.invitee", defaultValue: "\(name) t’invite à la mission en duo de la semaine.", bundle: .main)
    }

    static var duoAccept: String { String(localized: "game2.duo.accept", defaultValue: "Accepter", bundle: .main) }

    static var duoDecline: String { String(localized: "game2.duo.decline", defaultValue: "Décliner", bundle: .main) }

    static var duoCancel: String { String(localized: "game2.duo.cancel", defaultValue: "Annuler l’invitation", bundle: .main) }

    static var duoAbandon: String { String(localized: "game2.duo.abandon", defaultValue: "Quitter le duo", bundle: .main) }

    static func duoProgressMe(done: String, target: String) -> String {
        String(localized: "game2.duo.progress.me", defaultValue: "Toi : \(done) sur \(target)", bundle: .main)
    }

    static func duoProgressPartner(name: String, done: String, target: String) -> String {
        String(localized: "game2.duo.progress.partner", defaultValue: "\(name) : \(done) sur \(target)", bundle: .main)
    }

    static func duoProgressCommon(done: String, target: String) -> String {
        String(localized: "game2.duo.progress.common", defaultValue: "À deux : \(done) sur \(target)", bundle: .main)
    }

    static func duoReward(points: String) -> String {
        String(localized: "game2.duo.reward", defaultValue: "Ta part : \(points)", bundle: .main)
    }

    static func duoRewardDoubled(points: String) -> String {
        String(localized: "game2.duo.reward.doubled", defaultValue: "Récompense doublée : \(points)", bundle: .main)
    }

    static var duoRewardHint: String { String(localized: "game2.duo.reward.hint", defaultValue: "Doublée si vous finissez chacun votre part.", bundle: .main) }

    static var duoCompleted: String { String(localized: "game2.duo.completed", defaultValue: "Duo réussi cette semaine.", bundle: .main) }

    static var duoAbandoned: String { String(localized: "game2.duo.abandoned", defaultValue: "Duo quitté. Un nouveau duo s’ouvre la semaine prochaine.", bundle: .main) }

    static var duoExpired: String { String(localized: "game2.duo.expired", defaultValue: "Le duo de la semaine s’est terminé sans aboutir.", bundle: .main) }

    static var leaguePseudonymTitle: String { String(localized: "game2.league.pseudonym.title", defaultValue: "Ton pseudonyme", bundle: .main) }

    static var leaguePseudonymNew: String { String(localized: "game2.league.pseudonym.new", defaultValue: "Nouveau pseudonyme", bundle: .main) }

    static var leaguePseudonymHintChange: String { String(localized: "game2.league.pseudonym.hint_change", defaultValue: "3 à 20 caractères. Ni ton nom, ni ton identifiant.", bundle: .main) }

}

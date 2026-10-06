import Foundation

// MARK: - Ce que la vague 2 du jeu dit — settings (suite de `GameText`, voir `GameWave2CopyCommon.swift`)

extension GameText {
    static var settingsTitle: String { String(localized: "game2.settings.title", defaultValue: "Réglages du jeu", bundle: .main) }

    static var settingsCelebrationsTitle: String { String(localized: "game2.settings.celebrations.title", defaultValue: "Mee et Meo", bundle: .main) }

    static var settingsCelebrationsBody: String { String(localized: "game2.settings.celebrations.body", defaultValue: "Les cartes de Mee et Meo et les propositions de photo qui apparaissent sur Progression. Ce réglage vaut pour cet appareil seulement.", bundle: .main) }

    static var settingsCelebrationsSwitch: String { String(localized: "game2.settings.celebrations.switch", defaultValue: "Afficher les célébrations", bundle: .main) }

    static var settingsHiddenTitle: String { String(localized: "game2.settings.hidden.title", defaultValue: "Jeu masqué", bundle: .main) }

    static var settingsHiddenBody: String { String(localized: "game2.settings.hidden.body", defaultValue: "Masque le jeu partout sur cet appareil, ferme ta vitrine, ton rang, ton trésor et ton Atlas à tous les autres, et te retire de la ligue publique. Tes points et tes trophées sont gardés.", bundle: .main) }

    static var settingsHiddenSwitch: String { String(localized: "game2.settings.hidden.switch", defaultValue: "Masquer le jeu", bundle: .main) }

    static var settingsHiddenCard: String { String(localized: "game2.settings.hidden.card", defaultValue: "Le jeu est masqué sur cet appareil.", bundle: .main) }

    static var settingsHiddenShow: String { String(localized: "game2.settings.hidden.show", defaultValue: "Réafficher le jeu", bundle: .main) }

    static var settingsHiddenReopenNote: String { String(localized: "game2.settings.hidden.reopen_note", defaultValue: "Tes réglages de visibilité restent fermés : rouvre-les ici quand tu le souhaites.", bundle: .main) }

    static var settingsNotificationsTitle: String { String(localized: "game2.settings.notifications.title", defaultValue: "Notifications du jeu", bundle: .main) }

    static var settingsNotificationsBody: String { String(localized: "game2.settings.notifications.body", defaultValue: "Une invitation à un duo, le résultat de ta ligue, une étape de saison : au plus une notification de jeu par jour.", bundle: .main) }

    static var settingsNotificationsSwitch: String { String(localized: "game2.settings.notifications.switch", defaultValue: "Recevoir les notifications du jeu", bundle: .main) }

    static var settingsVisibilityTitle: String { String(localized: "game2.settings.visibility.title", defaultValue: "Qui voit quoi", bundle: .main) }

    static var settingsVisibilityBody: String { String(localized: "game2.settings.visibility.body", defaultValue: "Hors amis acceptés, personne ne voit si tu es en ligne ni quand tu joues. Ces réglages disent ce que tes amis, ou tout le monde, voient de ton jeu.", bundle: .main) }

    static var settingsLeagueTitle: String { String(localized: "game2.settings.league.title", defaultValue: "Ligue publique", bundle: .main) }

    static func settingsLeagueOn(name: String) -> String {
        String(localized: "game2.settings.league.on", defaultValue: "Tu es dans la ligue publique sous le nom \(name).", bundle: .main)
    }

    static var settingsLeagueOnUnnamed: String { String(localized: "game2.settings.league.on_unnamed", defaultValue: "Tu es dans la ligue publique.", bundle: .main) }

    static var settingsLeagueOff: String { String(localized: "game2.settings.league.off", defaultValue: "Tu n’es pas dans la ligue publique. Ta ligue entre amis reste ouverte.", bundle: .main) }

    static var settingsLeagueManage: String { String(localized: "game2.settings.league.manage", defaultValue: "Gérer ma ligue", bundle: .main) }

    static var settingsHelp: String { String(localized: "game2.settings.help", defaultValue: "Comment ça marche", bundle: .main) }

    static var profileTitle: String { String(localized: "game2.profile.title", defaultValue: "Mon jeu", bundle: .main) }

    static func profileLevel(level: String, tier: String) -> String {
        String(localized: "game2.profile.level", defaultValue: "Niveau \(level) · \(tier)", bundle: .main)
    }

    static func profileGlory(glory: String) -> String {
        String(localized: "game2.profile.glory", defaultValue: "\(glory) de Gloire", bundle: .main)
    }

    static func profileTreasury(meeshes: String, tier: String) -> String {
        String(localized: "game2.profile.treasury", defaultValue: "\(meeshes) · \(tier)", bundle: .main)
    }

    static func profileFlame(days: String) -> String {
        String(localized: "game2.profile.flame", defaultValue: "Flamme : \(days)", bundle: .main)
    }

    static var profileShowcase: String { String(localized: "game2.profile.showcase", defaultValue: "Vitrine", bundle: .main) }

    static var profileMedals: String { String(localized: "game2.profile.medals", defaultValue: "Médailles", bundle: .main) }

    static var profileSeeProgress: String { String(localized: "game2.profile.see_progress", defaultValue: "Voir ma progression", bundle: .main) }

    static var profileSeeShowcase: String { String(localized: "game2.profile.see_showcase", defaultValue: "Voir toute la vitrine", bundle: .main) }

    static func profileVisitorTitle(name: String) -> String {
        String(localized: "game2.profile.visitor_title", defaultValue: "Vitrine de \(name)", bundle: .main)
    }

    static var profileNoTrophy: String { String(localized: "game2.profile.no_trophy", defaultValue: "Pas encore de trophée.", bundle: .main) }

}

// MARK: - Ce que le catalogue du web ne dit pas : l'opposition à la ligue entre amis (conformité B-2)

extension GameText {
    static var settingsFriendsLeagueTitle: String { String(localized: "game2.settings.friends_league.title", defaultValue: "Ligue entre amis", bundle: .main) }
    static var settingsFriendsLeagueBody: String { String(localized: "game2.settings.friends_league.body", defaultValue: "Tes amis acceptés te voient dans leur classement de la semaine, et toi dans le tien. Tu peux t’en retirer d’un geste : tu n’apparais plus dans le leur, et tu ne vois plus le leur.", bundle: .main) }
    static var settingsFriendsLeagueSwitch: String { String(localized: "game2.settings.friends_league.switch", defaultValue: "Ne plus participer à la ligue entre amis", bundle: .main) }
}

import Foundation

/// **QUAND rappeler de tenir sa série — la règle, sans horloge ni notification.**
///
/// La série est le seul compteur de l'engagement qui se PERD en n'agissant pas :
/// un badge acquis reste acquis, un succès aussi, le niveau ne redescend pas.
/// Une série se rompt à minuit. L'app lui consacre un hero entier et ne
/// prévenait jamais qu'elle allait tomber (#5902).
///
/// **Pourquoi une notification LOCALE, quand tout le reste vient de la
/// passerelle.** Les quatre notifications d'engagement existantes célèbrent un
/// fait accompli, et le serveur seul le connaît. Celle-ci ANTICIPE, et tout ce
/// qu'elle a besoin de savoir est déjà sur l'appareil : quel jour on est, si un
/// geste a été posé aujourd'hui, combien de jours sont tenus. Elle marche donc
/// en avion, hors ligne, et même si le push est refusé côté serveur.
///
/// **Ce type est PUR.** Il ne lit ni `Date()`, ni `UNUserNotificationCenter`, ni
/// aucun réglage : tout lui est remis. C'est ce qui rend éprouvables les six cas
/// où il ne faut RIEN planifier — et c'est là que la feature se juge, pas sur le
/// cas nominal. Le cas nominal produit six notifications utiles ; chaque cas
/// manqué en produit six inutiles, par jour, ce qui est exactement le bruit qui
/// apprend à ignorer les six suivantes.
nonisolated enum StreakReminderPlan {

    /// Les trois moments de la journée. Ils portent leur nom plutôt qu'une
    /// heure : c'est le moment qui est une décision produit, l'heure n'en est
    /// que le réglage.
    enum Moment: String, CaseIterable, Sendable {
        case matin, midi, soir

        /// L'heure du PREMIER rappel du moment. Le second suit une heure après
        /// (directive porteur 2026-09-09 : « 2 fois le matin avec écart de 1h,
        /// pareil à midi et le soir »).
        var premiereHeure: Int {
            switch self {
            case .matin: return 8
            case .midi: return 12
            case .soir: return 19
            }
        }
    }

    /// Un rappel à poser. `heure` est une heure LOCALE du jour courant — jamais
    /// un `Date` : le planificateur emploie un déclencheur calendaire, qui suit
    /// le fuseau de l'appareil si l'utilisateur voyage.
    struct Rappel: Equatable, Sendable {
        let moment: Moment
        let heure: Int
        let identifiant: String
        let titre: String
        let corps: String
    }

    /// L'écart entre les deux rappels d'un même moment.
    static let ecartHeures = 1

    /// Rend les rappels à poser, ou une liste VIDE.
    ///
    /// - Parameters:
    ///   - maintenant: l'instant de référence — jamais lu par ce type.
    ///   - serieEnCours: jours tenus. `0` ⇒ rien à tenir, donc rien à rappeler.
    ///   - aAgiAujourdhui: le geste du jour est-il posé. C'est le cœur du
    ///     « jusqu'à accomplissement » de la directive.
    ///   - notificationsAutorisees: l'autorisation est-elle DÉJÀ accordée. On
    ///     ne la demande jamais pour un rappel de série — une demande surgie
    ///     pour ça serait une intrusion.
    static func rappels(
        maintenant: Date,
        calendrier: Calendar,
        serieEnCours: Int,
        aAgiAujourdhui: Bool,
        notificationsAutorisees: Bool
    ) -> [Rappel] {
        // Les trois refus, dans l'ordre du moins cher au plus cher à établir.
        guard notificationsAutorisees else { return [] }
        guard serieEnCours > 0 else { return [] }
        guard !aAgiAujourdhui else { return [] }

        let heureCourante = calendrier.component(.hour, from: maintenant)

        return Moment.allCases.flatMap { moment -> [Rappel] in
            [moment.premiereHeure, moment.premiereHeure + ecartHeures].compactMap { heure in
                // Une heure PASSÉE — ou l'heure pile — ne se planifie pas : un
                // déclencheur calendaire déjà dépassé tombe LE LENDEMAIN, et il
                // parlerait alors d'une série que la nuit a peut-être rompue.
                // L'heure pile, elle, tomberait dans la seconde : ça ressemble
                // à un défaut plus qu'à un rappel.
                guard heure > heureCourante, heure < 24 else { return nil }
                return Rappel(
                    moment: moment,
                    heure: heure,
                    identifiant: "streak-reminder.\(moment.rawValue).\(heure)",
                    titre: StreakReminderCopy.titre,
                    corps: StreakReminderCopy.corps(joursTenus: serieEnCours)
                )
            }
        }
    }
}

/// Le texte des rappels. Il dit ce qui est EN JEU — le nombre de jours tenus —
/// et jamais « revenez » : un rappel qui ne nomme pas ce qu'on risque de perdre
/// ne donne aucune raison d'ouvrir l'app.
nonisolated enum StreakReminderCopy {
    static let titre = String(
        localized: "streak.reminder.title",
        defaultValue: "Votre série vous attend",
        bundle: .main
    )

    static func corps(joursTenus: Int) -> String {
        if joursTenus == 1 {
            return String(
                localized: "streak.reminder.body.one",
                defaultValue: "1 jour tenu. Un message, une story ou un post aujourd'hui, et la série continue.",
                bundle: .main
            )
        }
        return String(
            localized: "streak.reminder.body",
            defaultValue: "\(joursTenus) jours tenus. Un message, une story ou un post aujourd'hui, et la série continue.",
            bundle: .main
        )
    }
}

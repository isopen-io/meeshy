import Foundation

/// **Le geste du jour, marqué localement** (#5902).
///
/// Le planificateur des rappels de série a besoin d'UNE chose que le modèle de
/// progression ne dit pas : l'utilisateur a-t-il agi AUJOURD'HUI. `currentDays`
/// donne le nombre de jours tenus, jamais la date du dernier — deux jours de
/// série se lisent pareil qu'on ait écrit ce matin ou avant-hier soir.
///
/// **Pourquoi une marque locale plutôt qu'un champ serveur.** Le serveur le sait
/// (`EngagementCounter.updatedAt`, que `elanInputsFromRows` lit déjà pour la
/// fenêtre de l'élan) et ne l'expose pas dans la charge de `/me/engagement`.
/// L'exposer est le geste juste, et c'est un lot de passerelle ; en attendant,
/// une marque locale répond à la question pour le geste qui la pose neuf fois
/// sur dix — envoyer un message.
///
/// **Ce qu'elle NE prétend pas être.** Elle voit les gestes faits SUR CET
/// APPAREIL. Quelqu'un qui écrit depuis le web puis ouvre iOS recevra un rappel
/// dont il n'a plus besoin — un rappel de trop, jamais une série perdue. La
/// direction de l'erreur est choisie : rappeler à tort coûte une notification,
/// ne pas rappeler coûte la série, et c'est elle qu'on protège. Le champ serveur
/// fermera l'écart ; en son absence, mieux vaut ce biais que pas de rappel.
nonisolated enum StreakActivityMark {

    private static let cle = "meeshy.streak.lastLocalActivityDay"

    /// Marque le geste du jour. Idempotente : écrire dix fois le même jour ne
    /// coûte qu'une écriture de la même valeur.
    static func marquer(
        maintenant: Date = Date(),
        calendrier: Calendar = .current,
        defaults: UserDefaults = .standard
    ) {
        defaults.set(jour(maintenant, calendrier), forKey: cle)
    }

    /// Un geste a-t-il été posé aujourd'hui, sur cet appareil.
    static func aAgiAujourdhui(
        maintenant: Date = Date(),
        calendrier: Calendar = .current,
        defaults: UserDefaults = .standard
    ) -> Bool {
        guard let marque = defaults.string(forKey: cle) else { return false }
        return marque == jour(maintenant, calendrier)
    }

    /// Le jour civil, en clé stable et lisible — pas un `TimeInterval` : deux
    /// instants du même jour doivent rendre la MÊME clé, et une comparaison de
    /// dates brutes ne le garantit pas au passage de minuit.
    private static func jour(_ date: Date, _ calendrier: Calendar) -> String {
        let c = calendrier.dateComponents([.year, .month, .day], from: date)
        return "\(c.year ?? 0)-\(c.month ?? 0)-\(c.day ?? 0)"
    }
}

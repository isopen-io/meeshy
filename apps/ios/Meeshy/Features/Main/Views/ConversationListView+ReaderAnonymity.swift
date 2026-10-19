import MeeshySDK

// MARK: - Anonymat du lecteur (mode Résumé)

/// `currentUser == nil` est un état TRANSITOIRE (démarrage à froid, session en
/// cours de restauration), jamais une preuve d'anonymat. Le repli `?? true`
/// masquait le mode Résumé aux utilisateurs inscrits pendant ce court
/// chargement (#3592) : seul un `MeeshyUser.isAnonymous` EXPLICITEMENT vrai
/// doit fermer une capacité réservée aux inscrits.
nonisolated enum ConversationListReaderAnonymity {
    static func isAnonymous(currentUser: MeeshyUser?) -> Bool {
        currentUser?.isAnonymous ?? false
    }
}

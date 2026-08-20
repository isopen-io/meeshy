import Foundation

public extension MeeshyConversation {
    /// Rendu de l'effectif : « 199+ » quand le serveur l'a plafonné pour ce
    /// lecteur, la valeur brute sinon. Chiffres + « + » — identique dans
    /// toutes les langues, aucune clé de localisation nécessaire.
    var memberCountDisplay: String {
        memberCountCapped ? "\(memberCount)+" : "\(memberCount)"
    }
}

import Foundation

extension Array where Element == SavedAccount {
    /// `user` est-il déjà, sous la même identité, le compte ouvert le plus récemment ? (#11558)
    ///
    /// C'est la seule condition où la liste des comptes n'a rien à réécrire : son ordre au
    /// prochain lancement suit `lastActiveAt`, jamais la position en mémoire.
    func showsAsMostRecent(_ user: MeeshyUser) -> Bool {
        guard let known = first(where: { $0.id == user.id }),
              known.username == user.username, known.displayName == user.displayName,
              known.avatarURL == user.avatar else { return false }
        return allSatisfy { $0.id == user.id || $0.lastActiveAt < known.lastActiveAt }
    }
}

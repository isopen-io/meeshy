import Foundation
import MeeshySDK

/// Nomme les personnes des cercles (#13938). Le serveur ne sert que des identifiants : l'annuaire lit d'abord le cache
/// des amis (déjà sur disque, aucune requête), puis le profil des autres, une fois, et se souvient du résultat pour la
/// session. Un profil illisible laisse la personne absente — l'écran écrit « Inconnu ».
actor CirclePeopleDirectory: CirclePeopleResolving {
    static let shared = CirclePeopleDirectory()

    /// Plafond de profils demandés d'un coup : une liste de cercles est bornée (500 liens), pas une rafale de 500 requêtes.
    private static let fetchCap = 40

    private let users: UserServiceProviding
    private var known: [String: CirclePerson] = [:]

    init(users: UserServiceProviding = UserService.shared) {
        self.users = users
    }

    func people(for ids: [String]) async -> [String: CirclePerson] {
        let wanted = Array(Set(ids))
        let cold = wanted.filter { known[$0] == nil }
        if !cold.isEmpty {
            await seedFromFriends(cold)
            await fetchProfiles(cold.filter { known[$0] == nil })
        }
        return wanted.reduce(into: [String: CirclePerson]()) { result, id in
            if let person = known[id] { result[id] = person }
        }
    }

    private func seedFromFriends(_ ids: [String]) async {
        let store = await CacheCoordinator.shared.friends
        guard let cached = await store.loadIgnoringExpiry(for: FriendshipCache.PersistenceKeys.friendsList) else { return }
        for friend in cached.items where ids.contains(friend.id) {
            known[friend.id] = CirclePerson(id: friend.id, name: friend.name, username: friend.username, avatarURL: friend.avatar)
        }
    }

    private func fetchProfiles(_ ids: [String]) async {
        let users = self.users
        let fetched = await withTaskGroup(of: CirclePerson?.self, returning: [CirclePerson].self) { group in
            for id in ids.prefix(Self.fetchCap) {
                group.addTask {
                    guard let user = try? await users.getProfileById(id) else { return nil }
                    return CirclePerson(user: user)
                }
            }
            var people: [CirclePerson] = []
            for await person in group {
                if let person { people.append(person) }
            }
            return people
        }
        for person in fetched { known[person.id] = person }
    }
}

extension CirclePerson {
    nonisolated init(user: MeeshyUser) {
        let composed = [user.firstName, user.lastName].compactMap { $0 }.joined(separator: " ")
        let name = user.displayName ?? (composed.isEmpty ? user.username : composed)
        self.init(id: user.id, name: name, username: user.username, avatarURL: user.avatar)
    }
}

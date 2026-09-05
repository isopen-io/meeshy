import Foundation
import MeeshySDK
import MeeshyUI

/// **L'annuaire, en double de test.** `AudienceUserSearching` est la couture
/// que le picker d'audience et la liste de mentions du SDK partagent déjà ;
/// `MentionComposerController` la rejoint pour qu'un BROUILLON puisse chercher
/// une personne qui n'est pas dans les amis de l'auteur.
///
/// Le double compte ses appels ET retient sa dernière requête : les deux
/// questions qu'on pose à cette couture sont « a-t-elle été interrogée ? » et
/// « avec quoi ? » — la seconde attrape un fragment mal découpé, que le compte
/// seul laisserait passer.
final class MockUserDirectorySearch: AudienceUserSearching, @unchecked Sendable {

    var result: Result<[UserSearchResult], Error> = .success([])
    private(set) var callCount = 0
    private(set) var lastQuery: String?
    private(set) var lastLimit: Int?

    func searchUsers(query: String, limit: Int, offset: Int) async throws -> [UserSearchResult] {
        callCount += 1
        lastQuery = query
        lastLimit = limit
        return try result.get()
    }
}

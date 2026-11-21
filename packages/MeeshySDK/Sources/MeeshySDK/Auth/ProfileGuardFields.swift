import Foundation

/// Les champs que la garde optimiste du profil sait confirmer : ceux que la source servie PORTE. `profile:updated`
/// ne porte pas la bio (#19306) — la garde ne se lève donc pas sur lui tant qu'une bio est en vol.
struct ProfileGuardFields: OptionSet {
    let rawValue: Int
    static let displayName = ProfileGuardFields(rawValue: 1)
    static let bio = ProfileGuardFields(rawValue: 2)
    static let avatar = ProfileGuardFields(rawValue: 4)
    static let all: ProfileGuardFields = [.displayName, .bio, .avatar]
    static let snapshot: ProfileGuardFields = [.displayName, .avatar]

    static func resolve(
        _ server: MeeshyUser, pending: ProfileSnapshot?, carrying fields: ProfileGuardFields
    ) -> (user: MeeshyUser, clearedPending: Bool) {
        guard let pending else { return (server, false) }
        let unverifiable = all.subtracting(fields)
        let holdsUnverifiable = (unverifiable.contains(.displayName) && pending.displayName != nil)
            || (unverifiable.contains(.bio) && pending.bio != nil)
            || (unverifiable.contains(.avatar) && pending.avatarUrl != nil)
        let matches = (!fields.contains(.displayName) || server.displayName == pending.displayName)
            && (!fields.contains(.bio) || server.bio == pending.bio)
            && (!fields.contains(.avatar) || server.avatar == pending.avatarUrl)
        guard matches else {
            return (server.withProfileChanges(
                displayName: pending.displayName, bio: pending.bio, avatar: pending.avatarUrl), false)
        }
        return (server, !holdsUnverifiable)
    }
}

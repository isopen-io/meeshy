import Foundation

/// Appliquer un geste d'effectif (#18767) à ce que l'appareil tient déjà.
///
/// Règles, gardées par `CommunityMemberEventsTests` (mêmes que le web et Android) :
///  - une autre communauté n'est jamais touchée (`nil`) ;
///  - `memberCount` se recopie ;
///  - le rôle tenu ne change que si la personne concernée est le LECTEUR
///    (sorti ⇒ plus de rôle) ; un tiers ne déplace jamais le rôle du lecteur.
extension MeeshyCommunity {

    public func applying(_ change: CommunityMemberChange) -> MeeshyCommunity? {
        guard change.communityId == id, change.memberCount != memberCount else { return nil }
        var updated = self
        updated.memberCount = change.memberCount
        return updated
    }
}

extension APICommunity {

    public func applying(_ change: CommunityMemberChange, readerId: String) -> APICommunity? {
        guard change.communityId == id else { return nil }
        let role = change.concerns(readerId: readerId) ? change.role?.rawValue : currentUserRole
        guard change.memberCount != memberCount || role != currentUserRole else { return nil }
        return APICommunity(
            id: id, identifier: identifier, name: name, description: description,
            avatar: avatar, banner: banner, isPrivate: isPrivate,
            createdBy: createdBy, createdAt: createdAt, updatedAt: updatedAt,
            creator: creator, members: members, _count: nil,
            memberCount: change.memberCount, conversationCount: conversationCount ?? _count?.conversations,
            currentUserRole: role, onlineMemberCount: onlineMemberCount
        )
    }
}

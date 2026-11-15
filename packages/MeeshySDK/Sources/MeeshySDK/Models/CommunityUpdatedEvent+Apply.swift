import Foundation

/// Appliquer `community:updated` (#18439) à ce que l'appareil tient déjà.
///
/// Règles, gardées par `CommunityUpdatedEventTests` :
///  - une autre communauté n'est jamais touchée (`nil`) ;
///  - un événement PLUS ANCIEN que la copie tenue ne la recule pas (`nil`) —
///    deux réglages rapprochés peuvent arriver dans le désordre ;
///  - ce que la charge ne porte pas reste tel quel (rôle du lecteur, « N en
///    ligne », emoji, nombre de canaux) ;
///  - l'empreinte floue d'une image qui CHANGE est oubliée : elle décrirait
///    l'ancienne.
extension CommunityUpdatedEvent {

    func isNewer(than current: Date?) -> Bool {
        guard let current, let written = writtenAt else { return true }
        return written >= current
    }
}

extension MeeshyCommunity {

    public func applying(_ event: CommunityUpdatedEvent) -> MeeshyCommunity? {
        guard event.communityId == id, event.isNewer(than: updatedAt) else { return nil }
        return MeeshyCommunity(
            id: id, identifier: event.identifier, name: event.name,
            description: event.description,
            avatar: event.avatar, avatarThumbHash: event.avatar == avatar ? avatarThumbHash : nil,
            banner: event.banner, bannerThumbHash: event.banner == banner ? bannerThumbHash : nil,
            isPrivate: event.isPrivate, isActive: isActive, deletedAt: deletedAt,
            createdBy: createdBy, createdAt: createdAt, updatedAt: event.writtenAt ?? updatedAt,
            memberCount: event.memberCount, conversationCount: conversationCount,
            emoji: emoji, color: event.name == name ? color : DynamicColorGenerator.colorForName(event.name),
            theme: theme, language: language, onlineMemberCount: onlineMemberCount
        )
    }
}

extension APICommunity {

    public func applying(_ event: CommunityUpdatedEvent) -> APICommunity? {
        guard event.communityId == id, event.isNewer(than: updatedAt) else { return nil }
        return APICommunity(
            id: id, identifier: event.identifier, name: event.name, description: event.description,
            avatar: event.avatar, banner: event.banner, isPrivate: event.isPrivate,
            createdBy: createdBy, createdAt: createdAt, updatedAt: event.writtenAt ?? updatedAt,
            creator: creator, members: members, _count: nil,
            memberCount: event.memberCount, conversationCount: conversationCount ?? _count?.conversations,
            currentUserRole: currentUserRole, onlineMemberCount: onlineMemberCount
        )
    }
}

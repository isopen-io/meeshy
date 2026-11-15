// GÉNÉRÉ — ne pas éditer à la main.
//
// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le
// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après
// tout changement de route :
//
//   cd packages/shared && npm run android-endpoints:generate
//
// Les chemins sont relatifs au préfixe d'API (/api/v1/) ; les emplacements {nom}
// sont résolus par @Path. Les routes hors /api/v1 gardent leur chemin complet.

package me.meeshy.sdk.net.routes

public object ApiRoutesCommunities {
    public const val BY_ID: String = "communities/{id}"
    public const val BY_ID_CONVERSATIONS: String = "communities/{id}/conversations"
    public const val BY_ID_CONVERSATIONS_BY_CONVERSATION_ID: String = "communities/{id}/conversations/{conversationId}"
    public const val BY_ID_INVITE: String = "communities/{id}/invite"
    public const val BY_ID_JOIN: String = "communities/{id}/join"
    public const val BY_ID_LEAVE: String = "communities/{id}/leave"
    public const val BY_ID_MEMBERS: String = "communities/{id}/members"
    public const val BY_ID_MEMBERS_BY_MEMBER_ID: String = "communities/{id}/members/{memberId}"
    public const val BY_ID_MEMBERS_BY_MEMBER_ID_ROLE: String = "communities/{id}/members/{memberId}/role"
    public const val CHECK_IDENTIFIER_BY_IDENTIFIER: String = "communities/check-identifier/{identifier}"
    public const val MINE: String = "communities/mine"
    public const val ROOT: String = "communities"
    public const val SEARCH: String = "communities/search"
}

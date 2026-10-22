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

public object ApiRoutesPosts {
    public const val BOOKMARKS: String = "posts/bookmarks"
    public const val BY_POST_ID: String = "posts/{postId}"
    public const val BY_POST_ID_ANONYMOUS_VIEW: String = "posts/{postId}/anonymous-view"
    public const val BY_POST_ID_BOOKMARK: String = "posts/{postId}/bookmark"
    public const val BY_POST_ID_COMMENTS: String = "posts/{postId}/comments"
    public const val BY_POST_ID_COMMENTS_BY_COMMENT_ID: String = "posts/{postId}/comments/{commentId}"
    public const val BY_POST_ID_COMMENTS_BY_COMMENT_ID_LIKE: String = "posts/{postId}/comments/{commentId}/like"
    public const val BY_POST_ID_COMMENTS_BY_COMMENT_ID_REPLIES: String = "posts/{postId}/comments/{commentId}/replies"
    public const val BY_POST_ID_COMMENTS_BY_COMMENT_ID_TRANSLATE: String = "posts/{postId}/comments/{commentId}/translate"
    public const val BY_POST_ID_DOWNLOADS: String = "posts/{postId}/downloads"
    public const val BY_POST_ID_IMPRESSION: String = "posts/{postId}/impression"
    public const val BY_POST_ID_INTERACTIONS: String = "posts/{postId}/interactions"
    public const val BY_POST_ID_LIKE: String = "posts/{postId}/like"
    public const val BY_POST_ID_MEDIA_BY_MEDIA_ID_EXPORT: String = "posts/{postId}/media/{mediaId}/export"
    public const val BY_POST_ID_OBJECTS_BY_OBJECT_ID_RESPONSES: String = "posts/{postId}/objects/{objectId}/responses"
    public const val BY_POST_ID_PIN: String = "posts/{postId}/pin"
    public const val BY_POST_ID_REPOST: String = "posts/{postId}/repost"
    public const val BY_POST_ID_REPUBLISH: String = "posts/{postId}/republish"
    public const val BY_POST_ID_SHARE: String = "posts/{postId}/share"
    public const val BY_POST_ID_TRANSLATE: String = "posts/{postId}/translate"
    public const val BY_POST_ID_VIEW: String = "posts/{postId}/view"
    public const val BY_POST_ID_VIEWS: String = "posts/{postId}/views"
    public const val COMMUNITY_BY_COMMUNITY_ID: String = "posts/community/{communityId}"
    public const val ENGAGEMENT_BATCH: String = "posts/engagement/batch"
    public const val FEED: String = "posts/feed"
    public const val FEED_REELS: String = "posts/feed/reels"
    public const val FEED_STATUSES: String = "posts/feed/statuses"
    public const val FEED_STATUSES_DISCOVER: String = "posts/feed/statuses/discover"
    public const val FEED_STORIES: String = "posts/feed/stories"
    public const val FROM_ATTACHMENT: String = "posts/from-attachment"
    public const val HASHTAG_BY_TAG: String = "posts/hashtag/{tag}"
    public const val IMPRESSIONS_BATCH: String = "posts/impressions/batch"
    public const val MEDIA_BY_MEDIA_ID: String = "posts/media/{mediaId}"
    public const val MEDIA_BY_MEDIA_ID_CAPTION_TRANSLATE: String = "posts/media/{mediaId}/caption/translate"
    public const val NEARBY: String = "posts/nearby"
    public const val NEARBY_DENSITY: String = "posts/nearby/density"
    public const val ROOT: String = "posts"
    public const val STORIES_MINE: String = "posts/stories/mine"
    public const val USER_BY_USER_ID: String = "posts/user/{userId}"
}

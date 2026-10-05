/**
 * Les adresses du groupe `posts` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as postsEndpoints from '@meeshy/shared/api/endpoints/posts';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/posts/bookmarks */
export const bookmarks = '/api/v1/posts/bookmarks';

/** GET · PUT · DELETE /api/v1/posts/:postId */
export const byPostId = (postId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}`;

/** POST /api/v1/posts/:postId/anonymous-view */
export const byPostIdAnonymousView = (postId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/anonymous-view`;

/** POST · DELETE /api/v1/posts/:postId/bookmark */
export const byPostIdBookmark = (postId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/bookmark`;

/** GET · POST /api/v1/posts/:postId/comments */
export const byPostIdComments = (postId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/comments`;

/** PATCH · DELETE /api/v1/posts/:postId/comments/:commentId */
export const byPostIdCommentsByCommentId = (postId: string, commentId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`;

/** POST · DELETE /api/v1/posts/:postId/comments/:commentId/like */
export const byPostIdCommentsByCommentIdLike = (postId: string, commentId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`;

/** GET /api/v1/posts/:postId/comments/:commentId/replies */
export const byPostIdCommentsByCommentIdReplies = (postId: string, commentId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/replies`;

/** POST /api/v1/posts/:postId/comments/:commentId/translate */
export const byPostIdCommentsByCommentIdTranslate = (postId: string, commentId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/translate`;

/** POST /api/v1/posts/:postId/downloads */
export const byPostIdDownloads = (postId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/downloads`;

/** POST /api/v1/posts/:postId/impression */
export const byPostIdImpression = (postId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/impression`;

/** GET /api/v1/posts/:postId/interactions */
export const byPostIdInteractions = (postId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/interactions`;

/** POST · DELETE /api/v1/posts/:postId/like */
export const byPostIdLike = (postId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/like`;

/** GET /api/v1/posts/:postId/media/:mediaId/export */
export const byPostIdMediaByMediaIdExport = (postId: string, mediaId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/media/${encodeURIComponent(mediaId)}/export`;

/** GET · POST · DELETE /api/v1/posts/:postId/objects/:objectId/responses */
export const byPostIdObjectsByObjectIdResponses = (postId: string, objectId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/objects/${encodeURIComponent(objectId)}/responses`;

/** POST · DELETE /api/v1/posts/:postId/pin */
export const byPostIdPin = (postId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/pin`;

/** POST /api/v1/posts/:postId/repost */
export const byPostIdRepost = (postId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/repost`;

/** POST /api/v1/posts/:postId/republish */
export const byPostIdRepublish = (postId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/republish`;

/** POST /api/v1/posts/:postId/share */
export const byPostIdShare = (postId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/share`;

/** POST /api/v1/posts/:postId/translate */
export const byPostIdTranslate = (postId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/translate`;

/** POST /api/v1/posts/:postId/view */
export const byPostIdView = (postId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/view`;

/** GET /api/v1/posts/:postId/views */
export const byPostIdViews = (postId: string): string => `/api/v1/posts/${encodeURIComponent(postId)}/views`;

/** GET /api/v1/posts/community/:communityId */
export const communityByCommunityId = (communityId: string): string => `/api/v1/posts/community/${encodeURIComponent(communityId)}`;

/** POST /api/v1/posts/engagement/batch */
export const engagementBatch = '/api/v1/posts/engagement/batch';

/** GET /api/v1/posts/feed */
export const feed = '/api/v1/posts/feed';

/** GET /api/v1/posts/feed/reels */
export const feedReels = '/api/v1/posts/feed/reels';

/** GET /api/v1/posts/feed/statuses */
export const feedStatuses = '/api/v1/posts/feed/statuses';

/** GET /api/v1/posts/feed/statuses/discover */
export const feedStatusesDiscover = '/api/v1/posts/feed/statuses/discover';

/** GET /api/v1/posts/feed/stories */
export const feedStories = '/api/v1/posts/feed/stories';

/** POST /api/v1/posts/from-attachment */
export const fromAttachment = '/api/v1/posts/from-attachment';

/** GET /api/v1/posts/hashtag/:tag */
export const hashtagByTag = (tag: string): string => `/api/v1/posts/hashtag/${encodeURIComponent(tag)}`;

/** POST /api/v1/posts/impressions/batch */
export const impressionsBatch = '/api/v1/posts/impressions/batch';

/** DELETE /api/v1/posts/media/:mediaId */
export const mediaByMediaId = (mediaId: string): string => `/api/v1/posts/media/${encodeURIComponent(mediaId)}`;

/** POST /api/v1/posts/media/:mediaId/caption/translate */
export const mediaByMediaIdCaptionTranslate = (mediaId: string): string => `/api/v1/posts/media/${encodeURIComponent(mediaId)}/caption/translate`;

/** GET /api/v1/posts/nearby */
export const nearby = '/api/v1/posts/nearby';

/** GET /api/v1/posts/nearby/density */
export const nearbyDensity = '/api/v1/posts/nearby/density';

/** POST /api/v1/posts */
export const root = '/api/v1/posts';

/** GET /api/v1/posts/stories/mine */
export const storiesMine = '/api/v1/posts/stories/mine';

/** GET /api/v1/posts/user/:userId */
export const userByUserId = (userId: string): string => `/api/v1/posts/user/${encodeURIComponent(userId)}`;

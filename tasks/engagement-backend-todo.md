# Backend engagement-capture + agrégation + partage tracé — TODO

## LOT 4 — Ingestion (plan Tasks 4.1-4.4)
- [ ] 4.1 Prisma model PostEngagement (append-only) + Post/User relations + regen client
- [ ] 4.2 Zod EngagementBatchSchema + rate-limit type 'engagement'
- [ ] 4.3 PostService.recordEngagementBatch (upsert sessionId, skip-and-continue, cap 300s) [RED→GREEN]
- [ ] 4.4 POST /posts/engagement/batch (auth, Zod, idempotent) [RED→GREEN]

## LOT 6 — Partage tracé (spec §20)
- [ ] TrackingLink.targetType (enum TrackingTargetType) + targetId, regen client
- [ ] Migration .mongodb.js (backfill EXTERNAL + post regex ObjectId, dedup legacy, partial unique index)
- [ ] POST /posts/:id/share upsert applicatif findFirst→reuse OR create+shareCount++ tx, catch P2002
- [ ] GET /posts/:id/share {shortUrl,token,totalClicks,uniqueClicks,lastClickedAt}
- [ ] Fix bookmarkPost create+catch P2002 ; unbookmark guard bookmarkCount>=0
- [ ] deletePost invalidate (isActive=false) TrackingLink of post

## LOT 5 backend — Agrégation (spec §19)
- [ ] Post.reelOpenCount/qualifiedViewCount/playCount Int @default(0)
- [ ] recordEngagementBatch INSERT-only increment (reelOpen if reels; playCount += completions; qualifiedView per §19.3)
- [ ] Expose 3 counters in GET /posts/feed include

## LOT 7 backend — /resolve (spec §21.2)
- [ ] GET /tracking-links/:token/resolve {kind,targetType,targetId,originalUrl,sharerId,isActive,expiresAt}
- [ ] Fallback ConversationShareLink (kind=conversation); expired→isActive:false HTTP 200
- [ ] Declare ALL fields in Fastify response schema

## Verification
- [ ] pnpm jest posts-engagement + new tests green
- [ ] pnpm tsc --noEmit (gateway) green

---
"@meeshy/shared": patch
---

Add `sharedPlaceResponseSchema` as the single response shape for a shared place

A shared place was described inline by each response schema that hoists
`metadata.location`. Because fast-json-stringify truncates any undeclared
property without a signal, a surface that copies the shape slightly wrong — or
forgets it — loses the position with nothing to show for it. That is precisely
what happened to both share-link send routes.

The two existing copies in `api-schemas.ts` now spread this constant (overriding
only `description`), and the share-link message schema uses it too.

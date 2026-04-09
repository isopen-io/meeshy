---
name: Stats recompute MongoDB aggregate follow-up
description: ConversationMessageStatsService.recompute() loads all messages in memory — needs MongoDB aggregate pipeline for large conversations
type: project
---

ConversationMessageStatsService.recompute() uses prisma.message.findMany() without limit, loading all messages into Node.js memory. For 100k+ message conversations, this causes high memory usage and latency.

**Why:** Only triggers on cold start (first stats request for a conversation without a ConversationMessageStats row). After that, everything is incremental. New conversations start at 0. But pre-existing conversations will hit this once.

**How to apply:** Replace findMany with prisma.$runCommandRaw() MongoDB aggregate pipeline ($match + $group) in ConversationMessageStatsService.recompute(). File: services/gateway/src/services/ConversationMessageStatsService.ts. Can also add a one-time migration script to pre-populate stats for existing conversations.

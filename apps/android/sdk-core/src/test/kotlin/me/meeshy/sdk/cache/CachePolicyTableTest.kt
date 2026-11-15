package me.meeshy.sdk.cache

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.cache.CachePolicy.StorageLocation
import org.junit.Test

/**
 * The retention table is the SAME on both platforms: every resource below carries the numbers
 * of its iOS twin in `packages/MeeshySDK/.../Cache/CachePolicy.swift` (`staleTTL` = fresh
 * window, `ttl` = keep window, `maxItemCount`). iOS `months(n)` is n * 30 days, `years(n)` n * 365.
 */
class CachePolicyTableTest {

    private fun minutes(n: Long) = n * 60_000L
    private fun hours(n: Long) = n * 3_600_000L
    private fun days(n: Long) = n * 86_400_000L
    private fun months(n: Long) = n * 30 * 86_400_000L
    private fun years(n: Long) = n * 365 * 86_400_000L

    private fun assertWindows(policy: CachePolicy, fresh: Long, keep: Long, maxItems: Int? = null) {
        assertThat(policy.freshForMillis).isEqualTo(fresh)
        assertThat(policy.keepForMillis).isEqualTo(keep)
        assertThat(policy.maxItemCount).isEqualTo(maxItems)
        assertThat(policy.storageLocation).isEqualTo(StorageLocation.Room)
    }

    // ── Windows the lot names explicitly ───────────────────────────────────────

    @Test
    fun `messages keep six months, stay fresh two minutes, cap at 600`() =
        assertWindows(CachePolicy.Messages, fresh = minutes(2), keep = months(6), maxItems = 600)

    @Test
    fun `stories keep 72 hours`() =
        assertWindows(CachePolicy.Stories, fresh = minutes(5), keep = hours(72))

    @Test
    fun `feed keeps seven days, stays fresh five minutes, caps at 100 posts`() =
        assertWindows(CachePolicy.Feed, fresh = minutes(5), keep = days(7), maxItems = 100)

    @Test
    fun `comments keep one hour and cap at 500`() =
        assertWindows(CachePolicy.Comments, fresh = minutes(2), keep = hours(1), maxItems = 500)

    @Test
    fun `notifications keep 24 hours, stay fresh two minutes, cap at 200`() =
        assertWindows(CachePolicy.Notifications, fresh = minutes(2), keep = hours(24), maxItems = 200)

    @Test
    fun `call history keeps 30 days and caps at 300`() =
        assertWindows(CachePolicy.CallHistory, fresh = minutes(5), keep = days(30), maxItems = 300)

    @Test
    fun `profiles keep 30 days and cap at 100`() =
        assertWindows(CachePolicy.Profiles, fresh = minutes(5), keep = days(30), maxItems = 100)

    @Test
    fun `user stats keep six hours and cap at 10`() =
        assertWindows(CachePolicy.UserStats, fresh = minutes(10), keep = hours(6), maxItems = 10)

    @Test
    fun `participants keep 24 hours and stay fresh five minutes`() =
        assertWindows(CachePolicy.Participants, fresh = minutes(5), keep = hours(24))

    @Test
    fun `conversation media keeps six months and stays fresh ten minutes with no cap`() =
        assertWindows(CachePolicy.ConversationMedia, fresh = minutes(10), keep = months(6))

    // ── Windows that already matched iOS and must not move ─────────────────────

    @Test
    fun `conversations keep 24 hours and stay fresh five minutes`() =
        assertWindows(CachePolicy.Conversations, fresh = minutes(5), keep = hours(24))

    @Test
    fun `links and tokens keep 12 hours and cap at 100`() =
        assertWindows(CachePolicy.LinksAndTokens, fresh = minutes(5), keep = hours(12), maxItems = 100)

    @Test
    fun `preferences keep 24 hours, stay fresh ten minutes, cap at 500`() =
        assertWindows(CachePolicy.Preferences, fresh = minutes(10), keep = hours(24), maxItems = 500)

    @Test
    fun `communities keep 24 hours, stay fresh five minutes, cap at 500`() =
        assertWindows(CachePolicy.Communities, fresh = minutes(5), keep = hours(24), maxItems = 500)

    // ── Local-only stores: never stale, fresh until the eviction horizon ───────

    @Test
    fun `drafts are fresh for their whole 30 days`() =
        assertWindows(CachePolicy.Drafts, fresh = days(30), keep = days(30), maxItems = 500)

    @Test
    fun `call transcripts are fresh for their whole 90 days`() =
        assertWindows(CachePolicy.CallTranscripts, fresh = days(90), keep = days(90), maxItems = 1000)

    @Test
    fun `call network journals are fresh for their whole 30 days`() =
        assertWindows(CachePolicy.CallNetworkJournals, fresh = days(30), keep = days(30), maxItems = 200)

    // ── Windows Android keeps on purpose ───────────────────────────────────────

    @Test
    fun `statuses keep their Android windows until the status bar cache is realigned`() =
        assertWindows(CachePolicy.Statuses, fresh = minutes(1), keep = hours(24))

    @Test
    fun `suggestions have no iOS twin and keep their Android windows`() =
        assertWindows(CachePolicy.Suggestions, fresh = minutes(1), keep = hours(6))

    @Test
    fun `the default policy keeps the five minute and 24 hour windows`() =
        assertWindows(CachePolicy.Default, fresh = minutes(5), keep = hours(24))

    // ── Disk storage ───────────────────────────────────────────────────────────

    private fun assertDisk(policy: CachePolicy, ttl: Long, subdir: String, maxBytes: Long) {
        assertThat(policy.freshForMillis).isEqualTo(ttl)
        assertThat(policy.keepForMillis).isEqualTo(ttl)
        assertThat(policy.maxItemCount).isNull()
        assertThat(policy.storageLocation).isEqualTo(StorageLocation.Disk(subdir, maxBytes))
    }

    @Test
    fun `images live a year on disk within 300 MB`() =
        assertDisk(CachePolicy.MediaImages, ttl = years(1), subdir = "Images", maxBytes = 300_000_000L)

    @Test
    fun `audio lives six months on disk within 200 MB`() =
        assertDisk(CachePolicy.MediaAudio, ttl = months(6), subdir = "Audio", maxBytes = 200_000_000L)

    @Test
    fun `video lives six months on disk within 1 GB`() =
        assertDisk(CachePolicy.MediaVideo, ttl = months(6), subdir = "Video", maxBytes = 1_000_000_000L)

    @Test
    fun `thumbnails live six months on disk within 150 MB`() =
        assertDisk(CachePolicy.Thumbnails, ttl = months(6), subdir = "Thumbnails", maxBytes = 150_000_000L)

    @Test
    fun `a disk entry is never stale, it is fresh until its ttl and then expired`() {
        val policy = CachePolicy.MediaVideo

        assertThat(classifyCache("clip", policy.keepForMillis, policy)).isInstanceOf(CacheResult.Fresh::class.java)
        assertThat(classifyCache("clip", policy.keepForMillis + 1, policy)).isInstanceOf(CacheResult.Syncing::class.java)
    }

    // ── The constructor existing call sites use ────────────────────────────────

    @Test
    fun `the two-argument constructor stays valid and defaults to an unbounded Room entry`() {
        val policy = CachePolicy(freshForMillis = 1_000L, keepForMillis = 10_000L)

        assertThat(policy.maxItemCount).isNull()
        assertThat(policy.storageLocation).isEqualTo(StorageLocation.Room)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `a keep window shorter than the fresh window is refused`() {
        CachePolicy(freshForMillis = 10_000L, keepForMillis = 1_000L)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `an item cap of zero is refused`() {
        CachePolicy(freshForMillis = 1_000L, keepForMillis = 10_000L, maxItemCount = 0)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `a disk budget of zero bytes is refused`() {
        StorageLocation.Disk(subdir = "Images", maxBytes = 0L)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `a disk entry needs a subdirectory`() {
        StorageLocation.Disk(subdir = " ", maxBytes = 1L)
    }
}

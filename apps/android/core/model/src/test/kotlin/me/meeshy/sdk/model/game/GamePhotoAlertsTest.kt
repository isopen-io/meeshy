package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import me.meeshy.sdk.testutil.SharedFixtures
import me.meeshy.sdk.testutil.stringOrNull
import org.junit.Test

/** Les alertes d'immortalisation (#10173) : le rythme, la nuit, le silence et l'arriéré, rejoués sur la loi `photo-alert`. */
class GamePhotoAlertsTest {

    private val vectors = SharedFixtures.vectors("reading-modes/game.vectors.json").filter { it.input.stringOrNull("law") == "photo-alert" }

    private fun JsonElement?.int(): Int? = if (this == null || this is JsonNull) null else jsonPrimitive.intOrNull
    private fun JsonElement?.long(): Long? = if (this == null || this is JsonNull) null else jsonPrimitive.longOrNull
    private fun JsonElement?.string(): String? = if (this == null || this is JsonNull) null else jsonPrimitive.contentOrNull
    private fun JsonElement?.strings(): List<String> = (this as? JsonArray)?.map { it.jsonPrimitive.content }.orEmpty()
    private fun JsonElement?.isAbsent(): Boolean = this == null || this is JsonNull

    private fun standingOf(obj: JsonObject) = PhotoCatchUpStanding(
        rank = GloryRank.entries.first { it.name.lowercase() == obj["rank"].string() },
        division = obj["division"].int(),
        levelRecord = obj["levelRecord"].int()!!,
        prestige = obj["prestige"].int()!!,
        minted = obj["minted"].int()!!,
        treasuryTier = obj["treasuryTier"].string()?.let { wire -> TreasuryTierKey.entries.first { it.name.lowercase() == wire } },
        flameRecord = obj["flameRecord"].int()!!,
        pastCycleRecords = (obj["pastCycleRecords"] as? JsonArray)?.map { it.int()!! },
    )

    private fun policyOf(obj: JsonObject) = PhotoAlertPolicy(
        photographs = PhotoAlertPolicy.Photographs.entries.first { it.wire == obj["photographs"].string() },
        invitations = PhotoAlertPolicy.Invitations.entries.first { it.wire == obj["invitations"].string() },
        backlog = PhotoAlertPolicy.Backlog.entries.first { it.wire == obj["backlog"].string() },
        inApp = obj["inApp"]!!.jsonObject.let {
            PhotoAlertPolicy.InApp(it["perDay"].int()!!, it["minGapMinutes"].int()!!, it["sessionGraceMinutes"].int()!!)
        },
        push = obj["push"]!!.jsonObject.let {
            PhotoAlertPolicy.Push(it["perDay"].int()!!, it["delayMinutes"].int()!!, it["nightFromHour"].int()!!, it["nightToHour"].int()!!)
        },
    )

    private fun pacingOf(obj: JsonObject) = PhotoAlertPacing(
        now = obj["now"].long()!!,
        dayKey = obj["dayKey"].string()!!,
        sessionStartedAt = obj["sessionStartedAt"].long(),
        surface = PhotoAlertPacing.Surface.entries.first { it.wire == obj["surface"].string() },
        shown = obj["shown"]!!.jsonArray.map { PhotoAlertPacing.Shown(it.jsonObject["at"].long()!!, it.jsonObject["dayKey"].string()!!) },
    )

    private fun kind(kind: String) = vectors.filter { it.input.stringOrNull("kind") == kind }
        .also { assertWithMessage("aucun vecteur photo-alert $kind").that(it).isNotEmpty() }

    @Test
    fun `alert rejoue les alertes annoncees et leur proposition`() {
        kind("alert").forEach { v ->
            val input = v.input
            val alert = GamePhotoAlerts.alert(
                reached = input["reached"].strings(),
                standing = standingOf(input["standing"]!!.jsonObject),
                kept = input["kept"].strings(),
                presented = input["presented"].strings(),
                baseline = input["baseline"].takeUnless { it.isAbsent() }?.let { standingOf(it.jsonObject) },
                policy = policyOf(input["policy"]!!.jsonObject),
                treasuryPeak = input["treasuryPeak"].string()?.let { wire -> TreasuryTierKey.entries.first { it.name.lowercase() == wire } },
                pacing = input["pacing"].takeUnless { it.isAbsent() }?.let { pacingOf(it.jsonObject) },
            )
            val expected = v.expected!!.jsonObject["alert"]
            if (expected.isAbsent()) {
                assertWithMessage("${v.label}").that(alert).isNull()
            } else {
                val e = expected!!.jsonObject
                assertWithMessage("${v.label} : annonce").that(alert?.announce).isEqualTo(e["announce"].string())
                assertWithMessage("${v.label} : proposition").that(alert?.propose).isEqualTo(e["propose"].string())
                assertWithMessage("${v.label} : accusées").that(alert?.reached).isEqualTo(e["reached"].strings())
            }
        }
    }

    @Test
    fun `pacing rejoue le rythme dans l app`() {
        kind("pacing").forEach { v ->
            val pace = GamePhotoAlerts.pacing(pacingOf(v.input["pacing"]!!.jsonObject), policyOf(v.input["policy"]!!.jsonObject))
            assertWithMessage(v.label).that(pace.wire).isEqualTo(v.expected!!.jsonObject["pace"].string())
        }
    }

    @Test
    fun `steps rejoue ce que la politique photographie`() {
        kind("steps").forEach { v ->
            val steps = GamePhotoCatchUpLaw.stepsReached(standingOf(v.input["standing"]!!.jsonObject), policyOf(v.input["policy"]!!.jsonObject))
            assertWithMessage(v.label).that(steps.map { it.id }).isEqualTo(v.expected!!.jsonObject["ids"].strings())
        }
    }

    @Test
    fun `digest rejoue le resume groupe du push`() {
        kind("digest").forEach { v ->
            val moments = v.input["moments"]!!.jsonArray.map {
                val o = it.jsonObject
                PhotoMomentRecord(o["stepId"].string()!!, o["presentedAt"].string(), o["notifiedAt"].string())
            }
            val digest = GamePhotoAlerts.digest(moments)
            val expected = v.expected!!.jsonObject["digest"]
            if (expected.isAbsent()) assertWithMessage(v.label).that(digest).isNull() else {
                assertWithMessage(v.label).that(digest?.stepIds).isEqualTo(expected!!.jsonObject["stepIds"].strings())
                assertWithMessage(v.label).that(digest?.count).isEqualTo(expected.jsonObject["count"].int())
            }
        }
    }

    @Test
    fun `big rejoue les grands moments`() {
        kind("big").forEach { v ->
            val actual = v.input["ids"].strings().map(GamePhotoAlerts::isBigMoment)
            assertWithMessage(v.label).that(actual).isEqualTo(v.expected!!.jsonObject["big"]!!.jsonArray.map { it.jsonPrimitive.booleanOrNull })
        }
    }

    @Test
    fun `la politique standard est celle du vecteur`() {
        kind("policy").forEach { v -> assertThat(PhotoAlertPolicy.Standard).isEqualTo(policyOf(v.expected!!.jsonObject)) }
    }

    @Test
    fun `le push ne part jamais la nuit de 21 h a 9 h`() {
        assertThat(listOf(20, 21, 23, 0, 8, 9, 12).map { GamePhotoAlerts.isPushNight(it) })
            .containsExactly(false, true, true, true, true, false, false).inOrder()
    }

    @Test
    fun `une invitation passive attend la fin de la grace de la session puis reste silencieuse apres une affichee`() {
        val start = 1_000_000_000L
        fun pacing(now: Long, shown: List<PhotoAlertPacing.Shown> = emptyList()) =
            PhotoAlertPacing(now, "2026-10-11", start, PhotoAlertPacing.Surface.Passive, shown)
        assertThat(GamePhotoAlerts.pacing(pacing(start + 5 * 60_000L))).isEqualTo(PhotoAlertPace.Wait)
        assertThat(GamePhotoAlerts.pacing(pacing(start + 11 * 60_000L))).isEqualTo(PhotoAlertPace.Allowed)
        assertThat(GamePhotoAlerts.pacing(pacing(start + 11 * 60_000L, listOf(PhotoAlertPacing.Shown(start, "2026-10-12")))))
            .isEqualTo(PhotoAlertPace.Silent)
    }
}

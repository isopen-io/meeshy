package me.meeshy.sdk.model.game

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Fabriques de JSON serveur pour les tests du bloc `game` : une charge COMPLÈTE, modifiable clé par clé. */
internal object GameBlockFixtures {

    val json = Json { explicitNulls = true; encodeDefaults = false }

    fun mission(id: String = "m1", completedAt: String? = null): JsonObject = buildJsonObject {
        put("id", id)
        put("templateKey", "send-messages")
        put("difficulty", "easy")
        put("signal", "axis:content.post")
        put("prism", false)
        put("target", 5)
        put("progress", 2)
        put("reward", 600)
        put("glory", 60)
        put("completedAt", completedAt?.let(::JsonPrimitive) ?: JsonNull)
    }

    fun personal(): JsonObject = JsonObject(
        mission("p1").toMutableMap().apply {
            put("startsAt", JsonPrimitive("2026-10-20T10:00:00.000Z"))
            put("endsAt", JsonPrimitive("2026-10-20T12:00:00.000Z"))
            put("state", JsonPrimitive("active"))
        },
    )

    fun ladder(): JsonObject = buildJsonObject {
        put("level", 142)
        put("tier", "nebuleuse")
        put("floorScore", 90000)
        put("nextThreshold", 91000)
        put("pointsToNext", 1000)
        put("progress", 0.25)
        put("record", 150)
        put("cap", 499)
        put("isMax", false)
        put("held", true)
        put("levelMaxLifetime", 160)
        put("pastCycleRecords", JsonArray(listOf(JsonPrimitive(100))))
        put(
            "step",
            buildJsonObject {
                put("level", 150); put("kind", "rank"); put("target", 6000); put("current", 5000)
                put("met", false); put("rank", "voix")
            },
        )
        put(
            "steps",
            buildJsonObject { put("minted", 3); put("missionsDone", 12); put("flameRecord", 9) },
        )
    }

    fun level(withLadder: Boolean = true): JsonObject = buildJsonObject {
        put("level", 100)
        put("tier", "galaxie")
        put("score", 80000)
        put("floorScore", 70000)
        put("nextThreshold", JsonNull)
        put("pointsToNext", 0)
        put("progress", 1.0)
        put("record", 100)
        put("prestige", 1)
        put("canPrestige", true)
        if (withLadder) put("ladder", ladder())
        put("sparks", 5_000_000_000L)
        put("sparksCycle", 6_000_000_000L)
        put("sparksLifetime", 7_000_000_000L)
        put("levelMaxLifetime", 160)
        put("sparksDebt", 0)
    }

    fun glory(): JsonObject = buildJsonObject {
        put("glory", 70000)
        put("rank", "polyglotte")
        put("division", 2)
        put("division5", 3)
        put(
            "next",
            buildJsonObject { put("rank", "ambassadeur"); put("division", 3); put("division5", 5); put("minGlory", 130000) },
        )
        put("gloryMissing", 60000)
        put("progress", 0.1)
        put("mythic", JsonNull)
    }

    fun treasury(): JsonObject = buildJsonObject {
        put("held", 12)
        put("tier", "escarcelle")
        put("next", buildJsonObject { put("key", "coffret"); put("minHeld", 50); put("missing", 38) })
        put(
            "access",
            JsonArray(
                listOf(
                    buildJsonObject {
                        put("key", "bourse"); put("minHeld", 1); put("locked", false); put("requires", JsonNull)
                    },
                    buildJsonObject {
                        put("key", "tresor"); put("minHeld", 500); put("locked", true)
                        put(
                            "requires",
                            buildJsonObject { put("rank", "voix"); put("division", 1); put("division5", 1) },
                        )
                    },
                ),
            ),
        )
    }

    fun mint(edition: String = "silver"): JsonObject = buildJsonObject {
        put("number", 13)
        put("price", 1588)
        put("edition", edition)
        put("canMint", false)
        put("missingPoints", 300)
        put("levelBefore", 100)
        put("levelAfter", 100)
        put("levelsLost", 0)
        put("gloryGained", 0)
        put("basePrice", 1587)
        put("costFactor", 1.0)
        put("costLevel", 100)
    }

    fun chest(): JsonObject = buildJsonObject {
        put("status", "ready")
        put(
            "odds",
            buildJsonObject {
                put("minPoints", 500); put("maxPoints", 10000); put("fragment", 0.1666); put("freeze", 0.05)
                put("minGlory", 50); put("maxGlory", 1000); put("bonusWhole", 0.05); put("bonusFifth", 0.1666)
            },
        )
        put("reward", JsonNull)
        put(
            "today",
            buildJsonObject { put("points", 1721); put("glory", 172); put("bonusWhole", 1221); put("bonusFifth", 244) },
        )
    }

    fun flame(): JsonObject = buildJsonObject {
        put("days", 8)
        put("form", "flamme")
        put("bonusPercent", 5)
        put("freezes", 1)
        put("maxFreezes", 2)
        put("freezePrice", 1)
        put("relightPrice", 3)
        put("status", "lit")
        put("canRelight", false)
    }

    fun boosts(): JsonObject = buildJsonObject {
        put("tailwind", 1.25)
        put(
            "prismHour",
            buildJsonObject { put("startMinute", 600); put("endMinute", 660); put("multiplier", 2.0) },
        )
    }

    fun block(personal: JsonElement? = personal(), overrides: Map<String, JsonElement?> = emptyMap()): JsonObject {
        val base = mutableMapOf<String, JsonElement>(
            "level" to level(),
            "glory" to glory(),
            "treasury" to treasury(),
            "mint" to mint(),
            "missions" to buildJsonObject {
                put("dayKey", "2026-10-20")
                put("prismDay", false)
                put("unlocked", true)
                put("items", JsonArray(listOf(mission("m1"), mission("m2", "2026-10-20T09:00:00.000Z"))))
                put("rerollAvailable", true)
                if (personal != null) put("personal", personal)
            },
            "chest" to chest(),
            "flame" to flame(),
            "boosts" to boosts(),
            "guideSeen" to JsonArray(listOf(JsonPrimitive("welcome"))),
            "starFragments" to buildJsonObject { put("collected", 4) },
        )
        overrides.forEach { (key, value) -> if (value == null) base.remove(key) else base[key] = value }
        return JsonObject(base)
    }
}

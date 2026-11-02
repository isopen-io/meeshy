package me.meeshy.sdk.model.game

import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

/*
 * Le jour, la graine et le tirage du Jeu Meeshy (#9373). MIROIR de
 * `packages/shared/utils/game/day-prng.ts` et de `GameDay.swift` (iOS).
 *
 * Aucune horloge ni aucun aléa implicites : le jour est une CLÉ `AAAA-MM-JJ` calculée dans le
 * fuseau du COMPTE (`User.timezone`, UTC à défaut), jamais celui de l'appareil. La graine est
 * FNV-1a 32 bits sur les octets UTF-8 de `userId|jour|sel`, la suite est mulberry32 : des
 * opérations entières non signées sur 32 bits, que `game.vectors.json` rejoue à l'identique.
 */

/** Les opérations sur les clés de jour `AAAA-MM-JJ`. Une clé illisible rend `null` : le client ne plante pas. */
public object GameDay {

    private val shape = Regex("^(\\d{4})-(\\d{2})-(\\d{2})$")

    private fun civil(dayKey: String): LocalDate? {
        val match = shape.matchEntire(dayKey) ?: return null
        val (year, month, day) = match.destructured
        if (year.toInt() < 100) return null
        return try {
            LocalDate.of(year.toInt(), month.toInt(), day.toInt())
        } catch (_: DateTimeException) {
            null
        }
    }

    /** `true` pour une vraie date du calendrier au format `AAAA-MM-JJ` (années 0000 à 0099 refusées, comme le TS). */
    public fun isDayKey(value: String): Boolean = civil(value) != null

    /** Nombre de jours écoulés depuis 1970-01-01, `null` si la clé n'est pas une date. */
    public fun number(dayKey: String): Long? = civil(dayKey)?.toEpochDay()

    /** La clé `days` jours après (ou avant, si négatif) [dayKey]. */
    public fun add(days: Int, dayKey: String): String? = civil(dayKey)?.plusDays(days.toLong())?.toString()

    /** Jours calendaires de [from] à [to] : positif quand [to] est après [from]. */
    public fun diff(from: String, to: String): Int? {
        val start = number(from) ?: return null
        val end = number(to) ?: return null
        return (end - start).toInt()
    }

    /** `AAAA-MM` — sert à « une fois par mois ». */
    public fun month(dayKey: String): String = dayKey.take(7)

    /** Le fuseau où se découpe le jour de jeu : celui du compte, ou UTC — le même repli que la passerelle. */
    public fun zone(timezone: String?): ZoneId {
        if (timezone.isNullOrEmpty()) return ZoneOffset.UTC
        return try {
            ZoneId.of(timezone)
        } catch (_: DateTimeException) {
            ZoneOffset.UTC
        }
    }

    /** La clé du jour de jeu à cet instant, dans le fuseau du COMPTE (jamais celui de l'appareil). */
    public fun dayKey(epochMillis: Long, timezone: String?): String =
        Instant.ofEpochMilli(epochMillis).atZone(zone(timezone)).toLocalDate().toString()

    /** La minute du jour LOCAL du compte à cet instant, 0..1439. */
    public fun minuteOfDay(epochMillis: Long, timezone: String?): Int {
        val time = Instant.ofEpochMilli(epochMillis).atZone(zone(timezone)).toLocalTime()
        return time.hour * 60 + time.minute
    }
}

/** Ce qui fait la graine : l'utilisateur, le jour et un SEL qui sépare les usages. */
public data class GameSeedParts(val userId: String, val dayKey: String, val salt: String)

public object GameSeed {
    private const val FNV_OFFSET: UInt = 0x811c9dc5u
    private const val FNV_PRIME: UInt = 0x01000193u

    /** FNV-1a 32 bits, non signé, sur les octets UTF-8. */
    public fun fnv1a(text: String): UInt =
        text.toByteArray(Charsets.UTF_8).fold(FNV_OFFSET) { hash, byte -> (hash xor (byte.toUInt() and 0xffu)) * FNV_PRIME }

    /** `fnv1a("userId|jour|sel")`. */
    public fun seed(parts: GameSeedParts): UInt = fnv1a("${parts.userId}|${parts.dayKey}|${parts.salt}")
}

/** mulberry32 : une suite déterministe de tirages dans [0, 1). Zéro dépendance, rejouable depuis la graine. */
public class GameRandom(seed: UInt) {
    private var state: UInt = seed

    public constructor(parts: GameSeedParts) : this(GameSeed.seed(parts))

    public fun next(): Double {
        state += 0x6d2b79f5u
        var t = state
        t = (t xor (t shr 15)) * (t or 1u)
        t = t xor (t + (t xor (t shr 7)) * (t or 61u))
        return (t xor (t shr 14)).toDouble() / 4_294_967_296.0
    }

    /** Un indice dans [0, length[ ; le tirage est CONSOMMÉ même si [length] vaut 0 (clients alignés). */
    public fun pickIndex(length: Int): Int = kotlin.math.floor(next() * length).toInt()
}

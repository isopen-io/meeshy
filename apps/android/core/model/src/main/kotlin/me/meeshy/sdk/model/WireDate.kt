package me.meeshy.sdk.model

import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * LES DATES DU FIL — la source unique de ce que le client écrit à la passerelle et relit de ce
 * qu'elle sert. Miroir de `WireDate` (`packages/MeeshySDK/.../Utils/WireDate.swift`, #6609).
 *
 * La passerelle sérialise par `toISOString` (`2026-09-15T09:34:23.563Z`) et valide ses entrées par
 * `z.string().datetime({ offset: true })`. Le client écrit donc une date-heure ISO 8601 COMPLÈTE,
 * en UTC, à TROIS chiffres de millisecondes, et relit avec ET sans fractions de seconde.
 *
 * Pourquoi ne pas écrire `Instant.toString()` : il omet les fractions à la seconde ronde
 * (`…:23Z`) et les écrit sur 1, 2, 3, 6 ou 9 chiffres selon la valeur (`…:23.5Z`). Valide pour la
 * passerelle, mais illisible comme clé de comparaison, et deux dates égales à la milliseconde
 * s'écrivent alors de deux façons.
 *
 * L'arrondi est une règle écrite : une date sous la milliseconde s'arrondit vers le BAS, jamais
 * vers le haut — un watermark écrit plus tard que lui-même ferait sauter une ligne du delta.
 */
public object WireDate {

    private val formatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT).withZone(ZoneOffset.UTC)

    /** `2026-09-15T09:34:23.563Z` pour des millisecondes depuis l'époque. */
    public fun string(epochMillis: Long): String = formatter.format(Instant.ofEpochMilli(epochMillis))

    /**
     * `2026-09-15T09:34:23.563Z` pour un instant, arrondi vers le BAS à la milliseconde
     * (`Instant.toEpochMilli` plancher, y compris avant l'époque).
     */
    public fun string(instant: Instant): String = string(instant.toEpochMilli())

    /**
     * Les millisecondes depuis l'époque d'une date-heure ISO 8601 avec ou sans fractions, en `Z`
     * ou avec décalage. `null` pour tout le reste — une heure seule n'est pas une date, ni une
     * chaîne vide ou blanche. Une fraction plus fine que la milliseconde est arrondie vers le bas.
     */
    public fun epochMillis(value: String?): Long? = instant(value)?.toEpochMilli()

    /** Même lecture que [epochMillis], rendue comme [Instant]. */
    public fun instant(value: String?): Instant? {
        if (value.isNullOrBlank()) return null
        return runCatching { Instant.parse(value) }
            .recoverCatching { OffsetDateTime.parse(value).toInstant() }
            .getOrNull()
    }
}

package me.meeshy.sdk.model

import java.time.Instant
import java.time.ZoneId

/**
 * Les regles de la declaration de date de naissance — port de `BirthDateService.wireDay`
 * et de `BirthDateDeclarationError.classify` (`BirthDateService.swift`).
 */
object BirthDateRules {

    /**
     * Le jour CIVIL que l'utilisateur a choisi, au format `AAAA-MM-JJ` du contrat, lu dans le
     * fuseau [zone] (celui de l'appareil par defaut). Aucune locale n'intervient : les chiffres
     * sont toujours ASCII, jamais ceux de l'arabe ou du hindi.
     */
    fun wireDay(epochMillis: Long, zone: ZoneId = ZoneId.systemDefault()): String {
        val day = Instant.ofEpochMilli(epochMillis).atZone(zone).toLocalDate()
        return "${pad(day.year, 4)}-${pad(day.monthValue, 2)}-${pad(day.dayOfMonth, 2)}"
    }

    /**
     * Le jour civil (`AAAA-MM-JJ`) d'un instant choisi par le selecteur Material3, qui rend
     * minuit UTC du jour retenu : il se lit donc en UTC, jamais dans le fuseau de l'appareil.
     */
    fun wireDayFromPicker(pickerUtcMillis: Long): String =
        wireDay(pickerUtcMillis, java.time.ZoneOffset.UTC)

    /** `viewerWriteRestrictionGlobal` ferme l'ecriture d'un mineur (13-17 ans) : il se lit, sans s'ecrire. */
    fun restrictsWriting(declaration: BirthDateDeclaration): Boolean =
        declaration.viewerWriteRestrictionGlobal

    private fun pad(value: Int, width: Int): String = value.toString().padStart(width, '0')
}

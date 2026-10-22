package me.meeshy.sdk.model.link

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

/**
 * Une adresse BRUTE découpée comme la lit la RFC 3986 — celle de `android.net.Uri` et de Foundation : l'autorité
 * s'arrête au premier `/`, `?` ou `#`, jamais à `\`. Rien n'est décodé, rien n'est normalisé : les lois de lien
 * (`EmailLinkSecret`, `InAppLinks`) jugent sur ce que l'adresse DIT, pas sur ce qu'un analyseur indulgent en ferait.
 *
 * Kotlin pur (aucun `android.net.Uri`) : la lecture se prouve sur une JVM nue.
 */
internal data class RawUrl(
    val scheme: String,
    val authority: String?,
    val path: String,
    val query: String?,
    val fragment: String?,
) {
    /** L'hôte de l'autorité, sans identifiants ni port, en minuscules. `null` sans autorité. */
    val host: String?
        get() = authority?.substringAfterLast('@')?.substringBefore(':')?.lowercase()

    companion object {
        private val pattern = Regex(
            """([A-Za-z][A-Za-z0-9+.\-]*):(?://([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?""",
            RegexOption.DOT_MATCHES_ALL,
        )

        /** `null` ⇒ adresse illisible : pas de schéma. */
        fun parse(raw: String): RawUrl? = pattern.matchEntire(raw)?.let { match ->
            val groups = match.groups
            RawUrl(
                scheme = match.groupValues[1],
                authority = groups[2]?.value,
                path = match.groupValues[3],
                query = groups[4]?.value,
                fragment = groups[5]?.value,
            )
        }
    }
}

private val percentRun = Regex("(?:%[0-9a-fA-F]{2})+")

/**
 * Décode chaque suite de `%xx` d'UN tour. Une suite qui n'est pas de l'UTF-8 valide (octet isolé, forme trop longue,
 * substitut) reste TELLE QUELLE — comme `decodeURIComponent` sous `try` côté TypeScript et `removingPercentEncoding ?? run`
 * côté Swift. Le `+` n'est jamais un espace ici : c'est un décodage de chemin, pas de formulaire.
 */
internal fun percentDecodeOnce(text: String): String =
    percentRun.replace(text) { run -> utf8OrNull(run.value) ?: run.value }

private fun utf8OrNull(escapes: String): String? {
    val bytes = ByteArray(escapes.length / 3) { index ->
        escapes.substring(index * 3 + 1, index * 3 + 3).toInt(radix = 16).toByte()
    }
    return try {
        Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes))
            .toString()
    } catch (_: CharacterCodingException) {
        null
    }
}

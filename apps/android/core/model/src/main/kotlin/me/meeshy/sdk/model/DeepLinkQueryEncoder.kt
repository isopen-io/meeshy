package me.meeshy.sdk.model

/**
 * Valeur de requête d'un lien `meeshy://` construit par un raccourci, un assistant ou un widget.
 * Miroir de `IntentURLQuery` d'iOS : l'ensemble « requête autorisée » moins `& = + ? #`.
 * Une dictée « Tom & Jerry ce soir » ne doit pas arriver tronquée à « Tom » : `&` ouvrirait un autre
 * paramètre, `=` une valeur, `+` se lirait comme une espace et `?` / `#` ouvriraient une requête ou un fragment.
 */
object DeepLinkQueryEncoder {
    private const val LITERAL: String = "-._~!$'()*,/:;@"
    private const val HEX: String = "0123456789ABCDEF"

    fun encode(value: String): String {
        val out = StringBuilder(value.length)
        value.toByteArray(Charsets.UTF_8).forEach { byte ->
            val c = (byte.toInt() and 0xFF).toChar()
            if (byte >= 0 && isLiteral(c)) {
                out.append(c)
            } else {
                val v = byte.toInt() and 0xFF
                out.append('%').append(HEX[v shr 4]).append(HEX[v and 0x0F])
            }
        }
        return out.toString()
    }

    private fun isLiteral(c: Char): Boolean =
        c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9' || c in LITERAL
}

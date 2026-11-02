package me.meeshy.sdk.model.avatar

/**
 * Libellé TalkBack d'un avatar : le nom, son humeur, et « dans la conversation » quand le pair y est.
 * La pastille d'humeur masque le point et n'est lue par personne : sans ce libellé, l'humeur
 * n'existait que pour l'oeil. Miroir de `MeeshyAvatar.spokenName`.
 *
 * Pur : les deux libellés localisés viennent de l'appelant ([moodLabel] reçoit l'emoji).
 */
public object AvatarAccessibilityLabel {

    public fun spokenName(
        name: String,
        moodEmoji: String?,
        isHere: Boolean,
        moodLabel: (String) -> String,
        hereLabel: String,
        fallbackName: String = "",
    ): String {
        val mood = moodEmoji?.takeIf { it.isNotEmpty() }?.let(moodLabel)
        val here = hereLabel.takeIf { isHere }
        return listOfNotNull(name.ifBlank { fallbackName }.takeIf { it.isNotBlank() }, mood, here)
            .joinToString(", ")
    }
}

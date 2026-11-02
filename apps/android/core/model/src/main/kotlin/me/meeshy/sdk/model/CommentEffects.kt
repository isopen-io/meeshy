package me.meeshy.sdk.model

/**
 * **CE QU'UN COMMENTAIRE PORTE COMME EFFETS** (#14385, iOS `commentBlurEnabled` + `commentEffects` → `effectFlags`) : le
 * flou (toucher pour révéler) et les effets PERMANENTS — lueur, pulsation, arc-en-ciel, étincelles. Ni éphémère, ni vue
 * unique, ni effet d'apparition : iOS ne les offre pas à un commentaire (`ComposerMode.comment`), et un drapeau reçu
 * hors de cet ensemble ne se rend pas.
 */
public object CommentEffects {

    /** Les bits qu'un commentaire peut porter. */
    public const val ALLOWED_MASK: Long = MessageEffectFlags.BLURRED or MessageEffectFlags.PERSISTENT_MASK

    /** Bascule [flag] dans [effects] ; un drapeau qu'un commentaire ne porte pas est sans effet. */
    public fun toggle(effects: MessageEffects, flag: Long): MessageEffects =
        if (flag and ALLOWED_MASK.inv() != 0L || flag == 0L) effects else MessageEffectsEditor.toggle(effects, flag)

    /** Le `effectFlags` du POST : `null` quand rien n'est posé (iOS `flags > 0 ? Int(flags) : nil`). */
    public fun wire(effects: MessageEffects): Int? = (effects.flags and ALLOWED_MASK).takeIf { it != 0L }?.toInt()

    /** Ce que le fil REND d'un commentaire reçu : seulement ses bits de commentaire. */
    public fun served(effectFlags: Int?): MessageEffects =
        MessageEffects(flags = (effectFlags?.toLong() ?: 0L) and ALLOWED_MASK)

    /** Un commentaire flouté se lit en le touchant. */
    public fun isBlurred(effectFlags: Int?): Boolean = MessageEffectFlags.has(served(effectFlags).flags, MessageEffectFlags.BLURRED)
}

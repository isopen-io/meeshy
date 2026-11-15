package me.meeshy.app.profile

import androidx.annotation.StringRes
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.ui.R as UiR

/**
 * Les libellés IMPÉRATIFS d'un lien (#14910, décision porteur) — iso `ProfileCircleWording.swift` : monter dit le cercle
 * visé (Soyons amis, Soyons proches, Devenons sang), descendre le cercle d'arrivée (Restons proches, Restons amis, Restons
 * en contact) ; à Connaissance, « Annuler le lien ». Une clé par cercle, jamais un gabarit de niveau.
 */
internal object ProfileCircleWording {
    @StringRes
    fun promote(target: RelationLevel): Int? = when (target) {
        RelationLevel.FRIEND -> UiR.string.circles_promote_friend
        RelationLevel.CLOSE -> UiR.string.circles_promote_close
        RelationLevel.BLOOD -> UiR.string.circles_promote_blood
        RelationLevel.PUBLIC, RelationLevel.COMMUNITY, RelationLevel.ACQUAINTANCE -> null
    }

    @StringRes
    fun promoteA11y(target: RelationLevel): Int? = when (target) {
        RelationLevel.FRIEND -> UiR.string.circles_promote_friend_a11y
        RelationLevel.CLOSE -> UiR.string.circles_promote_close_a11y
        RelationLevel.BLOOD -> UiR.string.circles_promote_blood_a11y
        RelationLevel.PUBLIC, RelationLevel.COMMUNITY, RelationLevel.ACQUAINTANCE -> null
    }

    @StringRes
    fun lower(target: RelationLevel): Int = when (target) {
        RelationLevel.CLOSE -> UiR.string.circles_demote_close
        RelationLevel.FRIEND -> UiR.string.circles_demote_friend
        RelationLevel.ACQUAINTANCE -> UiR.string.circles_demote_acquaintance
        RelationLevel.PUBLIC, RelationLevel.COMMUNITY, RelationLevel.BLOOD -> UiR.string.circles_action_unlink
    }

    @StringRes
    fun lowerTitle(target: RelationLevel): Int = when (target) {
        RelationLevel.CLOSE -> UiR.string.circles_demote_close_confirm_title
        RelationLevel.FRIEND -> UiR.string.circles_demote_friend_confirm_title
        RelationLevel.ACQUAINTANCE -> UiR.string.circles_demote_acquaintance_confirm_title
        RelationLevel.PUBLIC, RelationLevel.COMMUNITY, RelationLevel.BLOOD -> UiR.string.circles_unlink_confirm_title
    }
}

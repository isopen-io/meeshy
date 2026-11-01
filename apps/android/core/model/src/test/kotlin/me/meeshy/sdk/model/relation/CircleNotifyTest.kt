package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Les dix-neuf crans d'entourage de #13929, tels que `CIRCLE_NOTIFY_FAMILIES` les déclare (#14064). */
class CircleNotifyTest {

    @Test
    fun `les dix-neuf cles sont celles de la passerelle, dans l'ordre partage`() {
        assertThat(CircleNotify.KEYS).containsExactly(
            "circlePublicationPost", "circlePublicationReel", "circlePublicationStory", "circlePublicationMood",
            "circlePublicationRepost", "circlePublicationShare",
            "circleOnMyContentComment", "circleOnMyContentReaction", "circleOnMyContentShare", "circleOnMyContentRepost",
            "circleOnMyContentQuote", "circleOnMyContentReference", "circleOnMyContentMention",
            "circleElsewhereComment", "circleElsewhereReaction", "circleElsewhereShare", "circleElsewhereQuote",
            "circleElsewhereReference", "circleElsewhereMention",
        ).inOrder()
    }

    @Test
    fun `sans reglage chaque famille montre le defaut servi, Proche, Proche, Sang`() {
        assertThat(CircleNotifyFamily.PUBLICATION.default).isEqualTo(RelationAudienceChoice.CLOSE)
        assertThat(CircleNotifyFamily.ON_MY_CONTENT.default).isEqualTo(RelationAudienceChoice.CLOSE)
        assertThat(CircleNotifyFamily.ELSEWHERE.default).isEqualTo(RelationAudienceChoice.BLOOD)
        assertThat(CircleNotify.summaryOf(emptyMap(), CircleNotifyFamily.ELSEWHERE)).isEqualTo(RelationAudienceChoice.BLOOD)
    }

    @Test
    fun `une action reglee prend son cran, les autres gardent le defaut`() {
        val chosen = mapOf("circlePublicationReel" to RelationAudienceChoice.PUBLIC)

        assertThat(CircleNotify.valueOf(chosen, CircleNotifyFamily.PUBLICATION, CircleNotifyAction.REEL))
            .isEqualTo(RelationAudienceChoice.PUBLIC)
        assertThat(CircleNotify.valueOf(chosen, CircleNotifyFamily.PUBLICATION, CircleNotifyAction.POST))
            .isEqualTo(RelationAudienceChoice.CLOSE)
    }

    @Test
    fun `une famille dont les actions different n'a pas de cran commun`() {
        val chosen = mapOf("circleElsewhereMention" to RelationAudienceChoice.NOBODY)

        assertThat(CircleNotify.summaryOf(chosen, CircleNotifyFamily.ELSEWHERE)).isNull()
        assertThat(CircleNotify.summaryOf(chosen, CircleNotifyFamily.PUBLICATION)).isEqualTo(RelationAudienceChoice.CLOSE)
    }

    @Test
    fun `les sept crans vont du plus ferme au plus large`() {
        assertThat(RelationAudienceChoice.entries.map { it.name }).containsExactly(
            "NOBODY", "BLOOD", "CLOSE", "FRIEND", "ACQUAINTANCE", "COMMUNITY", "PUBLIC",
        ).inOrder()
    }
}

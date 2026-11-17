package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AgeClass
import me.meeshy.sdk.model.relation.RelationAccess
import me.meeshy.sdk.model.relation.RelationAccessInput
import me.meeshy.sdk.model.relation.RelationConsent
import me.meeshy.sdk.model.relation.RelationFeature
import me.meeshy.sdk.model.relation.RelationLevel
import org.junit.Test

/**
 * « Voir comme » (#18887) : la Vitrine rendue au niveau d'un cercle. L'aperçu se calcule depuis la loi d'accès partagée
 * (`RelationAccess`), jamais depuis une liste écrite à la main ; ce qui est fermé se dit en rangée verrouillée avec le
 * cercle qui l'ouvre, et ne porte jamais la donnée protégée.
 */
class VitrineAsCircleTest {

    private fun open(level: RelationLevel): Set<RelationFeature> =
        VitrineAsCircle.view(level).open.map { it.feature }.toSet()

    private fun lockedAt(level: RelationLevel): Map<RelationFeature, RelationLevel> =
        VitrineAsCircle.view(level).locked.associate { it.capability.feature to it.opensAt }

    @Test
    fun `les six cercles se parcourent du Public au Sang, Public en tête`() {
        assertThat(VitrineAsCircle.levels).containsExactly(
            RelationLevel.PUBLIC, RelationLevel.COMMUNITY, RelationLevel.ACQUAINTANCE,
            RelationLevel.FRIEND, RelationLevel.CLOSE, RelationLevel.BLOOD,
        ).inOrder()
    }

    @Test
    fun `un inconnu ne voit ni présence ni niveau ni position, tout en rangées verrouillées`() {
        assertThat(open(RelationLevel.PUBLIC)).isEmpty()
        val locked = lockedAt(RelationLevel.PUBLIC)
        assertThat(locked[RelationFeature.PRESENCE_ONLINE]).isEqualTo(RelationLevel.FRIEND)
        assertThat(locked[RelationFeature.GAME_BASIC]).isEqualTo(RelationLevel.FRIEND)
        assertThat(locked[RelationFeature.GAME_SPARKS_GLORY]).isEqualTo(RelationLevel.CLOSE)
        assertThat(locked[RelationFeature.DEVICE_BATTERY]).isEqualTo(RelationLevel.CLOSE)
        assertThat(locked[RelationFeature.LOCATION_LIVE]).isEqualTo(RelationLevel.BLOOD)
    }

    @Test
    fun `un Ami voit en ligne ou rien et le niveau, pas la présence détaillée`() {
        assertThat(open(RelationLevel.FRIEND)).containsAtLeast(RelationFeature.PRESENCE_ONLINE, RelationFeature.GAME_BASIC)
        assertThat(open(RelationLevel.FRIEND)).doesNotContain(RelationFeature.PRESENCE_DETAILED)
        assertThat(lockedAt(RelationLevel.FRIEND)[RelationFeature.PRESENCE_DETAILED]).isEqualTo(RelationLevel.CLOSE)
    }

    @Test
    fun `un Proche ouvre la présence détaillée, les étincelles et la batterie, pas la position`() {
        assertThat(open(RelationLevel.CLOSE)).containsAtLeast(
            RelationFeature.PRESENCE_DETAILED, RelationFeature.GAME_SPARKS_GLORY, RelationFeature.DEVICE_BATTERY,
        )
        assertThat(lockedAt(RelationLevel.CLOSE).keys).containsExactly(RelationFeature.LOCATION_LIVE, RelationFeature.LOCATION_HISTORY)
    }

    @Test
    fun `le Sang ne laisse rien de verrouillé`() {
        assertThat(VitrineAsCircle.view(RelationLevel.BLOOD).locked).isEmpty()
    }

    @Test
    fun `chaque cercle ouvre au moins ce que le précédent ouvrait, jamais moins`() {
        VitrineAsCircle.levels.zipWithNext().forEach { (lower, higher) ->
            assertThat(open(higher)).containsAtLeastElementsIn(open(lower))
        }
    }

    @Test
    fun `ouvert et verrouillé se partagent les capacités, sans recouvrement ni oubli`() {
        VitrineAsCircle.levels.forEach { level ->
            val view = VitrineAsCircle.view(level)
            val all = view.open.map { it.feature } + view.locked.map { it.capability.feature }
            assertThat(all).containsExactlyElementsIn(VitrineCapability.entries.map { it.feature })
        }
    }

    @Test
    fun `le cercle qui ouvre une rangée verrouillée l'ouvre vraiment selon la loi partagée`() {
        VitrineAsCircle.levels.forEach { level ->
            VitrineAsCircle.view(level).locked.forEach { lock ->
                assertThat(lock.opensAt).isGreaterThan(level)
                assertThat(allowedByLaw(lock.opensAt, lock.capability.feature)).isTrue()
                assertThat(allowedByLaw(previous(lock.opensAt), lock.capability.feature)).isFalse()
            }
        }
    }

    @Test
    fun `les rangées verrouillées se rangent par cercle d'ouverture puis par ordre de la vitrine`() {
        val locked = VitrineAsCircle.view(RelationLevel.PUBLIC).locked
        assertThat(locked.map { it.opensAt }).isInOrder()
    }

    @Test
    fun `une rangée verrouillée ne porte que la capacité et le cercle, jamais une donnée`() {
        val fields = VitrineLock::class.java.declaredFields.filterNot { it.isSynthetic }.map { it.name }
        assertThat(fields).containsExactly("capability", "opensAt")
    }

    private fun previous(level: RelationLevel): RelationLevel = VitrineAsCircle.levels[VitrineAsCircle.levels.indexOf(level) - 1]

    private fun allowedByLaw(level: RelationLevel, feature: RelationFeature): Boolean = RelationAccess.resolve(
        RelationAccessInput(
            viewerId = "viewer", targetId = "owner", grantedByViewer = level, grantedByTarget = level,
            sharesCommunity = false, blockedEitherWay = false, viewerMinor = AgeClass.ADULT, targetMinor = AgeClass.ADULT,
            viewerRole = null, feature = feature, consent = RelationConsent.GRANTED,
        ),
    ).allowed
}

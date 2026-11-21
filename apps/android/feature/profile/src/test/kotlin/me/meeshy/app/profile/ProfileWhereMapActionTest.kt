package me.meeshy.app.profile

import androidx.compose.foundation.clickable
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * « Voir sur la carte » sur la face Actions (#18890). La carte ouverte ne se referme pas sous les yeux de l'utilisateur
 * quand la personne cesse de partager : elle passe à son état vide (« X ne partage pas sa position »), et seul le bouton
 * d'entrée disparaît. Et la feuille de la carte n'offre que ce que la face offre : écrire si la fiche le permet, appeler
 * si le cercle l'ouvre, partager la mienne si le cercle l'ouvre et que je ne la partage pas déjà avec elle.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ProfileWhereMapActionTest {

    @get:Rule
    val compose = createComposeRule()

    private val person = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private val open = "See on the map"
    private val map = "THE MAP"

    @Test
    fun `a share that ends while the map is open leaves the map open, only the entry goes away`() {
        var sharedWithMe by mutableStateOf(true)
        compose.setContent {
            MeeshyTheme {
                ProfileWhereMapEntry(userId = person, sharedWithMe = sharedWithMe) { close ->
                    Text(map, Modifier.clickable(onClick = close))
                }
            }
        }
        compose.onNodeWithText(open).performClick()
        compose.onNodeWithText(map).assertIsDisplayed()

        sharedWithMe = false
        compose.waitForIdle()

        compose.onNodeWithText(map).assertIsDisplayed()
        compose.onNodeWithText(open).assertDoesNotExist()

        compose.onNodeWithText(map).performClick()
        compose.onNodeWithText(map).assertDoesNotExist()
    }

    @Test
    fun `nothing shared with me, nothing to see - no entry`() {
        compose.setContent {
            MeeshyTheme { ProfileWhereMapEntry(userId = person, sharedWithMe = false) { Text(map) } }
        }
        compose.onNodeWithText(open).assertDoesNotExist()
        compose.onNodeWithText(map).assertDoesNotExist()
    }

    @Test
    fun `the map offers only what the face offers`() {
        val everything = ProfileWhereMapOffers.of(canMessage = true, offersCall = true, offersLocation = true, sharingWithThem = false)
        assertThat(everything).isEqualTo(ProfileWhereMapOffers(write = true, call = true, shareMine = true))

        val blocked = ProfileWhereMapOffers.of(canMessage = false, offersCall = false, offersLocation = true, sharingWithThem = false)
        assertThat(blocked.write).isFalse()
        assertThat(blocked.call).isFalse()
    }

    @Test
    fun `sharing mine is offered only when the circle opens it and it is not already going to them`() {
        val locked = ProfileWhereMapOffers.of(canMessage = true, offersCall = true, offersLocation = false, sharingWithThem = false)
        assertThat(locked.shareMine).isFalse()

        val alreadyGoing = ProfileWhereMapOffers.of(canMessage = true, offersCall = true, offersLocation = true, sharingWithThem = true)
        assertThat(alreadyGoing.shareMine).isFalse()
    }
}

package me.meeshy.app

import android.content.Intent
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import java.security.SecureRandom
import me.meeshy.app.chat.IncomingShareSelection
import me.meeshy.app.composer.inbound.ComposerSeedStore
import me.meeshy.app.composer.inbound.InboundShareIntake
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13585 : depuis que `ShareTargetActivity` accepte tout type, la seule porte est la politique de source. Ce témoin passe par
 * la porte RÉELLE de l'activité (`InboundShareIntake.admitsSource`) : un chemin de fichier, même vers les données de Meeshy,
 * et une URI de nos propres fournisseurs ne sont jamais lus — seul le `content://` d'une autre app l'est.
 */
@RunWith(RobolectricTestRunner::class)
class ShareTargetIncomingSelectionTest {
    @get:Rule val folder = TemporaryFolder()
    private val context = ApplicationProvider.getApplicationContext<android.app.Application>()
    private val intake by lazy { InboundShareIntake(context, ComposerSeedStore(File(folder.root, "inbound").also { it.mkdirs() }, { 0L }, SecureRandom())) }

    @Test
    fun `a shared file path is refused for a single share of any type`() {
        val ownSecrets = Uri.parse("file:///data/data/${context.packageName}/shared_prefs/session.xml")
        val intent = Intent(Intent.ACTION_SEND).setType("*/*").putExtra(Intent.EXTRA_STREAM, ownSecrets)

        val selection = IncomingShareSelection.of(intent, intake::admitsSource)

        assertThat(selection.admitted).isEmpty()
        assertThat(selection.refused).isEqualTo(1)
    }

    @Test
    fun `in a multiple share only the other app's content uris are read`() {
        val other = Uri.parse("content://com.example.docs/contrat.pdf")
        val streams = arrayListOf(
            Uri.parse("file:///sdcard/Download/contrat.pdf"),
            Uri.parse("content://${context.packageName}.fileprovider/cache/media-intake/x"),
            other,
        )
        val intent = Intent(Intent.ACTION_SEND_MULTIPLE).setType("*/*").putParcelableArrayListExtra(Intent.EXTRA_STREAM, streams)

        val selection = IncomingShareSelection.of(intent, intake::admitsSource)

        assertThat(selection.admitted).containsExactly(other)
        assertThat(selection.refused).isEqualTo(2)
    }
}

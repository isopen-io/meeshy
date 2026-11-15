package me.meeshy.app.stories

import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.media.scene.SceneExportBranding
import me.meeshy.sdk.model.brand.MeeshyBrandJingle
import me.meeshy.sdk.model.brand.PcmWav
import me.meeshy.sdk.model.scene.export.StoryExportBrandingPlan
import me.meeshy.sdk.model.scene.export.StoryExportIdentity
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat

/**
 * **Prépare l'emballage de marque d'un export de story** (#13509) : rapatrie l'avatar et la bannière de l'auteur (bornés — une
 * image qui n'arrive pas dans [IMAGE_BUDGET_MILLIS] est remplacée par l'aplat d'accent et les initiales), fait peindre les
 * cartes, écrit les deux signatures sonores (synthétisées par [MeeshyBrandJingle], jamais des fichiers) en WAV. L'export ne
 * tombe jamais sur sa marque : si les cartes ne se peignent pas, la story part seule.
 */
internal class StoryExportBrandAssembler(
    private val fetch: suspend (url: String, target: File) -> Unit,
    private val paint: suspend (StoryExportBrandPaintRequest) -> StoryExportBrandCards?,
) {

    suspend fun assemble(identity: StoryExportIdentity, format: StoryExportVideoFormat, work: File): SceneExportBranding? {
        val directory = File(work, "marque").apply { mkdirs() }
        val request = StoryExportBrandPaintRequest(
            identity = identity,
            avatar = image(identity.avatarUrl, File(directory, "avatar.media")),
            banner = image(identity.bannerUrl, File(directory, "banniere.media")),
            withIntro = true,
            withAuthorCard = true,
            directory = directory,
            format = format,
        )
        val cards = paint(request) ?: return null
        return SceneExportBranding(
            plan = StoryExportBrandingPlan.make(hasIntro = cards.intro != null, hasAuthorOutro = cards.author != null),
            introCard = cards.intro,
            outroCard = cards.outro,
            authorCard = cards.author,
            introJingle = cards.intro?.let { jingle(File(directory, "ouverture.wav"), MeeshyBrandJingle.samples()) },
            introJingleMillis = millis(MeeshyBrandJingle.DURATION_SECONDS),
            outroJingle = jingle(File(directory, "fermeture.wav"), MeeshyBrandJingle.outroSamples()),
            outroJingleMillis = millis(MeeshyBrandJingle.OUTRO_DURATION_SECONDS),
        )
    }

    private suspend fun image(url: String?, target: File): File? {
        if (url.isNullOrBlank()) return null
        return try {
            withTimeoutOrNull(IMAGE_BUDGET_MILLIS) { fetch(url, target) }?.let { target }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            target.delete()
            null
        }
    }

    private fun jingle(target: File, samples: FloatArray): File = target.also { it.writeBytes(PcmWav.encode(samples, MeeshyBrandJingle.SAMPLE_RATE)) }

    private fun millis(seconds: Double): Long = (seconds * MILLIS_PER_SECOND).toLong()

    companion object {
        const val IMAGE_BUDGET_MILLIS = 4_000L
        private const val MILLIS_PER_SECOND = 1_000.0
    }
}

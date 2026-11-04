package me.meeshy.sdk.pack

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.model.game.FrameUsage
import me.meeshy.sdk.model.pack.FramePack
import me.meeshy.sdk.model.pack.FrameShelfContent
import me.meeshy.sdk.model.pack.FrameShelfLaw
import timber.log.Timber

/** Le détail d'un pack de cadres (`GET /packs/glory-frame/<slug>`). */
fun interface FramePackDetails {
    suspend fun detail(slug: String): FramePack
}

/** La langue du lecteur pour les chaînes d'un pack ; le français à défaut. */
fun interface ShelfLanguage {
    fun current(): String
}

/** Le libellé d'usage d'un cadre, dans la langue de l'interface, avec les noms du jeu (« Rang Ambassadeur IV uniquement »). */
fun interface FrameUsageCopy {
    fun text(usage: FrameUsage): String
}

/**
 * **L'onglet d'un pack de cadres installé** (miroir de `FramePackShelfLoader`, iOS) : son détail, son contrat vérifié par
 * son empreinte, les chaînes de la langue du lecteur, puis un cadre par vignette avec le libellé de SON usage.
 *
 * Un contrat d'une version inconnue ne se lit pas : l'onglet dit « Mets à jour Meeshy ». Ce qui est déjà affiché le
 * reste quand une relecture échoue. Chargé une fois par version du pack.
 */
class FramePackShelfLoader(
    private val details: FramePackDetails,
    private val contracts: FramePackContractStore,
    private val language: ShelfLanguage,
    private val usageCopy: FrameUsageCopy,
) {
    private val _contents = MutableStateFlow<Map<String, FrameShelfContent>>(emptyMap())
    val contents: StateFlow<Map<String, FrameShelfContent>> = _contents.asStateFlow()

    private val lock = Mutex()
    private val loaded = HashSet<String>()

    suspend fun load(pack: FramePack) {
        val key = "${pack.slug}@${pack.version}"
        lock.withLock { if (key in loaded) return }
        if (_contents.value[pack.slug] == null) publish(pack.slug, FrameShelfContent.Loading)
        try {
            val detail = details.detail(pack.slug)
            when (val read = contracts.read(detail, language.current())) {
                FramePackContractRead.NeedsUpdate -> publish(pack.slug, FrameShelfContent.NeedsUpdate)
                FramePackContractRead.Missing -> publish(pack.slug, FrameShelfContent.Unavailable)
                is FramePackContractRead.Loaded -> {
                    publish(pack.slug, FrameShelfContent.Frames(FrameShelfLaw.tiles(read.contract, read.strings, usageCopy::text)))
                    lock.withLock { loaded += key }
                }
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w("Frame pack shelf failed: %s", failure.javaClass.simpleName)
            if (_contents.value[pack.slug] is FrameShelfContent.Frames) return
            publish(pack.slug, FrameShelfContent.Unavailable)
        }
    }

    private fun publish(slug: String, content: FrameShelfContent) {
        _contents.update { it + (slug to content) }
    }
}

package me.meeshy.sdk.pack

import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.pack.FramePack
import me.meeshy.sdk.model.pack.FrameShelfLaw
import me.meeshy.sdk.model.pack.GloryFramePackContract
import me.meeshy.sdk.model.pack.PackAssetRef
import me.meeshy.sdk.model.pack.PackStringKey

/** Ce que la lecture du contrat d'un pack de cadres rend. */
sealed interface FramePackContractRead {
    /** Version de contrat inconnue ou forme illisible : « Mets à jour Meeshy », et rien d'autre ne se télécharge. */
    data object NeedsUpdate : FramePackContractRead

    /** Le pack ne sert pas de contrat. */
    data object Missing : FramePackContractRead

    data class Loaded(
        val contract: GloryFramePackContract,
        val stringsRef: PackAssetRef?,
        val strings: Map<String, String>,
    ) : FramePackContractRead
}

/**
 * **Le contrat d'un pack de cadres, lu dans le magasin adressé par contenu** (miroir de la lecture de
 * `FramePackShelfLoader`, iOS). Chaque octet passe par [assets], qui vérifie l'empreinte annoncée : un contrat altéré ne
 * se lit jamais. Les chaînes sont celles de la langue du lecteur, sinon le français ; leur absence ne fait pas tomber
 * l'onglet (les noms se lisent par identifiant). Ce que l'onglet a rangé est consigné dans l'index pour l'élagage.
 */
class FramePackContractStore(
    private val assets: PackAssetReading,
    private val index: PackFileIndex,
) {
    suspend fun read(detail: FramePack, language: String): FramePackContractRead {
        if (!FrameShelfLaw.readsSchema(detail.contractSchema)) return FramePackContractRead.NeedsUpdate
        val contractRef = detail.contract ?: return FramePackContractRead.Missing
        val parsed = GloryFramePackContract.parse(String(assets.data(contractRef), Charsets.UTF_8))
            ?: return FramePackContractRead.NeedsUpdate
        val stringsRef = detail.stringsRef(language)
        val strings = readStrings(stringsRef)
        index.record(FrameShelfLaw.manifest(detail, parsed.contract, stringsRef))
        return FramePackContractRead.Loaded(parsed.contract, stringsRef, strings)
    }

    private suspend fun readStrings(ref: PackAssetRef?): Map<String, String> {
        if (ref == null) return emptyMap()
        return try {
            PackStringKey.parseStrings(String(assets.data(ref), Charsets.UTF_8))
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            emptyMap()
        }
    }
}

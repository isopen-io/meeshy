package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/*
 * Les codecs tolérants des cinq catégories de préférences que cet appareil lit et écrit sur
 * `me/preferences/{categorie}` : audio, message, vidéo, document, application — le patron des codecs
 * notification et confidentialité (`PreferencesTolerantDecoding.kt`), sans y toucher.
 *
 * Trois garanties, une par fonction :
 *  - LIRE : un champ absent ou d'un type inattendu (dont une énumération inconnue) retombe sur SON
 *    défaut sans vider ses voisins ; une clé inconnue est conservée dans `extras` ;
 *  - ÉCRIRE : le cliché COMPLET part avec les `extras` remis à plat à la racine, donc une clé d'une
 *    version plus récente du serveur fait l'aller-retour sans perte ;
 *  - PERSISTER : le jeton durable est ce même cliché, relu par le même décodeur.
 */
private val snapshotJson = Json {
    encodeDefaults = true
    explicitNulls = false
}

private const val EXTRAS = "extras"

/** Les cinq horodatages de consentement : `z.never` côté passerelle sur la catégorie application (#4180). */
private val WRITE_FORBIDDEN_APPLICATION_KEYS = setOf(
    "dataProcessingConsentAt",
    "voiceDataConsentAt",
    "voiceProfileConsentAt",
    "voiceCloningConsentAt",
    "voiceCloningEnabledAt",
)

/** Le codec d'une catégorie : décodage tolérant, cliché complet à envoyer, jeton durable. */
public class PreferenceCategoryCodec<T : Any> internal constructor(
    public val category: PreferenceCategory,
    private val serializer: KSerializer<T>,
    private val defaults: T,
    private val extrasOf: (T) -> Map<String, JsonElement>,
    private val withExtras: (T, Map<String, JsonElement>) -> T,
    private val neverSent: Set<String> = emptySet(),
) {
    /**
     * Le bloc [served] par le serveur posé sur le bloc [local] : le serveur fait foi champ par champ, et
     * les clés inconnues des DEUX côtés survivent (celles du serveur l'emportent sur une même clé locale),
     * si bien qu'un champ d'une version plus récente repart avec le PATCH suivant.
     */
    public fun mergeServed(local: T, served: T): T =
        withExtras(served, extrasOf(local) + extrasOf(served))

    /** Le bloc servi (ou persisté) ; tout ce qui n'est pas un objet est les défauts. */
    public fun decode(element: JsonElement?): T =
        decodeTolerantBlock(serializer, element) ?: defaults

    /** Le corps de `PATCH me/preferences/{categorie}` : tous les champs, `extras` remis à plat à la racine. */
    public fun snapshot(block: T): JsonObject = JsonObject(flat(block) - neverSent)

    /** Le jeton durable du bloc : le cliché, plus ce qui ne part jamais mais se relit (les horodatages). */
    public fun storageValue(block: T): String = JsonObject(flat(block)).toString()

    private fun flat(block: T): Map<String, JsonElement> =
        extrasOf(block) + (snapshotJson.encodeToJsonElement(serializer, block).jsonObject - EXTRAS)

    /** Relit un jeton ; absent, vide ou illisible ⇒ les défauts. */
    public fun fromStorage(raw: String?): T = decode(parseStoredBlock(snapshotJson, raw))
}

public object PreferenceCategoryCodecs {
    public val audio: PreferenceCategoryCodec<AudioPreferences> = PreferenceCategoryCodec(
        PreferenceCategory.AUDIO, AudioPreferences.serializer(), AudioPreferences(), { it.extras }, { block, extras -> block.copy(extras = extras) },
    )
    public val message: PreferenceCategoryCodec<MessagePreferences> = PreferenceCategoryCodec(
        PreferenceCategory.MESSAGE, MessagePreferences.serializer(), MessagePreferences(), { it.extras }, { block, extras -> block.copy(extras = extras) },
    )
    public val video: PreferenceCategoryCodec<VideoPreferences> = PreferenceCategoryCodec(
        PreferenceCategory.VIDEO, VideoPreferences.serializer(), VideoPreferences(), { it.extras }, { block, extras -> block.copy(extras = extras) },
    )
    public val document: PreferenceCategoryCodec<DocumentPreferences> = PreferenceCategoryCodec(
        PreferenceCategory.DOCUMENT, DocumentPreferences.serializer(), DocumentPreferences(), { it.extras }, { block, extras -> block.copy(extras = extras) },
    )

    /** Les horodatages de consentement se LISENT (ils décorent l'écran) mais ne partent jamais. */
    public val application: PreferenceCategoryCodec<ApplicationPreferences> = PreferenceCategoryCodec(
        PreferenceCategory.APPLICATION,
        ApplicationPreferences.serializer(),
        ApplicationPreferences(),
        { it.extras },
        { block, extras -> block.copy(extras = extras) },
        neverSent = WRITE_FORBIDDEN_APPLICATION_KEYS,
    )
}

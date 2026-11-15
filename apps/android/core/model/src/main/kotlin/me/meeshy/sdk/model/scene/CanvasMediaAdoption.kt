package me.meeshy.sdk.model.scene

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.model.CanvasV3
import me.meeshy.sdk.model.ObjectV3
import me.meeshy.sdk.model.SceneV3
import me.meeshy.sdk.model.StoryEffects

/**
 * **La référence média d'un objet de scène, quelle que soit son orthographe**
 * (#6894). Port de `ObjectV3.mediaReference` (`CanvasV3.swift`).
 *
 * Deux écritures coexistent pour dire « cet objet montre le média X » : les
 * composers posent `postMediaId` ; la passerelle ACCEPTE et RÉÉCRIT aussi
 * `mediaId`, et les documents qu'elle sert sous cette forme (fonds `plane: bg`
 * sans porteur `content`) n'ont jamais de `postMediaId`. `postMediaId` est la
 * forme de RÉFÉRENCE ; `mediaId` n'est lu qu'en second.
 *
 * Site unique : tout consommateur qui doit savoir si un objet DÉSIGNE un
 * enregistrement du post appelle cette propriété plutôt que de relire les deux
 * clés — une seconde lecture ad hoc est comment deux surfaces divergent sur la
 * même question.
 */
val ObjectV3.mediaReference: String?
    get() = payload.nonBlankString(KEY_POST_MEDIA_ID) ?: payload.nonBlankString(KEY_MEDIA_ID)

/**
 * Ce que le téléversement de publication a servi pour un objet : l'identité de
 * l'enregistrement que le POST possède et, quand ce dispatch en a produit une,
 * l'adresse qui le sert. [url] `null` ⇒ l'objet garde la sienne.
 */
data class ServedMedia(val id: String, val url: String? = null)

/**
 * Le document publié après adoption : le runtime (la première slide) et les
 * scènes que le canvas v3 transporte pour les suivantes. Les deux voyagent
 * ensemble parce que la règle vaut pour l'ensemble — n'adopter qu'un des deux
 * rend la publication cohérente à moitié.
 */
data class AdoptedCanvas(val effects: StoryEffects?, val canvas: CanvasV3?)

/**
 * **Un canvas publié ne peut désigner que des médias que le post POSSÈDE**
 * (#5280). Port de `CanvasMediaAdoption` (iOS, `CanvasMediaAdoption.swift`).
 *
 * Une photo posée sur la scène peut être téléversée DEUX fois : une pré-montée
 * à la pose (pour que le canvas ait une URL affichable tout de suite), puis une
 * seconde à la publication (pour que le POST ait son média) — ou, ici, différée
 * hors ligne sous un identifiant provisoire que le vrai téléversement remplace.
 * Tant que le canvas garde l'ancienne identité, il désigne une ligne qui
 * n'appartient pas au post : le lecteur ne la trouve pas dans `post.media` et
 * peint une scène VIDE, pour tous les spectateurs.
 *
 * > Un identifiant orphelin ne produit ni erreur, ni journal, ni rendu partiel :
 * > il produit du BLANC. Les deux fichiers existent, les deux requêtes
 * > répondent 200, et rien dans la chaîne n'a de raison de se plaindre.
 *
 * La règle est PURE — aucun état, aucune E/S — pour pouvoir se VÉRIFIER sans
 * monter une vue, avec le même témoin sur la publication initiale et sur la
 * republication.
 */
object CanvasMediaAdoption {

    /**
     * Les `postMediaId` que le canvas désigne et que le post ne possède pas.
     * Vide ⇒ le canvas est cohérent avec sa publication.
     *
     * Un objet dont l'identité est VIDE n'est pas un orphelin : c'est un objet
     * dont l'asset manquait au moment de publier, déjà journalisé là-bas et
     * délibérément laissé hors de `mediaIds`.
     */
    fun orphanIds(effects: StoryEffects, postMediaIds: List<String>, canvas: CanvasV3? = null): List<String> {
        val owned = postMediaIds.toSet()
        return designatedIds(effects, canvas).filter { it.isNotBlank() && it !in owned }
    }

    /**
     * **Tous les `postMediaId` que le document DÉSIGNE**, où qu'ils vivent : le
     * runtime (`mediaObjects`) ET les scènes que le canvas v3 transporte, sous
     * leurs DEUX orthographes ([mediaReference]). N'en lire qu'un endroit rendait
     * [isCoherent] vraie sur la publication exacte qui échouait à l'écran — une
     * garde qui ne voit pas la moitié du document certifie l'autre moitié.
     */
    fun designatedIds(effects: StoryEffects, canvas: CanvasV3? = null): List<String> =
        effects.mediaObjects.orEmpty().map { it.postMediaId } + carriedReferences(canvas, KIND_MEDIA)

    /**
     * **Les `mediaIds` d'une publication : ce que ce dispatch a téléversé, PUIS
     * tout ce que le document désigne** (#8012). Un média pré-téléversé garde son
     * identité dans le canvas et n'est pas re-téléversé : ne lister que les
     * uploads du dispatch le laissait hors de `mediaIds`, donc jamais rattaché au
     * post et balayé côté serveur vingt-quatre heures plus tard comme un
     * téléversement abandonné.
     *
     * Les pistes audio et les autocollants intégrés en font partie : ce sont des
     * enregistrements du post au même titre qu'une photo (`StorySticker.postMediaId`
     * vit dans le même espace d'identifiants).
     */
    fun publicationMediaIds(uploaded: List<String>, effects: StoryEffects?, canvas: CanvasV3? = null): List<String> {
        val designated = effects?.let { designatedIds(it, canvas) } ?: carriedReferences(canvas, KIND_MEDIA)
        val sounds = effects?.audioPlayerObjects.orEmpty().map { it.postMediaId } +
            carriedReferences(canvas, KIND_AUDIO)
        val stickers = effects?.stickerObjects.orEmpty().map { it.postMediaId } +
            carriedReferences(canvas, KIND_STICKER)
        return (uploaded + designated + sounds + stickers).filter { it.isNotBlank() }.distinct()
    }

    /** `true` ⇔ tout ce que le canvas désigne est attaché au post. */
    fun isCoherent(effects: StoryEffects, postMediaIds: List<String>, canvas: CanvasV3? = null): Boolean =
        orphanIds(effects, postMediaIds, canvas).isEmpty()

    /**
     * **L'ADOPTION — le canvas reprend l'identité que le post vient de créer.**
     *
     * Trois cartes se rencontrent ici, et nulle part ailleurs :
     *
     * | carte | ce qu'elle dit |
     * |---|---|
     * | [objectIdsBySourceIndex] | position du fichier → objet de canvas |
     * | [idsBySourceIndex] | position → identité de l'enregistrement du post |
     * | [urlsBySourceIndex] | position → URL servie |
     *
     * La POSITION est le seul lien qui survive à la relocalisation des fichiers :
     * la file ne garde que des chemins relatifs, et l'URL d'origine n'existe plus
     * au moment du dispatch. C'est aussi pourquoi l'index s'ENREGISTRE à l'upload
     * au lieu de se déduire d'une longueur — un upload sauté romprait
     * l'alignement en silence.
     *
     * Un objet que rien ne désigne est laissé INTACT plutôt que vidé : il peut
     * venir d'une pré-montée dont le fichier est déjà en ligne et parfaitement
     * valide. Effacer ce qu'on ne sait pas remplacer transforme un doute en perte.
     *
     * @param onImpossible appelé avec la raison quand l'adoption ne peut pas avoir
     *   lieu (rien à adopter, ou aucun pont objet ↔ fichier) : le document traverse
     *   alors INCHANGÉ, et la raison est ce que l'appelant journalise.
     */
    fun adopting(
        effects: StoryEffects?,
        canvas: CanvasV3? = null,
        objectIdsBySourceIndex: List<String?>?,
        idsBySourceIndex: Map<Int, String>,
        urlsBySourceIndex: Map<Int, String>,
        onImpossible: (reason: String) -> Unit = {},
    ): AdoptedCanvas {
        if (effects == null && canvas == null) {
            onImpossible("adoption impossible: effects absents")
            return AdoptedCanvas(effects, canvas)
        }
        if (objectIdsBySourceIndex == null) {
            onImpossible("adoption impossible: objectIds absents (aucun pont objet ↔ fichier)")
            return AdoptedCanvas(effects, canvas)
        }
        val served = servedByObject(objectIdsBySourceIndex, idsBySourceIndex, urlsBySourceIndex)
        return adoptingServed(effects, canvas, served)
    }

    /** L'adoption par identifiant d'OBJET : le pont position → objet est déjà résolu. */
    fun adoptingServed(
        effects: StoryEffects?,
        canvas: CanvasV3?,
        served: Map<String, ServedMedia>,
    ): AdoptedCanvas = rebuild(effects, canvas) { objectId, _ -> served[objectId] }

    /**
     * **L'adoption par IDENTITÉ de média** : le téléversement différé a livré son
     * vrai identifiant, et tout objet qui désignait l'identifiant provisoire
     * ([replacing] : provisoire → servi) reprend le vrai — runtime, sons,
     * autocollants et scènes portées. C'est la forme que prend l'adoption sur le
     * chemin de republication d'une publication mise en file hors ligne, où l'on
     * connaît l'identité à remplacer mais plus la position du fichier.
     */
    fun adoptingByMedia(
        effects: StoryEffects?,
        canvas: CanvasV3?,
        replacing: Map<String, ServedMedia>,
    ): AdoptedCanvas = rebuild(effects, canvas) { _, reference -> reference?.let(replacing::get) }

    private fun servedByObject(
        objectIdsBySourceIndex: List<String?>,
        idsBySourceIndex: Map<Int, String>,
        urlsBySourceIndex: Map<Int, String>,
    ): Map<String, ServedMedia> = buildMap {
        objectIdsBySourceIndex.forEachIndexed { index, objectId ->
            val servedId = idsBySourceIndex[index]
            if (!objectId.isNullOrEmpty() && servedId != null) {
                put(objectId, ServedMedia(servedId, urlsBySourceIndex[index]))
            }
        }
    }

    /**
     * Reconstruit le document sans jamais le muter. [serve] reçoit l'identifiant
     * de l'objet et l'identité qu'il désigne aujourd'hui (`null` quand il n'en
     * désigne aucune) et rend ce qu'il doit désormais désigner, ou `null` pour le
     * laisser tel quel.
     */
    private fun rebuild(
        effects: StoryEffects?,
        canvas: CanvasV3?,
        serve: (objectId: String, reference: String?) -> ServedMedia?,
    ): AdoptedCanvas = AdoptedCanvas(
        effects = effects?.let { adoptingRuntime(it, serve) },
        canvas = canvas?.let { adoptingScenes(it, serve) },
    )

    private fun adoptingRuntime(
        effects: StoryEffects,
        serve: (objectId: String, reference: String?) -> ServedMedia?,
    ): StoryEffects = effects.copy(
        mediaObjects = effects.mediaObjects?.map { media ->
            serve(media.id, media.postMediaId.ifBlank { null })
                ?.let { media.copy(postMediaId = it.id, mediaURL = it.url ?: media.mediaURL) }
                ?: media
        },
        // Le SON et le STICKER s'adoptent comme le média visuel (#8521) : sans cela
        // leur fichier monterait et le canvas garderait l'identité de la pré-montée.
        // Le modèle Android du son ne porte pas d'adresse (`StoryAudioPlayerObject`
        // n'a pas de `mediaURL`) : seule l'identité se réécrit.
        audioPlayerObjects = effects.audioPlayerObjects?.map { sound ->
            serve(sound.id, sound.postMediaId.ifBlank { null })?.let { sound.copy(postMediaId = it.id) } ?: sound
        },
        stickerObjects = effects.stickerObjects?.map { sticker ->
            serve(sticker.id, sticker.postMediaId.ifBlank { null })?.let { sticker.copy(postMediaId = it.id) }
                ?: sticker
        },
    )

    /**
     * **Les scènes que le CANVAS transporte s'adoptent comme le runtime.** La
     * première slide est posée en runtime et les suivantes dans les scènes : sans
     * cette passe, les objets des scènes 2 à N n'apparaissent dans AUCUN
     * `mediaObjects`, la boucle du runtime ne les voit pas, et leur identité reste
     * celle de la pré-montée — la scène 2 rend alors l'image de la scène 1, par
     * repli sur le premier visuel, ce qui a l'air d'un rendu réussi.
     *
     * Reconstruit par `copy` : ouverture, fermeture, transitions, durée,
     * `thumbHash` et rapport du porteur voyagent avec ce qu'on change sans qu'on
     * ait à les énumérer — les omettre les perdrait en silence.
     */
    private fun adoptingScenes(
        document: CanvasV3,
        serve: (objectId: String, reference: String?) -> ServedMedia?,
    ): CanvasV3 = document.copy(
        scenes = document.scenes.map { scene: SceneV3 ->
            scene.copy(objects = scene.objects.map { adoptingObject(it, serve) })
        },
    )

    private fun adoptingObject(
        item: ObjectV3,
        serve: (objectId: String, reference: String?) -> ServedMedia?,
    ): ObjectV3 {
        if (item.kind !in ADOPTABLE_KINDS) return item
        val served = serve(item.id, item.mediaReference) ?: return item
        // Un `mediaId` préexistant est RETIRÉ, pas seulement supplanté : le laisser
        // sur le fil offrait à la passerelle un identifiant périmé à réclamer
        // comme non adopté. L'URL n'est réécrite que si le dispatch en a servi une.
        val payload = buildMap<String, JsonElement> {
            putAll(item.payload)
            remove(KEY_MEDIA_ID)
            put(KEY_POST_MEDIA_ID, JsonPrimitive(served.id))
            served.url?.let { put(KEY_MEDIA_URL, JsonPrimitive(it)) }
        }
        return item.copy(payload = JsonObject(payload))
    }

    private fun carriedReferences(canvas: CanvasV3?, kind: String): List<String> =
        canvas?.scenes.orEmpty()
            .flatMap { it.objects }
            .filter { it.kind == kind }
            .mapNotNull { it.mediaReference }

    private const val KIND_MEDIA = "media"
    private const val KIND_AUDIO = "audio"
    private const val KIND_STICKER = "sticker"

    /** Les familles du canvas dont un objet désigne un fichier par son identité. */
    private val ADOPTABLE_KINDS = setOf(KIND_MEDIA, KIND_AUDIO, KIND_STICKER)
}

private const val KEY_POST_MEDIA_ID = "postMediaId"
private const val KEY_MEDIA_ID = "mediaId"
private const val KEY_MEDIA_URL = "mediaURL"

private fun JsonObject.nonBlankString(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotBlank() }

package me.meeshy.app.chat.export

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * LE DÉCOR D'UNE CARTE (#18673) — ce qu'une maquette ajoute à la mise en page commune : l'alignement
 * du texte, un cadre, un ornement. Miroir de `MessageCardDecor` (iOS). Chaque brique est CONNUE du
 * moteur et se règle par des valeurs : une maquette de marque les combine, elle n'apporte jamais de
 * code. [NONE] rend exactement la carte d'avant.
 */
data class CardDecor(
    val alignment: Alignment = Alignment.START,
    val frame: Frame = Frame.NONE,
    val ornament: Ornament = Ornament.NONE,
) {
    enum class Alignment(val key: String) { START("start"), CENTER("center") }
    enum class Frame(val key: String) { NONE("none"), PANEL("panel"), BORDER("border") }
    enum class Ornament(val key: String) { NONE("none"), QUOTE_MARK("quoteMark"), ACCENT_RULE("accentRule") }

    val isNone: Boolean get() = this == NONE

    companion object {
        val NONE = CardDecor()
    }
}

/** L'en-tête : droit, ou tourné le long du bord. Lu pour rester fidèle à la fiche iOS. */
enum class CardHeaderOrientation(val key: String) { HORIZONTAL("horizontal"), ROTATED_UP("rotatedUp") }

/**
 * UNE MAQUETTE D'EXPORT (#18673) — une FICHE DE DONNÉES, jamais du code. Miroir de `MessageCardModel`
 * (iOS) : une palette, une police et une liaison par défaut, la disposition, le décor, et les
 * liaisons que l'utilisateur peut y choisir. Les maquettes intégrées sont lues par le même décodeur
 * qu'une marque utiliserait pour fournir la sienne.
 */
data class CardModel(
    /** Stable — un format enregistré s'en souvient. Une marque le préfixe : `@marque/nom`. */
    val id: String,
    /** Le nom par langue (`fr`, `en`…) ; `fr` sert de repli. */
    val names: Map<String, String>,
    val palette: CardPaletteId,
    val typeface: CardTypefaceId,
    val link: CardLinkId,
    /** Les liaisons qui vont à cette maquette — vide : toutes. */
    val links: List<CardLinkId> = emptyList(),
    val aspect: CardAspect = CardAspect.AUTO,
    val headerOrientation: CardHeaderOrientation = CardHeaderOrientation.HORIZONTAL,
    val authorPlacement: CardAuthorPlacement = CardAuthorPlacement.ABOVE,
    val tilt: CardTilt = CardTilt.NONE,
    val decor: CardDecor = CardDecor.NONE,
) {
    fun name(language: String?): String {
        val code = language?.take(2)?.lowercase()
        return code?.let { names[it] } ?: names["fr"] ?: names.values.sorted().firstOrNull() ?: id
    }

    /** Les liaisons à proposer dans l'onglet « Liaison ». */
    val offeredLinks: List<CardLinkId> get() = links.ifEmpty { CardLinkId.entries }

    val template: CardTemplateId get() = CardTemplateId(palette, typeface, link)

    /**
     * Le format habillé par la maquette : ce que l'utilisateur a choisi de MONTRER (noms, anonymat,
     * date, heures) reste ; la palette, la police, la liaison, la disposition et le décor viennent d'elle.
     */
    fun applied(to: CardFormat): CardFormat = to.copy(
        template = template,
        model = id,
        aspect = aspect,
        authorPlacement = authorPlacement,
        tilt = tilt,
        decor = decor,
    )

    /** Une liaison qu'elle n'offre pas sort le format de la maquette. */
    fun accepts(link: CardLinkId): Boolean = link in offeredLinks
}

/** LES MAQUETTES — les huit intégrées, et le décodeur STRICT qui lit celles d'une marque. */
object CardModels {
    const val DEFAULT_ID = "citation"

    val builtIn: List<CardModel> by lazy { decode(BUILT_IN_JSON) ?: emptyList() }

    fun model(id: String?, models: List<CardModel> = builtIn): CardModel? = id?.let { wanted -> models.firstOrNull { it.id == wanted } }

    /**
     * Lit une liste de fiches. Une valeur inconnue (palette, police, liaison absentes du moteur), un
     * identifiant invalide ou en double refusent TOUT : jamais une maquette à moitié lue.
     */
    fun decode(raw: String): List<CardModel>? {
        val array = runCatching { Json.parseToJsonElement(raw) as? JsonArray }.getOrNull() ?: return null
        val models = array.map { (it as? JsonObject)?.let(::model) ?: return null }
        return models.takeIf { list -> list.map { it.id }.toSet().size == list.size }
    }

    /** `citation`, ou `@marque/nom` pour une marque : lettres minuscules, chiffres et tirets. */
    fun isValidId(id: String): Boolean {
        val branded = id.startsWith("@")
        val parts = if (branded) id.drop(1).split("/") else listOf(id)
        if (parts.size !in 1..2 || branded != (parts.size == 2)) return false
        return parts.all { part -> part.length in 1..40 && part.all { it in 'a'..'z' || it in '0'..'9' || it == '-' } }
    }

    private fun model(fields: JsonObject): CardModel? {
        fun text(key: String): String? = (fields[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
        fun <T> optional(key: String, default: T, read: (String) -> T?): T? =
            if (fields[key] == null) default else text(key)?.let(read)

        val id = text("id")?.takeIf(::isValidId) ?: return null
        val names = (fields["names"] as? JsonObject)?.mapValues { (_, value) ->
            (value as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return null
        }?.takeIf { it.isNotEmpty() } ?: return null
        val link = text("link")?.let(::linkOf) ?: return null
        val links = when (val raw: JsonElement? = fields["links"]) {
            null -> emptyList()
            is JsonArray -> raw.map { entry -> (entry as? JsonPrimitive)?.takeIf { it.isString }?.content?.let(::linkOf) ?: return null }
            else -> return null
        }
        if (links.isNotEmpty() && link !in links) return null
        val decor = when (val raw = fields["decor"]) {
            null -> CardDecor.NONE
            is JsonObject -> decor(raw) ?: return null
            else -> return null
        }
        return CardModel(
            id = id,
            names = names,
            palette = text("palette")?.let { key -> CardPaletteId.entries.firstOrNull { it.key == key } } ?: return null,
            typeface = text("typeface")?.let { key -> CardTypefaceId.entries.firstOrNull { it.key == key } } ?: return null,
            link = link,
            links = links,
            aspect = optional("aspect", CardAspect.AUTO) { key -> CardAspect.entries.firstOrNull { it.key == key } } ?: return null,
            headerOrientation = optional("headerOrientation", CardHeaderOrientation.HORIZONTAL) { key ->
                CardHeaderOrientation.entries.firstOrNull { it.key == key }
            } ?: return null,
            authorPlacement = optional("authorPlacement", CardAuthorPlacement.ABOVE) { key ->
                CardAuthorPlacement.entries.firstOrNull { it.key == key }
            } ?: return null,
            tilt = optional("tilt", CardTilt.NONE) { key -> CardTilt.entries.firstOrNull { it.key == key } } ?: return null,
            decor = decor,
        )
    }

    private fun decor(fields: JsonObject): CardDecor? {
        fun text(key: String): String? = (fields[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
        return CardDecor(
            alignment = text("alignment")?.let { key -> CardDecor.Alignment.entries.firstOrNull { it.key == key } } ?: return null,
            frame = text("frame")?.let { key -> CardDecor.Frame.entries.firstOrNull { it.key == key } } ?: return null,
            ornament = text("ornament")?.let { key -> CardDecor.Ornament.entries.firstOrNull { it.key == key } } ?: return null,
        )
    }

    private fun linkOf(key: String): CardLinkId? = CardLinkId.entries.firstOrNull { it.key == key }

    /** Les huit maquettes de Meeshy — la MÊME fiche qu'iOS (`MessageCardModels.builtInJSON`). */
    const val BUILT_IN_JSON = """
    [
      {"id": "citation", "names": {"fr": "Citation", "en": "Quote", "es": "Cita", "de": "Zitat", "it": "Citazione", "pt": "Citação", "ar": "اقتباس"},
       "palette": "aurore", "typeface": "rond", "link": "orbite"},
      {"id": "bulles", "names": {"fr": "Bulles", "en": "Bubbles", "es": "Burbujas", "de": "Blasen", "it": "Bolle", "pt": "Balões", "ar": "فقاعات"},
       "palette": "neige", "typeface": "systeme", "link": "bulles", "links": ["bulles"]},
      {"id": "affiche", "names": {"fr": "Affiche", "en": "Poster", "es": "Cartel", "de": "Plakat", "it": "Manifesto", "pt": "Cartaz", "ar": "ملصق"},
       "palette": "minuit", "typeface": "affiche", "link": "silence", "links": ["silence", "orbite"], "aspect": "story",
       "decor": {"alignment": "center", "frame": "none", "ornament": "accentRule"}},
      {"id": "editorial", "names": {"fr": "Éditorial", "en": "Editorial", "es": "Editorial", "de": "Editorial", "it": "Editoriale", "pt": "Editorial", "ar": "افتتاحية"},
       "palette": "editorial", "typeface": "didone", "link": "guillemets", "aspect": "portrait",
       "decor": {"alignment": "start", "frame": "border", "ornament": "none"}},
      {"id": "carnet", "names": {"fr": "Carnet", "en": "Notebook", "es": "Cuaderno", "de": "Notizbuch", "it": "Taccuino", "pt": "Caderno", "ar": "دفتر"},
       "palette": "manuscrit", "typeface": "plume", "link": "fil", "authorPlacement": "after", "tilt": "left",
       "decor": {"alignment": "start", "frame": "panel", "ornament": "none"}},
      {"id": "bandeau", "names": {"fr": "Bandeau", "en": "Banner", "es": "Banda", "de": "Banner", "it": "Fascia", "pt": "Faixa", "ar": "شريط"},
       "palette": "lagon", "typeface": "futur", "link": "filet", "headerOrientation": "rotatedUp", "aspect": "portrait"},
      {"id": "manifeste", "names": {"fr": "Manifeste", "en": "Manifesto", "es": "Manifiesto", "de": "Manifest", "it": "Manifesto", "pt": "Manifesto", "ar": "بيان"},
       "palette": "braise", "typeface": "marqueur", "link": "fleche", "aspect": "square", "tilt": "right",
       "decor": {"alignment": "start", "frame": "none", "ornament": "quoteMark"}},
      {"id": "epure", "names": {"fr": "Épure", "en": "Minimal", "es": "Mínimo", "de": "Schlicht", "it": "Essenziale", "pt": "Mínimo", "ar": "بسيط"},
       "palette": "ardoise", "typeface": "systeme", "link": "silence", "links": ["silence", "orbite"], "aspect": "square",
       "decor": {"alignment": "center", "frame": "border", "ornament": "none"}}
    ]
    """
}

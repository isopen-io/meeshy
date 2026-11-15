package me.meeshy.sdk.model.appearance

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Les fabriques des tests du catalogue d'apparence : un JSON de départ VALIDE par type, qu'un
 * test altère d'UN champ pour montrer ce que ce champ coûte (rien, un modèle, ou le catalogue).
 */
internal object AppearanceFixtures {

    val json = Json { ignoreUnknownKeys = true }

    fun parse(text: String): JsonObject = json.parseToJsonElement(text) as JsonObject

    /** Le fichier embarqué en assets, lu depuis le dépôt : le témoin qui garde la copie ET le décodeur. */
    fun embeddedCatalogText(): String = embeddedCatalogFile().readText()

    fun embeddedCatalogFile(): File {
        val relative = "sdk-core/src/main/assets/appearance-catalog.json"
        val candidates = generateSequence(File(".").absoluteFile) { it.parentFile }.take(8).flatMap {
            sequenceOf(File(it, relative), File(it, "apps/android/$relative"))
        }
        return checkNotNull(candidates.firstOrNull { it.isFile }) {
            "catalogue embarqué introuvable depuis ${File(".").absolutePath}"
        }
    }

    fun JsonObject.with(vararg changes: Pair<String, JsonElement?>): JsonObject {
        val next = toMutableMap()
        changes.forEach { (key, value) -> if (value == null) next.remove(key) else next[key] = value }
        return JsonObject(next)
    }

    fun array(vararg items: JsonElement): JsonArray = JsonArray(items.toList())

    fun text(value: String): JsonElement = JsonPrimitive(value)

    fun number(value: Number): JsonElement = JsonPrimitive(value)

    private fun palette(ink: String = "#1E1B4B"): String = """{"base":"#F7F7FB","ink":"$ink","soft":"#E4E4F0"}"""

    fun patternJson(key: String = "motif"): JsonObject = parse(
        """{"key":"$key","style":"pattern","palettes":{"light":${palette()},"dark":${palette("#C7C5F0")}},
          "tile":{"width":48,"height":48,"scale":1,"rotation":0,
          "paths":[{"d":"M24 0 L48 24 L24 48 L0 24 Z","role":"ink","opacity":0.07,"width":0.8}]},"fit":"fill"}""",
    )

    fun gradientJson(key: String = "brume"): JsonObject = parse(
        """{"key":"$key","style":"gradient","palettes":{"light":${palette()},"dark":${palette("#C7C5F0")}},
          "gradient":{"angle":180,"stops":[{"role":"base","at":0},{"role":"soft","at":1}],
          "blobs":[{"x":0.25,"y":0.15,"r":0.7,"role":"ink","opacity":0.35}]},"fit":"fill"}""",
    )

    fun ringJson(key: String = "filet"): JsonObject = parse(
        """{"key":"$key","stroke":{"style":"solid","width":0.03,"colors":["#C9A86A","#6366F1"]}}""",
    )

    fun ringWithOrnamentJson(key: String = "deco", color: Int = 1): JsonObject = ringJson(key).with(
        "ornament" to parse("""{"paths":[{"d":"M0 0 L10 10","color":$color,"opacity":0.8,"width":1.2,"group":"etoile"}]}"""),
    )

    fun frameJson(key: String = "cadre"): JsonObject = parse(
        """{"key":"$key","viewBox":[0,0,300,100],"palette":["#DCD2C0","#22262B","#B8954F"],
          "border":{"width":9.6,"color":0,"opacity":1,
          "filets":[{"inset":0.6,"width":0.9,"color":1,"opacity":1}]},
          "reach":{"corner":14.3,"cartouche":{"width":18.6,"depth":11.8,"edge":"top"}},
          "pieces":[{"anchor":"start","paths":[{"d":"M0 0H14V14H0Z","color":2,"opacity":1,"group":"coin"}]}],
          "friezes":[{"module":20,"from":20,"to":20,"fit":"justify",
          "paths":[{"d":"M0 5H20","color":2,"opacity":1,"width":0.5}]}]}""",
    )

    fun motionJson(kind: String = "rotate", target: String = "etoile"): JsonObject = parse(
        """{"kind":"$kind","targets":["$target"],"duration":12}""",
    )

    /** Un dégradé linéaire dont les arrêts désignent [colors], dans l'ordre. */
    fun frameGradient(vararg colors: Int): JsonObject {
        val stops = colors.mapIndexed { index, color -> """{"color":$color,"at":${index * 0.25}}""" }.joinToString(",")
        return parse("""{"kind":"linear","x1":0,"y1":0,"x2":1,"y2":0,"stops":[$stops]}""")
    }

    /** Un catalogue minimal et valide, que les tests altèrent section par section. */
    fun catalog(
        wallpapers: List<JsonElement> = listOf(pack("essentiels", "designs", patternJson("monogramme"), gradientJson("aurore"))),
        banners: List<JsonElement> = listOf(pack("bannieres-essentielles", "designs", patternJson("bandeau"))),
        rings: List<JsonElement> = listOf(pack("contours-essentiels", "rings", ringJson("filet"))),
        bannerFrames: List<JsonElement> = listOf(pack("cadres-haussmannien", "frames", frameJson("haussmannien"))),
        gamut: List<JsonElement> = listOf(gamutEntry("indigo"), gamutEntry("lagon")),
        strings: JsonObject = strings(),
        version: Int = 1,
    ): JsonObject = JsonObject(
        mapOf(
            "version" to number(version),
            "gamut" to JsonArray(gamut),
            "wallpapers" to JsonArray(wallpapers),
            "banners" to JsonArray(banners),
            "rings" to JsonArray(rings),
            "bannerFrames" to JsonArray(bannerFrames),
            "strings" to strings,
        ),
    )

    fun pack(
        slug: String,
        itemsField: String,
        vararg items: JsonElement,
        order: Int = 0,
        installedByDefault: Boolean = false,
        removable: Boolean = true,
    ): JsonObject = parse(
        """{"slug":"$slug","order":$order,"installedByDefault":$installedByDefault,"removable":$removable,"$itemsField":[]}""",
    ).with(itemsField to JsonArray(items.toList()))

    fun gamutEntry(key: String): JsonObject = parse(
        """{"key":"$key","name":"Nom $key",
          "light":{"surface":"#EEF0FF","accent":"#6366F1"},"dark":{"surface":"#14152E","accent":"#818CF8"}}""",
    )

    fun strings(): JsonObject = parse(
        """{"fr":{"packs":{"essentiels":{"name":"Essentiels","description":"Les motifs de base."}},
              "designs":{"monogramme":"Monogramme"},"rings":{"filet":"Filet"},"frames":{"haussmannien":"Haussmannien"},
              "gamut":{"indigo":"Indigo Meeshy"}},
          "en":{"packs":{"essentiels":{"name":"Essentials","description":"The basic patterns."}},
              "designs":{"monogramme":"Monogram"},"rings":{"filet":"Hairline"},"frames":{"haussmannien":"Haussmann"},
              "gamut":{"indigo":"Meeshy Indigo"}}}""",
    )
}

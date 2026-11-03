package me.meeshy.sdk.model.game.photo

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * L'ANIMATION DE LA PLAQUE D'AUTEUR (#10816) — un film Lottie GÉNÉRÉ depuis le fini, jamais un fichier dessiné par
 * variante. Miroir de `GamePhotoAuthorPlateMotion.swift` : mêmes couches, mêmes clés. Boîte 360 × 100, 72 images à
 * 60 i/s (1,2 s). Gravure : le burin ; estampage : quatre éclats ; grattage : la pièce en zigzag et les paillettes ;
 * pour tous, le lustre en diagonale. L'animation passe DESSUS le nom, ne le cache jamais.
 */
public object GamePhotoAuthorPlateMotion {

    public const val WIDTH: Int = 360
    public const val HEIGHT: Int = 100
    public const val FRAMES_PER_SECOND: Int = 60
    public const val FRAMES: Int = 72

    private val glint = listOf(1.0, 1.0, 1.0, 1.0)
    private val silver = listOf(0.86, 0.88, 0.92, 1.0)
    private val gold = listOf(0.99, 0.85, 0.45, 1.0)

    private data class Key(val t: Int, val s: List<Double>)

    private fun nums(values: List<Number>): JsonArray = JsonArray(values.map { JsonPrimitive(it) })
    private fun obj(vararg pairs: Pair<String, JsonElement>): JsonObject = JsonObject(linkedMapOf(*pairs))
    private fun num(v: Number): JsonPrimitive = JsonPrimitive(v)

    private val ease = obj("i" to obj("x" to nums(listOf(0.4)), "y" to nums(listOf(1))), "o" to obj("x" to nums(listOf(0.6)), "y" to nums(listOf(0))))

    private fun still(k: JsonElement): JsonObject = obj("a" to num(0), "k" to k)

    private fun moving(keys: List<Key>): JsonObject = obj(
        "a" to num(1),
        "k" to JsonArray(
            keys.mapIndexed { index, key ->
                val base = linkedMapOf<String, JsonElement>("t" to num(key.t), "s" to nums(key.s))
                if (index != keys.lastIndex) base.putAll(ease)
                JsonObject(base)
            },
        ),
    )

    private fun group(items: List<JsonObject>): JsonObject {
        val transform = obj(
            "ty" to JsonPrimitive("tr"), "p" to still(nums(listOf(0, 0))), "a" to still(nums(listOf(0, 0))),
            "s" to still(nums(listOf(100, 100))), "r" to still(num(0)), "o" to still(num(100)),
            "sk" to still(num(0)), "sa" to still(num(0)),
        )
        return obj("ty" to JsonPrimitive("gr"), "it" to JsonArray(items + transform))
    }

    private fun fill(color: List<Double>): JsonObject =
        obj("ty" to JsonPrimitive("fl"), "c" to still(nums(color)), "o" to still(num(100)), "r" to num(1))

    private fun ellipse(size: Double): JsonObject =
        obj("ty" to JsonPrimitive("el"), "d" to num(1), "s" to still(nums(listOf(size, size))), "p" to still(nums(listOf(0, 0))))

    private fun rect(w: Double, h: Double): JsonObject = obj(
        "ty" to JsonPrimitive("rc"), "d" to num(1), "s" to still(nums(listOf(w, h))),
        "p" to still(nums(listOf(0, 0))), "r" to still(num(0)),
    )

    private fun layer(
        index: Int,
        name: String,
        shapes: List<JsonObject>,
        position: JsonObject,
        opacity: JsonObject,
        rotation: Double = 0.0,
        scale: JsonObject? = null,
    ): JsonObject = obj(
        "ddd" to num(0), "ind" to num(index), "ty" to num(4), "nm" to JsonPrimitive(name), "sr" to num(1),
        "ks" to obj(
            "o" to opacity, "r" to still(num(rotation)), "p" to position,
            "a" to still(nums(listOf(0, 0, 0))), "s" to (scale ?: still(nums(listOf(100, 100, 100)))),
        ),
        "ao" to num(0), "shapes" to JsonArray(listOf(group(shapes))),
        "ip" to num(0), "op" to num(FRAMES), "st" to num(0), "bm" to num(0),
    )

    private fun sheen(index: Int): JsonObject = layer(
        index, "lustre", listOf(rect(34.0, 180.0), fill(glint)),
        position = moving(listOf(Key(30, listOf(-40.0, 50.0, 0.0)), Key(70, listOf(400.0, 50.0, 0.0)))),
        opacity = moving(listOf(Key(30, listOf(0.0)), Key(44, listOf(45.0)), Key(70, listOf(0.0)))),
        rotation = 18.0,
    )

    private fun burin(index: Int): JsonObject = layer(
        index, "burin", listOf(ellipse(7.0), fill(glint)),
        position = moving(listOf(Key(0, listOf(126.0, 74.0, 0.0)), Key(40, listOf(302.0, 74.0, 0.0)))),
        opacity = moving(listOf(Key(0, listOf(0.0)), Key(6, listOf(95.0)), Key(36, listOf(95.0)), Key(44, listOf(0.0)))),
    )

    private data class Spark(val x: Double, val y: Double, val start: Int)

    private val sparkSpots = listOf(Spark(140.0, 52.0, 4), Spark(196.0, 80.0, 12), Spark(248.0, 50.0, 20), Spark(292.0, 78.0, 28))

    private fun sparks(from: Int): List<JsonObject> = sparkSpots.mapIndexed { offset, spot ->
        layer(
            from + offset, "éclat ${offset + 1}", listOf(ellipse(6.0), fill(glint)),
            position = still(nums(listOf(spot.x, spot.y, 0.0))),
            opacity = still(num(90)),
            scale = moving(
                listOf(
                    Key(spot.start, listOf(0.0, 0.0, 100.0)),
                    Key(spot.start + 8, listOf(140.0, 140.0, 100.0)),
                    Key(spot.start + 20, listOf(0.0, 0.0, 100.0)),
                ),
            ),
        )
    }

    private val coinPath = listOf(118.0 to 46.0, 308.0 to 52.0, 122.0 to 60.0, 310.0 to 66.0, 120.0 to 74.0)

    private fun coin(index: Int): JsonObject = layer(
        index, "pièce", listOf(ellipse(16.0), fill(gold)),
        position = moving(coinPath.mapIndexed { step, point -> Key(step * 10, listOf(point.first, point.second, 0.0)) }),
        opacity = moving(listOf(Key(0, listOf(100.0)), Key(40, listOf(100.0)), Key(48, listOf(0.0)))),
    )

    private val fleckSpots = listOf(150.0 to 6, 184.0 to 12, 222.0 to 18, 258.0 to 24, 290.0 to 30)

    private fun flecks(from: Int): List<JsonObject> = fleckSpots.mapIndexed { offset, (x, start) ->
        layer(
            from + offset, "paillette ${offset + 1}", listOf(ellipse(4.0), fill(silver)),
            position = moving(listOf(Key(start, listOf(x, 62.0, 0.0)), Key(start + 30, listOf(x + 6, 100.0, 0.0)))),
            opacity = moving(listOf(Key(start, listOf(0.0)), Key(start + 4, listOf(100.0)), Key(start + 30, listOf(0.0)))),
        )
    }

    private fun layers(finish: PlateFinish): List<JsonObject> = when (finish) {
        PlateFinish.Engrave -> listOf(burin(1), sheen(2))
        PlateFinish.Emboss -> sparks(1) + sheen(1 + sparkSpots.size)
        PlateFinish.Scratch -> listOf(coin(1)) + flecks(2) + sheen(2 + fleckSpots.size)
    }

    /** Le document Lottie du fini. */
    public fun document(finish: PlateFinish): JsonObject = obj(
        "v" to JsonPrimitive("5.7.4"), "fr" to num(FRAMES_PER_SECOND), "ip" to num(0), "op" to num(FRAMES),
        "w" to num(WIDTH), "h" to num(HEIGHT),
        "nm" to JsonPrimitive("plaque d'auteur · ${finish.key}"), "ddd" to num(0), "assets" to JsonArray(emptyList()),
        "layers" to JsonArray(layers(finish)),
    )

    /** Le JSON que Lottie lit : l'animation générée, identique à chaque appel. */
    public fun json(finish: PlateFinish): String = document(finish).toString()
}

package me.meeshy.sdk.model.serialization

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le sérialiseur de liste tolérante — site UNIQUE de la tolérance « un élément
 * invalide ne fait pas tomber son porteur » (miroir de
 * `decodeLossyArrayIfPresent` / `LossyImageVariants` côté iOS).
 *
 * Un modèle plus strict que son fil ne perd pas le champ : il perd le contenu
 * porteur, le message entier disparaissant de la liste.
 */
class LossyListSerializerTest {

    @Serializable
    private data class Item(val id: Int, val label: String)

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val items = LossyListSerializer(Item.serializer())
    private val itemsOrNull = LossyNullableListSerializer(Item.serializer())

    @Test
    fun `an invalid element is dropped and the others are kept`() {
        val decoded = json.decodeFromString(
            items,
            """[{"id":1,"label":"a"},{"id":"oops","label":"b"},{"id":3,"label":"c"}]""",
        )
        assertThat(decoded).containsExactly(Item(1, "a"), Item(3, "c")).inOrder()
    }

    @Test
    fun `an element missing a required field is dropped`() {
        val decoded = json.decodeFromString(items, """[{"id":1},{"id":2,"label":"b"}]""")
        assertThat(decoded).containsExactly(Item(2, "b"))
    }

    @Test
    fun `scalars and nulls inside the array are dropped`() {
        val decoded = json.decodeFromString(items, """[null,"x",7,{"id":4,"label":"d"},[1,2]]""")
        assertThat(decoded).containsExactly(Item(4, "d"))
    }

    @Test
    fun `the order of the valid elements is preserved`() {
        val decoded = json.decodeFromString(
            items,
            """[{"id":3,"label":"c"},{"id":9},{"id":1,"label":"a"},{"id":2,"label":"b"}]""",
        )
        assertThat(decoded.map { it.id }).containsExactly(3, 1, 2).inOrder()
    }

    @Test
    fun `an array of only invalid elements decodes to an empty list`() {
        assertThat(json.decodeFromString(items, """[{"nope":true},{"id":"x"}]""")).isEmpty()
    }

    @Test
    fun `a value that is not an array decodes to an empty list`() {
        assertThat(json.decodeFromString(items, """{"id":1,"label":"a"}""")).isEmpty()
        assertThat(json.decodeFromString(items, "\"text\"")).isEmpty()
    }

    @Test
    fun `the nullable flavour keeps absent and non array as null but an empty array as empty`() {
        assertThat(json.decodeFromString(itemsOrNull, "null")).isNull()
        assertThat(json.decodeFromString(itemsOrNull, """{"id":1}""")).isNull()
        assertThat(json.decodeFromString(itemsOrNull, "[]")).isEmpty()
        assertThat(json.decodeFromString(itemsOrNull, """[{"id":1}]""")).isEmpty()
    }

    @Serializable
    private data class Page(
        @Serializable(with = ItemList::class) val items: List<Item> = emptyList(),
        @Serializable(with = ItemListOrNull::class) val more: List<Item>? = null,
        val title: String = "",
    )

    private object ItemList : KSerializer<List<Item>> by LossyListSerializer(Item.serializer())

    private object ItemListOrNull : KSerializer<List<Item>?> by LossyNullableListSerializer(Item.serializer())

    @Test
    fun `a holder survives a malformed element and keeps its other fields`() {
        val page = json.decodeFromString<Page>(
            """{"title":"p","items":[{"id":1,"label":"a"},{"id":"bad"}],"more":[{"id":2,"label":"b"},7]}""",
        )
        assertThat(page.title).isEqualTo("p")
        assertThat(page.items).containsExactly(Item(1, "a"))
        assertThat(page.more).containsExactly(Item(2, "b"))
    }

    @Test
    fun `absent and null keys keep the declared defaults`() {
        assertThat(json.decodeFromString<Page>("{}")).isEqualTo(Page())
        val withNulls = json.decodeFromString<Page>("""{"items":null,"more":null}""")
        assertThat(withNulls.items).isEmpty()
        assertThat(withNulls.more).isNull()
    }

    @Test
    fun `a holder round trips through the encoder`() {
        val page = Page(items = listOf(Item(1, "a"), Item(2, "b")), more = listOf(Item(3, "c")), title = "t")
        val encoded = json.encodeToString(Page.serializer(), page)
        assertThat(json.decodeFromString<Page>(encoded)).isEqualTo(page)
    }

    @Test
    fun `a null list is not written when nulls are implicit`() {
        val encoded = json.encodeToString(Page.serializer(), Page(more = null))
        assertThat(encoded).doesNotContain("more")
    }
}

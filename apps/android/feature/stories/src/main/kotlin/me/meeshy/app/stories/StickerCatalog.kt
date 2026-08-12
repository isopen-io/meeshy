package me.meeshy.app.stories

/**
 * The emoji-sticker categories offered by the composer's sticker picker — parity with
 * iOS `StickerPickerView`'s `StickerCategory` (smileys / animals / food / activities /
 * travel / objects / symbols / flags). The order here is the **tab order** shown to the
 * user, so it is part of the public contract.
 */
enum class StickerCategory {
    SMILEYS,
    ANIMALS,
    FOOD,
    ACTIVITIES,
    TRAVEL,
    OBJECTS,
    SYMBOLS,
    FLAGS,
}

/**
 * One catalogued emoji: its glyph, the [category] tab it lives under, and the lowercase
 * [keywords] a search query matches against. Keywords are the single source of truth for
 * search — there is no Unicode-name lookup, so the match is fully deterministic and pure
 * (no Android `emoji2` dependency, JVM-testable). An emoji belongs to exactly one
 * category, so [StickerCatalog.all] is free of duplicates.
 */
data class StickerEntry(
    val emoji: String,
    val category: StickerCategory,
    val keywords: List<String>,
)

/**
 * The curated emoji catalogue + the pure search the picker reads. Stateless building
 * block: it owns the emoji data and the filter rule, nothing about *when* the picker is
 * open or *which* tab is selected (that lives in [StickerPickerState] / the composer).
 *
 * Search is **substring, case-insensitive, across keywords or the glyph itself**, and the
 * result preserves catalogue order and is duplicate-free. A blank query is *not* a search
 * — it yields the whole scope unfiltered (the category's emojis, or every emoji when no
 * category is given).
 */
object StickerCatalog {

    val entries: List<StickerEntry> = buildList {
        addCategory(
            StickerCategory.SMILEYS,
            "😀" to listOf("grin", "smile", "happy"),
            "😂" to listOf("laugh", "joy", "lol", "haha"),
            "😍" to listOf("love", "heart", "eyes", "adore"),
            "😎" to listOf("cool", "sunglasses", "swag"),
            "🥳" to listOf("party", "celebrate", "hooray"),
            "😭" to listOf("cry", "sad", "tears", "sob"),
            "😡" to listOf("angry", "mad", "rage"),
            "🤔" to listOf("think", "hmm", "wonder"),
            "😉" to listOf("wink", "flirt"),
            "😘" to listOf("kiss", "love"),
            "😴" to listOf("sleep", "tired", "zzz"),
            "🤯" to listOf("mind", "blown", "shock"),
            "😊" to listOf("blush", "smile", "happy"),
            "🙄" to listOf("eyeroll", "annoyed"),
            "🥺" to listOf("plead", "puppy", "cute"),
            "😱" to listOf("scream", "fear", "scared"),
        )
        addCategory(
            StickerCategory.ANIMALS,
            "🐱" to listOf("cat", "kitten", "meow"),
            "🐶" to listOf("dog", "puppy", "woof"),
            "🐭" to listOf("mouse"),
            "🐰" to listOf("rabbit", "bunny"),
            "🦊" to listOf("fox"),
            "🐻" to listOf("bear"),
            "🐼" to listOf("panda"),
            "🐯" to listOf("tiger"),
            "🦁" to listOf("lion"),
            "🐷" to listOf("pig"),
            "🐸" to listOf("frog"),
            "🐵" to listOf("monkey"),
            "🐔" to listOf("chicken", "hen"),
            "🐧" to listOf("penguin"),
            "🦄" to listOf("unicorn"),
            "🐝" to listOf("bee", "honey"),
        )
        addCategory(
            StickerCategory.FOOD,
            "🍕" to listOf("pizza"),
            "🍔" to listOf("burger", "hamburger"),
            "🍟" to listOf("fries", "chips"),
            "🌭" to listOf("hotdog"),
            "🍿" to listOf("popcorn"),
            "🍩" to listOf("donut", "doughnut"),
            "🍦" to listOf("icecream", "soft", "serve"),
            "🎂" to listOf("cake", "birthday"),
            "🍫" to listOf("chocolate"),
            "🍎" to listOf("apple", "fruit"),
            "🍓" to listOf("strawberry", "fruit"),
            "🍉" to listOf("watermelon", "fruit"),
            "☕" to listOf("coffee", "tea", "hot"),
            "🍺" to listOf("beer", "drink"),
            "🍷" to listOf("wine", "drink"),
            "🍴" to listOf("fork", "knife", "eat"),
        )
        addCategory(
            StickerCategory.ACTIVITIES,
            "⚽" to listOf("soccer", "football", "ball"),
            "🏀" to listOf("basketball", "ball"),
            "🏈" to listOf("football", "rugby", "ball"),
            "⚾" to listOf("baseball", "ball"),
            "🎾" to listOf("tennis", "ball"),
            "🏐" to listOf("volleyball", "ball"),
            "🏆" to listOf("trophy", "win", "champion"),
            "🎮" to listOf("game", "controller", "play"),
            "🎸" to listOf("guitar", "music"),
            "🎤" to listOf("mic", "sing", "music"),
            "🎨" to listOf("art", "paint"),
            "🎬" to listOf("movie", "film", "clap"),
            "🎯" to listOf("dart", "target", "bullseye"),
            "🎲" to listOf("dice", "game"),
            "🏊" to listOf("swim", "sport"),
            "🚴" to listOf("bike", "cycle", "sport"),
        )
        addCategory(
            StickerCategory.TRAVEL,
            "✈️" to listOf("airplane", "plane", "fly", "travel"),
            "🚗" to listOf("car", "drive"),
            "🚕" to listOf("taxi", "cab"),
            "🚌" to listOf("bus"),
            "🚂" to listOf("train"),
            "🚀" to listOf("rocket", "launch", "space"),
            "⛵" to listOf("boat", "sail"),
            "🚢" to listOf("ship", "cruise"),
            "🏖️" to listOf("beach", "vacation"),
            "🏔️" to listOf("mountain", "snow"),
            "🗽" to listOf("statue", "liberty", "newyork"),
            "🗼" to listOf("tower", "pisa"),
            "🎡" to listOf("ferris", "wheel", "fair"),
            "🏕️" to listOf("camp", "tent"),
            "🌍" to listOf("earth", "globe", "world"),
            "🗺️" to listOf("map", "travel"),
        )
        addCategory(
            StickerCategory.OBJECTS,
            "💡" to listOf("bulb", "idea", "light"),
            "🔥" to listOf("fire", "lit", "hot"),
            "⭐" to listOf("star"),
            "💯" to listOf("hundred", "perfect", "100"),
            "📱" to listOf("phone", "mobile"),
            "💻" to listOf("laptop", "computer"),
            "🎧" to listOf("headphones", "music"),
            "📷" to listOf("camera", "photo"),
            "🎁" to listOf("gift", "present"),
            "💰" to listOf("money", "cash", "bag"),
            "🔑" to listOf("key", "unlock"),
            "⏰" to listOf("clock", "alarm", "time"),
            "🔋" to listOf("battery", "power"),
            "📚" to listOf("books", "read", "study"),
            "✂️" to listOf("scissors", "cut"),
            "🖍️" to listOf("crayon", "draw", "color"),
        )
        addCategory(
            StickerCategory.SYMBOLS,
            "❤️" to listOf("heart", "love", "red"),
            "💔" to listOf("brokenheart", "sad", "love"),
            "💖" to listOf("sparkleheart", "love", "pink"),
            "✨" to listOf("sparkles", "shine", "glitter"),
            "☮️" to listOf("peace"),
            "✅" to listOf("check", "done", "yes"),
            "❌" to listOf("cross", "no", "wrong"),
            "❗" to listOf("exclamation", "important"),
            "❓" to listOf("question", "huh"),
            "♻️" to listOf("recycle", "green"),
            "⚠️" to listOf("warning", "caution"),
            "🛑" to listOf("stop", "halt"),
            "💬" to listOf("speech", "comment", "talk"),
            "🔔" to listOf("bell", "notify"),
            "⚓" to listOf("anchor"),
            "♾️" to listOf("infinity", "forever"),
        )
        addCategory(
            StickerCategory.FLAGS,
            "🏁" to listOf("checkered", "flag", "race", "finish"),
            "🚩" to listOf("flag", "triangle", "golf"),
            "🏳️" to listOf("white", "flag", "surrender"),
            "🏴" to listOf("black", "flag"),
            "🏳️‍🌈" to listOf("rainbow", "flag", "pride"),
            "🇫🇷" to listOf("france", "french", "flag"),
            "🇺🇸" to listOf("usa", "america", "flag"),
            "🇬🇧" to listOf("uk", "britain", "flag"),
            "🇩🇪" to listOf("germany", "german", "flag"),
            "🇪🇸" to listOf("spain", "spanish", "flag"),
            "🇮🇹" to listOf("italy", "italian", "flag"),
            "🇵🇹" to listOf("portugal", "portuguese", "flag"),
            "🇧🇷" to listOf("brazil", "brazilian", "flag"),
            "🇯🇵" to listOf("japan", "japanese", "flag"),
            "🇨🇳" to listOf("china", "chinese", "flag"),
            "🇨🇦" to listOf("canada", "canadian", "flag"),
        )
    }

    /** Every catalogued emoji glyph in tab/catalogue order, duplicate-free. */
    val all: List<String> = entries.map { it.emoji }

    /** The emoji glyphs in [category], in catalogue order. */
    fun inCategory(category: StickerCategory): List<String> =
        entries.filter { it.category == category }.map { it.emoji }

    /**
     * The glyphs whose keywords (or glyph) match [query], optionally scoped to a single
     * [category]. A blank/whitespace [query] is not a search: it returns the whole scope
     * unfiltered. Otherwise the query is trimmed + lowercased and matched as a substring
     * against each entry's keywords or its glyph; the result preserves catalogue order
     * and is duplicate-free.
     */
    fun search(query: String, category: StickerCategory? = null): List<String> {
        val scope = if (category == null) entries else entries.filter { it.category == category }
        val needle = query.trim().lowercase()
        if (needle.isEmpty()) return scope.map { it.emoji }
        return scope
            .filter { entry -> entry.emoji == query.trim() || entry.keywords.any { it.contains(needle) } }
            .map { it.emoji }
            .distinct()
    }

    private fun MutableList<StickerEntry>.addCategory(
        category: StickerCategory,
        vararg items: Pair<String, List<String>>,
    ) {
        items.forEach { (emoji, keywords) -> add(StickerEntry(emoji, category, keywords)) }
    }
}

/**
 * The pure UI state of the sticker picker: which [category] tab is active and the live
 * search [query]. This is the product rule the composer's picker reads — in particular,
 * **a non-blank query searches across every category** (iOS parity), so the selected tab
 * is ignored while searching and honoured otherwise. Kept pure (no Compose, no VM) so the
 * "what is visible" decision is unit-tested in one place and the dialog stays glue.
 */
data class StickerPickerState(
    val category: StickerCategory = StickerCategory.SMILEYS,
    val query: String = "",
) {
    /** True once the user has typed a real (non-whitespace) query. */
    val isSearching: Boolean get() = query.isNotBlank()

    /**
     * The glyphs to render: the global search result while [isSearching] (the active tab
     * is intentionally ignored so a search spans all categories), otherwise the active
     * tab's emojis.
     */
    val visibleEmojis: List<String>
        get() = if (isSearching) StickerCatalog.search(query) else StickerCatalog.inCategory(category)

    /** Switch the active tab. Inert on the already-selected tab (same instance). */
    fun withCategory(next: StickerCategory): StickerPickerState =
        if (next == category) this else copy(category = next)

    /** Update the live search query. Inert when the text is unchanged (same instance). */
    fun withQuery(next: String): StickerPickerState =
        if (next == query) this else copy(query = next)
}

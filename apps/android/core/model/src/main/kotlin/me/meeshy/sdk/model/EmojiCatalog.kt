package me.meeshy.sdk.model

/**
 * Emoji categories for the full reaction picker — port of `EmojiCategory.all`
 * (EmojiReactionPicker.swift). Pure data: the [id] is a stable key the UI
 * layer maps to a localized label (sdk-ui owns the display strings), while
 * [icon] and [emojis] are presentation-agnostic.
 */
data class EmojiCategory(
    val id: String,
    val icon: String,
    val emojis: List<String>,
)

/** Source of truth for the emoji picker catalog (mirrors iOS `EmojiCategory.all`). */
object EmojiCatalog {

    /** The default quick-reaction strip when the user has no usage history yet. */
    val defaultQuickReactions: List<String> = listOf(
        "❤️", "😂", "🔥", "👏", "😮", "😢", "🥰", "👍",
    )

    val categories: List<EmojiCategory> = listOf(
        EmojiCategory(
            id = "reactions",
            icon = "🔥",
            emojis = listOf(
                "❤️", "😂", "🔥", "👏", "😮", "😢", "🥰", "😍",
                "💯", "🙏", "🤣", "😭", "✨", "🎉", "💪", "👍",
                "😊", "💕", "🤩", "😘", "❤️‍🔥", "🥺", "😎", "👀",
                "🫶", "💖", "😅", "🤔", "🥳", "💀", "😏", "🙌",
            ),
        ),
        EmojiCategory(
            id = "faces",
            icon = "😀",
            emojis = listOf(
                "😀", "😃", "😄", "😁", "😆", "🥹", "😊", "😇",
                "🙂", "😉", "😌", "😍", "🥰", "😘", "😗", "😙",
                "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗",
                "🤭", "🫢", "🫣", "🤫", "🤔", "🫡", "🤐", "🤨",
                "😐", "😑", "😶", "🫥", "😏", "😒", "🙄", "😬",
                "😮‍💨", "🤥", "🫨", "😔", "😪", "🤤", "😴", "😷",
                "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "🥴", "😵",
                "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐",
            ),
        ),
        EmojiCategory(
            id = "gestures",
            icon = "👋",
            emojis = listOf(
                "👍", "👎", "👏", "🙌", "🫶", "🙏", "💪", "✊",
                "👊", "🤛", "🤜", "🤝", "👋", "🤚", "🖐️", "✋",
                "🖖", "🫱", "🫲", "🫳", "🫴", "👌", "🤌", "🤏",
                "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉",
                "👆", "🖕", "👇", "☝️", "🫵", "👐", "🤲", "🦾",
            ),
        ),
        EmojiCategory(
            id = "hearts",
            icon = "❤️",
            emojis = listOf(
                "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
                "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓",
                "💗", "💖", "💘", "💝", "💟", "♥️", "🫀", "💋",
            ),
        ),
        EmojiCategory(
            id = "animals",
            icon = "🐶",
            emojis = listOf(
                "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼",
                "🐻‍❄️", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵",
                "🙈", "🙉", "🙊", "🐔", "🐧", "🐦", "🐤", "🦄",
                "🐝", "🦋", "🐌", "🐙", "🦑", "🐠", "🐡", "🐬",
            ),
        ),
        EmojiCategory(
            id = "objects",
            icon = "🎁",
            emojis = listOf(
                "🎁", "🎈", "🎉", "🎊", "🎂", "🍰", "🥂", "🍾",
                "🏆", "🥇", "🎯", "🎮", "🎲", "🎭", "🎬", "🎤",
                "🎧", "🎵", "🎶", "🎸", "🥁", "🎺", "🎨", "🖌️",
                "📸", "📱", "💻", "⌚", "💡", "🔮", "💎", "🪄",
            ),
        ),
    )
}

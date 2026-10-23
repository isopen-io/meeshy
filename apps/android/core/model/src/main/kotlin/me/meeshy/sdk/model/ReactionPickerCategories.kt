package me.meeshy.sdk.model

/** The six tabs of the reaction picker sheet — port of iOS `EmojiCategory.all` (EmojiReactionPicker.swift). */
enum class ReactionPickerCategoryId(val key: String, val icon: String) {
    REACTIONS("reactions", "🔥"),
    FACES("faces", "😀"),
    GESTURES("gestures", "👋"),
    HEARTS("hearts", "❤️"),
    ANIMALS("animals", "🐶"),
    OBJECTS("objects", "🎁"),
}

data class ReactionPickerCategory(
    val id: ReactionPickerCategoryId,
    val emojis: List<String>,
)

/** Shared constants of the quick-reaction bar (iOS `EmojiReactionPicker`). */
object ReactionBarLaw {
    /** The size of Meeshy's reaction bars everywhere one can react (story, message, image, comment, attachment). */
    const val DEFAULT_SCALE: Float = 1.5f

    /** Scale of the tile under the scrub finger (springs with a bounce). */
    const val HOVER_SCALE: Float = 1.35f
}

object ReactionPickerCategories {
    val all: List<ReactionPickerCategory> = listOf(
        ReactionPickerCategory(
            ReactionPickerCategoryId.REACTIONS,
            listOf(
                "❤️", "😂", "🔥", "👏", "😮", "😢", "🥰", "😍",
                "💯", "🙏", "🤣", "😭", "✨", "🎉", "💪", "👍",
                "😊", "💕", "🤩", "😘", "❤️‍🔥", "🥺", "😎", "👀",
                "🫶", "💖", "😅", "🤔", "🥳", "💀", "😏", "🙌",
            ),
        ),
        ReactionPickerCategory(
            ReactionPickerCategoryId.FACES,
            listOf(
                "😀", "😃", "😄", "😁", "😆", "🥹", "😊", "😇",
                "🙂", "😉", "😌", "😍", "🥰", "😘", "😗", "😙",
                "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗",
                "🤭", "🫢", "🫣", "🤫", "🤔", "🫡", "🤐", "🤨",
                "😐", "😑", "😶", "🫥", "😏", "😒", "🙄", "😬",
                "😮‍💨", "🤥", "🫨", "😞", "😔", "😪", "🤤", "😴",
                "😷", "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "🥴",
                "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐",
            ),
        ),
        ReactionPickerCategory(
            ReactionPickerCategoryId.GESTURES,
            listOf(
                "👍", "👎", "👏", "🙌", "🫶", "🙏", "💪", "✊",
                "👊", "🤛", "🤜", "🤝", "👋", "🤚", "🖐️", "✋",
                "🖖", "🫱", "🫲", "🫳", "🫴", "👌", "🤌", "🤏",
                "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉",
                "👆", "🖕", "👇", "☝️", "🫵", "👐", "🤲", "🦾",
            ),
        ),
        ReactionPickerCategory(
            ReactionPickerCategoryId.HEARTS,
            listOf(
                "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
                "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓",
                "💗", "💖", "💘", "💝", "💟", "♥️", "🫀", "💋",
            ),
        ),
        ReactionPickerCategory(
            ReactionPickerCategoryId.ANIMALS,
            listOf(
                "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼",
                "🐻‍❄️", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵",
                "🙈", "🙉", "🙊", "🐔", "🐧", "🐦", "🐤", "🦄",
                "🐝", "🦋", "🐌", "🐙", "🦑", "🐠", "🐡", "🐬",
            ),
        ),
        ReactionPickerCategory(
            ReactionPickerCategoryId.OBJECTS,
            listOf(
                "🎁", "🎈", "🎉", "🎊", "🎂", "🍰", "🥂", "🍾",
                "🏆", "🥇", "🎯", "🎮", "🎲", "🎭", "🎬", "🎤",
                "🎧", "🎵", "🎶", "🎸", "🥁", "🎺", "🎨", "🖌️",
                "📸", "📱", "💻", "⌚", "💡", "🔮", "💎", "🪄",
            ),
        ),
    )
}

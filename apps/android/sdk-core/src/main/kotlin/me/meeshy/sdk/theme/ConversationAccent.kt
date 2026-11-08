package me.meeshy.sdk.theme

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.DIRECT_GENERIC_NAME
import me.meeshy.sdk.model.directName
import me.meeshy.sdk.model.interlocutor
import me.meeshy.sdk.model.isDirect
import me.meeshy.sdk.model.appearance.AppearanceGamut
import me.meeshy.sdk.model.appearance.AppearanceScheme
import me.meeshy.sdk.model.appearance.ConversationAppearance

/**
 * Deterministic accent [DynamicColorGenerator.ColorPalette] for a conversation, via the
 * shared color algorithm — the single source of the row's `primary` avatar fill and its
 * `secondary` heat-gradient tint (parity iOS `conversation.colorPalette`). Computed once
 * so a row consuming both hues never re-derives the palette.
 */
fun ApiConversation.accentColorPalette(): DynamicColorGenerator.ColorPalette =
    // Route the wire `type` through the shared WIRE_TYPE_TO_CONTEXT_TYPE table so that
    // `public`/`global`/`broadcast` collapse onto the COMMUNITY base color, exactly as
    // web (`conversationAccentPalette`) and iOS (`MeeshyConversation.computeColorPalette`)
    // do — a local `when { … else -> DIRECT }` served those three the DIRECT color.
    DynamicColorGenerator.paletteForWire(type = type, memberCount = memberCount)

/**
 * La palette que le lecteur VOIT (parité iOS `MeeshyConversation.displayPalette(scheme:)`) : l'accent
 * PERSONNEL de sa ligne de préférences (`appearance.accent`, une teinte par schéma clair ou sombre)
 * décliné à ±30°, sinon la palette calculée, inchangée. L'accent personnel ne s'écrit jamais dans
 * [accentColorPalette] (cache, anciens clients) : il se résout ici, à la lecture.
 */
fun ApiConversation.displayPalette(gamut: AppearanceGamut, scheme: AppearanceScheme): DynamicColorGenerator.ColorPalette {
    val computed = accentColorPalette()
    val key = ConversationAppearance.read(resolvedPreferences?.appearance) { gamut.contains(it) }.accent
        ?: return computed
    val hex = gamut.accent(key, scheme)?.removePrefix("#")?.uppercase() ?: return computed
    return DynamicColorGenerator.ColorPalette.derived(hex, computed.saturationBoost)
}

/** Deterministic accent color (hex) for a conversation, via the shared color algorithm. */
fun ApiConversation.accentHex(): String = accentColorPalette().primary

/**
 * The name to show for a conversation. A group/community keeps its [title]; a direct
 * conversation has no title of its own — like iOS `APIConversation.toConversation` and web
 * `titleOf` (`apps/web/src/lib/view/conversation.ts`) — so it takes the name of the OTHER
 * participant, elected against [currentUserId] by the one election of
 * [me.meeshy.sdk.model.interlocutor], and never the stored [title], which can carry a legacy
 * artifact ("X et Y", composed client-side at creation, #6790) rather than a legitimate name.
 * An unknown reader ([currentUserId] `null` or blank) elects nobody: the row reads as the
 * generic name instead of as the reader's own (#11615). A local rename
 * ([resolvedPreferences]'s `customName`) always wins first, for either kind of conversation.
 */
fun ApiConversation.displayTitle(currentUserId: String? = null): String {
    resolvedPreferences?.customName?.takeIf { it.isNotBlank() }?.let { return it }
    if (isDirect) return directName(currentUserId)
    title?.takeIf { it.isNotBlank() }?.let { return it }
    return DIRECT_GENERIC_NAME
}

/**
 * The other participant's user id in a direct conversation — the presence-lookup key for a
 * conversation row/header (`ConversationListUiState.presenceStateFor` et al.). `null` for a
 * group/community/channel/bot conversation, when the reader is unknown, or when no other
 * participant is known. Projection of the same election as [displayTitle] and the avatar:
 * they are true together or false together.
 */
fun ApiConversation.otherParticipantUserId(currentUserId: String?): String? =
    interlocutor(currentUserId)?.userId

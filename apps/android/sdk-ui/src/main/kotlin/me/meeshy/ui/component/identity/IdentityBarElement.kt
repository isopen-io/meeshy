package me.meeshy.ui.component.identity

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.component.bubble.LanguageChip

/** Qui cède sa place en premier quand la ligne manque de largeur. */
public enum class IdentityTruncation { First, Second, Never }

/** Une entrée du menu d'action (iOS `ActionMenuItem`). */
@Immutable
public class IdentityMenuItem(
    public val label: String,
    public val isDestructive: Boolean = false,
    public val onClick: () -> Unit,
)

/** Les éléments déclaratifs d'une `UserIdentityBar` (iOS `IdentityBarElement`). */
public sealed interface IdentityBarElement {
    public val id: String
    public val truncation: IdentityTruncation get() = IdentityTruncation.Never

    public data object Name : IdentityBarElement {
        override val id: String = "name"
        override val truncation: IdentityTruncation = IdentityTruncation.First
    }

    public data class Username(val value: String) : IdentityBarElement {
        override val id: String get() = "username:$value"
        override val truncation: IdentityTruncation get() = IdentityTruncation.Second
    }

    public data class RoleBadge(val role: MemberRole) : IdentityBarElement {
        override val id: String get() = "role:${role.wireValue}"
    }

    public data class Time(val value: String) : IdentityBarElement {
        override val id: String get() = "time:$value"
    }

    public data class Delivery(val status: IdentityDeliveryStatus) : IdentityBarElement {
        override val id: String get() = "delivery:${status.name}"
    }

    /** Les drapeaux du Prisme : [onTap] reçoit le code de la langue touchée. */
    public class Flags(
        public val chips: List<LanguageChip>,
        public val onTap: ((String) -> Unit)? = null,
    ) : IdentityBarElement {
        override val id: String get() = "flags:" + chips.joinToString(",") { it.code }
    }

    public class TranslateButton(public val onClick: () -> Unit) : IdentityBarElement {
        override val id: String get() = "translate"
    }

    public data class Presence(val state: PresenceState) : IdentityBarElement {
        override val id: String get() = "presence:${state.name}"
    }

    public data class MemberSince(val value: String) : IdentityBarElement {
        override val id: String get() = "memberSince:$value"
        override val truncation: IdentityTruncation get() = IdentityTruncation.Second
    }

    public class ActionButton(public val label: String, public val onClick: () -> Unit) : IdentityBarElement {
        override val id: String get() = "action:$label"
    }

    public class ActionMenu(public val label: String, public val items: List<IdentityMenuItem>) : IdentityBarElement {
        override val id: String get() = "menu:$label"
    }

    public data class Text(val value: String, val tag: String? = null) : IdentityBarElement {
        override val id: String get() = if (tag != null) "text:$value:$tag" else "text:$value"
        override val truncation: IdentityTruncation get() = IdentityTruncation.Second
    }
}

/** Les quatre emplacements de la barre : deux lignes, chacune avec un groupe début et un groupe fin. */
@Immutable
public data class IdentityBarSlots(
    val leadingPrimary: List<IdentityBarElement> = emptyList(),
    val trailingPrimary: List<IdentityBarElement> = emptyList(),
    val leadingSecondary: List<IdentityBarElement> = emptyList(),
    val trailingSecondary: List<IdentityBarElement> = emptyList(),
) {
    public val hasSecondaryRow: Boolean get() = leadingSecondary.isNotEmpty() || trailingSecondary.isNotEmpty()
}

/** Les compositions prêtes à l'emploi (iOS `UserIdentityBar.messageBubble / comment / listing / metaRow`). */
public object IdentityBarPresets {

    private fun roleOrNull(role: MemberRole?): List<IdentityBarElement> =
        if (role != null && role != MemberRole.MEMBER) listOf(IdentityBarElement.RoleBadge(role)) else emptyList()

    private fun usernameOrNull(username: String?): List<IdentityBarElement> =
        username?.let { listOf(IdentityBarElement.Username(it)) }.orEmpty()

    /**
     * [inlineTime] = bulle de groupe : l'heure se lit en ligne avec l'auteur (`Nom · 12:45`) ; en direct,
     * heure et statut restent collés au bord de fin.
     */
    public fun messageBubble(
        role: MemberRole?,
        time: String,
        delivery: IdentityDeliveryStatus?,
        flags: List<LanguageChip>,
        onFlagTap: ((String) -> Unit)?,
        onTranslateTap: (() -> Unit)?,
        username: String?,
        inlineTime: Boolean = false,
    ): IdentityBarSlots {
        val leading = buildList<IdentityBarElement> {
            add(IdentityBarElement.Name)
            addAll(roleOrNull(role))
            if (inlineTime && time.isNotEmpty()) {
                add(IdentityBarElement.Text("·", "time"))
                add(IdentityBarElement.Time(time))
            }
            if (flags.isNotEmpty() || onTranslateTap != null) add(IdentityBarElement.Text("·", "flags"))
            if (flags.isNotEmpty()) add(IdentityBarElement.Flags(flags, onFlagTap))
            if (onTranslateTap != null) add(IdentityBarElement.TranslateButton(onTranslateTap))
        }
        val trailing = buildList<IdentityBarElement> {
            if (!inlineTime && time.isNotEmpty()) add(IdentityBarElement.Time(time))
            if (delivery != null) add(IdentityBarElement.Delivery(delivery))
        }
        return IdentityBarSlots(leading, trailing, usernameOrNull(username))
    }

    public fun comment(
        role: MemberRole?,
        time: String,
        flags: List<LanguageChip>,
        onFlagTap: ((String) -> Unit)?,
        onTranslateTap: (() -> Unit)?,
        username: String?,
    ): IdentityBarSlots = IdentityBarSlots(
        leadingPrimary = listOf<IdentityBarElement>(IdentityBarElement.Name) + roleOrNull(role),
        trailingPrimary = listOf(IdentityBarElement.Time(time)),
        leadingSecondary = usernameOrNull(username),
        trailingSecondary = buildList {
            if (flags.isNotEmpty()) add(IdentityBarElement.Flags(flags, onFlagTap))
            if (onTranslateTap != null) add(IdentityBarElement.TranslateButton(onTranslateTap))
        },
    )

    public fun listing(
        role: MemberRole?,
        username: String?,
        actionLabel: String?,
        onAction: (() -> Unit)?,
        statusText: String?,
    ): IdentityBarSlots = IdentityBarSlots(
        leadingPrimary = listOf<IdentityBarElement>(IdentityBarElement.Name) + roleOrNull(role),
        trailingPrimary = if (actionLabel != null && onAction != null) {
            listOf(IdentityBarElement.ActionButton(actionLabel, onAction))
        } else {
            emptyList()
        },
        leadingSecondary = usernameOrNull(username),
        trailingSecondary = statusText?.let { listOf(IdentityBarElement.Text(it)) }.orEmpty(),
    )

    /** Ligne méta sans avatar ni nom : drapeaux + traduire, puis heure + statut (omis si vides). */
    public fun metaRow(
        time: String,
        delivery: IdentityDeliveryStatus?,
        flags: List<LanguageChip>,
        onFlagTap: ((String) -> Unit)?,
        onTranslateTap: (() -> Unit)?,
    ): IdentityBarSlots = IdentityBarSlots(
        leadingPrimary = buildList {
            if (flags.isNotEmpty()) add(IdentityBarElement.Flags(flags, onFlagTap))
            if (onTranslateTap != null) add(IdentityBarElement.TranslateButton(onTranslateTap))
        },
        trailingPrimary = buildList {
            if (time.isNotEmpty()) add(IdentityBarElement.Time(time))
            if (delivery != null) add(IdentityBarElement.Delivery(delivery))
        },
    )
}

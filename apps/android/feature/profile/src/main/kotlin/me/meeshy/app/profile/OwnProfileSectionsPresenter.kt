package me.meeshy.app.profile

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.auth.CountryCatalog
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.status.statusForUser

/** Les sections de MA page, dans l'ordre d'iOS `ProfileView.scrollContent`. */
enum class OwnProfileSection { IDENTITY, CONTACT, LANGUAGES, STATS, FRIEND_REQUESTS, MEMBER_SINCE }

/** Le badge d'un moyen de contact : vert « Vérifié » ou orange « Non vérifié ». */
enum class ContactVerification { VERIFIED, NOT_VERIFIED }

/**
 * Une ligne de contact (e-mail ou téléphone). [value] `null` = rien de renseigné : la ligne lit « — »
 * et ne porte aucun badge, comme iOS qui ne pose `verificationBadge` que sur une valeur non vide.
 */
@Immutable
data class OwnProfileContactLine(
    val value: String?,
    val flag: String?,
    val verification: ContactVerification?,
)

/** Les trois rangs de langue de contenu du Prisme, dans l'ordre de la section « Langues ». */
enum class OwnProfileLanguageSlot { PRIMARY, REGIONAL, CUSTOM }

/** Ce que la droite d'une ligne de langue affiche. */
@Immutable
sealed interface OwnProfileLanguageValue {
    data class Chosen(val flag: String, val nativeName: String) : OwnProfileLanguageValue

    /** Langue principale absente : « Choisir ». */
    data object Choose : OwnProfileLanguageValue

    /** Langue secondaire absente : « Aucune ». */
    data object None : OwnProfileLanguageValue
}

/**
 * Une ligne sélecteur de langue (iOS `languagePickerRow`) : [isPickable] seulement en édition,
 * [allowsClear] pour les rangs secondaires que l'on peut vider, sous-titre pour la principale choisie.
 */
@Immutable
data class OwnProfileLanguageRow(
    val slot: OwnProfileLanguageSlot,
    val code: String,
    val value: OwnProfileLanguageValue,
    val showsSubtitle: Boolean,
    val isPickable: Boolean,
    val allowsClear: Boolean,
)

/** Les trois cartes de la section « Statistiques » (iOS `statCard` x 3). */
@Immutable
data class OwnProfileStatCards(
    val messages: String,
    val conversations: String,
    val friendRequests: String,
)

/** Ce dont le présentateur a besoin : l'identité de session, les tampons d'édition et les destinations fournies. */
data class OwnProfileSectionsInput(
    val user: MeeshyUser,
    val systemLanguage: String,
    val regionalLanguage: String,
    val customDestinationLanguage: String,
    val isEditing: Boolean,
    val stats: UserStatsPresentation?,
    val pendingFriendRequests: Int,
    val canOpenStats: Boolean,
    val canOpenProgression: Boolean,
    val canOpenDecor: Boolean,
)

/** MA page projetée pour le rendu : l'écran n'a plus aucune décision à prendre. */
@Immutable
data class OwnProfileSectionsPresentation(
    val sections: List<OwnProfileSection>,
    val email: OwnProfileContactLine,
    val phone: OwnProfileContactLine,
    val languages: List<OwnProfileLanguageRow>,
    val statCards: OwnProfileStatCards,
    val statsOpenable: Boolean,
    val showsProgression: Boolean,
    val showsDecor: Boolean,
    val friendRequestsBadge: String?,
    val memberSinceEpochMillis: Long?,
)

/**
 * Présentateur pur de MA page de profil (parité iOS `ProfileView` : `contactSection`, `languagesSection`,
 * `statsSection`, `friendRequestsSection`, `memberSinceSection`). Aucune dépendance Android : chaque
 * branche se prouve en test JVM.
 */
object OwnProfileSectionsPresenter {

    val ORDER: List<OwnProfileSection> = listOf(
        OwnProfileSection.IDENTITY,
        OwnProfileSection.CONTACT,
        OwnProfileSection.LANGUAGES,
        OwnProfileSection.STATS,
        OwnProfileSection.FRIEND_REQUESTS,
        OwnProfileSection.MEMBER_SINCE,
    )

    fun present(input: OwnProfileSectionsInput): OwnProfileSectionsPresentation {
        val user = input.user
        return OwnProfileSectionsPresentation(
            sections = ORDER,
            email = contactLine(user.email, flag = null, verifiedAt = user.emailVerifiedAt),
            phone = user.phoneNumber.let { contactLine(it, CountryCatalog.flagForPhoneNumber(it), user.phoneVerifiedAt) },
            languages = listOf(
                languageRow(OwnProfileLanguageSlot.PRIMARY, input.systemLanguage, input.isEditing),
                languageRow(OwnProfileLanguageSlot.REGIONAL, input.regionalLanguage, input.isEditing),
                languageRow(OwnProfileLanguageSlot.CUSTOM, input.customDestinationLanguage, input.isEditing),
            ),
            statCards = statCards(input.stats),
            statsOpenable = input.canOpenStats,
            showsProgression = input.canOpenProgression,
            showsDecor = input.canOpenDecor,
            friendRequestsBadge = input.pendingFriendRequests.takeIf { it > 0 }?.toString(),
            memberSinceEpochMillis = isoToEpochMillisOrNull(user.createdAt),
        )
    }

    private fun contactLine(raw: String?, flag: String?, verifiedAt: String?): OwnProfileContactLine {
        val value = raw?.trim()?.takeIf { it.isNotEmpty() }
            ?: return OwnProfileContactLine(value = null, flag = null, verification = null)
        val verification = if (verifiedAt.isNullOrBlank()) ContactVerification.NOT_VERIFIED else ContactVerification.VERIFIED
        return OwnProfileContactLine(value = value, flag = flag, verification = verification)
    }

    private fun languageRow(slot: OwnProfileLanguageSlot, code: String, isEditing: Boolean): OwnProfileLanguageRow {
        val isPrimary = slot == OwnProfileLanguageSlot.PRIMARY
        val info = code.takeIf { it.isNotBlank() }?.let(LanguageData::info)
        val value = when {
            info != null -> OwnProfileLanguageValue.Chosen(flag = info.flag, nativeName = info.nativeName)
            isPrimary -> OwnProfileLanguageValue.Choose
            else -> OwnProfileLanguageValue.None
        }
        return OwnProfileLanguageRow(
            slot = slot,
            code = code,
            value = value,
            showsSubtitle = isPrimary && code.isNotBlank(),
            isPickable = isEditing,
            allowsClear = !isPrimary,
        )
    }

    private fun statCards(stats: UserStatsPresentation?): OwnProfileStatCards {
        fun value(metric: StatMetric): String =
            stats?.tiles?.firstOrNull { it.metric == metric }?.formattedValue ?: "0"
        return OwnProfileStatCards(
            messages = value(StatMetric.MESSAGES),
            conversations = value(StatMetric.CONVERSATIONS),
            friendRequests = value(StatMetric.FRIEND_REQUESTS),
        )
    }
}

/**
 * Mon humeur sur l'avatar de MA page (parité iOS `ProfileOwnAvatar.shownMood`) : elle vient du cache
 * des statuts déjà servi, jamais d'une requête ; une humeur vide ne peint rien, et l'édition la masque
 * parce que le crayon occupe son coin.
 */
object OwnProfileMood {

    fun resolve(statuses: List<StatusEntry>, userId: String): String? =
        statuses.statusForUser(userId)?.moodEmoji?.takeIf { it.isNotBlank() }

    fun shown(emoji: String?, isEditing: Boolean): String? =
        if (isEditing) null else emoji?.takeIf { it.isNotBlank() }
}

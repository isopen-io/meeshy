package me.meeshy.sdk.model.onboarding

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import me.meeshy.sdk.model.ConversationWriteRestriction

/**
 * Les cartes, dans l'ordre du parcours (iOS `OnboardingStepId`). `EMAIL` n'est proposée qu'à un compte dont l'adresse
 * n'est pas vérifiée ; `AGE` n'existe que si la passerelle la connaît ([ApiOnboardingState.servesAgeStep]).
 */
enum class OnboardingStepId(val wire: String) {
    LANGUAGES("languages"),
    AGE("age"),
    EMAIL("email"),
    GLOBAL("global"),
    STORY("story"),
    FRIENDS("friends"),
    NOTIFICATIONS("notifications"),
    ;

    companion object {
        fun fromWire(raw: String?): OnboardingStepId? = entries.firstOrNull { it.wire == raw }
    }
}

/** Ce que l'utilisateur a fait d'une carte. */
enum class OnboardingStepOutcome(val wire: String) { DONE("done"), SKIPPED("skipped") }

/** L'audience par défaut de la première story. */
enum class OnboardingStoryVisibility { PUBLIC, FRIENDS }

/** Un profil proposé à la carte « Trouve ta bande ». Aucune présence : ces profils ne sont pas encore des amis. */
data class OnboardingSuggestion(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val languages: List<String> = emptyList(),
)

/** Ce que chaque geste créditera MAINTENANT (barème × élan courant, calculé par la passerelle). */
data class OnboardingStepRewards(val global: Int, val story: Int, val friendship: Int)

/**
 * L'état servi par `GET /me/onboarding` et rendu par chaque `PATCH` (iOS `APIOnboardingState`). Le SERVEUR déclare le
 * parcours ; le client l'affiche. [protectedRegime] se lit fail-closed : absent, il vaut `true`, et il impose
 * l'audience « amis ».
 */
data class ApiOnboardingState(
    val eligible: Boolean,
    val completedAt: String? = null,
    val seenSteps: List<OnboardingStepId> = emptyList(),
    val prefilledSteps: List<OnboardingStepId> = emptyList(),
    val globalConversationId: String? = null,
    val protectedRegime: Boolean = true,
    val storyDefaultVisibility: OnboardingStoryVisibility = OnboardingStoryVisibility.FRIENDS,
    val suggestions: List<OnboardingSuggestion> = emptyList(),
    /** `null` : passerelle antérieure, la carte « valide ton adresse » ne s'invente pas. */
    val emailVerified: Boolean? = null,
    /** `null` : non servi, la carte publie comme avant. */
    val canPublishStory: Boolean? = null,
    val stepRewards: OnboardingStepRewards? = null,
    /** Vrai dès que la passerelle SERT `viewerWriteRestriction`, même à `null`. */
    val servesAgeStep: Boolean = false,
    val viewerWriteRestriction: ConversationWriteRestriction? = null,
) {
    companion object {
        /** Le plafond de la carte « Trouve ta bande » : le contrat en sert au plus six. */
        const val MAX_SUGGESTIONS: Int = 6
    }
}

/**
 * Lecture tolérante de la charge (iOS `APIOnboardingState.init(from:)`) : une étape inconnue est ÉCARTÉE, jamais
 * fatale ; une charge illisible rend `null`.
 */
object OnboardingStateParser {
    fun parse(element: JsonElement?): ApiOnboardingState? {
        val obj = element as? JsonObject ?: return null
        val isProtected = obj.bool("protectedRegime") ?: true
        val served = if (obj.string("storyDefaultVisibility") == "public") {
            OnboardingStoryVisibility.PUBLIC
        } else {
            OnboardingStoryVisibility.FRIENDS
        }
        return ApiOnboardingState(
            eligible = obj.bool("eligible") ?: false,
            completedAt = obj.string("completedAt"),
            seenSteps = steps(obj["seenSteps"]),
            prefilledSteps = steps(obj["prefilledSteps"]),
            globalConversationId = obj.string("globalConversationId"),
            protectedRegime = isProtected,
            storyDefaultVisibility = if (isProtected) OnboardingStoryVisibility.FRIENDS else served,
            suggestions = suggestions(obj["suggestions"]).take(ApiOnboardingState.MAX_SUGGESTIONS),
            emailVerified = obj.bool("emailVerified"),
            canPublishStory = obj.bool("canPublishStory"),
            stepRewards = rewards(obj["stepRewards"]),
            servesAgeStep = obj.containsKey("viewerWriteRestriction") || obj.bool("servesAgeStep") == true,
            viewerWriteRestriction = obj.string("viewerWriteRestriction")?.takeIf { it.isNotEmpty() }
                ?.let(ConversationWriteRestriction::fromWire),
        )
    }

    private fun steps(element: JsonElement?): List<OnboardingStepId> =
        (element as? JsonArray).orEmpty().mapNotNull { OnboardingStepId.fromWire((it as? JsonPrimitive)?.contentOrNull) }

    private fun suggestions(element: JsonElement?): List<OnboardingSuggestion> =
        (element as? JsonArray).orEmpty().mapNotNull { item ->
            val o = item as? JsonObject ?: return@mapNotNull null
            val id = o.string("id") ?: return@mapNotNull null
            val username = o.string("username") ?: return@mapNotNull null
            OnboardingSuggestion(
                id = id,
                username = username,
                displayName = o.string("displayName") ?: username,
                avatarUrl = o.string("avatarUrl"),
                languages = (o["languages"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull },
            )
        }

    private fun rewards(element: JsonElement?): OnboardingStepRewards? {
        val o = element as? JsonObject ?: return null
        val global = o.int("global") ?: return null
        val story = o.int("story") ?: return null
        val friendship = o.int("friendship") ?: return null
        return OnboardingStepRewards(global, story, friendship)
    }

    private fun JsonObject.string(key: String): String? =
        (this[key] as? JsonPrimitive)?.takeIf { it !is JsonNull && it.isString }?.content

    private fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.booleanOrNull

    private fun JsonObject.int(key: String): Int? = (this[key] as? JsonPrimitive)?.intOrNull
}

/** Le corps d'un `PATCH /me/onboarding` pour une carte vue : `step` ET `outcome`, toujours ensemble. */
@Serializable
data class OnboardingStepUpdate(val step: String, val outcome: String) {
    companion object {
        fun of(step: OnboardingStepId, outcome: OnboardingStepOutcome) =
            OnboardingStepUpdate(step.wire, outcome.wire)
    }
}

/** Le corps d'un `PATCH /me/onboarding` qui clôt le parcours. */
@Serializable
data class OnboardingFinishUpdate(val finish: Boolean = true)

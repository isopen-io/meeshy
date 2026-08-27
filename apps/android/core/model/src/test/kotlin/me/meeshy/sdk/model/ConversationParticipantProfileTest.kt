package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * La fiche d'un participant, portée sur Android (#3943) — troisième client de
 * `GET /conversations/{id}/participants/{participantId}/profile`, livré côté
 * gateway par #3870 et rendu par iOS et web depuis #3877.
 *
 * Deux règles gouvernent ce port, et aucune n'est un détail de style :
 *
 * 1. **Le décodeur est TOLÉRANT.** `kotlinx.serialization` échoue sur le
 *    DOCUMENT ENTIER quand un champ requis manque — un modèle plus strict que
 *    le fil ne rend pas une fiche incomplète, il ne rend RIEN. Le port Kotlin
 *    d'un modèle Swift a déjà commis cette faute une fois, en copiant la FORME
 *    des modèles iOS sans copier la tolérance de leurs décodeurs.
 * 2. **La règle d'affichage vit ici, pas dans le Composable** — même loi que
 *    `ParticipantEntryCapabilities.denied` côté SDK Swift et
 *    `CAPABILITY_ORDER` côté web. Trois clients qui réécrivent la règle
 *    chacun de leur côté finissent par dire trois choses différentes.
 */
class ConversationParticipantProfileTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private fun decode(payload: String): ApiParticipantProfile =
        json.decodeFromString(ApiParticipantProfile.serializer(), payload)

    // ── 1. Le décodeur est tolérant ─────────────────────────────────────────

    @Test
    fun decodes_theMinimalDocumentTheGatewayCanServe() {
        val profile = decode("""{"participantId":"p1","conversationId":"c1"}""")

        assertThat(profile.participantId).isEqualTo("p1")
        assertThat(profile.entryCapabilities).isNull()
        assertThat(profile.canGrantHistory).isFalse()
    }

    /** `entryCapabilities` est `null` pour un INSCRIT — seul un visiteur sans compte en a. */
    @Test
    fun decodes_aRegisteredMember_withoutEntryCapabilities() {
        val profile = decode(
            """{"participantId":"p1","conversationId":"c1","isAnonymous":false,
                "displayName":"Alice","entryCapabilities":null,"entryLink":null,
                "historyVisibleFrom":null,"canGrantHistory":true}"""
        )

        assertThat(profile.isAnonymous).isFalse()
        assertThat(profile.entryCapabilities).isNull()
        assertThat(profile.canGrantHistory).isTrue()
    }

    @Test
    fun decodes_aVisitorWithItsEntryCapabilitiesAndLink() {
        val profile = decode(
            """{"participantId":"p1","conversationId":"c1","isAnonymous":true,
                "displayName":"ano_bob",
                "entryCapabilities":{"canSendMessages":true,"canSendFiles":false,
                  "canSendImages":true,"canSendVideos":false,"canSendAudios":false,
                  "canSendLocations":false,"canSendLinks":false,"canViewHistory":false},
                "entryLink":{"name":"Lien public","isActive":true,"expiresAt":null,
                  "maxUses":10,"currentUses":3},
                "historyVisibleFrom":"2026-01-15T00:00:00.000Z","canGrantHistory":true}"""
        )

        assertThat(profile.entryCapabilities?.canSendImages).isTrue()
        assertThat(profile.entryLink?.name).isEqualTo("Lien public")
        assertThat(profile.entryLink?.currentUses).isEqualTo(3)
        assertThat(profile.historyVisibleFrom).isEqualTo("2026-01-15T00:00:00.000Z")
    }

    /**
     * `canViewHistory` peut MANQUER (#4009) : le gateway le retire de la charge
     * diffusée à la room de conversation. Un modèle qui l'exige perdrait la
     * fiche entière — pas seulement ce champ.
     */
    @Test
    fun decodes_entryCapabilities_withoutCanViewHistory() {
        val profile = decode(
            """{"participantId":"p1","conversationId":"c1",
                "entryCapabilities":{"canSendMessages":true,"canSendFiles":true,
                  "canSendImages":true,"canSendVideos":true,"canSendAudios":true,
                  "canSendLocations":true,"canSendLinks":true}}"""
        )

        assertThat(profile.entryCapabilities).isNotNull()
        assertThat(profile.entryCapabilities?.canViewHistory).isNull()
    }

    @Test
    fun decodes_ignoresFieldsItDoesNotKnow() {
        val profile = decode("""{"participantId":"p1","conversationId":"c1","futureField":42}""")

        assertThat(profile.participantId).isEqualTo("p1")
    }

    // ── 2. La règle d'affichage ─────────────────────────────────────────────

    private fun capabilities(
        canViewHistory: Boolean? = true,
        canSendMessages: Boolean = true,
        canSendImages: Boolean = true,
    ) = ParticipantEntryCapabilities(
        canSendMessages = canSendMessages,
        canSendFiles = true,
        canSendImages = canSendImages,
        canSendVideos = true,
        canSendAudios = true,
        canSendLocations = true,
        canSendLinks = true,
        canViewHistory = canViewHistory,
    )

    @Test
    fun denied_listsOnlyWhatIsRefused_inDisplayOrder() {
        val denied = capabilities(canViewHistory = false, canSendImages = false).denied

        assertThat(denied).containsExactly(
            ParticipantCapability.CAN_VIEW_HISTORY,
            ParticipantCapability.CAN_SEND_IMAGES,
        ).inOrder()
    }

    @Test
    fun denied_isEmptyWhenNothingIsRefused() {
        assertThat(capabilities().denied).isEmpty()
    }

    /**
     * Un droit NON DIT n'est pas un droit REFUSÉ (#4009). L'y ranger ferait
     * afficher « Ne voit pas les messages antérieurs » à toute la salle —
     * exactement le fait que la charge réduite vient de taire.
     */
    @Test
    fun denied_omitsAnUndisclosedCapability() {
        val denied = capabilities(canViewHistory = null, canSendImages = false).denied

        assertThat(denied).doesNotContain(ParticipantCapability.CAN_VIEW_HISTORY)
        assertThat(denied).contains(ParticipantCapability.CAN_SEND_IMAGES)
    }

    @Test
    fun disclosed_namesWhatThePayloadActuallySays() {
        assertThat(capabilities(canViewHistory = null).disclosed)
            .doesNotContain(ParticipantCapability.CAN_VIEW_HISTORY)
        assertThat(capabilities(canViewHistory = false).disclosed)
            .contains(ParticipantCapability.CAN_VIEW_HISTORY)
    }

    /** `canViewHistory` vient EN TÊTE : c'est le refus qui explique le plus de comportements. */
    @Test
    fun capabilityOrder_putsHistoryFirst_asOnTheTwoOtherClients() {
        assertThat(ParticipantCapability.entries.first())
            .isEqualTo(ParticipantCapability.CAN_VIEW_HISTORY)
    }

    // ── 3. « Retirer » est une VALEUR, pas une absence ───────────────────────

    /**
     * Le gateway distingue `historyVisibleFrom: null` — « retire l'octroi » —
     * de la clé ABSENTE, qui n'affirme rien. Or `kotlinx.serialization` OMET par
     * défaut une propriété égale à son défaut : sans `@EncodeDefault`, « retirer »
     * serait parti sur le fil comme « ne rien dire », et l'octroi serait resté
     * en place pendant que l'écran affiche qu'il a été levé.
     *
     * Même piège que côté Swift, où l'`encodeIfPresent` synthétisé a valu un
     * encodeur manuel à iOS (#3877). Deux langages, deux mécanismes, un seul
     * symptôme : une intention EXPLICITE qui disparaît du corps de la requête.
     */
    @Test
    fun historyGrantUpdate_encodesAnExplicitNull_neverOmitsTheKey() {
        val body = Json.encodeToString(HistoryGrantUpdate.serializer(), HistoryGrantUpdate(null))

        assertThat(body).contains("historyVisibleFrom")
        assertThat(body).isEqualTo("""{"historyVisibleFrom":null}""")
    }

    @Test
    fun historyGrantUpdate_carriesTheDateWhenOneIsPosed() {
        val body = Json.encodeToString(
            HistoryGrantUpdate.serializer(),
            HistoryGrantUpdate("2026-03-01T00:00:00Z"),
        )

        assertThat(body).isEqualTo("""{"historyVisibleFrom":"2026-03-01T00:00:00Z"}""")
    }
}

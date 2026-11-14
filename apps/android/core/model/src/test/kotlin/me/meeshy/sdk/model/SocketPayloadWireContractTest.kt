package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Verrouille la FORME DU FIL de trois charges serveur→client, en faisant traverser à chacune la
 * VRAIE couche de désérialisation — le `Json` de `SdkModule.providesJson()`, recopié à l'identique.
 *
 * C'est la moitié que les témoins existants ne tenaient pas, et la raison pour laquelle le défaut
 * #18069 a vécu : un témoin qui CONSTRUIT `TranslationEvent(...)` en Kotlin vérifie le consommateur
 * et saute le décodeur. Il reste vert quelle que soit la charge réellement émise. Même mécanique,
 * même silence que [TranscriptionReadyEventTest] et que `participant:role-updated` avant lui.
 *
 * La seconde moitié — « le miroir n'exige rien que le contrat ne déclare » — est tenue
 * mécaniquement, et pour TOUS les événements d'un coup, par
 * `packages/shared/__tests__/ci/socket-payload-shape-gate.test.ts` (#18070). Les deux se complètent :
 * la garde compare le miroir au CONTRAT, ce fichier le confronte à une charge LITTÉRALE.
 */
class SocketPayloadWireContractTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    /**
     * La charge exacte de `buildTranslationEvent.ts`, l'émetteur UNIQUE de `message:translation` :
     * les traductions IMBRIQUENT sous `translations`, et il n'y a PAS de `conversationId`.
     *
     * Le miroir déclarait `conversationId`, `targetLanguage` et `translatedContent` à la racine,
     * tous requis : chaque trame levait `MissingFieldException`, avalée par
     * `SocketInboundRoute.guarded`. Aucune traduction temps réel n'atteignait Android (#18069).
     */
    @Test
    fun `decodes the nested gateway payload of message colon translation`() {
        val raw = """
            {
              "messageId": "m1",
              "translations": [
                {
                  "id": "m1_en_1763070000000",
                  "messageId": "m1",
                  "sourceLanguage": "fr",
                  "targetLanguage": "en",
                  "translatedContent": "Hello everyone",
                  "translationModel": "nllb-200",
                  "cacheKey": "m1_fr_en",
                  "cached": false,
                  "confidenceScore": 0.95,
                  "createdAt": "2026-11-13T21:00:00.000Z"
                }
              ]
            }
        """.trimIndent()

        val event = json.decodeFromString(TranslationEvent.serializer(), raw)

        assertThat(event.messageId).isEqualTo("m1")
        assertThat(event.usable).hasSize(1)
        assertThat(event.usable.single().targetLanguage).isEqualTo("en")
        assertThat(event.usable.single().translatedContent).isEqualTo("Hello everyone")
        assertThat(event.usable.single().sourceLanguage).isEqualTo("fr")
    }

    /** Une trame peut porter PLUSIEURS traductions : aucune ne se perd, et la liste garde son ordre. */
    @Test
    fun `decodes every translation a frame carries`() {
        val raw = """
            {
              "messageId": "m2",
              "translations": [
                { "targetLanguage": "en", "translatedContent": "Hello" },
                { "targetLanguage": "es", "translatedContent": "Hola" }
              ]
            }
        """.trimIndent()

        val event = json.decodeFromString(TranslationEvent.serializer(), raw)

        assertThat(event.usable.map { it.targetLanguage }).containsExactly("en", "es").inOrder()
    }

    /**
     * Indulgence : une entrée vide ou sans langue ne lève pas — elle est écartée par [TranslationEvent.usable],
     * donc la fusion la laisse tomber au lieu d'emporter la trame entière (motif [TranscriptionReadyEventTest]).
     */
    @Test
    fun `a malformed entry is dropped, not thrown`() {
        val raw = """
            {
              "messageId": "m3",
              "translations": [
                { "targetLanguage": "", "translatedContent": "orpheline" },
                { "targetLanguage": "de", "translatedContent": "   " },
                { "targetLanguage": "it", "translatedContent": "Ciao" }
              ]
            }
        """.trimIndent()

        val event = json.decodeFromString(TranslationEvent.serializer(), raw)

        assertThat(event.translations).hasSize(3)
        assertThat(event.usable.map { it.targetLanguage }).containsExactly("it")
    }

    /** Une trame sans aucune traduction se décode et ne fusionne rien. */
    @Test
    fun `an empty frame decodes to no usable translation`() {
        val event = json.decodeFromString(TranslationEvent.serializer(), """{ "messageId": "m4" }""")

        assertThat(event.messageId).isEqualTo("m4")
        assertThat(event.usable).isEmpty()
    }

    /**
     * `userId` est OPTIONNEL au contrat (`types/reaction.ts`) et le doc-comment dit pourquoi : la
     * passerelle le pose toujours, mais une charge PERSISTÉE puis rejouée hors ligne peut dater
     * d'avant son ajout. Exigé par le miroir, il faisait lever le décodage sur ce rejeu — piège armé
     * relevé par la garde de forme (#18070).
     */
    @Test
    fun `a reaction replayed without userId decodes`() {
        val raw = """
            {
              "messageId": "m1",
              "conversationId": "c1",
              "emoji": "❤️",
              "count": 2
            }
        """.trimIndent()

        val event = json.decodeFromString(ReactionUpdateEvent.serializer(), raw)

        assertThat(event.userId).isNull()
        assertThat(event.emoji).isEqualTo("❤️")
        assertThat(event.count).isEqualTo(2)
    }

    /**
     * Et l'acteur INCONNU n'est jamais « moi » — y compris face à un lecteur anonyme, dont
     * l'identité est nulle elle aussi. Sans ce garde, `null == null` rendrait VRAI et la réaction
     * d'un tiers passerait pour mon propre écho.
     */
    @Test
    fun `an unknown actor is never my own echo`() {
        val anonymous = json.decodeFromString(
            ReactionUpdateEvent.serializer(),
            """{ "messageId": "m1", "conversationId": "c1", "emoji": "👍" }""",
        )

        assertThat(anonymous.isOwnEcho(null)).isFalse()
        assertThat(anonymous.isOwnEcho("u1")).isFalse()

        val mine = json.decodeFromString(
            ReactionUpdateEvent.serializer(),
            """{ "messageId": "m1", "conversationId": "c1", "userId": "u1", "emoji": "👍" }""",
        )

        assertThat(mine.isOwnEcho("u1")).isTrue()
        assertThat(mine.isOwnEcho("u2")).isFalse()
        assertThat(mine.isOwnEcho(null)).isFalse()
    }

    /**
     * `attachmentId` est posé CONDITIONNELLEMENT par `emitAttachmentUpdated.ts` : un enrichissement
     * qui porte sur le message entier n'en nomme aucune pièce. Second piège armé de #18070.
     */
    @Test
    fun `an attachment update without attachmentId decodes`() {
        val raw = """
            {
              "messageId": "m1",
              "conversationId": "c1",
              "status": "ready"
            }
        """.trimIndent()

        val event = json.decodeFromString(AttachmentUpdatedEvent.serializer(), raw)

        assertThat(event.attachmentId).isNull()
        assertThat(event.status).isEqualTo("ready")
    }
}

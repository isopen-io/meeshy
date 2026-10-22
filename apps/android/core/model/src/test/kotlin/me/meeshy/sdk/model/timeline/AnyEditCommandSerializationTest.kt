package me.meeshy.sdk.model.timeline

import me.meeshy.sdk.model.scene.ClipTransform
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryKeyframe
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class AnyEditCommandSerializationTest {

    private val project = sampleProject()

    private val allCommands: List<EditCommand> = listOf(
        AddClipCommand(id = "1", timestamp = 1, clipId = "n", postMediaId = "pm", kind = TimelineClipKind.IMAGE, startTime = 0f, duration = 1f),
        DeleteClipCommand(id = "2", timestamp = 2, clipId = "v1", kind = TimelineClipKind.VIDEO, snapshotMedia = project.mediaObjects[0], insertionIndex = 0),
        MoveClipCommand(id = "3", timestamp = 3, clipId = "v1", kind = TimelineClipKind.VIDEO, oldStartTime = 1f, newStartTime = 2f),
        TrimClipCommand(id = "4", timestamp = 4, clipId = "v1", kind = TimelineClipKind.VIDEO, oldStartTime = 1f, oldDuration = 4f, newStartTime = 2f, newDuration = 3f),
        SplitClipCommand(id = "5", timestamp = 5, clipId = "v1", kind = TimelineClipKind.VIDEO, splitAtRelativeTime = 1f, leftId = "l", rightId = "r"),
        AddTransitionCommand(id = "6", timestamp = 6, transition = StoryClipTransition(id = "tr")),
        RemoveTransitionCommand(id = "7", timestamp = 7, transitionId = "tr1", snapshot = project.clipTransitions[0], insertionIndex = 0),
        ChangeTransitionCommand(id = "8", timestamp = 8, transitionId = "tr1", previous = project.clipTransitions[0], updated = StoryClipTransition(id = "tr1")),
        AddKeyframeCommand(id = "9", timestamp = 9, clipId = "v1", kind = TimelineClipKind.VIDEO, keyframe = StoryKeyframe(id = "k", time = 1f)),
        MoveKeyframeCommand(id = "10", timestamp = 10, clipId = "v1", kind = TimelineClipKind.VIDEO, keyframeId = "k1", oldTime = 1f, newTime = 2f, oldX = 0.1, newX = 0.2),
        DeleteKeyframeCommand(id = "11", timestamp = 11, clipId = "v1", kind = TimelineClipKind.VIDEO, keyframeId = "k1", snapshot = StoryKeyframe(id = "k1"), insertionIndex = 0),
        SetClipPropertyCommand(id = "12", timestamp = 12, clipId = "v1", kind = TimelineClipKind.VIDEO, property = ClipProperty.Transform(ClipTransform.IDENTITY, ClipTransform(0.1, 0.2, 2.0, 30.0, 4))),
        SetSlideDurationCommand(id = "13", timestamp = 13, oldDuration = 10f, newDuration = 20f, oldAuthoredDuration = 12f),
    )

    @Test
    fun `les treize commandes survivent a un aller retour JSON`() {
        assertThat(allCommands).hasSize(13)
        allCommands.forEach { command ->
            assertThat(AnyEditCommandCodec.decodeOrNull(AnyEditCommandCodec.encode(command))).isEqualTo(command)
        }
    }

    @Test
    fun `chaque commande porte son etiquette de fil`() {
        val tags = allCommands.map { (AnyEditCommandCodec.encode(it) as JsonObject)["type"]!!.toString().trim('"') }
        assertThat(tags).containsExactly(
            "addClip", "deleteClip", "moveClip", "trimClip", "splitClip", "addTransition", "removeTransition",
            "changeTransition", "addKeyframe", "moveKeyframe", "deleteKeyframe", "setClipProperty", "setSlideDuration",
        ).inOrder()
        assertThat(allCommands.map(AnyEditCommandCodec::typeTag)).isEqualTo(tags)
    }

    @Test
    fun `un type inconnu rend null sans exception`() {
        val unknown = JsonObject(mapOf("type" to JsonPrimitive("teleportClip"), "clipId" to JsonPrimitive("x")))
        assertThat(AnyEditCommandCodec.decodeOrNull(unknown)).isNull()
        assertThat(AnyEditCommandCodec.decodeOrNull(JsonPrimitive("junk"))).isNull()
    }

    @Test
    fun `un instantane survit a l aller retour texte avec son curseur`() {
        val snapshot = CommandStackSnapshot(allCommands, cursor = 5)
        assertThat(CommandStackSnapshot.fromJsonOrNull(snapshot.toJson())).isEqualTo(snapshot)
    }

    @Test
    fun `une commande inconnue est ignoree et le curseur recule d autant`() {
        val known = allCommands.take(3).map(AnyEditCommandCodec::encode)
        val unknown = JsonObject(mapOf("type" to JsonPrimitive("futureCommand")))
        val text = JsonObject(
            mapOf(
                "commands" to JsonArray(listOf(known[0], unknown, known[1], known[2])),
                "cursor" to JsonPrimitive(3),
            ),
        ).toString()
        val restored = CommandStackSnapshot.fromJsonOrNull(text)!!
        assertThat(restored.commands).containsExactly(allCommands[0], allCommands[1], allCommands[2]).inOrder()
        assertThat(restored.cursor).isEqualTo(2)
    }

    @Test
    fun `un document illisible rend null et la pile vide reste valide`() {
        assertThat(CommandStackSnapshot.fromJsonOrNull("not json")).isNull()
        assertThat(CommandStackSnapshot.fromJsonOrNull("{}")).isEqualTo(CommandStackSnapshot.EMPTY)
        assertThat(Json.parseToJsonElement(CommandStackSnapshot.EMPTY.toJson())).isNotNull()
    }
}

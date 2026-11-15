package me.meeshy.sdk.model

/** Ce qu'un objet audio produit SUR la scène — miroir de `SceneAudioStagePresence` (iOS, #9737). */
sealed interface SceneAudioStagePresence {
    /** Le son de FOND : aucun pixel ; il se dit par le crédit HORS scène. */
    data object OffStage : SceneAudioStagePresence

    /** Le son de PREMIER PLAN : une pastille capsule à la pose choisie au composeur. */
    data class Chip(val pose: SceneAudioChipPose) : SceneAudioStagePresence
}

/** Centre normalisé 0–1, échelle et rotation (degrés) avec les défauts du fil (1 et 0). */
data class SceneAudioChipPose(val x: Double, val y: Double, val scale: Double, val rotation: Double)

/** LA règle lue par toute surface qui peint une scène : le fond ne paraît pas, le premier plan est une pastille. */
object SceneAudioStageRule {
    fun presence(audio: StoryAudioPlayerObject): SceneAudioStagePresence =
        if (audio.isBackground == true) {
            SceneAudioStagePresence.OffStage
        } else {
            SceneAudioStagePresence.Chip(
                SceneAudioChipPose(audio.x, audio.y, audio.scale ?: 1.0, audio.rotation ?: 0.0),
            )
        }

    fun isStaged(audio: StoryAudioPlayerObject): Boolean = presence(audio) != SceneAudioStagePresence.OffStage

    fun stagedAudios(audios: List<StoryAudioPlayerObject>): List<StoryAudioPlayerObject> = audios.filter(::isStaged)
}

package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import me.meeshy.sdk.model.serialization.LossyListSerializer
import me.meeshy.sdk.model.serialization.LossyNullableListSerializer

/*
 * Les familles d'objets d'une scène se lisent ÉLÉMENT PAR ÉLÉMENT, miroir de
 * `decodeLossyArrayIfPresent` (StoryEffects.swift) : un objet illisible ne coûte que
 * lui-même, jamais la story, ni la page de stories qui la porte.
 */

internal object StoryTextObjectListSerializer :
    KSerializer<List<StoryTextObject>> by LossyListSerializer(StoryTextObject.serializer())

internal object StoryLocationObjectListSerializer :
    KSerializer<List<StoryLocationObject>> by LossyListSerializer(StoryLocationObject.serializer())

internal object StoryStickerListSerializer :
    KSerializer<List<StorySticker>?> by LossyNullableListSerializer(StorySticker.serializer())

internal object StoryMediaObjectListSerializer :
    KSerializer<List<StoryMediaObject>?> by LossyNullableListSerializer(StoryMediaObject.serializer())

internal object StoryAudioPlayerObjectListSerializer :
    KSerializer<List<StoryAudioPlayerObject>?> by LossyNullableListSerializer(StoryAudioPlayerObject.serializer())

internal object StoryDrawingStrokeListSerializer :
    KSerializer<List<StoryDrawingStroke>?> by LossyNullableListSerializer(StoryDrawingStroke.serializer())

internal object StoryClipTransitionListSerializer :
    KSerializer<List<StoryClipTransition>?> by LossyNullableListSerializer(StoryClipTransition.serializer())

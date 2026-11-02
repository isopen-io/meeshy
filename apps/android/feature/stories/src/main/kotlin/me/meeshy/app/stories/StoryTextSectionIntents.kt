package me.meeshy.app.stories

import me.meeshy.sdk.model.scene.StoryTextFrameShape

/*
 * Les intentions des sections cadre, bordure et langue d'un texte (#13561, #13534). Chaque ligne est un réducteur
 * testé ; un glissé de curseur est UN geste (une seule entrée d'annulation), les pastilles sont des gestes isolés.
 */

internal fun StoryComposerViewModel.onTextElementFrameShape(id: String, shape: StoryTextFrameShape) =
    onSceneReduce { StoryComposerTextReducer.frameShaped(it, id, shape) }

internal fun StoryComposerViewModel.onTextElementFramePadding(id: String, scale: Float) =
    onSceneGesture("frame-padding:$id") { StoryComposerTextReducer.framePadded(it, id, scale) }

internal fun StoryComposerViewModel.onTextElementFrameBorder(id: String, width: Float) =
    onSceneGesture("frame-border:$id") { StoryComposerTextReducer.frameBordered(it, id, width) }

internal fun StoryComposerViewModel.onTextElementFrameColor(id: String, hex: String) =
    onSceneReduce { StoryComposerTextReducer.frameColored(it, id, hex) }

internal fun StoryComposerViewModel.onTextElementOutlineWidth(id: String, width: Float) =
    onSceneGesture("outline-width:$id") { StoryComposerTextReducer.outlineWidened(it, id, width) }

internal fun StoryComposerViewModel.onTextElementOutlineColor(id: String, hex: String) =
    onSceneReduce { StoryComposerTextReducer.outlineColored(it, id, hex) }

internal fun StoryComposerViewModel.onTextElementLanguage(id: String, code: String) =
    onSceneReduce { StoryComposerTextReducer.languaged(it, id, code) }

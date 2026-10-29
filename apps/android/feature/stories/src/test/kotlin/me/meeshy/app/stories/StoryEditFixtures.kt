package me.meeshy.app.stories

import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.ApiPost

/**
 * Une story publiée telle qu'iOS l'écrit et que la passerelle la sert : le blob `storyEffects` est celui du golden de
 * `StoryModelWireGoldenTest` (CHAQUE champ de chaque famille porte une valeur), entouré des médias du post.
 */
internal object StoryEditFixtures {

    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    const val BACKGROUND_VIDEO = "64f0a1b2c3d4e5f6a7b8c9d2"
    const val STICKER_IMAGE = "64f0a1b2c3d4e5f6a7b8c9d0"
    const val VOICE_TRACK = "64f0a1b2c3d4e5f6a7b8c9d3"
    const val FOREGROUND_PHOTO = "64f0a1b2c3d4e5f6a7b8c9e1"
    const val ME = "64f0a1b2c3d4e5f6a7b8c9aa"

    val iosEffects = """
        {
          "background": "gradient:#1E1B4B,#6366F1",
          "filter": "vintage",
          "filterIntensity": 0.8,
          "stickerObjects": [
            { "id": "st1", "emoji": "🔥", "postMediaId": "$STICKER_IMAGE", "provider": "library",
              "x": 0.8, "y": 0.7, "scale": 1.5, "rotation": 15, "zIndex": 4, "baseSize": 300,
              "anchor": { "x": 0.25, "y": 0.75 }, "startTime": 1, "duration": 4, "fadeIn": 0.3, "fadeOut": 0.5 },
            { "id": "st2", "emoji": "✨", "x": 0.2, "y": 0.3, "scale": 1.1, "rotation": -10, "zIndex": 5, "baseSize": 140,
              "anchor": { "x": 0.5, "y": 0.5 }, "startTime": 2, "duration": 3 }
          ],
          "backgroundAudioId": "snd_nuits_ete",
          "backgroundAudioVolume": 0.5,
          "voiceAttachmentId": "$VOICE_TRACK",
          "opening": "fade",
          "closing": "zoom",
          "textObjects": [
            { "id": "t1", "text": "Salut", "x": 0.25, "y": 0.2, "scale": 1.2, "rotation": 5, "zIndex": 3,
              "anchor": { "x": 0.1, "y": 0.9 }, "fontSize": 120, "fontFamily": "serif",
              "textStyle": "typewriter", "textColor": "#FFD166", "textAlign": "right", "textBg": "#11111180",
              "backgroundStyle": { "type": "glass", "hex": "#FFFFFF33", "radius": 12 },
              "borderColor": "#EF476F", "borderWidth": 2, "textEffect": "neon-glow",
              "translations": { "en": "Hi", "es": "Hola" }, "sourceLanguage": "fr",
              "startTime": 1, "duration": 6, "fadeIn": 0.25, "fadeOut": 0.75, "isLocked": true,
              "keyframes": [ { "id": "k1", "time": 1, "x": 0.2, "y": 0.3, "scale": 1.1, "opacity": 0, "easing": "easeIn" } ] },
            { "id": "t2", "text": "Bonne journée", "x": 0.5, "y": 0.8, "scale": 1, "rotation": 0, "zIndex": 4,
              "fontSize": 64, "textStyle": "bold", "translations": { "en": "Have a nice day" }, "sourceLanguage": "fr" }
          ],
          "mediaObjects": [
            { "id": "m1", "postMediaId": "$BACKGROUND_VIDEO", "mediaURL": "https://cdn.meeshy.me/m1.mp4",
              "mediaType": "video", "placement": "background", "x": 0.4, "y": 0.6, "scale": 0.9, "rotation": 3, "volume": 0.5,
              "aspectRatio": 1.7777, "anchor": { "x": 0.4, "y": 0.0 }, "intrinsicDuration": 12.5, "isBackground": true,
              "loop": true, "crop": { "x": 0.1, "y": 0.2, "width": 0.5, "height": 0.6 }, "zIndex": 2,
              "startTime": 0.5, "duration": 8, "sourceStart": 3, "sourceEnd": 8, "fadeIn": 0.5, "fadeOut": 1.5,
              "keyframes": [ { "id": "k3", "time": 0.5, "scale": 1, "easing": "linear" } ] },
            { "id": "fg1", "postMediaId": "$FOREGROUND_PHOTO", "mediaURL": "https://cdn.meeshy.me/fg1.jpg",
              "mediaType": "image", "placement": "media", "x": 0.3, "y": 0.7, "scale": 1.4, "rotation": -12,
              "aspectRatio": 0.75, "filter": "warm", "zIndex": 7,
              "adjustments": { "contrast": 1.2 }, "keyframes": [ { "id": "k9", "time": 1, "x": 0.4, "easing": "easeOut" } ] }
          ],
          "audioPlayerObjects": [
            { "id": "a1", "postMediaId": "$VOICE_TRACK", "placement": "canvas", "x": 0.4, "y": 0.6, "volume": 0.75,
              "waveformSamples": [0.25, 0.5, 0.125], "isBackground": true, "zIndex": 6, "startTime": 1.5, "duration": 9,
              "sourceStart": 2, "sourceEnd": 11, "loop": true, "fadeIn": 0.5, "fadeOut": 1, "sourceLanguage": "fr" }
          ],
          "drawingStrokes": [
            { "id": "d1", "points": [ { "x": 100, "y": 200, "pressure": 0.5 }, { "x": 150, "y": 260, "pressure": 0.75 } ],
              "colorHex": "#06D6A0", "width": 8, "tool": "marker", "smoothing": "curve", "createdAt": 1700000000.5, "captureVersion": 1 }
          ],
          "thumbHash": "3OcRJYB4d3h/iIeHeEh3eIhw+j3A",
          "backgroundTransform": { "scale": 1.1, "offsetX": 0.02, "offsetY": -0.04, "rotation": 2, "videoFitMode": "fit", "backdrop": "blur" },
          "timelineDuration": 9.5,
          "clipTransitions": [ { "id": "ct1", "fromClipId": "c1", "toClipId": "c2", "kind": "dissolve", "duration": 0.5, "easing": "easeInOut" } ],
          "musicTrackId": "legacy-track-9",
          "layout": "hero"
        }
    """.trimIndent()

    val iosPost: ApiPost = json.decodeFromString(
        ApiPost.serializer(),
        """
        { "id": "p1", "type": "STORY", "visibility": "FRIENDS", "content": "Bonjour",
          "originalLanguage": "fr", "author": { "id": "$ME", "username": "me" },
          "media": [
            { "id": "$BACKGROUND_VIDEO", "mimeType": "video/mp4", "fileUrl": "https://cdn.meeshy.me/m1.mp4", "width": 1080, "height": 1920, "duration": 12 },
            { "id": "$FOREGROUND_PHOTO", "mimeType": "image/jpeg", "fileUrl": "https://cdn.meeshy.me/fg1.jpg", "width": 600, "height": 800 },
            { "id": "$STICKER_IMAGE", "mimeType": "image/png", "fileUrl": "https://cdn.meeshy.me/st1.png" },
            { "id": "$VOICE_TRACK", "mimeType": "audio/mp4", "fileUrl": "https://cdn.meeshy.me/a1.m4a" }
          ],
          "mentions": [
            { "userId": "64f0a1b2c3d4e5f6a7b8c9bb", "username": "ana", "display": "NOTE" },
            { "userId": "64f0a1b2c3d4e5f6a7b8c9bc", "username": "zed", "display": "INLINE" }
          ],
          "storyEffects": $iosEffects }
        """.trimIndent(),
    )

    fun opening(post: ApiPost = iosPost, mentionsKnown: Boolean = true): StoryEditOpening =
        StoryEditOpening.open(post, mentionsKnown)

    /** L'état du composeur à l'ouverture : celui que l'écran montre avant le premier geste. */
    fun opened(opening: StoryEditOpening = opening()): StoryComposerUiState = opening.applied(StoryComposerUiState())
}

package me.meeshy.app.calls

import android.Manifest

/**
 * The runtime permissions a call needs before WebRTC can capture media: the
 * microphone is always required; the camera only for a video call. The request
 * itself (an ActivityResult launcher) is wired where the call is started.
 */
object CallPermissions {
    fun required(isVideo: Boolean): Array<String> =
        if (isVideo) {
            arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA)
        } else {
            arrayOf(Manifest.permission.RECORD_AUDIO)
        }
}

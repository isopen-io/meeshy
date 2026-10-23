package me.meeshy.sdk.call

import android.graphics.SurfaceTexture
import android.view.Surface
import org.webrtc.EglBase

/**
 * Un `EglBase` sans contexte GL, pour les tests JVM du moteur. MockK ne peut pas le sous-classer :
 * l'interface déclare une fabrique statique signée avec `javax.microedition.khronos.egl.EGLContext`,
 * classe absente du classpath des tests unitaires, et la réflexion de ByteBuddy la charge.
 */
internal class InertEglBase : EglBase {
    override fun createSurface(surface: Surface?) = Unit
    override fun createSurface(surfaceTexture: SurfaceTexture?) = Unit
    override fun createDummyPbufferSurface() = Unit
    override fun createPbufferSurface(width: Int, height: Int) = Unit
    override fun getEglBaseContext(): EglBase.Context = EglBase.Context { 0L }
    override fun hasSurface(): Boolean = false
    override fun surfaceWidth(): Int = 0
    override fun surfaceHeight(): Int = 0
    override fun releaseSurface() = Unit
    override fun release() = Unit
    override fun makeCurrent() = Unit
    override fun detachCurrent() = Unit
    override fun swapBuffers() = Unit
    override fun swapBuffers(presentationTimeStampNs: Long) = Unit
}

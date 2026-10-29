package me.meeshy.sdk.call.effects

import android.opengl.GLES20
import java.nio.FloatBuffer

/**
 * A linked GLES 2 program whose uniform locations are looked up once. Unlike webrtc's `GlShader`, a
 * uniform the compiler optimised away is silently ignored instead of throwing: the same Kotlin call
 * site feeds the colour uniforms to programs that use them and to programs that do not.
 */
internal class CallGlProgram(vertex: String, fragment: String) {
    private val program: Int
    private val locations = HashMap<String, Int>()

    init {
        val vs = compile(GLES20.GL_VERTEX_SHADER, vertex)
        val fs = compile(GLES20.GL_FRAGMENT_SHADER, fragment)
        program = GLES20.glCreateProgram()
        check(program != 0) { "glCreateProgram failed" }
        GLES20.glAttachShader(program, vs)
        GLES20.glAttachShader(program, fs)
        GLES20.glLinkProgram(program)
        val status = IntArray(1)
        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, status, 0)
        GLES20.glDeleteShader(vs)
        GLES20.glDeleteShader(fs)
        if (status[0] != GLES20.GL_TRUE) {
            val log = GLES20.glGetProgramInfoLog(program)
            GLES20.glDeleteProgram(program)
            error("program link failed: $log")
        }
    }

    fun use() = GLES20.glUseProgram(program)

    fun attribute(name: String, buffer: FloatBuffer) {
        val location = GLES20.glGetAttribLocation(program, name)
        if (location < 0) return
        GLES20.glEnableVertexAttribArray(location)
        GLES20.glVertexAttribPointer(location, 2, GLES20.GL_FLOAT, false, 0, buffer)
    }

    fun uniform(name: String, value: Float) = location(name).takeIf { it >= 0 }?.let { GLES20.glUniform1f(it, value) }

    fun uniform(name: String, x: Float, y: Float) = location(name).takeIf { it >= 0 }?.let { GLES20.glUniform2f(it, x, y) }

    fun sampler(name: String, unit: Int) = location(name).takeIf { it >= 0 }?.let { GLES20.glUniform1i(it, unit) }

    fun matrix(name: String, value: FloatArray) =
        location(name).takeIf { it >= 0 }?.let { GLES20.glUniformMatrix4fv(it, 1, false, value, 0) }

    fun release() = GLES20.glDeleteProgram(program)

    private fun location(name: String): Int = locations.getOrPut(name) { GLES20.glGetUniformLocation(program, name) }

    private fun compile(type: Int, source: String): Int {
        val shader = GLES20.glCreateShader(type)
        GLES20.glShaderSource(shader, source)
        GLES20.glCompileShader(shader)
        val status = IntArray(1)
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0)
        if (status[0] != GLES20.GL_TRUE) {
            val log = GLES20.glGetShaderInfoLog(shader)
            GLES20.glDeleteShader(shader)
            error("shader compile failed: $log")
        }
        return shader
    }
}

package me.meeshy.app.calls

import android.content.Context
import io.mockk.every
import io.mockk.mockk
import org.junit.Test

/** The haptics seam must never fail a call: no vibrator, no service, no permission = silence. */
class CallHapticsTest {

    @Test
    fun `every beat is silent and safe on a device without a vibrator service`() {
        val context = mockk<Context>(relaxed = true)
        every { context.getSystemService(any<String>()) } returns null
        val haptics = AndroidCallHaptics(context)

        CallHapticKind.entries.forEach { haptics.play(it) }
    }

    @Test
    fun `a platform that throws when vibrating does not fail the call`() {
        val context = mockk<Context>(relaxed = true)
        every { context.getSystemService(any<String>()) } throws SecurityException("no VIBRATE")
        val haptics = AndroidCallHaptics(context)

        CallHapticKind.entries.forEach { haptics.play(it) }
    }
}

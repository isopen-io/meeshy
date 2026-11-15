package me.meeshy.ui.component.game

import com.google.common.truth.Truth.assertThat
import org.junit.Assume.assumeNotNull
import org.junit.Test
import java.io.File

class GameShadersSourceTest {

    private fun swiftShaders(): File? {
        var dir: File? = File(System.getProperty("user.dir")).absoluteFile
        while (dir != null) {
            val f = File(dir, "packages/MeeshySDK/Sources/MeeshyUI/Game/GameShaders.swift")
            if (f.isFile) return f
            dir = dir.parentFile
        }
        return null
    }

    @Test
    fun `chaque source declare ses uniforms et une fonction main`() {
        GameShaderSources.functionNames.forEach { name ->
            val source = GameShaderSources.sources.getValue(name)
            assertThat(source).contains("half4 main(float2 position)")
            GameShaderSources.uniformsBySource.getValue(name).forEach { uniform ->
                assertThat(source).containsMatch("uniform\\s+(shader|float|float2)\\s+$uniform;")
            }
        }
    }

    @Test
    fun `les sources n ont ni directive metal ni caractere hors ASCII`() {
        GameShaderSources.sources.values.forEach { source ->
            assertThat(source).doesNotContain("#include")
            assertThat(source).doesNotContain("[[")
            assertThat(source.all { it.code < 128 }).isTrue()
        }
    }

    @Test
    fun `les noms de fonctions suivent GameShaders swift`() {
        val swift = swiftShaders()
        assumeNotNull(swift)
        val declared = Regex("functionNames\\s*=\\s*\\[([^\\]]*)]").find(swift!!.readText())!!
            .groupValues[1].split(",").map { it.trim().trim('"') }
        assertThat(GameShaderSources.functionNames).containsExactlyElementsIn(declared).inOrder()
    }
}

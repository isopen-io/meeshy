package me.meeshy.app

import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

// #17257 (jumelle de l'iOS #17251) : UN SEUL éditeur d'image, celui de la capture caméra. L'ancien éditeur plein écran
// (Simple / Pro, historique, comparaison, panneaux de réglages) a quitté le dépôt ; avatar et bannière passent par
// `EntityImageRetouchHost`, qui monte `ComposerRetouchScreen` au format imposé. Cette garde lit la SOURCE : aucun de ses
// symboles ne revient, et aucun appelant d'image d'identité ne contourne la retouche.
class SingleImageEditorGuardTest {

    private val retired = listOf(
        "MeeshyImageEditorScreen",
        "ImageEditorViewModel",
        "ImageEditorContext",
        "ImageEditorSession",
        "ImageEditorMode",
        "ImageEditorModeSwitcher",
        "ImageEditorHistoryOverlay",
        "ImageEditHistory",
        "MeeshyImageCropEditor",
        "ProfileImageEditorFlow",
        "ProfileImageEditorHost",
        "CommunityImageEditorFlow",
        "CropRatio",
    )

    private fun androidRoot(): File {
        var dir: File? = File(".").canonicalFile
        while (dir != null && !File(dir, "gradle/libs.versions.toml").isFile) dir = dir.parentFile
        return checkNotNull(dir) { "racine apps/android introuvable" }
    }

    private fun sources(): List<File> =
        androidRoot().walkTopDown()
            .filter { it.isFile && it.extension == "kt" && "/src/" in it.path && "/build/" !in it.path }
            .filter { it.name != "SingleImageEditorGuardTest.kt" }
            .toList()

    @Test
    fun `l'ancien editeur d'image ne revient pas`() {
        val pattern = Regex("""\b(${retired.joinToString("|")})\b""")
        val offenders = sources().flatMap { file ->
            file.readLines().mapIndexedNotNull { index, line ->
                pattern.find(line)?.let { "${file.name}:${index + 1} ${it.value}" }
            }
        }
        assertWithMessage("symbole de l'ancien éditeur d'image (passer par EntityImageRetouchHost / ComposerRetouchScreen)")
            .that(offenders).isEmpty()
    }

    @Test
    fun `une image d'identite choisie passe toujours par la retouche avant l'envoi`() {
        val direct = Regex("""onImagePicked\(\s*ImageUploadTarget\.""")
        val offenders = sources().filter { "/src/main/" in it.path }.flatMap { file ->
            file.readLines().mapIndexedNotNull { index, line ->
                "${file.name}:${index + 1}".takeIf { direct.containsMatchIn(line) }
            }
        }
        assertWithMessage("avatar ou bannière envoyé sans retouche (offrir la photo à rememberEntityImageRetouch)")
            .that(offenders).isEmpty()
    }
}

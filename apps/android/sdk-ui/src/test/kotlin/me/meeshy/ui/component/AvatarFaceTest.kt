package me.meeshy.ui.component

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #12569 — la loi du cercle d'avatar (miroir de `MeeshyAvatar.avatarBody` / `CachedAvatarImage`, iOS) :
 * UN SEUL visage à la fois. Photo quand une référence est servie ET chargée ; sinon les initiales.
 * Jamais les deux (pas d'initiales sous la photo), jamais de spinner : une erreur reste en initiales.
 */
class AvatarFaceTest {

    private val base = "https://gate.meeshy.me/api/v1/"

    // MARK: ce qui se résout

    @Test
    fun `aucune reference servie donne les initiales`() {
        assertThat(AvatarFace.resolve("Alice Martin", imageUrl = null, apiBaseUrl = base))
            .isEqualTo(AvatarFace.Initials("AM"))
        assertThat(AvatarFace.resolve("Alice Martin", imageUrl = "   ", apiBaseUrl = base))
            .isEqualTo(AvatarFace.Initials("AM"))
    }

    @Test
    fun `une cle de stockage nue se resout dans l'atome`() {
        val face = AvatarFace.resolve("Alice", imageUrl = "2026/09/abc/photo.png", apiBaseUrl = base)

        assertThat(face).isEqualTo(
            AvatarFace.Photo(model = "https://gate.meeshy.me/api/v1/attachments/file/2026/09/abc/photo.png", initials = "A"),
        )
    }

    @Test
    fun `une cle du magasin statique se resout sur l'origine statique`() {
        val face = AvatarFace.resolve("Alice", imageUrl = "static:u/i/2026/09/a.jpg", apiBaseUrl = base)

        assertThat((face as AvatarFace.Photo).model).isEqualTo("https://static.meeshy.me/u/i/2026/09/a.jpg")
    }

    @Test
    fun `une URL complete reste inchangee`() {
        val face = AvatarFace.resolve("Alice", imageUrl = "https://gate.meeshy.me/2026/09/abc/photo.png", apiBaseUrl = base)

        assertThat((face as AvatarFace.Photo).model).isEqualTo("https://gate.meeshy.me/2026/09/abc/photo.png")
    }

    @Test
    fun `une photo locale du telephone reste telle quelle`() {
        val face = AvatarFace.resolve("Alice", imageUrl = "content://media/picker/1", apiBaseUrl = base)

        assertThat((face as AvatarFace.Photo).model).isEqualTo("content://media/picker/1")
    }

    @Test
    fun `les initiales du placeholder sont exactement celles d'un avatar sans photo`() {
        val sansPhoto = AvatarFace.resolve("Théo (foot)", imageUrl = null, apiBaseUrl = base)
        val avecPhoto = AvatarFace.resolve("Théo (foot)", imageUrl = "2026/09/t/p.png", apiBaseUrl = base)

        assertThat(avecPhoto.initials).isEqualTo(sansPhoto.initials)
    }

    // MARK: ce qui se montre : jamais les deux

    @Test
    fun `pendant le chargement seules les initiales sont montrees`() {
        val face = AvatarFace.resolve("Alice", imageUrl = "2026/09/abc/photo.png", apiBaseUrl = base)

        assertThat(face.layer(AvatarPhotoState.Loading)).isEqualTo(AvatarLayer.Initials("A"))
    }

    @Test
    fun `une fois chargee seule la photo est montree`() {
        val face = AvatarFace.resolve("Alice", imageUrl = "2026/09/abc/photo.png", apiBaseUrl = base)

        assertThat(face.layer(AvatarPhotoState.Success)).isInstanceOf(AvatarLayer.Photo::class.java)
    }

    @Test
    fun `une erreur de chargement rend les initiales, sans reessayer`() {
        val face = AvatarFace.resolve("Alice", imageUrl = "2026/09/abc/photo.png", apiBaseUrl = base)

        assertThat(face.layer(AvatarPhotoState.Error)).isEqualTo(AvatarLayer.Initials("A"))
    }

    @Test
    fun `sans photo demandee aucun etat ne montre une photo`() {
        val face = AvatarFace.resolve("Alice", imageUrl = null, apiBaseUrl = base)

        AvatarPhotoState.entries.forEach { state ->
            assertThat(face.layer(state)).isEqualTo(AvatarLayer.Initials("A"))
        }
    }
}

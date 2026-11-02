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
    fun `une reference serveur file ou content ne charge jamais un fichier local`() {
        listOf("file:///data/user/0/me.meeshy/secret.png", "FILE:///etc/hosts", "content://media/picker/1", " content://x/1").forEach { served ->
            assertThat(AvatarFace.resolve("Alice", imageUrl = served, apiBaseUrl = base))
                .isEqualTo(AvatarFace.Initials("A"))
        }
    }

    @Test
    fun `un hote hors politique ne declenche aucune requete et rend les initiales`() {
        listOf("http://evil.example/a.png", "https://10.0.0.5/a.png", "ftp://host/a.png").forEach { served ->
            assertThat(AvatarFace.resolve("Alice", imageUrl = served, apiBaseUrl = base))
                .isEqualTo(AvatarFace.Initials("A"))
        }
    }

    @Test
    fun `une photo choisie localement par l'utilisateur passe par son propre parametre`() {
        val face = AvatarFace.resolve("Alice", imageUrl = null, apiBaseUrl = base, localPhotoUri = "content://media/picker/1")

        assertThat((face as AvatarFace.Photo).model).isEqualTo("content://media/picker/1")
    }

    @Test
    fun `la photo locale ne prend que file ou content, jamais une adresse reseau`() {
        val face = AvatarFace.resolve("Alice", imageUrl = null, apiBaseUrl = base, localPhotoUri = "https://evil.example/a.png")

        assertThat(face).isEqualTo(AvatarFace.Initials("A"))
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

    // MARK: la première image, et ce que le moteur rapporte ensuite

    @Test
    fun `une photo deja en memoire se montre des la premiere image`() {
        val face = AvatarFace.resolve("Alice", imageUrl = "2026/09/abc/photo.png", apiBaseUrl = base)

        assertThat(face.layer(AvatarPhotoState.firstFrame(isResident = true))).isInstanceOf(AvatarLayer.Photo::class.java)
    }

    @Test
    fun `une photo absente de la memoire commence par ses initiales`() {
        val face = AvatarFace.resolve("Alice", imageUrl = "2026/09/abc/photo.png", apiBaseUrl = base)

        assertThat(face.layer(AvatarPhotoState.firstFrame(isResident = false))).isEqualTo(AvatarLayer.Initials("A"))
    }

    @Test
    fun `une photo montree ne retombe pas en initiales quand le moteur annonce qu'il charge`() {
        assertThat(AvatarPhotoState.Success.then(AvatarPhotoState.Loading)).isEqualTo(AvatarPhotoState.Success)
    }

    @Test
    fun `une erreur apres une photo rend les initiales`() {
        assertThat(AvatarPhotoState.Success.then(AvatarPhotoState.Error)).isEqualTo(AvatarPhotoState.Error)
    }

    @Test
    fun `hors photo montree, l'etat suit ce que le moteur rapporte`() {
        assertThat(AvatarPhotoState.Loading.then(AvatarPhotoState.Success)).isEqualTo(AvatarPhotoState.Success)
        assertThat(AvatarPhotoState.Error.then(AvatarPhotoState.Loading)).isEqualTo(AvatarPhotoState.Loading)
    }
}

package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.JsonConverterFactory
import me.meeshy.sdk.net.MeeshyApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.Retrofit

/**
 * Le profil public Android parle a UNE adresse — `GET /directory/people/:handle` (#4250).
 *
 * ## Ce que l'absence d'inventaire coutait
 *
 * #4161 a donne au profil public son adresse canonique et laisse `users/:id`,
 * `users/id/:id` et `u/:username` servis en ALIAS, le temps que la queue des
 * versions installees s'ecoule. Le commentaire qui garde ces alias cote
 * passerelle ne nomme que « les versions iOS installees » : Android n'avait ete
 * compte par aucun audit du chantier, et il appelait pourtant les TROIS. Retirer
 * les alias sur cet inventaire aurait coupe l'ouverture de profil sur Android,
 * lien de partage compris.
 *
 * ## Pourquoi la suite passe par un vrai Retrofit, et pas par la reflexion
 *
 * Lire l'annotation `@GET` prouve ce qui est ECRIT, pas ce qui PART. Le defaut
 * de `expand` ci-dessous vit dans un pont synthetique genere par Kotlin, la
 * concatenation du chemin de base et du chemin relatif vit dans Retrofit, et le
 * decodage vit dans le `Json` de [MeeshyApi] — trois etages qu'une assertion sur
 * l'annotation ne traverse pas. La requete est donc CAPTUREE au dernier maillon
 * avant le reseau, et la reponse remonte toute la chaine de conversion reelle.
 */
class PublicProfileEndpointTest {

    private val baseUrl = "https://gate.staging.meeshy.me/api/v1/"

    private class Capture {
        var request: Request? = null
    }

    /**
     * Un `MeeshyApi` dont le dernier interceptor court-circuite le reseau : il
     * retient la requete telle qu'elle serait emise et rend [body] tel quel.
     */
    private fun apiServing(body: String, capture: Capture): UserApi {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                capture.request = chain.request()
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(body.toResponseBody("application/json".toMediaType()))
                    .build()
            }
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(
                JsonConverterFactory(MeeshyApi.json, "application/json".toMediaType()),
            )
            .build()
            .create(UserApi::class.java)
    }

    /**
     * La charge que `publicProfileSchema` DECLARE, servie telle quelle
     * (`services/gateway/src/routes/users/public-profile.ts`). Les quatre champs
     * de voix y sont, et `MeeshyUser` ne les connait pas : c'est la moitie
     * « champ inconnu » du piege kotlinx.
     */
    private fun servedProfile(
        isOnline: String = "true",
        lastActiveAt: String = "\"2026-08-29T10:00:00.000Z\"",
        extra: String = "",
    ) = """
        {
          "success": true,
          "data": {
            "id": "68b0000000000000000000aa",
            "username": "bob",
            "firstName": "Bob",
            "lastName": null,
            "displayName": "Bob L.",
            "avatar": "https://cdn.meeshy.me/a.jpg",
            "banner": null,
            "bio": "hello",
            "role": "USER",
            "isOnline": $isOnline,
            "lastActiveAt": $lastActiveAt,
            "createdAt": "2026-01-02T03:04:05.000Z",
            "voicePublic": true,
            "voiceSampleUrl": "https://cdn.meeshy.me/v.m4a",
            "voiceSampleDurationMs": 4200,
            "voiceQuality": 0.87,
            "isAnonymous": false,
            "isMeeshyer": true$extra
          }
        }
    """.trimIndent()

    // --- 1. L'adresse -------------------------------------------------------

    @Test
    fun `an Android profile read goes to the canonical directory address`() = runTest {
        val capture = Capture()
        apiServing(servedProfile(), capture).getPerson("68b0000000000000000000aa")

        assertThat(capture.request!!.url.encodedPath)
            .isEqualTo("/api/v1/directory/people/68b0000000000000000000aa")
    }

    /**
     * Le meme appel sert un pseudo sans resolution prealable : c'est la detection
     * `isValidObjectId` de la passerelle qui tranche, donc un lien partage
     * `meeshy://u/<pseudo>` se transmet verbatim depuis la navigation.
     */
    @Test
    fun `a shared-link username reaches the same address, unresolved`() = runTest {
        val capture = Capture()
        apiServing(servedProfile(), capture).getPerson("bob")

        assertThat(capture.request!!.url.encodedPath).isEqualTo("/api/v1/directory/people/bob")
    }

    /**
     * `expand=presence` part SANS que le site d'appel ait a y penser.
     *
     * La route canonique SUPPRIME `isOnline` et `lastActiveAt` par defaut, la ou
     * les trois alias les servaient. Sans ce parametre la migration ne casse
     * rien de visible a la compilation ni au decodage — elle vide seulement la
     * pastille de presence de tous les profils consultes. C'est le temoin qui
     * separe « migre » de « migre correctement ».
     */
    @Test
    fun `the read asks for presence, so migrating does not silently drop the dot`() = runTest {
        val capture = Capture()
        apiServing(servedProfile(), capture).getPerson("bob")

        assertThat(capture.request!!.url.queryParameter("expand")).isEqualTo("presence")
    }

    // --- 2. Le decodage -----------------------------------------------------

    /**
     * Le fil sert QUATRE champs de voix que `MeeshyUser` ne declare pas. Sous un
     * `Json` strict, un seul d'entre eux ferait echouer le document ENTIER et le
     * profil disparaitrait — c'est deja arrive a un post dans ce depot.
     */
    @Test
    fun `the four voice fields the model ignores do not sink the document`() = runTest {
        val capture = Capture()
        val user = apiServing(servedProfile(), capture).getPerson("bob").data

        assertThat(user).isNotNull()
        assertThat(user!!.id).isEqualTo("68b0000000000000000000aa")
        assertThat(user.username).isEqualTo("bob")
    }

    /**
     * Les trois blocs d'expansion (`stats`, `relation`, `isSelf`) sont eux aussi
     * inconnus de `MeeshyUser`. Ils ne sont pas demandes aujourd'hui, mais un
     * `expand=stats,relation` ajoute demain ne doit pas faire disparaitre le
     * profil : le temoin l'etablit avant que quelqu'un n'essaie.
     */
    @Test
    fun `the expansion blocks the model ignores do not sink the document either`() = runTest {
        val capture = Capture()
        val expansions = """,
            "stats": { "postsCount": 3, "storiesCount": 1, "languagesUsed": 2 },
            "relation": "friend",
            "isSelf": false"""
        val user = apiServing(servedProfile(extra = expansions), capture).getPerson("bob").data

        assertThat(user).isNotNull()
        assertThat(user!!.username).isEqualTo("bob")
    }

    /**
     * L'autre moitie du piege : les DIX-HUIT champs que le profil public ne sert
     * plus depuis #4161 — dont les trois langues du Prisme, `email`,
     * `autoTranslateEnabled` et `updatedAt`. Ils sont absents du fil, et
     * `MeeshyUser` les porte tous avec une valeur par defaut : ils doivent
     * decoder a `null`, jamais lever.
     */
    @Test
    fun `the eighteen fields the public profile no longer serves decode to null`() = runTest {
        val capture = Capture()
        val user = apiServing(servedProfile(), capture).getPerson("bob").data!!

        assertThat(user.email).isNull()
        assertThat(user.phoneNumber).isNull()
        assertThat(user.systemLanguage).isNull()
        assertThat(user.regionalLanguage).isNull()
        assertThat(user.customDestinationLanguage).isNull()
        assertThat(user.autoTranslateEnabled).isNull()
        assertThat(user.isActive).isNull()
        assertThat(user.updatedAt).isNull()
    }

    /**
     * La presence servie doit ARRIVER jusqu'au modele : c'est elle que
     * `ProfileHeaderPresentation.from` lit pour peindre la pastille et la ligne
     * « vu il y a X ».
     */
    @Test
    fun `served presence reaches the model`() = runTest {
        val capture = Capture()
        val user = apiServing(servedProfile(), capture).getPerson("bob").data!!

        assertThat(user.isOnline).isTrue()
        assertThat(user.lastActiveAt).isEqualTo("2026-08-29T10:00:00.000Z")
    }

    /**
     * Et l'ABSENCE de presence — ce que la loi du 2026-08-25 sert a un lecteur
     * qui n'est pas ami — decode sans lever, en laissant les deux champs nuls.
     * Le client ne fabrique rien : pas de champ, pas de pastille.
     */
    @Test
    fun `withheld presence decodes as absent, never as a failure`() = runTest {
        val capture = Capture()
        val body = servedProfile(isOnline = "null", lastActiveAt = "null")
        val user = apiServing(body, capture).getPerson("bob").data!!

        assertThat(user.isOnline).isNull()
        assertThat(user.lastActiveAt).isNull()
    }

    // --- 3. La garde negative ----------------------------------------------

    /**
     * Plus AUCUNE interface Retrofit ne vise l'un des trois alias.
     *
     * Une garde negative meurt en silence : si elle cesse de lire les fichiers,
     * elle passe au vert en ne protegeant plus rien. Elle compte donc d'abord ce
     * qu'elle a lu, et exige d'y trouver l'adresse canonique — un ancrage
     * POSITIF dans la meme extraction, sans quoi « aucun alias trouve » ne
     * voudrait rien dire.
     */
    @Test
    fun `no Retrofit endpoint targets the three profile aliases any more`() {
        val paths = declaredEndpointPaths()

        assertThat(paths.size).isAtLeast(50)
        assertThat(paths).contains("directory/people/{handle}")

        val aliases = listOf(
            Regex("""^users/\{[^}/]+}$"""),
            Regex("""^users/id/\{[^}/]+}$"""),
            Regex("""^u/\{[^}/]+}$"""),
        )
        val offenders = paths.filter { path -> aliases.any { it.matches(path) } }

        assertThat(offenders).isEmpty()
    }

    private fun apiSourceDir(): File {
        val relative = "src/main/kotlin/me/meeshy/sdk/net/api"
        val fromModule = File(relative)
        if (fromModule.isDirectory) return fromModule
        val fromRepoRoot = File("core/network/$relative")
        check(fromRepoRoot.isDirectory) {
            "could not locate the Retrofit api sources from ${fromModule.absolutePath}"
        }
        return fromRepoRoot
    }

    private fun declaredEndpointPaths(): List<String> {
        val files = apiSourceDir().listFiles { f: File -> f.extension == "kt" }?.toList().orEmpty()
        check(files.size >= 10) { "read only ${files.size} api source files — the guard is blind" }

        val annotation = Regex("""@(?:GET|POST|PUT|PATCH|DELETE|HEAD)\("([^"]*)"\)""")
        return files.flatMap { file ->
            annotation.findAll(file.readText()).map { it.groupValues[1] }.toList()
        }
    }
}

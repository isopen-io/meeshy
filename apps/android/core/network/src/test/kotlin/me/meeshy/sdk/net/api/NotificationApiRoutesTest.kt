package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ReadNotificationsByTypesRequest
import me.meeshy.sdk.model.RegisterDeviceTokenRequest
import me.meeshy.sdk.model.UnregisterDeviceTokenRequest
import org.junit.Test

/**
 * Ce que les routes de notifications et de jeton envoient RÉELLEMENT : la requête
 * est capturée au dernier maillon, derrière le vrai Retrofit et le vrai `Json`.
 */
class NotificationApiRoutesTest {

    private fun notifications(http: RecordingHttp) = http.serve(NotificationApi::class.java)

    private val deviceToken = "fcm-token-0123456789-abcdef"

    // ── Le jeton push ────────────────────────────────────────────────────────

    @Test
    fun `registering the push token posts to the gateway route with an Android FCM body`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"id":"t1","type":"fcm","platform":"android","isNew":true}}""",
        )

        val response = notifications(http).registerDeviceToken(RegisterDeviceTokenRequest.fcm(deviceToken))

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/users/register-device-token")
        assertThat(http.only.contentType).startsWith("application/json")
        assertThat(http.only.body)
            .isEqualTo("""{"token":"$deviceToken","platform":"android","type":"fcm"}""")
        assertThat(response.data?.id).isEqualTo("t1")
        assertThat(response.data?.isNew).isTrue()
    }

    @Test
    fun `optional device fields are sent when provided and omitted otherwise`() = runTest {
        val http = RecordingHttp()

        notifications(http).registerDeviceToken(
            RegisterDeviceTokenRequest.fcm(
                token = deviceToken,
                deviceId = "device-1",
                deviceName = "Pixel 8",
                appVersion = "2.0.1",
                bundleId = "me.meeshy.android",
            ),
        )

        val expected = listOf(
            "\"token\":\"$deviceToken\"",
            "\"platform\":\"android\"",
            "\"type\":\"fcm\"",
            "\"deviceId\":\"device-1\"",
            "\"deviceName\":\"Pixel 8\"",
            "\"appVersion\":\"2.0.1\"",
            "\"bundleId\":\"me.meeshy.android\"",
        ).joinToString(separator = ",", prefix = "{", postfix = "}")
        assertThat(http.only.body).isEqualTo(expected)
    }

    /**
     * LE témoin du défaut d'origine : `@DELETE` + `@Body` est refusé par Retrofit
     * (« Non-body HTTP method cannot contain @Body ») au premier appel, avant
     * même qu'une requête n'existe. Avec `@HTTP(hasBody = true)`, la requête part.
     */
    @Test
    fun `unregistering the push token sends a DELETE that carries a body`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"deletedCount":1,"message":"Successfully unregistered"}}""",
        )

        val response = notifications(http).unregisterDeviceToken(UnregisterDeviceTokenRequest.byToken(deviceToken))

        assertThat(http.only.method).isEqualTo("DELETE")
        assertThat(http.only.path).isEqualTo("/api/v1/users/register-device-token")
        assertThat(http.only.contentType).startsWith("application/json")
        assertThat(http.only.body).isEqualTo("""{"token":"$deviceToken"}""")
        assertThat(response.data?.deletedCount).isEqualTo(1)
    }

    @Test
    fun `unregistering by device id sends only the device id`() = runTest {
        val http = RecordingHttp()

        notifications(http).unregisterDeviceToken(UnregisterDeviceTokenRequest.byDeviceId("device-1"))

        assertThat(http.only.body).isEqualTo("""{"deviceId":"device-1"}""")
    }

    // ── La liste, ses filtres, ses totaux ────────────────────────────────────

    @Test
    fun `a plain list sends no filter parameter`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":[]}""")

        notifications(http).list(offset = 0, limit = 20)

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/notifications")
        assertThat(http.only.queryParameter("offset")).isEqualTo("0")
        assertThat(http.only.queryParameter("limit")).isEqualTo("20")
        assertThat(http.only.hasQueryParameter("types")).isFalse()
        assertThat(http.only.hasQueryParameter("hideReadTypes")).isFalse()
        assertThat(http.only.hasQueryParameter("cursor")).isFalse()
    }

    @Test
    fun `the category filters travel as comma separated lists`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":[]}""")

        notifications(http).list(
            limit = 20,
            unreadOnly = true,
            cursor = "abc",
            types = "user_mentioned,mention",
            hideReadTypes = "new_message,message_reaction",
        )

        assertThat(http.only.queryParameter("types")).isEqualTo("user_mentioned,mention")
        assertThat(http.only.queryParameter("hideReadTypes")).isEqualTo("new_message,message_reaction")
        assertThat(http.only.queryParameter("unreadOnly")).isEqualTo("true")
        assertThat(http.only.queryParameter("cursor")).isEqualTo("abc")
        assertThat(http.only.hasQueryParameter("offset")).isFalse()
    }

    @Test
    fun `the counts route decodes the totals by raw type`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"total":5,"unread":2,"byType":{"new_message":3,"friend_request":2}}}""",
        )

        val counts = notifications(http).counts().data!!

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/notifications/counts")
        assertThat(counts.unread).isEqualTo(2)
        assertThat(counts.byType).containsEntry("friend_request", 2)
    }

    // ── La consommation ──────────────────────────────────────────────────────

    @Test
    fun `reading a conversation's notifications posts to its consumption route`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"count":3}""")

        val response = notifications(http).markConversationAsRead("68b0000000000000000000cc")

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/notifications/conversation/68b0000000000000000000cc/read")
        assertThat(response.count).isEqualTo(3)
    }

    @Test
    fun `reading a post's notifications posts to its consumption route`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"count":1}""")

        val response = notifications(http).markPostAsRead("68b0000000000000000000dd")

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/notifications/post/68b0000000000000000000dd/read")
        assertThat(response.count).isEqualTo(1)
    }

    @Test
    fun `reading by types posts the types array`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"count":4}""")

        val response = notifications(http).markTypesAsRead(
            ReadNotificationsByTypesRequest(listOf("friend_request", "contact_request")),
        )

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/notifications/read-by-types")
        assertThat(http.only.body).isEqualTo("""{"types":["friend_request","contact_request"]}""")
        assertThat(response.count).isEqualTo(4)
    }

    // ── L'accusé de réception ────────────────────────────────────────────────

    @Test
    fun `the delivery receipt posts to the conversation mark-as-received route`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"markedCount":2}}""")

        val response = http.serve(ConversationApi::class.java).markReceived("68b0000000000000000000cc")

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/conversations/68b0000000000000000000cc/mark-as-received")
        assertThat(response.data?.markedCount).isEqualTo(2)
    }
}

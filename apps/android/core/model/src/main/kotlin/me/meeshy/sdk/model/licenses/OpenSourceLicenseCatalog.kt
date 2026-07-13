package me.meeshy.sdk.model.licenses

/**
 * The curated set of open-source libraries the Meeshy Android app bundles at runtime. This is the
 * Android-accurate parity of the iOS `LicensesView` list — the actual Compose / Coil / OkHttp / Hilt
 * / Socket.IO Java / WebRTC-Android stack, not iOS's Swift dependencies. Kept as a single source of
 * truth so the About → "Open source licenses" screen renders only what actually ships.
 */
public object OpenSourceLicenseCatalog {

    public val LICENSES: List<OpenSourceLicense> = listOf(
        OpenSourceLicense(
            name = "Jetpack Compose",
            author = "Google",
            type = OpenSourceLicenseType.APACHE_2_0,
            url = "https://developer.android.com/jetpack/compose",
        ),
        OpenSourceLicense(
            name = "AndroidX",
            author = "Google",
            type = OpenSourceLicenseType.APACHE_2_0,
            url = "https://github.com/androidx/androidx",
        ),
        OpenSourceLicense(
            name = "Material Components for Android",
            author = "Google",
            type = OpenSourceLicenseType.APACHE_2_0,
            url = "https://github.com/material-components/material-components-android",
        ),
        OpenSourceLicense(
            name = "Dagger Hilt",
            author = "Google",
            type = OpenSourceLicenseType.APACHE_2_0,
            url = "https://dagger.dev/hilt",
        ),
        OpenSourceLicense(
            name = "Kotlin Coroutines",
            author = "JetBrains",
            type = OpenSourceLicenseType.APACHE_2_0,
            url = "https://github.com/Kotlin/kotlinx.coroutines",
        ),
        OpenSourceLicense(
            name = "Kotlinx Serialization",
            author = "JetBrains",
            type = OpenSourceLicenseType.APACHE_2_0,
            url = "https://github.com/Kotlin/kotlinx.serialization",
        ),
        OpenSourceLicense(
            name = "Coil",
            author = "Coil Contributors",
            type = OpenSourceLicenseType.APACHE_2_0,
            url = "https://github.com/coil-kt/coil",
        ),
        OpenSourceLicense(
            name = "OkHttp",
            author = "Square",
            type = OpenSourceLicenseType.APACHE_2_0,
            url = "https://github.com/square/okhttp",
        ),
        OpenSourceLicense(
            name = "Retrofit",
            author = "Square",
            type = OpenSourceLicenseType.APACHE_2_0,
            url = "https://github.com/square/retrofit",
        ),
        OpenSourceLicense(
            name = "Media3 ExoPlayer",
            author = "Google",
            type = OpenSourceLicenseType.APACHE_2_0,
            url = "https://github.com/androidx/media",
        ),
        OpenSourceLicense(
            name = "Room",
            author = "Google",
            type = OpenSourceLicenseType.APACHE_2_0,
            url = "https://developer.android.com/jetpack/androidx/releases/room",
        ),
        OpenSourceLicense(
            name = "Timber",
            author = "Jake Wharton",
            type = OpenSourceLicenseType.APACHE_2_0,
            url = "https://github.com/JakeWharton/timber",
        ),
        OpenSourceLicense(
            name = "ZXing",
            author = "ZXing Authors",
            type = OpenSourceLicenseType.APACHE_2_0,
            url = "https://github.com/zxing/zxing",
        ),
        OpenSourceLicense(
            name = "Firebase Android SDK",
            author = "Google",
            type = OpenSourceLicenseType.APACHE_2_0,
            url = "https://github.com/firebase/firebase-android-sdk",
        ),
        OpenSourceLicense(
            name = "Socket.IO Client Java",
            author = "Socket.IO",
            type = OpenSourceLicenseType.MIT,
            url = "https://github.com/socketio/socket.io-client-java",
        ),
        OpenSourceLicense(
            name = "WebRTC Android",
            author = "Stream",
            type = OpenSourceLicenseType.BSD,
            url = "https://github.com/GetStream/webrtc-android",
        ),
    )

    public fun groups(): List<OpenSourceLicenseGroup> =
        OpenSourceLicensePresentationBuilder.build(LICENSES)
}

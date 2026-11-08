plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
}

// L'E2EE libsignal par appareil (#14591, ADR-030) : le miroir Kotlin de `packages/MeeshySDK/Sources/MeeshyE2EE`.
// Aucun import `android.*` dans `src/main` : le module se compile et se teste aussi sur une JVM nue
// (`./meeshy.sh jvm-check`), avec la bibliothèque libsignal-client et son natif Linux. Le stockage
// scellé par le Keystore et le transport vivent dans `:sdk-core`, derrière les interfaces d'ici.
android {
    namespace = "me.meeshy.core.e2ee"
    compileSdk = 37

    defaultConfig {
        minSdk = 26
    }

    buildTypes {
        release { isMinifyEnabled = false }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    api(project(":core:model"))
    api(libs.libsignal.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.core)

    // Les tests JVM chargent le natif de bureau que porte libsignal-client (libsignal_jni_amd64.so) :
    // la bibliothèque Android n'embarque que les natifs des ABI Android.
    testImplementation(libs.libsignal.client)
    testImplementation(libs.junit)
    testImplementation(libs.truth)
    testImplementation(libs.kotlinx.coroutines.test)
}

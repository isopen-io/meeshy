plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "me.meeshy.sdk"
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
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
        }
    }
    // Les illustrations des cadres d'appel (#13695) : les MÊMES fichiers que iOS et le web, versés tels quels
    // dans les actifs (`call-frames/<nom>.webp`), sans copie dans le dépôt Android.
    sourceSets["main"].assets.srcDir(
        generateSequence(projectDir) { it.parentFile }
            .map { File(it, "packages/shared/design/call-capture-frames/assets") }
            .first { it.isDirectory },
    )
}

dependencies {
    api(project(":core:model"))
    api(project(":core:network"))
    implementation(project(":core:common"))
    implementation(project(":core:datastore"))
    implementation(project(":core:crypto"))
    implementation(project(":core:database"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.android)
    api(libs.stream.webrtc)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.androidx.media3.common)
    implementation(libs.androidx.media3.transformer)
    implementation(libs.androidx.media3.muxer)
    implementation(libs.androidx.media3.effect)
    implementation(libs.datastore.preferences)
    implementation(libs.room.ktx)
    implementation(libs.hilt.android)
    implementation(libs.hilt.work)
    implementation(libs.work.runtime)
    implementation(libs.socketio)
    implementation(libs.timber)
    implementation(libs.mlkit.translate)
    implementation(libs.mlkit.language.id)
    ksp(libs.hilt.compiler)
    ksp(libs.hilt.work.compiler)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.ext.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)
    testImplementation(libs.truth)
    testImplementation(libs.mockk)
    // Test-only: OutboxFlushWorkerTest builds the worker with TestListenableWorkerBuilder.
    testImplementation(libs.work.testing)
    // Test-only: TusUploadRepositoryTest constructs raw retrofit2.Response fixtures
    // to stub TusApi.createUpload (the Location-header response createSession()
    // reads). :core:network keeps retrofit an `implementation` (not `api`) dependency
    // deliberately — production code here never touches retrofit2 types directly,
    // routing through NetworkResult/createSession — so this stays test-scoped only.
    testImplementation(libs.retrofit)
    // Test-only: SceneAssetFetcherTest serves a media file over a local socket.
    testImplementation(libs.okhttp.mockwebserver)
}

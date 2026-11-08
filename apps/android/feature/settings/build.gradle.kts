plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

android {
    namespace = "me.meeshy.feature.settings"
    compileSdk = 37

    defaultConfig { minSdk = 26 }

    buildTypes { release { isMinifyEnabled = false } }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
        }
    }
    sourceSets {
        getByName("test") {
            java.srcDir(rootProject.file("test-support/compose-robolectric/kotlin"))
            resources.srcDir(rootProject.file("test-support/compose-robolectric/resources"))
        }
    }
}

dependencies {
    implementation(project(":sdk-core"))
    implementation(project(":sdk-ui"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    // #16269 — la fiche et le plein écran de la boutique se referment au retour système (BackHandler).
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.bundles.compose)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.work.runtime)
    implementation(libs.coil.compose)
    implementation(libs.play.review.ktx)
    // lot: cache-purge-attribution-service — la purge par clé lit et vide les SimpleCache Media3 (audio, vidéo).
    implementation(libs.androidx.media3.datasource)
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.media3.common)
    testImplementation(libs.androidx.media3.datasource)
    testImplementation(libs.turbine)
    testImplementation(libs.truth)
    testImplementation(libs.mockk)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
}

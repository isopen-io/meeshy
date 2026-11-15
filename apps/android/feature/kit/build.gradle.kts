plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// K00 — le catalogue du kit de la planche. Lié à :app en `debugImplementation` seulement (fiche docs/product/kit/K00-Catalogue.md) :
// aucun octet en production. Aucune dépendance vers une autre feature.
android {
    namespace = "me.meeshy.feature.kit"
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

// Les instantanés se COMPARENT dans testDebugUnitTest (mode `verify`, le défaut) ; ils s'ENREGISTRENT par
// `-Pmeeshy.kit.snapshots=record` — jamais sur un poste, seulement par l'entrée `record_snapshots` d'android.yml.
val kitSnapshotMode: String = providers.gradleProperty("meeshy.kit.snapshots").getOrElse("verify")
require(kitSnapshotMode in setOf("verify", "record")) { "meeshy.kit.snapshots : « verify » ou « record », pas « $kitSnapshotMode »" }

tasks.withType<Test>().configureEach {
    systemProperty("roborazzi.test.${if (kitSnapshotMode == "record") "record" else "verify"}", "true")
    systemProperty("meeshy.kit.snapshots", kitSnapshotMode)
    systemProperty("meeshy.kit.snapshotsDir", layout.projectDirectory.dir("src/test/snapshots").asFile.absolutePath)
}

dependencies {
    implementation(project(":sdk-ui"))

    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.ktx)
    implementation(platform(libs.compose.bom))
    implementation(libs.bundles.compose)
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.truth)
    testImplementation(libs.kotlinx.serialization.json)
    testImplementation(libs.androidx.test.ext.junit)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
}

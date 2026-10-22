plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
}

apply(from = rootProject.file("gradle/call-frames-catalogue.gradle.kts"))

android {
    namespace = "me.meeshy.core.model"
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
}

androidComponents {
    onVariants { variant ->
        variant.sources.kotlin?.addGeneratedSourceDirectory(
            tasks.named<Task>("generateCallFrameCatalogue"),
            { task: Task -> task.property("outputDir") as org.gradle.api.file.DirectoryProperty },
        )
    }
}

dependencies {
    api(libs.kotlinx.serialization.json)

    testImplementation(libs.junit)
    testImplementation(libs.truth)
    testImplementation(libs.kotlinx.coroutines.test)
}

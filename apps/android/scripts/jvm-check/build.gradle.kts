import org.gradle.api.tasks.testing.logging.TestExceptionFormat

// Compile et teste :core:model, :core:crypto et :core:e2ee (Kotlin pur, aucun import android.*) sur une JVM
// nue, sans AGP ni SDK Android : la boucle TDD locale des conteneurs qui
// n'atteignent pas dl.google.com. Versions alignées sur gradle/libs.versions.toml.
plugins {
    kotlin("jvm") version "2.1.20"
    kotlin("plugin.serialization") version "2.1.20"
}

val module = rootDir.resolve("../../core/model").canonicalFile
val crypto = rootDir.resolve("../../core/crypto").canonicalFile
val e2ee = rootDir.resolve("../../core/e2ee").canonicalFile
val modelOnly = providers.gradleProperty("jvmCheckModelOnly").isPresent
val cryptoSources = if (modelOnly) emptyList() else listOf(crypto, e2ee)

layout.buildDirectory.set(rootDir.resolve("../../build/jvm-check"))

kotlin { jvmToolchain(21) }

apply(from = rootDir.resolve("../../gradle/call-frames-catalogue.gradle.kts"))

// StreamingSeal porte encore sa fabrique Android Keystore (android.content.Context, tink.integration.android) :
// il se compile et se teste par la CI (:core:crypto:testDebugUnitTest) tant que #13686 ne l'a pas scindé.
val androidBoundCrypto = "**/core/crypto/primitives/StreamingSeal.kt"
val androidBoundCryptoTest = "**/core/crypto/primitives/StreamingSealTest.kt"

sourceSets {
    main {
        kotlin.srcDirs(listOf(module.resolve("src/main/kotlin")) + cryptoSources.map { it.resolve("src/main/kotlin") })
        kotlin.exclude(androidBoundCrypto)
        kotlin.srcDir(tasks.named("generateCallFrameCatalogue").flatMap { it.property("outputDir") as org.gradle.api.file.DirectoryProperty })
    }
    test {
        kotlin.srcDirs(listOf(module.resolve("src/test/kotlin")) + cryptoSources.map { it.resolve("src/test/kotlin") })
        kotlin.exclude(androidBoundCryptoTest)
        if (!modelOnly) resources.srcDir(crypto.resolve("src/test/resources"))
        resources.srcDir(module.resolve("src/test/resources"))
    }
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
    if (!modelOnly) {
        implementation("com.google.crypto.tink:tink:1.15.0")
        implementation("org.signal:libsignal-client:0.105.4")
    }
    testImplementation("junit:junit:4.13.2")
    testImplementation("com.google.truth:truth:1.4.4")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}

tasks.test {
    useJUnit()
    workingDir = module
    testLogging {
        events("failed")
        exceptionFormat = TestExceptionFormat.SHORT
    }
}

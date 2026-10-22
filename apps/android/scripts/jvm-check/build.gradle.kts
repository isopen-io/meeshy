import org.gradle.api.tasks.testing.logging.TestExceptionFormat

// Compile et teste :core:model (Kotlin pur, aucun import android.*) sur une JVM
// nue, sans AGP ni SDK Android : la boucle TDD locale des conteneurs qui
// n'atteignent pas dl.google.com. Versions alignées sur gradle/libs.versions.toml.
plugins {
    kotlin("jvm") version "2.0.21"
    kotlin("plugin.serialization") version "2.0.21"
}

val module = rootDir.resolve("../../core/model").canonicalFile

layout.buildDirectory.set(rootDir.resolve("../../build/jvm-check"))

kotlin { jvmToolchain(21) }

apply(from = rootDir.resolve("../../gradle/call-frames-catalogue.gradle.kts"))

sourceSets {
    main {
        kotlin.srcDirs(module.resolve("src/main/kotlin"))
        kotlin.srcDir(tasks.named("generateCallFrameCatalogue").flatMap { it.property("outputDir") as org.gradle.api.file.DirectoryProperty })
    }
    test { kotlin.srcDirs(module.resolve("src/test/kotlin")) }
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
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

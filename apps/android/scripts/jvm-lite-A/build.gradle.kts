plugins { kotlin("jvm") version "2.1.20"; kotlin("plugin.serialization") version "2.1.20" }
val module = rootDir.resolve("../../core/model").canonicalFile
layout.buildDirectory.set(rootDir.resolve("../../build/jvm-lite-A"))
kotlin { jvmToolchain(21) }
apply(from = rootDir.resolve("../../gradle/call-frames-catalogue.gradle.kts"))
sourceSets {
  main { kotlin.srcDirs(module.resolve("src/main/kotlin")); kotlin.srcDir(tasks.named("generateCallFrameCatalogue").flatMap { it.property("outputDir") as org.gradle.api.file.DirectoryProperty }) }
  test { kotlin.srcDirs(module.resolve("src/test/kotlin")); resources.srcDir(module.resolve("src/test/resources")) }
}

dependencies {
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
  testImplementation("junit:junit:4.13.2"); testImplementation("com.google.truth:truth:1.4.4")
  testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}
tasks.test { useJUnit(); workingDir = module; filter { includeTestsMatching("me.meeshy.sdk.model.syncpill.*"); includeTestsMatching("me.meeshy.sdk.model.sync.*"); includeTestsMatching("me.meeshy.sdk.model.connection.*") }; testLogging { events("failed","passed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.SHORT } }

pluginManagement {
    repositories {
        maven("https://maven-central.storage-download.googleapis.com/maven2")
        maven("https://repo1.maven.org/maven2")
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositories {
        maven("https://maven-central.storage-download.googleapis.com/maven2")
        maven("https://repo1.maven.org/maven2")
        maven("https://build-artifacts.signal.org/libraries/maven/") {
            content { includeGroup("org.signal") }
        }
    }
}
rootProject.name = "meeshy-android-jvm-check"

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

@Suppress("UnstableApiUsage")
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // libsignal (#14591, ADR-030) : Signal ne publie plus sur Maven Central depuis la 0.86.
        maven("https://build-artifacts.signal.org/libraries/maven/") {
            content { includeGroup("org.signal") }
        }
    }
}

rootProject.name = "meeshy-android"

include(":app")
include(":sdk-core")
include(":sdk-ui")
include(":core:common")
include(":core:model")
include(":core:network")
include(":core:database")
include(":core:datastore")
include(":core:crypto")
include(":core:e2ee")
include(":core:navigation")
include(":feature:auth")
include(":feature:conversations")
include(":feature:chat")
include(":feature:feed")
include(":feature:profile")
include(":feature:game")
include(":feature:notifications")
include(":feature:settings")
include(":feature:contacts")
include(":feature:community")
include(":feature:stories")
include(":feature:calls")
include(":feature:reels")
include(":feature:kit")

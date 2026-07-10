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
include(":core:navigation")
include(":feature:auth")
include(":feature:conversations")
include(":feature:chat")
include(":feature:feed")
include(":feature:profile")
include(":feature:notifications")
include(":feature:settings")
include(":feature:contacts")
include(":feature:stories")

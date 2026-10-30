import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

if (file("google-services.json").exists()) {
    pluginManager.apply(libs.plugins.google.services.get().pluginId)
} else {
    logger.warn("app/google-services.json absent : plugin google-services non appliqué, FCM inactif (voir docs/fcm-setup.md)")
}

// Clé de release : lue HORS du dépôt, jamais écrite ici — même ordre que la coque (`apps/web/android/app/build.gradle`) :
//   1. MEESHY_ANDROID_KEYSTORE_PROPERTIES — chemin d'un fichier .properties ;
//   2. apps/android/keystore.properties — fichier local, ignoré par git ;
//   3. MEESHY_ANDROID_STORE_FILE + MEESHY_ANDROID_STORE_PASSWORD + MEESHY_ANDROID_KEY_ALIAS + MEESHY_ANDROID_KEY_PASSWORD (CI).
// Sans aucune source, la release se construit NON signée. La fiche `me.meeshy.app` exige la clé d'envoi de la coque (ADR-025).
fun meeshyReleaseSigningProperties(): Properties? {
    val props = Properties()
    val candidate = System.getenv("MEESHY_ANDROID_KEYSTORE_PROPERTIES")?.let(::file) ?: rootProject.file("keystore.properties")
    if (candidate.exists()) {
        candidate.inputStream().use { props.load(it) }
        return props
    }
    val storeFile = System.getenv("MEESHY_ANDROID_STORE_FILE") ?: return null
    props["storeFile"] = storeFile
    props["storeType"] = System.getenv("MEESHY_ANDROID_STORE_TYPE") ?: "pkcs12"
    props["storePassword"] = System.getenv("MEESHY_ANDROID_STORE_PASSWORD")
    props["keyAlias"] = System.getenv("MEESHY_ANDROID_KEY_ALIAS")
    props["keyPassword"] = System.getenv("MEESHY_ANDROID_KEY_PASSWORD")
    return props
}

android {
    namespace = "me.meeshy.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "me.meeshy.app"
        minSdk = 26
        targetSdk = 36
        // Numéro de build LU à la construction : `-PmeeshyBuildNumber=<n>`, au-dessus de tout code déjà envoyé sur la
        // fiche (la coque y a monté jusqu'à 34085). Sans lui, 1 — la marque d'un build fait hors publication.
        versionCode = (findProperty("meeshyBuildNumber") ?: "1").toString().toInt()
        // 3.x : la native succède sur la fiche aux 2.x de la coque, sans recouvrement de numéros.
        versionName = "3.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            meeshyReleaseSigningProperties()?.let { props ->
                storeFile = file(props.getProperty("storeFile"))
                storeType = props.getProperty("storeType") ?: "pkcs12"
                storePassword = props.getProperty("storePassword")
                keyAlias = props.getProperty("keyAlias")
                keyPassword = props.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // Preuve locale uniquement : -Pmeeshy.release.debugSigning=true signe la release avec la clé de debug
            // (aucune clé de publication n'est dans le dépôt) ; -Pmeeshy.release.idSuffix=.rc l'installe à côté d'une debug.
            if (providers.gradleProperty("meeshy.release.debugSigning").isPresent) {
                signingConfig = signingConfigs.getByName("debug")
            } else if (meeshyReleaseSigningProperties() != null) {
                signingConfig = signingConfigs.getByName("release")
            }
            providers.gradleProperty("meeshy.release.idSuffix").orNull?.let { applicationIdSuffix = it }
        }
    }

    // Un appareil n'installe qu'un jeu de bibliothèques natives (WebRTC pèse ~4 x 10 Mo) : un APK par ABI,
    // plus l'APK universel pour le sideload. Un App Bundle (bundleRelease) ignore ce bloc et laisse Play découper.
    splits {
        abi {
            // Le type debug garde son APK unique (installDebug, tests) : le découpage ne s'applique qu'aux tâches release.
            // Un App Bundle refuse les APK multiples (issuetracker 402800800) : bundleRelease ne découpe jamais.
            isEnable = gradle.startParameter.taskNames.let { tasks ->
                tasks.any { it.contains("Release", ignoreCase = true) } && tasks.none { it.contains("bundle", ignoreCase = true) }
            }
            reset()
            include("arm64-v8a", "armeabi-v7a", "x86_64", "x86")
            isUniversalApk = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
        }
    }
}

dependencies {
    implementation(project(":sdk-core"))
    implementation(project(":core:datastore"))
    implementation(project(":sdk-ui"))
    implementation(project(":feature:auth"))
    implementation(project(":feature:conversations"))
    implementation(project(":feature:chat"))
    implementation(project(":feature:feed"))
    implementation(project(":feature:profile"))
    implementation(project(":feature:notifications"))
    implementation(project(":feature:settings"))
    implementation(project(":feature:contacts"))
    implementation(project(":feature:community"))
    implementation(project(":feature:stories"))
    implementation(project(":feature:calls"))
    implementation(project(":feature:reels"))
    implementation(project(":feature:game"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.bundles.compose)
    implementation(libs.material)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.hilt.work)
    ksp(libs.hilt.work.compiler)
    implementation(libs.work.runtime)
    implementation(libs.firebase.messaging)
    implementation(libs.timber)
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.coil.compose)
    implementation(libs.okhttp)
    debugImplementation(libs.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.ext.junit)
    testImplementation(libs.turbine)
    testImplementation(libs.truth)
    testImplementation(libs.mockk)
    // #13792 — la réponse d'une bannière jugée contre un vrai cache Room (graine FCM, garde de l'outbox).
    testImplementation(project(":core:database"))
    testImplementation(libs.room.runtime)
}

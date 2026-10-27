# R8 pour la release de l'application native (#13400). Base : proguard-android-optimize.txt.
# Les bibliothèques qui livrent leurs règles (consumer rules) ne sont pas répétées : Hilt/Dagger, Room,
# Retrofit, OkHttp, Coil, Media3, Compose, Firebase Messaging, WorkManager, kotlinx.serialization (règles du jar),
# ML Kit. Ne figurent ici que les manques constatés ou connus par la documentation des bibliothèques.

# Traces d'incident lisibles ; mapping.txt est produit par R8 (à conserver hors dépôt, par versionCode).
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions
-renamesourcefileattribute SourceFile

# kotlinx.serialization : la bibliothèque livre ses règles ; on ajoute le filet de la documentation officielle pour
# les classes @Serializable de l'application (Companion.serializer() et $$serializer, retrouvés par réflexion).
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault
-if @kotlinx.serialization.Serializable class **
-keepclassmembers class <1> {
    static <1>$Companion Companion;
}
-if @kotlinx.serialization.Serializable class ** {
    static **$* *;
}
-keepclassmembers class <2>$<3> {
    kotlinx.serialization.KSerializer serializer(...);
}
# Retrofit résout son convertisseur par serializer(java.lang.reflect.Type) sur la SIGNATURE GÉNÉRIQUE de la méthode
# (ApiResponse<ChangePasswordResponse>). Un modèle que le code ne lit jamais (réponse ignorée) n'y figure qu'en
# argument de type : R8 le retirait et réécrivait la signature en ApiResponse<Object>, et l'appel levait
# « Serializer for class 'Any' is not found » — 64 routes en release (auth/me, me/preferences, notifications/counts,
# users/register-device-token, users/me/password…). Les modèles @Serializable de l'application restent donc vivants.
-keep,allowobfuscation,allowoptimization @kotlinx.serialization.Serializable class me.meeshy.**
-if @kotlinx.serialization.Serializable class ** {
    public static ** INSTANCE;
}
-keepclassmembers class <1> {
    public static <1> INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}

# Enums : valueOf/values lus par réflexion (Room TypeConverters, sérialisation, Bundle, SavedStateHandle).
-keepclassmembers enum me.meeshy.** {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Room : entités, DAO et base sont conservés par les règles de Room ; les classes _Impl générées sont
# instanciées par réflexion via Class.forName(nom + "_Impl").
-keep class * extends androidx.room.RoomDatabase { <init>(); }

# Retrofit : les interfaces de service sont proxifiées (Proxy) ; leurs méthodes portent les annotations HTTP.
-keep,allowobfuscation interface me.meeshy.** { @retrofit2.http.* <methods>; }
-dontwarn retrofit2.KotlinExtensions
-dontwarn retrofit2.KotlinExtensions$*

# WebRTC (io.getstream:stream-webrtc-android) : le code natif (JNI) retrouve classes, champs et méthodes
# Java par leur nom ; renommer ou retirer quoi que ce soit dans org.webrtc casse l'appel à l'exécution.
-keep class org.webrtc.** { *; }
-keep class io.getstream.webrtc.** { *; }
-dontwarn org.webrtc.**

# Socket.IO / Engine.IO (io.socket) : charge ses transports et ses parseurs par leurs noms.
-keep class io.socket.** { *; }
-dontwarn io.socket.**

# Tink (androidx.security:security-crypto + coffre) : les messages protobuf « lite » sont lus par réflexion sur leurs champs.
-keepclassmembers class * extends com.google.crypto.tink.shaded.protobuf.GeneratedMessageLite {
    <fields>;
}
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**
-dontwarn org.checkerframework.**

# OkHttp : fournisseurs TLS optionnels absents du classpath Android.
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**

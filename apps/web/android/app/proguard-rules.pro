# #12447 — regles de la coque sous R8. Les plugins Capacitor (annotations,
# @PluginMethod) sont gardes par les regles de capacitor-android.

# MeeshyMessagingService.forward joint le plugin de notifications par
# reflexion : son nom et ses deux methodes statiques doivent survivre.
-keep class com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin {
    public static void onNewToken(java.lang.String);
    public static void sendRemoteMessage(com.google.firebase.messaging.RemoteMessage);
}

# Les traces de plantage restent lisibles une fois desobscurcies par le mapping.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

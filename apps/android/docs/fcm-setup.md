# Configuration FCM de l'application native

Sans `app/google-services.json`, le plugin `com.google.gms.google-services` n'est PAS appliqué : `FirebaseApp` n'est pas initialisée, `FirebaseAvailability.isConfigured(context)` vaut faux et aucun code FCM ne s'exécute (un seul avertissement journalisé). La CI (`assembleDebug` + `testDebugUnitTest`) reste verte sans le fichier.

## 1. Enregistrer les deux applications Android
Dans la console Firebase, projet **meeshy-me** (le MÊME que la clé Admin SDK de la passerelle, sinon la passerelle ne peut pas livrer) :
- `me.meeshy.android` (release)
- `me.meeshy.android.debug` (debug, suffixe `.debug`)

Télécharger un seul `google-services.json` contenant les deux clients.

## 2. Build local
Déposer le fichier dans `apps/android/app/google-services.json` (ignoré par git). Le plugin est alors appliqué automatiquement.

## 3. Build release en CI
Créer le secret `GOOGLE_SERVICES_JSON` (contenu du fichier) et l'écrire avant le build, sans jamais l'afficher :
```
echo "$GOOGLE_SERVICES_JSON" > apps/android/app/google-services.json
```
Ne jamais utiliser `set -x`, `cat` ni `echo` du contenu en CI.

## 4. Vérifier
1. Lancer l'appli, ouvrir une session : le jeton FCM est enregistré auprès de la passerelle.
2. Console Firebase > Cloud Messaging > Envoyer un message de test avec ce jeton, ou provoquer un message depuis un autre compte.
3. La notification doit arriver sur l'appareil.

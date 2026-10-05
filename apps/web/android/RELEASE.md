# Publier l'application Android (coque `apps/web`) sur le Play Store

L'application Android est la coque Capacitor de `apps/web` (identifiant `me.meeshy.app`). Le Kotlin natif de `apps/android` est gelé et ne part pas au store.

La commande de release refuse de construire tant qu'il manque la clé, `google-services.json` ou la passerelle de production (`scripts/lib/android-release.mjs`, #8669). Rien ne peut donc partir à moitié configuré.

## Une seule fois

1. **Firebase (#7302).** Dans la console Firebase, ajouter l'application Android `me.meeshy.app` au projet de production et télécharger son `google-services.json`. Dans *Paramètres du projet → Comptes de service*, générer la clé Admin SDK, la déposer sur le serveur et pointer `FIREBASE_ADMIN_CREDENTIALS_PATH` dessus dans l'environnement du gateway de production. Sans cette clé, le gateway ne peut rien envoyer à FCM.
2. **La clé de signature (#8085).** Elle existe déjà : RSA 4096, PKCS#12, alias `meeshy-release`, gardée hors du dépôt. Son empreinte est déjà publiée dans `public/.well-known/assetlinks.json`. Il faut la retrouver dans le gestionnaire de mots de passe. **La perdre interdit toute mise à jour.**
3. **Secrets GitHub** (*Settings → Secrets and variables → Actions* du dépôt) :

   | secret | valeur |
   |---|---|
   | `MEESHY_ANDROID_KEYSTORE_BASE64` | `base64 -i meeshy-release.p12` (macOS) ou `base64 -w0 meeshy-release.p12` (Linux) |
   | `MEESHY_ANDROID_STORE_PASSWORD` | mot de passe du fichier `.p12` |
   | `MEESHY_ANDROID_KEY_ALIAS` | `meeshy-release` |
   | `MEESHY_ANDROID_KEY_PASSWORD` | mot de passe de la clé (en PKCS#12, le même que celui du fichier) |
   | `MEESHY_ANDROID_GOOGLE_SERVICES_JSON_BASE64` | `base64` du `google-services.json` |
   | `MEESHY_PLAY_SERVICE_ACCOUNT_JSON` | *(facultatif, étape 6)* le JSON du compte de service Play |

4. **Play Console.** Créer l'application « Meeshy » (compte développeur Google Play, 25 $ une fois). Remplir la fiche : description courte et longue, icône 512×512, bannière 1024×500, au moins deux captures de téléphone, catégorie *Communication*, e-mail de contact et URL de la politique de confidentialité. Remplir aussi les questionnaires : classification du contenu, public cible, sécurité des données (messages, contacts, micro et caméra, identifiants), et accès à l'app (fournir un compte de démonstration aux réviseurs).
5. **Signature d'application Play.** Accepter *Play App Signing* au premier téléversement. `meeshy-release` devient alors la clé d'**importation**. Copier ensuite l'empreinte SHA-256 de la **clé de signature de l'app** (*Test et publication → Intégrité de l'app*) dans `public/.well-known/assetlinks.json`, à côté de l'empreinte existante, sinon les App Links ne se vérifient pas sur les installations venues du store (#5819).
6. *(Facultatif)* **Publication automatique.** Dans Google Cloud, créer un compte de service et télécharger sa clé JSON. Dans la Play Console, sous *Utilisateurs et autorisations*, l'inviter avec le droit de publier sur les pistes de test et de production. Poser ensuite son JSON dans `MEESHY_PLAY_SERVICE_ACCOUNT_JSON`.

## À chaque version

1. Monter `version` dans `apps/web/package.json`. `build-shells.mjs` en dérive `versionName` ; `versionCode` est le compte de commits (D-45).
2. GitHub, onglet *Actions*, ouvrir **Android Release (coque apps/web)**, cliquer *Run workflow* sur `main` et choisir la piste (`internal` par défaut).
3. Le workflow rend deux artefacts signés : `app-release.aab`, pour la Play Console, et `app-release.apk`, à installer directement avec `adb install -r`. Si `MEESHY_PLAY_SERVICE_ACCOUNT_JSON` est posé, il pousse aussi l'`.aab` sur la piste choisie. **La toute première version se téléverse à la main**, parce que l'API refuse une application qui n'a encore aucun bundle.
4. Tester la version interne sur un vrai téléphone : connexion, envoi d'un message, puis réception d'une notification **application fermée** depuis un autre compte. Toucher la notification doit ouvrir la bonne conversation.
5. Promouvoir la version en production depuis la Play Console. Poser ensuite `SHELL_LATEST_VERSION=<version>` dans l'environnement du gateway pour que les anciennes installations voient la bannière de mise à jour (#6937).

## En local, sans CI

```bash
cd apps/web
cp /chemin/sûr/google-services.json android/app/google-services.json   # ignoré par git
cat > android/keystore.properties <<'PROPS'                             # ignoré par git
storeFile=/chemin/sûr/meeshy-release.p12
storePassword=…
keyAlias=meeshy-release
keyPassword=…
PROPS
VITE_API_BASE=https://gate.meeshy.me VITE_DATA_SOURCE=gateway \
  node scripts/build-shells.mjs --target android --release
```

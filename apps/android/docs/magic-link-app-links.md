# Magic link — App Links & empreinte de signature

Le lien magic link envoyé par email est `https://meeshy.me/auth/magic-link?token=…`.
Pour qu'un tap sur ce lien **ouvre l'app Android directement** (au lieu du
navigateur), Android exige une relation Digital Asset Links **vérifiée** entre le
domaine `meeshy.me` et l'app `me.meeshy.app`.

Deux moitiés, qui doivent concorder :

| Côté | Quoi | Où |
|------|------|-----|
| App | `intent-filter` `autoVerify="true"` sur `https://meeshy.me/auth/magic-link` | `app/src/main/AndroidManifest.xml` |
| Domaine | `assetlinks.json` déclarant le **SHA-256 du certificat de signature** | `apps/web/public/.well-known/assetlinks.json` → servi à `https://meeshy.me/.well-known/assetlinks.json` |

La vérification échoue — et le lien ouvre le navigateur — tant que l'empreinte
SHA-256 du certificat qui signe l'APK/AAB installé **ne figure pas** dans
`assetlinks.json`. C'est pour ça qu'il faut y mettre l'empreinte de la clé
**release** avant la prod : le fichier ne contient aujourd'hui que l'empreinte
**debug** (utile seulement pour tester en local avec `me.meeshy.app.debug`).

---

## 1. Obtenir l'empreinte SHA-256

Le certificat qui compte est celui qui **signe l'artefact tel qu'il est
installé sur l'appareil**. Selon le mode de distribution :

### Cas A — Play App Signing (recommandé, cas par défaut d'un AAB sur le Play Store)

Google re-signe l'app avec **sa** clé de signature d'app ; c'est donc l'empreinte
de **cette** clé (pas celle de l'upload key) qui vérifie les liens pour toute
installation venant du Play Store.

1. Play Console → app **Meeshy** (`me.meeshy.app`) → **Test and release → Setup → App signing**.
2. Section **App signing key certificate** → copier **SHA-256 certificate fingerprint**
   (format `AB:CD:…`, 32 octets).
3. Bonus : la même page propose un bloc **Digital Asset Links JSON** prêt à
   copier — il contient déjà cette empreinte au bon format.

⚠️ Copier aussi l'empreinte de la **Upload key certificate** (même page) **si**
des APK release sont un jour distribués hors-Play (sideload, APK direct) : ces
installs sont signées par l'upload key, pas par la clé d'app Google. En cas de
doute, mettre **les deux** empreintes dans `sha256_cert_fingerprints` (le tableau
en accepte plusieurs — voir §2).

### Cas B — Keystore release auto-géré (hors Play App Signing)

Quand la `signingConfig release` sera ajoutée à `app/build.gradle.kts` avec un
keystore hors-repo :

```bash
keytool -list -v \
  -keystore /chemin/vers/meeshy-release.jks \
  -alias <alias-release> \
  -storepass <store-pass> | grep 'SHA256:'
```

ou, sans manipuler `keytool`, une fois la `signingConfig` branchée :

```bash
cd apps/android
./apps/android/meeshy.sh signingReport   # si la tâche est exposée
# ou directement :
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  ./gradlew :app:signingReport
```

`signingReport` liste, par variant, `Variant: release` → `SHA-256: …`.

### Cas C — Empreinte debug (déjà en place, pour référence)

Sert uniquement à tester les App Links en build **debug** (`me.meeshy.app.debug`).
Déjà présente dans `assetlinks.json`.

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android | grep 'SHA256:'
```

Valeur actuelle du keystore debug de la machine de dev :
`6B:E2:95:F8:20:33:A2:7E:33:37:13:D4:F4:9B:D2:D7:F5:B2:7D:DA:0D:D7:B7:0E:42:30:07:16:B9:33:D6:76`
(propre à chaque poste — la régénérer localement avec la commande ci-dessus si
elle diffère.)

---

## 2. Mettre l'empreinte dans `assetlinks.json`

Fichier : `apps/web/public/.well-known/assetlinks.json`. C'est un tableau
d'objets, un par `package_name`. `sha256_cert_fingerprints` est **une liste** :
on peut y mettre plusieurs empreintes (utile pendant une rotation de clé, ou
pour couvrir Play App signing key + upload key simultanément).

Remplacer le placeholder `REPLACE_WITH_RELEASE_SHA256` de l'entrée
`me.meeshy.app` par l'empreinte obtenue au §1 :

```json
{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "me.meeshy.app",
    "sha256_cert_fingerprints": [
      "AB:CD:EF:...:99"
    ]
  }
}
```

Ne pas toucher l'entrée `me.meeshy.app.debug` (empreinte debug, test local).

---

## 3. Déployer et vérifier

1. Déployer le frontend web pour que le fichier soit servi **en clair, sans
   redirection, en `application/json`** à :
   `https://meeshy.me/.well-known/assetlinks.json`
2. Vérifier avec l'outil officiel Google (remonte les erreurs de format/MIME) :
   `https://developers.google.com/digital-asset-links/tools/generator`
   ou l'API :
   ```bash
   curl "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://meeshy.me&relation=delegate_permission/common.handle_all_urls"
   ```
3. Sur un appareil avec le build release installé :
   ```bash
   adb shell pm verify-app-links --re-verify me.meeshy.app
   adb shell pm get-app-links me.meeshy.app   # doit afficher "verified" pour meeshy.me
   ```
4. Test fonctionnel — un tap sur un vrai lien magic link doit ouvrir l'app :
   ```bash
   adb shell am start -a android.intent.action.VIEW \
     -d "https://meeshy.me/auth/magic-link?token=<token-reel>"
   ```

> Repli garanti : même si la vérification App Link échoue, le magic link reste
> fonctionnel via le scheme custom `meeshy://auth/magic-link?token=…`
> (`intent-filter` sans `autoVerify`, toujours dans le manifest). Seule l'ouverture
> automatique depuis le lien `https` du mail dépend de `assetlinks.json`.

---

## 4. Quand la `signingConfig release` sera ajoutée

Aujourd'hui `app/build.gradle.kts` → `buildTypes.release` n'a **pas** de
`signingConfig` (pas de keystore dans le repo — convention Meeshy : secrets
hors-repo, cf. `apps/ios/fastlane/.env`). Au moment de brancher la signature
release :

- Garder le keystore et ses mots de passe **hors du repo** (ex. `keystore.properties`
  gitignoré, ou secrets CI), jamais committés.
- Après le premier build/upload signé, revenir ici §1 → §2 pour poser l'empreinte
  définitive dans `assetlinks.json`.

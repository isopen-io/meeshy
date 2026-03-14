# GUIDE D'INTÉGRATION INFO.PLIST

## 📋 INSTRUCTIONS

Ce fichier contient les entrées EXACTES à ajouter à votre fichier `Info.plist` existant.

### Méthode 1 : Via Xcode (RECOMMANDÉ)

1. **Ouvrez votre projet dans Xcode**
2. **Trouvez votre fichier Info.plist** dans le navigateur de projet
3. **Clic droit sur Info.plist** > Open As > Source Code
4. **Copiez les sections ci-dessous** entre les balises `<dict>` et `</dict>`
5. **Enregistrez** (Cmd + S)

### Méthode 2 : Via l'interface Xcode

1. **Ouvrez Info.plist** (double-clic)
2. **Clic droit** dans la liste > Add Row
3. Pour chaque clé ci-dessous :
   - Tapez le nom exact de la clé (ex: `NSCameraUsageDescription`)
   - Type : String
   - Value : Le texte de description

---

## 🔴 SECTION 1 : DESCRIPTIONS DE CONFIDENTIALITÉ (OBLIGATOIRES)

Copiez ceci dans votre Info.plist :

```xml
<!-- ========================================== -->
<!-- DESCRIPTIONS DE CONFIDENTIALITÉ REQUISES   -->
<!-- ========================================== -->

<!-- CAMÉRA : Pour les appels vidéo -->
<key>NSCameraUsageDescription</key>
<string>Meeshy a besoin d'accéder à votre caméra pour les appels vidéo avec vos contacts.</string>

<!-- MICROPHONE : Pour les appels audio et vidéo -->
<key>NSMicrophoneUsageDescription</key>
<string>Meeshy a besoin d'accéder à votre microphone pour les appels audio et vidéo avec vos contacts.</string>

<!-- BIBLIOTHÈQUE PHOTO : Pour partager des images -->
<key>NSPhotoLibraryUsageDescription</key>
<string>Meeshy a besoin d'accéder à vos photos pour vous permettre de partager des images avec vos contacts.</string>

<!-- AJOUT À LA BIBLIOTHÈQUE PHOTO : Pour sauvegarder des photos -->
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Meeshy a besoin de cette permission pour sauvegarder les photos que vous recevez dans votre galerie.</string>

<!-- CONTACTS : Pour trouver des amis (OPTIONNEL - seulement si vous utilisez) -->
<!-- Décommentez si vous synchronisez les contacts -->
<!--
<key>NSContactsUsageDescription</key>
<string>Meeshy peut accéder à vos contacts pour vous aider à trouver vos amis sur la plateforme.</string>
-->

<!-- NOTIFICATIONS : Explication de l'utilisation des notifications -->
<key>NSUserNotificationsUsageDescription</key>
<string>Meeshy utilise les notifications pour vous informer des nouveaux messages et appels entrants.</string>
```

---

## 🔵 SECTION 2 : BACKGROUND MODES (OBLIGATOIRES pour VoIP)

Si pas déjà présent, ajoutez :

```xml
<!-- ========================================== -->
<!-- MODES D'ARRIÈRE-PLAN REQUIS               -->
<!-- ========================================== -->

<key>UIBackgroundModes</key>
<array>
    <!-- Audio : Pour continuer les appels en arrière-plan -->
    <string>audio</string>
    
    <!-- VoIP : Pour les appels Internet -->
    <string>voip</string>
    
    <!-- Remote Notifications : Pour les notifications push -->
    <string>remote-notification</string>
    
    <!-- Background Fetch : Pour rafraîchir les données -->
    <string>fetch</string>
</array>
```

---

## 🟢 SECTION 3 : ASSOCIATED DOMAINS (Pour Universal Links)

Si pas déjà présent, ajoutez :

```xml
<!-- ========================================== -->
<!-- DOMAINES ASSOCIÉS (Universal Links)        -->
<!-- ========================================== -->

<key>com.apple.developer.associated-domains</key>
<array>
    <string>applinks:meeshy.me</string>
    <string>applinks:www.meeshy.me</string>
    <string>applinks:app.meeshy.me</string>
</array>
```

**Note** : Ceci DOIT correspondre à ce qui est dans votre fichier `.entitlements` ET à ce qui est configuré dans Apple Developer Portal.

---

## 🟡 SECTION 4 : CONFIGURATION APP (Recommandées)

```xml
<!-- ========================================== -->
<!-- CONFIGURATION DE L'APPLICATION            -->
<!-- ========================================== -->

<!-- Nom affiché de l'app -->
<key>CFBundleDisplayName</key>
<string>Meeshy</string>

<!-- Nom du bundle -->
<key>CFBundleName</key>
<string>Meeshy</string>

<!-- Version minimale d'iOS -->
<key>LSMinimumSystemVersion</key>
<string>17.0</string>

<!-- Couleur d'accentuation -->
<key>NSAccentColorName</key>
<string>AccentColor</string>
```

---

## 🟣 SECTION 5 : APP TRANSPORT SECURITY

Pour sécuriser les connexions réseau :

```xml
<!-- ========================================== -->
<!-- SÉCURITÉ DES TRANSPORTS                   -->
<!-- ========================================== -->

<key>NSAppTransportSecurity</key>
<dict>
    <!-- Interdire les connexions non-HTTPS par défaut -->
    <key>NSAllowsArbitraryLoads</key>
    <false/>
    
    <!-- Si vous avez besoin d'exceptions pour certains domaines -->
    <!-- Décommentez et ajoutez vos domaines -->
    <!--
    <key>NSExceptionDomains</key>
    <dict>
        <key>example.com</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
            <key>NSIncludesSubdomains</key>
            <true/>
        </dict>
    </dict>
    -->
</dict>
```

---

## 🔶 SECTION 6 : ORIENTATIONS SUPPORTÉES

Si pas déjà présent :

```xml
<!-- ========================================== -->
<!-- ORIENTATIONS DE L'INTERFACE               -->
<!-- ========================================== -->

<!-- Orientations pour iPhone -->
<key>UISupportedInterfaceOrientations~iphone</key>
<array>
    <string>UIInterfaceOrientationPortrait</string>
    <!-- Décommentez si vous voulez supporter le paysage sur iPhone -->
    <!--
    <string>UIInterfaceOrientationLandscapeLeft</string>
    <string>UIInterfaceOrientationLandscapeRight</string>
    -->
</array>

<!-- Orientations pour iPad (si vous supportez iPad) -->
<key>UISupportedInterfaceOrientations~ipad</key>
<array>
    <string>UIInterfaceOrientationPortrait</string>
    <string>UIInterfaceOrientationPortraitUpsideDown</string>
    <string>UIInterfaceOrientationLandscapeLeft</string>
    <string>UIInterfaceOrientationLandscapeRight</string>
</array>
```

---

## 🔷 SECTION 7 : SCENE CONFIGURATION (Pour SwiftUI)

Si pas déjà présent (nécessaire pour SceneDelegate) :

```xml
<!-- ========================================== -->
<!-- CONFIGURATION DES SCÈNES (SwiftUI)        -->
<!-- ========================================== -->

<key>UIApplicationSceneManifest</key>
<dict>
    <key>UIApplicationSupportsMultipleScenes</key>
    <true/>
    <key>UISceneConfigurations</key>
    <dict>
        <key>UIWindowSceneSessionRoleApplication</key>
        <array>
            <dict>
                <key>UISceneConfigurationName</key>
                <string>Default Configuration</string>
                <key>UISceneDelegateClassName</key>
                <string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>
            </dict>
        </array>
    </dict>
</dict>
```

---

## 🔸 SECTION 8 : CALLKIT (Pour les appels)

Si vous utilisez CallKit (ce qui semble être le cas), ajoutez :

```xml
<!-- ========================================== -->
<!-- CONFIGURATION CALLKIT                     -->
<!-- ========================================== -->

<!-- Ne pas demander de permission WiFi persistante -->
<key>UIRequiresPersistentWiFi</key>
<false/>

<!-- Support des appels VoIP -->
<key>UIBackgroundModes</key>
<array>
    <string>voip</string>
</array>
```

---

## ✅ VÉRIFICATION

Après avoir ajouté ces entrées, vérifiez :

### 1. Syntaxe XML valide

Votre Info.plist doit ressembler à ça :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- VOS ENTRÉES EXISTANTES -->
    
    <!-- NOUVELLES ENTRÉES AJOUTÉES -->
    <key>NSCameraUsageDescription</key>
    <string>...</string>
    
    <!-- etc. -->
</dict>
</plist>
```

### 2. Pas d'erreurs Xcode

- Ouvrez votre projet dans Xcode
- Vérifiez qu'il n'y a pas d'erreurs rouges
- Build le projet (Cmd + B)
- Vérifiez qu'il compile sans erreurs

### 3. Validation avec script

```bash
# Lancez le script de validation
./validate_app_store_readiness.sh

# Vérifiez que toutes les clés sont détectées
```

---

## 📝 EXEMPLE COMPLET

Voici à quoi devrait ressembler votre Info.plist COMPLET :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- ========================================== -->
    <!-- INFORMATIONS DE BASE                       -->
    <!-- ========================================== -->
    
    <key>CFBundleDisplayName</key>
    <string>Meeshy</string>
    
    <key>CFBundleName</key>
    <string>Meeshy</string>
    
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    
    <key>CFBundleVersion</key>
    <string>$(CURRENT_PROJECT_VERSION)</string>
    
    <key>CFBundleShortVersionString</key>
    <string>$(MARKETING_VERSION)</string>
    
    <!-- ========================================== -->
    <!-- DESCRIPTIONS DE CONFIDENTIALITÉ            -->
    <!-- ========================================== -->
    
    <key>NSCameraUsageDescription</key>
    <string>Meeshy a besoin d'accéder à votre caméra pour les appels vidéo avec vos contacts.</string>
    
    <key>NSMicrophoneUsageDescription</key>
    <string>Meeshy a besoin d'accéder à votre microphone pour les appels audio et vidéo avec vos contacts.</string>
    
    <key>NSPhotoLibraryUsageDescription</key>
    <string>Meeshy a besoin d'accéder à vos photos pour vous permettre de partager des images avec vos contacts.</string>
    
    <key>NSPhotoLibraryAddUsageDescription</key>
    <string>Meeshy a besoin de cette permission pour sauvegarder les photos que vous recevez dans votre galerie.</string>
    
    <key>NSUserNotificationsUsageDescription</key>
    <string>Meeshy utilise les notifications pour vous informer des nouveaux messages et appels entrants.</string>
    
    <!-- ========================================== -->
    <!-- BACKGROUND MODES                           -->
    <!-- ========================================== -->
    
    <key>UIBackgroundModes</key>
    <array>
        <string>audio</string>
        <string>voip</string>
        <string>remote-notification</string>
        <string>fetch</string>
    </array>
    
    <!-- ========================================== -->
    <!-- ASSOCIATED DOMAINS                         -->
    <!-- ========================================== -->
    
    <key>com.apple.developer.associated-domains</key>
    <array>
        <string>applinks:meeshy.me</string>
        <string>applinks:www.meeshy.me</string>
        <string>applinks:app.meeshy.me</string>
    </array>
    
    <!-- ========================================== -->
    <!-- APP TRANSPORT SECURITY                     -->
    <!-- ========================================== -->
    
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsArbitraryLoads</key>
        <false/>
    </dict>
    
    <!-- ========================================== -->
    <!-- ORIENTATIONS                               -->
    <!-- ========================================== -->
    
    <key>UISupportedInterfaceOrientations~iphone</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
    </array>
    
    <key>UISupportedInterfaceOrientations~ipad</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
        <string>UIInterfaceOrientationPortraitUpsideDown</string>
        <string>UIInterfaceOrientationLandscapeLeft</string>
        <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
    
    <!-- ========================================== -->
    <!-- SCENE CONFIGURATION                        -->
    <!-- ========================================== -->
    
    <key>UIApplicationSceneManifest</key>
    <dict>
        <key>UIApplicationSupportsMultipleScenes</key>
        <true/>
        <key>UISceneConfigurations</key>
        <dict>
            <key>UIWindowSceneSessionRoleApplication</key>
            <array>
                <dict>
                    <key>UISceneConfigurationName</key>
                    <string>Default Configuration</string>
                    <key>UISceneDelegateClassName</key>
                    <string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>
                </dict>
            </array>
        </dict>
    </dict>
    
    <!-- ========================================== -->
    <!-- DIVERS                                     -->
    <!-- ========================================== -->
    
    <key>LSMinimumSystemVersion</key>
    <string>17.0</string>
    
    <key>NSAccentColorName</key>
    <string>AccentColor</string>
    
    <key>UIRequiresPersistentWiFi</key>
    <false/>
    
</dict>
</plist>
```

---

## ⚠️ ATTENTION

### NE PAS :
- ❌ Supprimer vos entrées existantes
- ❌ Modifier les valeurs `$(PRODUCT_BUNDLE_IDENTIFIER)`, etc.
- ❌ Changer la structure XML

### FAIRE :
- ✅ Ajouter les nouvelles clés aux entrées existantes
- ✅ Adapter les descriptions selon votre langue préférée
- ✅ Vérifier que la syntaxe XML est correcte
- ✅ Compiler et tester après modifications

---

## 🌍 VERSIONS EN ANGLAIS (Si vous ciblez un public anglophone)

Si vous préférez des descriptions en anglais :

```xml
<!-- ENGLISH VERSIONS -->

<key>NSCameraUsageDescription</key>
<string>Meeshy needs access to your camera for video calls with your contacts.</string>

<key>NSMicrophoneUsageDescription</key>
<string>Meeshy needs access to your microphone for audio and video calls with your contacts.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Meeshy needs access to your photos to allow you to share images with your contacts.</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>Meeshy needs this permission to save photos you receive to your gallery.</string>

<key>NSUserNotificationsUsageDescription</key>
<string>Meeshy uses notifications to inform you of new messages and incoming calls.</string>
```

---

## 📞 AIDE

Si vous rencontrez des problèmes :

1. **Erreur de syntaxe XML** :
   - Vérifiez que chaque `<key>` a un `<string>` correspondant
   - Vérifiez que toutes les balises sont fermées

2. **Build échoue après modifications** :
   - Product > Clean Build Folder (Cmd + Shift + K)
   - Redémarrez Xcode
   - Vérifiez la syntaxe du XML

3. **Clés non reconnues** :
   - Vérifiez l'orthographe exacte (sensible à la casse)
   - Utilisez Copy/Paste depuis ce fichier

---

**Bonne chance ! 🚀**

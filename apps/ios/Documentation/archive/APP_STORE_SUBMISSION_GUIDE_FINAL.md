# 🍎 Guide Ultime : Soumission Meeshy à l'App Store

Ce guide détaille les étapes finales pour publier Meeshy sur l'App Store de manière sécurisée et automatisée.

## 1. Prérequis sur App Store Connect

Assurez-vous que les informations suivantes sont remplies sur [App Store Connect](https://appstoreconnect.apple.com) :

- **Nom de l'app** : Meeshy
- **Sous-titre** : Traduction instantanée et messagerie sécurisée.
- **Description** : (Fournie dans vos documents marketing)
- **Mots-clés** : chat, translation, messenger, meeshy, secure, real-time.
- **URL de support** : (Votre lien de support)
- **URL de politique de confidentialité** : (Votre lien de politique de confidentialité)
- **Catégorie** : Réseaux sociaux / Utilitaires.

---

## 2. Automatisation de la Signature (Fastlane Match)

Pour automatiser la signature du code en toute sécurité, nous utilisons `fastlane match`.

### Étape A : Créer un dépôt privé pour les certificats
1. Créez un dépôt GitHub **privé** (ex: `meeshy-certificates`).
2. Donnez-vous les droits d'accès.

### Étape B : Initialiser Match
Ouvrez un terminal dans `apps/ios` :
```bash
bundle exec fastlane match init
# Sélectionnez 'git' et entrez l'URL de votre dépôt privé
```

### Étape C : Générer les certificats
```bash
bundle exec fastlane match appstore
# Cela créera les certificats et profils de provisionnement sur Apple Developer
# et les stockera de manière chiffrée dans votre dépôt privé.
```

---

## 3. Configuration de Firebase Production

Assurez-vous que le fichier `GoogleService-Info.plist` de production est bien présent dans :
`apps/ios/Meeshy/GoogleService-Info.plist`

Si vous utilisez GitHub Actions, encodez ce fichier en Base64 et ajoutez-le aux secrets du dépôt sous le nom `GOOGLE_SERVICE_INFO_PLIST_BASE64`.

---

## 4. Soumission via GitHub Actions

Dès que vous êtes prêt à publier une version :

1. Mettez à jour le numéro de version dans Xcode ou via Fastlane :
   ```bash
   bundle exec fastlane bump_version type:patch
   ```
2. Créez un tag Git et poussez-le :
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. Le workflow **iOS Release** se déclenchera automatiquement, construira l'IPA et l'enverra sur TestFlight/App Store Connect.

---

## 5. Informations pour l'Examen de l'App (App Review)

Apple a besoin d'un compte de test pour vérifier l'application. Dans la section "Informations sur l'examen de l'app" :

- **Nom d'utilisateur** : `test_apple@meeshy.me`
- **Mot de passe** : `AppleReview2024!`
- **Notes** : "This app is a real-time messaging platform with instant translation. To test the translation feature, send a message in French to a user with English settings."

---

## 6. Checklist de Sécurité finale

- [ ] **Chiffrement** : L'application utilise HTTPS/WSS. Lors de la soumission, cochez "Oui" pour le chiffrement, mais précisez qu'il s'agit d'un usage standard (Exempt).
- [ ] **UGC (Contenu utilisateur)** : Le bouton "Signaler" est fonctionnel sur les messages et les profils. Apple vérifiera ce point en priorité.
- [ ] **Suppression de compte** : L'option de suppression de compte est présente dans les réglages (obligatoire pour Apple).

---

## 7. Notes Techniques sur l'Environnement de Build

L'application utilise désormais **Swift 6** pour garantir la sécurité de la concurrence.
- **Xcode Requis** : Version 16.0 ou supérieure.
- **macOS Requis** : macOS Sonoma (14.0) ou supérieur pour le développement local, **macOS Sequoia (15.0)** pour les runners CI.
- **Swift Version** : 6.0.

🚀 **Félicitations ! Votre application est prête pour le monde entier.**

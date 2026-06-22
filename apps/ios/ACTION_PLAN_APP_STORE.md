# 🚀 PLAN D'ACTION FINAL - DÉPLOIEMENT MEESHY SUR L'APP STORE

Ce document résume les étapes concrètes, automatisées et manuelles, pour publier Meeshy sur l'App Store en toute sécurité.

---

## 🛠️ PHASE 1 : ACTIONS AUTOMATISÉES (DÉJÀ RÉALISÉES)

J'ai effectué les corrections techniques suivantes :
1. **Sécurisation des Secrets** : Suppression des identifiants en clair et passage par des variables d'environnement (`ASC_KEY_ID`, `DEMO_USER`, etc.).
2. **Conformité Info.plist** : Vérification des descriptions de confidentialité pour la caméra, le micro, et les photos (localisées en 5 langues).
3. **Sécurité Critique** : Confirmation que le token VoIP est déjà stocké dans le Keychain (pas de risque de fuite via sauvegarde non chiffrée).
4. **Script de Validation** : Mise à jour de `./apps/ios/Meeshy.xcodeproj/validate_app_store_readiness.sh` pour fonctionner de manière autonome.
5. **Documents Légaux** : Création de `PRIVACY_POLICY.md` et `TERMS_OF_SERVICE.md` à la racine de `apps/ios/`.

---

## 📋 PHASE 2 : ACTIONS MANUELLES (À RÉALISER PAR VOUS)

### 1. Hébergement des documents légaux
Vous devez rendre ces documents accessibles via une URL HTTPS (ex: GitHub Pages, votre site web).
- **Politique de confidentialité** : `https://meeshy.me/privacy` (ou équivalent)
- **Conditions d'utilisation** : `https://meeshy.me/terms` (ou équivalent)

### 2. Création des Assets Marketing
Conformément au guide `./apps/ios/Meeshy.xcodeproj/APP_STORE_ASSETS_REQUIREMENTS.md`, préparez :
- **Captures d'écran** : 3 à 10 images pour iPhone 6.7" (1290x2796) et iPhone 6.5" (1242x2688).
- **Icône** : Vérifiez que l'icône 1024x1024 dans `Assets.xcassets` n'a pas de canal alpha (transparence).

### 3. Configuration App Store Connect
Connectez-vous sur [App Store Connect](https://appstoreconnect.apple.com) :
- Créez la nouvelle application "Meeshy" avec le Bundle ID `me.meeshy.app`.
- Remplissez les **Privacy Labels** (Nutrition Labels) en vous basant sur `./apps/ios/Meeshy/PrivacyInfo.xcprivacy`.
- Créez un **compte de test** (demo user) pour l'équipe de revue Apple.

---

## 🚀 PHASE 3 : PROCESSUS DE DÉPLOIEMENT

### Option A : Déploiement Local (recommandé pour le premier build)
Utilisez le script `meeshy.sh` déjà configuré :
```bash
cd apps/ios
# Assurez-vous d'avoir vos clés API dans l'environnement ou passez-les
export ASC_KEY_ID="VOTRE_KEY_ID"
export ASC_ISSUER_ID="VOTRE_ISSUER_ID"
export ASC_KEY_FILEPATH="/chemin/vers/votre/AuthKey.p8"

./meeshy.sh release
```

### Option B : GitHub Actions
Le workflow est prêt dans `.github/workflows/ios-release.yml`.
- Ajoutez les secrets suivants dans votre dépôt GitHub :
    - `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT` (Base64 du .p8).
    - `MATCH_PASSWORD`, `MATCH_DEPLOY_KEY`.
    - `DEMO_USER`, `DEMO_PASSWORD`.
- Déclenchez le déploiement en créant un tag (ex: `v1.0.0`) ou via l'onglet "Actions".

---

## 🔍 ÉTAPE FINALE : VÉRIFICATION
Avant chaque soumission, lancez toujours :
```bash
cd apps/ios
./Meeshy.xcodeproj/validate_app_store_readiness.sh
```

**Votre application est maintenant prête techniquement pour l'App Store !**

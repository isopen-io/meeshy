# Apple Privacy Nutrition Labels - Meeshy

## GUIDE DE REMPLISSAGE POUR APP STORE CONNECT

Lorsque vous soumettez votre application sur App Store Connect, vous devrez remplir les "Privacy Nutrition Labels". Voici les informations à déclarer pour Meeshy :

### 1. DONNÉES COLLECTÉES

#### A. Informations de contact
- **E-mail** : OUI
  - Utilisé pour : Fonctionnalité de l'app, Support client
  - Lié à l'identité de l'utilisateur : OUI
  - Utilisé pour le suivi : NON

- **Nom** : OUI
  - Utilisé pour : Fonctionnalité de l'app
  - Lié à l'identité de l'utilisateur : OUI
  - Utilisé pour le suivi : NON

- **Numéro de téléphone** : OUI (optionnel)
  - Utilisé pour : Fonctionnalité de l'app
  - Lié à l'identité de l'utilisateur : OUI
  - Utilisé pour le suivi : NON

#### B. Contenu utilisateur
- **Photos et vidéos** : OUI
  - Utilisé pour : Fonctionnalité de l'app
  - Lié à l'identité de l'utilisateur : OUI
  - Utilisé pour le suivi : NON

- **Messages** : OUI
  - Utilisé pour : Fonctionnalité de l'app
  - Lié à l'identité de l'utilisateur : OUI
  - Utilisé pour le suivi : NON

- **Contenu audio** : OUI
  - Utilisé pour : Fonctionnalité de l'app (appels vocaux)
  - Lié à l'identité de l'utilisateur : OUI
  - Utilisé pour le suivi : NON

#### C. Identifiants
- **ID utilisateur** : OUI
  - Utilisé pour : Fonctionnalité de l'app
  - Lié à l'identité de l'utilisateur : OUI
  - Utilisé pour le suivi : NON

- **ID de l'appareil** : OUI
  - Utilisé pour : Fonctionnalité de l'app (jeton de notification push, appareil d'une session ouverte), Analytiques
  - Lié à l'identité de l'utilisateur : OUI (le jeton et la session sont rattachés au compte)
  - Utilisé pour le suivi : NON

#### D. Localisation
- **Localisation précise** : OUI (uniquement quand l'utilisateur partage sa position)
  - Utilisé pour : Fonctionnalité de l'app
  - Lié à l'identité de l'utilisateur : OUI
  - Utilisé pour le suivi : NON

- **Localisation approximative** : OUI — pays et ville APPROXIMATIVE d'une session, déduits de l'adresse IP par une base locale (DB-IP Lite, aucune adresse envoyée à un tiers, #9609). L'app n'envoie plus aucune ville tirée du GPS (#9612).
  - Utilisé pour : Fonctionnalité de l'app (Sécurité > Sessions, alerte de nouvelle connexion)
  - Lié à l'identité de l'utilisateur : OUI
  - Utilisé pour le suivi : NON

#### E. Données d'utilisation
- **Données d'interaction avec le produit** : OUI
  - Utilisé pour : Fonctionnalité de l'app (avis de capture d'écran envoyé à l'auteur d'un contenu protégé), Analytiques (écrans vus)
  - Lié à l'identité de l'utilisateur : OUI (l'avis de capture nomme le compte qui a capturé)
  - Utilisé pour le suivi : NON

#### F. Diagnostics
- **Données de crash** : OUI
  - Utilisé pour : Analytiques (amélioration du produit)
  - Lié à l'identité de l'utilisateur : OUI (Crashlytics reçoit l'identifiant du compte connecté)
  - Utilisé pour le suivi : NON

- **Données de performance** : OUI
  - Utilisé pour : Analytiques (amélioration du produit)
  - Lié à l'identité de l'utilisateur : NON
  - Utilisé pour le suivi : NON

> Ce guide suit `apps/ios/Meeshy/PrivacyInfo.xcprivacy` ligne pour ligne (#9645) ; le manifeste fait foi en cas d'écart, et le témoin `SessionPrivacyManifestTests` en garde les déclarations de session. Les contacts du carnet d'adresses (non liés, Fonctionnalité) et les autres contenus utilisateur y figurent aussi.

### 2. DONNÉES NON COLLECTÉES

- Historique de recherche : NON
- Historique de navigation : NON
- Informations financières : NON
- Informations de santé : NON
- Informations sensibles : NON

### 3. PRATIQUES DE CONFIDENTIALITÉ

#### Chiffrement des données en transit
- OUI : Toutes les données sont transmises via HTTPS/WSS

#### Demande de suppression de données
- OUI : Les utilisateurs peuvent supprimer leur compte et toutes leurs données associées depuis l'application

#### Lien vers la politique de confidentialité
- URL : https://meeshy.me/privacy
- Assurez-vous que cette URL est accessible publiquement AVANT la soumission

#### Lien vers les conditions d'utilisation
- URL : https://meeshy.me/terms
- Assurez-vous que cette URL est accessible publiquement AVANT la soumission

### 4. INSTRUCTIONS POUR APP STORE CONNECT

1. Connectez-vous à App Store Connect (https://appstoreconnect.apple.com)
2. Allez dans "Mes Apps" > "Meeshy"
3. Dans la section "Confidentialité de l'App", cliquez sur "Commencer"
4. Répondez aux questions en utilisant les informations ci-dessus
5. Fournissez les liens vers votre politique de confidentialité et vos conditions d'utilisation

### 5. NOTES IMPORTANTES

⚠️ **CRITIQUE** : Vous DEVEZ héberger votre politique de confidentialité et vos conditions d'utilisation sur un site web public accessible avant de soumettre l'app.

Options recommandées :
- Créez une page sur https://meeshy.me/privacy et https://meeshy.me/terms
- Utilisez GitHub Pages si vous n'avez pas encore de site web
- Assurez-vous que les liens sont HTTPS (obligatoire)

### 6. VÉRIFICATION AVANT SOUMISSION

✅ Politique de confidentialité accessible publiquement
✅ Conditions d'utilisation accessibles publiquement
✅ Tous les types de données collectées déclarés dans App Store Connect
✅ Descriptions d'utilisation des données claires et précises
✅ Liens HTTPS valides et fonctionnels

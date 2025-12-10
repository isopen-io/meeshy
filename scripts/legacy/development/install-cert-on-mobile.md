# Installation du certificat SSL sur iPhone/iPad

## Problème
Quand vous accédez à l'application via `https://192.168.1.39:3000` depuis Safari sur iPhone, vous obtenez l'erreur :
```
Le certificat d'accès à ce serveur n'est pas valide.
```

## Solution : Installer le certificat racine mkcert sur votre iPhone

### Étape 1 : Localiser le certificat racine mkcert

Sur votre ordinateur de développement (où vous avez généré les certificats), exécutez :

```bash
mkcert -CAROOT
```

Cela affichera le chemin vers le dossier contenant le certificat racine, par exemple :
```
/Users/votreNom/Library/Application Support/mkcert
```

### Étape 2 : Copier le certificat racine

Dans ce dossier, vous trouverez un fichier nommé `rootCA.pem`. C'est le certificat racine qui doit être installé sur votre iPhone.

```bash
# Afficher le chemin complet
ls -la $(mkcert -CAROOT)/rootCA.pem

# Copier le fichier dans un endroit accessible
cp $(mkcert -CAROOT)/rootCA.pem ~/Desktop/mkcert-root-ca.pem
```

### Étape 3 : Transférer le certificat sur votre iPhone

Plusieurs méthodes possibles :

#### Option A : Par AirDrop (recommandé)
1. Localisez le fichier `mkcert-root-ca.pem` sur votre Bureau
2. Clic droit → Partager → AirDrop
3. Sélectionnez votre iPhone

#### Option B : Par serveur web temporaire
```bash
# Démarrer un serveur web simple dans le dossier contenant le certificat
cd ~/Desktop
python3 -m http.server 8080

# Ensuite sur votre iPhone, ouvrez Safari et allez à :
# http://[IP_DE_VOTRE_ORDINATEUR]:8080/mkcert-root-ca.pem
```

#### Option C : Par email
1. Envoyez-vous un email avec le fichier `mkcert-root-ca.pem` en pièce jointe
2. Ouvrez l'email sur votre iPhone
3. Téléchargez la pièce jointe

### Étape 4 : Installer le certificat sur iPhone

1. **Télécharger le profil**
   - Après avoir transféré le fichier, un message apparaîtra : "Profil téléchargé"
   - Si rien ne se passe, allez dans Réglages → Général → VPN et gestion des appareils

2. **Installer le profil**
   - Réglages → Général → VPN et gestion des appareils
   - Vous verrez "mkcert rootCA" ou un nom similaire
   - Appuyez dessus
   - Appuyez sur "Installer" (en haut à droite)
   - Entrez votre code PIN si demandé
   - Confirmez l'installation

3. **Activer la confiance pour le certificat racine** (IMPORTANT !)
   - Réglages → Général → Informations → Réglages des certificats (tout en bas)
   - Vous verrez "mkcert [nom de votre ordinateur]"
   - Activez le bouton pour "Activer la confiance totale"
   - Confirmez en appuyant sur "Continuer"

### Étape 5 : Vérifier l'installation

1. Ouvrez Safari sur votre iPhone
2. Allez à `https://192.168.1.39:3100` (frontend)
3. Vous ne devriez plus voir d'avertissement de sécurité
4. Testez également `https://192.168.1.39:3000/health` (gateway)

## Alternative : Utiliser un domaine local

Si vous avez configuré un domaine local (ex: `meeshy.local`), vous pouvez aussi :

1. Générer un certificat pour ce domaine :
```bash
cd frontend/.cert
mkcert -key-file localhost-key.pem -cert-file localhost.pem \
       localhost 127.0.0.1 ::1 \
       192.168.1.39 \
       meeshy.local "*.meeshy.local"
```

2. Configurer votre router ou fichier hosts pour pointer `meeshy.local` vers votre IP locale

## Dépannage

### Le certificat n'apparaît pas dans "VPN et gestion des appareils"
- Essayez de télécharger à nouveau le fichier via Safari (pas Chrome)
- Vérifiez que l'extension du fichier est bien `.pem` ou `.crt`

### "Ce profil n'est pas signé" lors de l'installation
- C'est normal pour les certificats auto-signés mkcert
- Continuez l'installation quand même

### L'erreur persiste après installation
- Vérifiez que vous avez bien activé la "Confiance totale" à l'Étape 4.3
- Redémarrez Safari
- Redémarrez votre iPhone

### L'option "Réglages des certificats" n'apparaît pas
- Sur iOS 15+, le chemin est : Réglages → Général → Informations → Réglages des certificats
- Sur iOS 14-, le chemin est : Réglages → Général → Informations → Certificats de confiance

## Script automatique pour partager le certificat

```bash
#!/bin/bash
# scripts/development/share-cert-to-mobile.sh

# Localiser le certificat racine
CAROOT=$(mkcert -CAROOT)
CERT_FILE="$CAROOT/rootCA.pem"

if [ ! -f "$CERT_FILE" ]; then
    echo "❌ Certificat racine mkcert non trouvé"
    echo "   Assurez-vous que mkcert est installé et initialisé"
    exit 1
fi

# Copier sur le bureau avec un nom plus explicite
cp "$CERT_FILE" ~/Desktop/mkcert-root-ca-install-on-iphone.pem

echo "✅ Certificat copié sur le bureau : ~/Desktop/mkcert-root-ca-install-on-iphone.pem"
echo ""
echo "📱 Pour installer sur iPhone :"
echo "   1. Transférez ce fichier sur votre iPhone (AirDrop, email, etc.)"
echo "   2. Ouvrez le fichier sur l'iPhone"
echo "   3. Réglages → Général → VPN et gestion des appareils"
echo "   4. Installez le profil mkcert"
echo "   5. Réglages → Général → Informations → Réglages des certificats"
echo "   6. Activez la confiance totale pour mkcert"
echo ""
echo "Ou démarrez un serveur web temporaire :"
echo "   cd ~/Desktop && python3 -m http.server 8080"
echo "   Puis sur iPhone : http://$(ipconfig getifaddr en0):8080/mkcert-root-ca-install-on-iphone.pem"

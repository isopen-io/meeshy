# ✅ Checklist de vérification - Page Profil

## 🎯 Objectif
Cette checklist vous permet de vérifier que toutes les fonctionnalités de la page profil fonctionnent correctement.

---

## 📱 Test de la page principale

### Affichage
- [ ] La page de profil s'ouvre sans erreur
- [ ] Le titre "Profil" est affiché en haut
- [ ] Le bouton "Modifier" est visible en haut à droite
- [ ] L'avatar s'affiche (ou les initiales si pas de photo)
- [ ] Le nom d'affichage est visible
- [ ] Le nom d'utilisateur (@username) est visible
- [ ] La bio s'affiche (si présente)

### Statistiques
- [ ] Le nombre de conversations s'affiche
- [ ] Le nombre de messages s'affiche
- [ ] La date d'inscription ("Membre depuis") s'affiche correctement

### Sections
- [ ] Section "Compte" visible avec :
  - [ ] Email affiché
  - [ ] Téléphone affiché (si présent)
  - [ ] Option "Mot de passe" présente
  - [ ] Nom d'utilisateur affiché
  
- [ ] Section "Paramètres" visible avec :
  - [ ] Paramètres de l'app
  - [ ] Langue & Traduction
  - [ ] Apparence
  
- [ ] Section "À propos" visible avec :
  - [ ] Version (1.0.0)
  - [ ] Conditions d'utilisation
  - [ ] Politique de confidentialité

### Bouton de déconnexion
- [ ] Bouton "Déconnexion" visible
- [ ] Couleur rouge
- [ ] Icône de déconnexion présente
- [ ] Bouton cliquable

---

## ✏️ Test de modification du profil

### Ouverture du modal
- [ ] Cliquer sur "Modifier" ouvre un modal
- [ ] Le titre "Modifier le profil" est affiché
- [ ] Les champs sont pré-remplis avec les valeurs actuelles
- [ ] Bouton "Annuler" visible en haut à gauche
- [ ] Bouton "Enregistrer" visible en haut à droite

### Modification des champs
- [ ] Modifier le nom d'affichage fonctionne
- [ ] Modifier la bio fonctionne
- [ ] Modifier le téléphone fonctionne
- [ ] Le bouton "Enregistrer" se désactive si pas de changement
- [ ] Le bouton "Enregistrer" s'active si changement détecté

### Sauvegarde
- [ ] Cliquer sur "Enregistrer" lance la sauvegarde
- [ ] Un indicateur de chargement s'affiche
- [ ] Les contrôles sont désactivés pendant la sauvegarde
- [ ] En cas de succès, le modal se ferme
- [ ] Les nouvelles valeurs sont visibles sur la page principale
- [ ] En cas d'erreur, un message s'affiche

### Annulation
- [ ] Cliquer sur "Annuler" ferme le modal
- [ ] Les modifications non sauvegardées sont perdues
- [ ] La page principale affiche les anciennes valeurs

---

## 🔒 Test de changement de mot de passe

### Ouverture du modal
- [ ] Cliquer sur "Mot de passe" ouvre un modal
- [ ] Le titre "Changer le mot de passe" est affiché
- [ ] Trois champs sont présents :
  - [ ] Mot de passe actuel
  - [ ] Nouveau mot de passe
  - [ ] Confirmer le mot de passe
- [ ] Tous les champs sont de type "SecureField" (masqués)
- [ ] Bouton "Annuler" visible
- [ ] Bouton "Enregistrer" visible mais désactivé

### Saisie et validation
- [ ] Saisir un mot de passe court (< 8 caractères)
  - [ ] Le bouton "Enregistrer" reste désactivé
  
- [ ] Saisir un mot de passe de 8 caractères
  - [ ] L'indicateur de force apparaît
  - [ ] L'indicateur montre "Faible" en rouge (🔴)
  
- [ ] Saisir un mot de passe de 10 caractères
  - [ ] L'indicateur montre "Moyen" en orange (🟠)
  
- [ ] Saisir un mot de passe de 12+ caractères avec majuscules, minuscules et chiffres
  - [ ] L'indicateur montre "Fort" en vert (🟢)
  - [ ] La barre de progression se remplit complètement

### Confirmation
- [ ] Les mots de passe ne correspondent pas
  - [ ] Le bouton "Enregistrer" reste désactivé
  
- [ ] Les mots de passe correspondent
  - [ ] Le bouton "Enregistrer" s'active

### Sauvegarde
- [ ] Cliquer sur "Enregistrer" lance le changement
- [ ] Un indicateur de chargement s'affiche
- [ ] En cas de succès, une alerte "Succès" s'affiche
- [ ] Cliquer "OK" sur l'alerte ferme le modal
- [ ] En cas d'erreur (mauvais mot de passe actuel), une alerte d'erreur s'affiche

---

## 📧 Test de changement d'email

### Ouverture du modal
- [ ] Cliquer sur "Email" ouvre un modal
- [ ] Le titre "Changer l'email" est affiché
- [ ] L'email actuel est affiché (non modifiable)
- [ ] Champ pour le nouvel email présent
- [ ] Champ pour le mot de passe présent
- [ ] Bouton "Annuler" visible
- [ ] Bouton "Enregistrer" visible mais désactivé

### Validation de l'email
- [ ] Saisir un email invalide (ex: "test")
  - [ ] Le bouton "Enregistrer" reste désactivé
  
- [ ] Saisir le même email que l'actuel
  - [ ] Le bouton "Enregistrer" reste désactivé
  
- [ ] Saisir un email valide différent
  - [ ] Format validé automatiquement

### Confirmation par mot de passe
- [ ] Sans mot de passe
  - [ ] Le bouton "Enregistrer" reste désactivé
  
- [ ] Avec mot de passe
  - [ ] Le bouton "Enregistrer" s'active

### Sauvegarde
- [ ] Cliquer sur "Enregistrer" lance le changement
- [ ] Un indicateur de chargement s'affiche
- [ ] En cas de succès, une alerte "Succès" s'affiche
- [ ] En cas d'erreur (email déjà utilisé), une alerte d'erreur spécifique s'affiche
- [ ] En cas d'erreur (mauvais mot de passe), une alerte appropriée s'affiche

---

## 📸 Test de changement de photo

### Sélection de photo
- [ ] Cliquer sur l'avatar ouvre le sélecteur de photos
- [ ] L'icône de caméra est visible en bas à droite de l'avatar
- [ ] Le sélecteur de photos système s'ouvre
- [ ] Impossible de fermer accidentellement

### Upload
- [ ] Sélectionner une photo lance l'upload
- [ ] L'avatar affiche un indicateur de chargement
- [ ] L'avatar est semi-transparent pendant l'upload
- [ ] En cas de succès, la nouvelle photo s'affiche immédiatement
- [ ] En cas d'erreur, un message s'affiche

---

## 🚪 Test de déconnexion

### Confirmation
- [ ] Cliquer sur "Déconnexion" affiche une alerte
- [ ] Le titre de l'alerte est "Déconnexion"
- [ ] Le message demande confirmation : "Êtes-vous sûr de vouloir vous déconnecter ?"
- [ ] Deux boutons présents :
  - [ ] "Annuler" (sans effet)
  - [ ] "Déconnexion" (rouge, destructif)

### Annulation
- [ ] Cliquer sur "Annuler" ferme l'alerte
- [ ] L'utilisateur reste connecté
- [ ] La page profil reste affichée

### Déconnexion effective
- [ ] Cliquer sur "Déconnexion" dans l'alerte lance le processus
- [ ] Un overlay s'affiche avec :
  - [ ] Fond semi-transparent noir
  - [ ] Indicateur de progression (spinner)
  - [ ] Texte "Déconnexion..."
  - [ ] Fond blanc arrondi
- [ ] L'interface se bloque pendant la déconnexion
- [ ] Après quelques secondes, redirection vers l'écran de connexion

### Vérification de la déconnexion complète
- [ ] Retourner sur l'app sans se reconnecter
- [ ] L'écran de connexion s'affiche
- [ ] Les données utilisateur ne sont plus accessibles
- [ ] Le token est effacé
- [ ] Se reconnecter fonctionne normalement

---

## 🎨 Tests visuels

### Design et apparence
- [ ] Les couleurs sont cohérentes avec l'app
- [ ] Les icônes sont bien alignées
- [ ] Les espacements sont uniformes
- [ ] Les coins arrondis sont présents
- [ ] Le contraste est suffisant pour lire le texte

### Animations
- [ ] Ouverture des modals est fluide
- [ ] Fermeture des modals est fluide
- [ ] L'indicateur de force du mot de passe s'anime
- [ ] L'overlay de déconnexion apparaît en douceur
- [ ] Les transitions sont sans saccades

### Responsive
- [ ] Tester sur iPhone (petit écran)
  - [ ] Tout est visible
  - [ ] Pas de débordement
  - [ ] Texte lisible
  
- [ ] Tester sur iPhone (grand écran)
  - [ ] Layout adapté
  - [ ] Aucun étirement
  
- [ ] Tester sur iPad
  - [ ] Layout approprié
  - [ ] Utilisation de l'espace
  
- [ ] Rotation de l'écran
  - [ ] Fonctionne en portrait
  - [ ] Fonctionne en paysage

### Mode sombre
- [ ] Activer le mode sombre
- [ ] Tous les éléments sont visibles
- [ ] Les couleurs s'adaptent correctement
- [ ] Le contraste reste suffisant
- [ ] Les indicateurs de chargement sont visibles

---

## 🔍 Tests de cas limites

### Connexion réseau
- [ ] Désactiver le Wi-Fi/données
- [ ] Tenter une modification
- [ ] Un message d'erreur approprié s'affiche
- [ ] L'app ne crash pas

### Champs vides
- [ ] Vider tous les champs du profil
- [ ] Tenter de sauvegarder
- [ ] Vérifier le comportement (accepté ou refusé selon la logique)

### Caractères spéciaux
- [ ] Tester avec émojis dans le nom
- [ ] Tester avec caractères accentués
- [ ] Tester avec caractères cyrilliques
- [ ] Tous doivent être acceptés et affichés correctement

### Texte très long
- [ ] Entrer une bio très longue (> 1000 caractères)
- [ ] Vérifier la limitation ou le comportement
- [ ] Vérifier l'affichage

---

## 🐛 Tests d'erreurs

### Erreurs API
- [ ] Simuler une erreur 401 (non autorisé)
  - [ ] Message d'erreur approprié
  
- [ ] Simuler une erreur 404 (endpoint non trouvé)
  - [ ] Fallback gracieux
  
- [ ] Simuler une erreur 500 (serveur)
  - [ ] Message d'erreur approprié

### Erreurs utilisateur
- [ ] Mot de passe actuel incorrect
  - [ ] Message clair : "Mot de passe actuel incorrect"
  
- [ ] Email déjà utilisé
  - [ ] Message clair : "Cet email est déjà utilisé"
  
- [ ] Format d'email invalide
  - [ ] Validation empêche la soumission

---

## ✅ Résultat final

### Comptage des tests
- **Total de tests à effectuer** : ~150
- **Tests passés** : _____
- **Tests échoués** : _____
- **Problèmes trouvés** : _____

### Notes et observations
```
[Notez ici vos observations, problèmes rencontrés, suggestions]







```

---

## 📋 Actions à entreprendre

En cas de problème détecté :

1. **Noter le problème** dans la section ci-dessus
2. **Reproduire le problème** de manière consistante
3. **Vérifier les logs** dans Xcode Console
4. **Identifier la cause** (UI, ViewModel, Service, API)
5. **Corriger le problème**
6. **Re-tester** pour confirmer la correction

---

## 🎓 Documentation de référence

En cas de question, consultez :
- **README_PROFILE_COMPLETE.md** - Vue d'ensemble complète
- **GUIDE_UTILISATION_PROFIL.md** - Guide utilisateur
- **TECHNICAL_DOCUMENTATION_PROFILE.md** - Documentation technique
- **ARCHITECTURE_VISUELLE_PROFILE.md** - Architecture et diagrammes

---

**Date du test** : _______________
**Testeur** : _______________
**Version de l'app** : 1.0.0
**Version iOS** : _______________
**Appareil** : _______________

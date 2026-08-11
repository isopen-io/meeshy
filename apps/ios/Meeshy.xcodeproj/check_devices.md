# Guide de gestion des appareils Apple Developer

## Étapes pour libérer de la place

### 1. Vérifier le nombre d'appareils actuels
- Allez sur https://developer.apple.com/account
- Certificates, Identifiers & Profiles → Devices → iOS
- Regardez "X of 100" en haut

### 2. Critères pour supprimer un appareil
- [ ] Appareil que vous ne possédez plus
- [ ] Appareil cassé/perdu
- [ ] Testeur qui n'est plus dans le projet
- [ ] Doublon (même appareil enregistré plusieurs fois)
- [ ] Appareil de test temporaire (> 1 an)

### 3. Processus de suppression
⚠️ ATTENTION : Vous ne pouvez faire ceci qu'UNE FOIS PAR AN !

1. Sur Apple Developer → Devices
2. Cochez les appareils à supprimer
3. Cliquez sur le bouton "−"
4. Confirmez

### 4. Après suppression
1. Ajoutez vos nouveaux appareils
2. Dans Xcode, régénérez les profils :
   - Décochez "Automatically manage signing"
   - Recochez "Automatically manage signing"
3. Clean Build Folder (⇧⌘K)
4. Rebuild

## Alternative : TestFlight

Pour éviter d'atteindre la limite de 100 appareils :

### Avantages de TestFlight
- ✅ Jusqu'à 10,000 testeurs externes
- ✅ Pas besoin d'enregistrer les UDIDs
- ✅ Distribution facile via email
- ✅ Feedback intégré
- ✅ Builds automatiques depuis Xcode

### Comment utiliser TestFlight
1. Dans Xcode : Product → Archive
2. Distribute App → TestFlight & App Store
3. Sur App Store Connect → TestFlight
4. Ajoutez des testeurs externes par email

## Obtenir l'UDID d'un iPhone

### Méthode 1 : Via Finder
1. Connectez l'iPhone au Mac
2. Ouvrez Finder
3. Sélectionnez l'iPhone
4. Cliquez sur le texte sous le nom plusieurs fois
5. Copiez l'UDID affiché (⌘C)

### Méthode 2 : Via Xcode
1. Window → Devices and Simulators (⇧⌘2)
2. Sélectionnez votre iPhone
3. Clic droit sur "Identifier" → Copy

## Questions fréquentes

**Q : Combien d'appareils puis-je enregistrer ?**
R : 100 par type (100 iPhones, 100 iPads, 100 Apple Watch, etc.)

**Q : Combien de fois puis-je modifier ma liste ?**
R : Une fois par an (à la date de renouvellement)

**Q : Puis-je contourner la limite de 100 ?**
R : Oui, utilisez TestFlight pour les testeurs (10,000 utilisateurs)

**Q : Que se passe-t-il si je supprime un appareil ?**
R : Les builds existants ne fonctionneront plus sur cet appareil. Vous devrez créer de nouveaux profils.

## Date de renouvellement

Vérifiez sur Apple Developer → Membership → "Membership Expiration Date"
C'est à cette date que votre quota sera réinitialisé.

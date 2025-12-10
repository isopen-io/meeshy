# Plan de Test - Popovers Toujours Visibles

**Date**: 20 Octobre 2025  
**Testeur**: _________________  
**Environnement**: Production / Development

## 🎯 Objectif

Valider que les popovers de réaction et de traduction restent **toujours visibles à l'écran** sur tous les appareils.

---

## 📱 Tests Mobile (Prioritaire)

### Test 1: iPhone SE (375px) - Portrait

#### Popover de Traduction
- [ ] Ouvrir une conversation avec plusieurs messages
- [ ] Cliquer sur le bouton traduction (🌐) d'un message à **gauche**
- [ ] **Validation**: Popover visible avec marges de chaque côté
- [ ] Cliquer sur le bouton traduction d'un message à **droite**
- [ ] **Validation**: Popover visible avec marges de chaque côté
- [ ] Scroll jusqu'en haut, cliquer sur traduction
- [ ] **Validation**: Popover se positionne en dessous si nécessaire
- [ ] Scroll jusqu'en bas, cliquer sur traduction
- [ ] **Validation**: Popover se positionne au-dessus

#### Emoji Picker
- [ ] Cliquer sur le bouton réaction (😊) d'un message à **gauche**
- [ ] **Validation**: Emoji picker visible avec marges
- [ ] **Validation**: Largeur réduite mais utilisable
- [ ] Cliquer sur le bouton réaction d'un message à **droite**
- [ ] **Validation**: Emoji picker visible et recentré
- [ ] Sélectionner un emoji
- [ ] **Validation**: Fermeture automatique et ajout correct

**Notes**: _______________________________________________

---

### Test 2: iPhone 13 Mini (360px) - Portrait

#### Popover de Traduction
- [ ] Message à gauche: Popover visible ✓
- [ ] Message à droite: Popover visible ✓
- [ ] En haut d'écran: Repositionnement correct ✓
- [ ] En bas d'écran: Positionnement correct ✓

#### Emoji Picker
- [ ] Message à gauche: Picker visible ✓
- [ ] Message à droite: Picker visible ✓
- [ ] Largeur adaptée au petit écran ✓

**Notes**: _______________________________________________

---

### Test 3: Samsung Galaxy S20 (360px) - Portrait

#### Popover de Traduction
- [ ] Tous les cas de position testés ✓
- [ ] Marges respectées ✓
- [ ] Contenu lisible ✓

#### Emoji Picker
- [ ] Visible sur tous les messages ✓
- [ ] Catégories accessibles ✓
- [ ] Recherche fonctionnelle ✓

**Notes**: _______________________________________________

---

### Test 4: Mobile en Paysage (Landscape)

**Appareil**: _________________  
**Résolution**: _______x_______

#### Popover de Traduction
- [ ] Visible en mode paysage
- [ ] Hauteur adaptée (pas trop haute)
- [ ] Scroll interne si nécessaire

#### Emoji Picker
- [ ] Visible en mode paysage
- [ ] Grille d'emojis adaptée

**Notes**: _______________________________________________

---

## 💻 Tests Tablet

### Test 5: iPad Mini (768px) - Portrait

#### Popover de Traduction
- [ ] Largeur: 270px (vérifier dans DevTools)
- [ ] Position centrale correcte
- [ ] Collision detection active

#### Emoji Picker
- [ ] Largeur: 320px max
- [ ] Toutes catégories visibles
- [ ] Performance fluide

**Notes**: _______________________________________________

---

### Test 6: iPad (810px) - Portrait

#### Popover de Traduction
- [ ] Largeur: 294px (vérifier dans DevTools)
- [ ] Onglets "Translations" et "Translate to" fonctionnels
- [ ] Liste de langues scrollable

#### Emoji Picker
- [ ] Affichage optimal à 320px
- [ ] Emojis fréquents en haut
- [ ] Recherche rapide

**Notes**: _______________________________________________

---

## 🖥️ Tests Desktop

### Test 7: Desktop (1024px+)

#### Popover de Traduction
- [ ] Largeur: 294px
- [ ] Positionnement fluide
- [ ] Animations correctes
- [ ] Fermeture au clic extérieur

#### Emoji Picker
- [ ] Largeur: 320px
- [ ] Grille complète visible
- [ ] Hover sur emojis fonctionne

**Notes**: _______________________________________________

---

## 🧪 Tests de Cas Limites

### Test 8: Cas Extrêmes

#### Très petit écran (320px)
- [ ] Ouvrir popover de traduction
- [ ] **Validation**: Largeur = min(280px, 296px) = 280px
- [ ] **Validation**: Marges = (320-280)/2 = 20px ✓
- [ ] Contenu lisible malgré la réduction

#### Très grand écran (2560px)
- [ ] Popover traduction ne dépasse pas 294px
- [ ] Emoji picker ne dépasse pas 320px
- [ ] Centrage correct par rapport au message

#### Plusieurs popovers ouverts
- [ ] Ouvrir popover traduction
- [ ] Tenter d'ouvrir un autre
- [ ] **Validation**: Un seul ouvert à la fois
- [ ] z-index correct (99999)

**Notes**: _______________________________________________

---

## 🎨 Tests Visuels

### Test 9: Design & UX

#### Popover Traduction
- [ ] Border radius correct
- [ ] Ombre portée visible
- [ ] Couleurs cohérentes (light/dark mode)
- [ ] Texte lisible
- [ ] Boutons cliquables facilement

#### Emoji Picker
- [ ] Emojis de taille appropriée
- [ ] Catégories bien séparées
- [ ] Scroll smooth
- [ ] Sélection visuelle au hover

**Notes**: _______________________________________________

---

## ⚡ Tests de Performance

### Test 10: Performance

#### Temps de réponse
- [ ] Ouverture popover traduction: < 100ms
- [ ] Ouverture emoji picker: < 100ms
- [ ] Fermeture instantanée
- [ ] Pas de lag lors du scroll

#### Animations
- [ ] Fade in/out fluide
- [ ] Pas de saccades
- [ ] 60 FPS maintenu (vérifier DevTools)

#### Mémoire
- [ ] Pas de fuite mémoire (ouvrir/fermer 50x)
- [ ] Pas d'augmentation excessive de RAM

**Notes**: _______________________________________________

---

## 🌐 Tests Multi-langues

### Test 11: Langues avec Caractères Spéciaux

#### Arabe (RTL)
- [ ] Popover traduction: direction correcte
- [ ] Emoji picker: direction correcte

#### Chinois (caractères larges)
- [ ] Texte non coupé
- [ ] Largeur suffisante

#### Allemand (mots longs)
- [ ] Wrap correct
- [ ] Pas de dépassement

**Notes**: _______________________________________________

---

## 🔄 Tests d'Interaction

### Test 12: Comportements Complexes

#### Hover & Click
- [ ] Hover sur bouton traduction: tooltip visible
- [ ] Hover sur popover: reste ouvert
- [ ] Mouse leave: fermeture après 300ms
- [ ] Click extérieur: fermeture immédiate

#### Keyboard Navigation
- [ ] Tab: navigation dans le popover
- [ ] Escape: fermeture
- [ ] Enter: sélection langue/emoji

#### Touch Events (Mobile)
- [ ] Tap sur bouton: ouverture
- [ ] Tap sur emoji: sélection et fermeture
- [ ] Swipe: scroll dans la liste
- [ ] Tap extérieur: fermeture

**Notes**: _______________________________________________

---

## 📊 Résumé des Tests

| Catégorie | Tests | Réussis | Échoués | Notes |
|-----------|-------|---------|---------|-------|
| Mobile | 4 | __ | __ | ______ |
| Tablet | 2 | __ | __ | ______ |
| Desktop | 1 | __ | __ | ______ |
| Cas Limites | 1 | __ | __ | ______ |
| Visuels | 1 | __ | __ | ______ |
| Performance | 1 | __ | __ | ______ |
| Multi-langues | 1 | __ | __ | ______ |
| Interactions | 1 | __ | __ | ______ |
| **TOTAL** | **12** | **__** | **__** | ______ |

---

## ✅ Critères de Validation

Pour que le fix soit validé, il faut:

1. **100% de réussite** sur les tests Mobile (Tests 1-4)
2. **Au moins 90% de réussite** sur les autres tests
3. **Aucun bug bloquant** détecté
4. **Performance maintenue** (pas de régression)

---

## 🐛 Bugs Détectés

| ID | Description | Sévérité | Appareil | Status |
|----|-------------|----------|----------|--------|
| 1 | ____________ | _______ | ________ | ______ |
| 2 | ____________ | _______ | ________ | ______ |
| 3 | ____________ | _______ | ________ | ______ |

---

## ✍️ Signature

**Testeur**: _________________  
**Date**: _____/_____/_____  
**Statut**: ☐ VALIDÉ  ☐ À CORRIGER  ☐ BLOQUÉ  

**Commentaires**: 
_____________________________________________________
_____________________________________________________
_____________________________________________________

---

## 🎯 Checklist Rapide (Quick Test)

Pour un test rapide (5 minutes):

- [ ] iPhone SE: Traduction popover visible ✓
- [ ] iPhone SE: Emoji picker visible ✓
- [ ] Desktop: Traduction popover = 294px ✓
- [ ] Desktop: Emoji picker = 320px ✓
- [ ] Aucun popover ne sort de l'écran ✓

✅ **Si tous les points sont OK**: Le fix fonctionne !

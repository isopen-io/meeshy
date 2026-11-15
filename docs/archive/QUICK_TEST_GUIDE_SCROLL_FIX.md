# Guide de Test Rapide - Fix Scroll AttachmentCarousel

## TEST 1 : Scroll Horizontal Fonctionne (CRITIQUE)

### Étapes
1. Ouvrir une conversation
2. Cliquer sur le bouton d'attachement (icône trombone)
3. Sélectionner 10+ fichiers (images, PDF, etc.)
4. Attendre la fin de l'upload

### Vérifications
- [ ] Scrollbar horizontale visible en bas du carrousel
- [ ] Scroll avec la molette de la souris fonctionne
- [ ] Drag de la scrollbar fonctionne
- [ ] Tous les fichiers sont accessibles via le scroll
- [ ] Le carrousel ne s'élargit PAS au-delà de la largeur du textarea

**Résultat attendu** : ✅ Tous les fichiers visibles via scroll horizontal

---

## TEST 2 : Largeur Fixe du Conteneur

### Étapes
1. Ouvrir DevTools (F12)
2. Sélectionner le textarea du message composer
3. Noter sa largeur (ex: 500px)
4. Ajouter 1 fichier → Mesurer la largeur du carrousel
5. Ajouter 10 fichiers → Mesurer la largeur du carrousel

### Vérifications
```javascript
// Dans la console DevTools
const textarea = document.querySelector('textarea');
const carousel = document.querySelector('[role="list"]');

console.log('Textarea width:', textarea.offsetWidth);
console.log('Carousel width:', carousel.offsetWidth);
console.log('Match:', textarea.offsetWidth === carousel.offsetWidth);
```

- [ ] Largeur du carrousel = Largeur du textarea
- [ ] Largeur reste constante (1 fichier vs 10 fichiers)
- [ ] Pas de débordement horizontal du carrousel

**Résultat attendu** : ✅ Largeur fixe et contrainte

---

## TEST 3 : Types de Fichiers Mixtes

### Étapes
1. Préparer les fichiers suivants :
   - 3 images (JPG, PNG)
   - 2 vidéos (MP4)
   - 2 audios (MP3)
   - 3 documents (PDF, TXT)
2. Les ajouter dans cet ordre
3. Scroller horizontalement pour tout voir

### Vérifications
- [ ] Images : miniatures visibles (80x80px)
- [ ] Vidéos : icône play centrée (160x128px)
- [ ] Audios : mini-lecteur avec countdown (160x80px)
- [ ] Documents : icône + extension (80x80px)
- [ ] Pas de clipping vertical (cartes complètes)
- [ ] Espacement cohérent entre les cartes (gap-3)

**Résultat attendu** : ✅ Tous les types affichés correctement

---

## TEST 4 : Enregistrement Audio

### Étapes
1. Cliquer sur le bouton microphone
2. Attendre 3-5 secondes (enregistrement en cours)
3. Cliquer sur STOP
4. La carte AudioRecorderCard apparaît dans le carrousel

### Vérifications
- [ ] AudioRecorderCard visible (160x80px)
- [ ] Bouton play/pause fonctionne
- [ ] Countdown affiché
- [ ] Waveform animée
- [ ] Pas de clipping vertical
- [ ] Scroll horizontal fonctionne si d'autres fichiers présents

**Résultat attendu** : ✅ AudioRecorderCard intégrée dans le scroll

---

## TEST 5 : Responsive Design

### Desktop (1920px)
1. Ouvrir en plein écran
2. Ajouter 10 fichiers
3. Vérifier le scroll

**Vérifications** :
- [ ] Scrollbar visible (8px de hauteur)
- [ ] Hover sur scrollbar change la couleur
- [ ] Scroll fluide

### Tablet (768px)
1. Réduire la fenêtre à 768px (ou DevTools responsive)
2. Ajouter 10 fichiers
3. Vérifier le scroll

**Vérifications** :
- [ ] Carrousel adapté à la largeur
- [ ] Scroll fonctionne
- [ ] Touch simulation fonctionne (DevTools)

### Mobile (375px)
1. Réduire à 375px (ou simulateur mobile)
2. Ajouter 10 fichiers
3. Vérifier le scroll

**Vérifications** :
- [ ] Carrousel adapté
- [ ] Touch scroll fluide (swipe horizontal)
- [ ] Momentum scrolling actif (inertie)

**Résultat attendu** : ✅ Fonctionne sur tous les breakpoints

---

## TEST 6 : Accessibilité Clavier

### Étapes
1. Ajouter 10 fichiers
2. Appuyer sur `Tab` jusqu'à atteindre le carrousel
3. Vérifier le focus visible (outline bleu)
4. Utiliser les flèches clavier :
   - `ArrowRight` : scroll vers la droite
   - `ArrowLeft` : scroll vers la gauche
   - `Home` : début de la liste
   - `End` : fin de la liste

### Vérifications
- [ ] Focus visible (outline bleu 2px)
- [ ] Flèches clavier scrollent le conteneur
- [ ] `Home` scroll au début
- [ ] `End` scroll à la fin

**Résultat attendu** : ✅ Navigation clavier complète

---

## TEST 7 : Screen Readers

### VoiceOver (macOS)
1. Activer VoiceOver : `Cmd + F5`
2. Naviguer avec `Tab` jusqu'au carrousel
3. Écouter les annonces

**Annonces attendues** :
```
"Attachments carousel, region"
"Attached files, list, 10 items"
"photo.jpg, list item 1 of 10, image, 1.2 MB"
```

### NVDA (Windows)
1. Activer NVDA : `Ctrl + Alt + N`
2. Naviguer avec `Tab` jusqu'au carrousel
3. Écouter les annonces

### Vérifications
- [ ] Région annoncée : "Attachments carousel"
- [ ] Liste annoncée : "X items"
- [ ] Chaque fichier annoncé avec détails (nom, type, taille)

**Résultat attendu** : ✅ ARIA labels fonctionnels

---

## TEST 8 : Dark Mode

### Étapes
1. Activer le dark mode (settings de l'app)
2. Ajouter 10 fichiers
3. Inspecter la scrollbar

### Vérifications
- [ ] Scrollbar track : couleur gris foncé (#374151)
- [ ] Scrollbar thumb : couleur gris moyen (#6b7280)
- [ ] Hover : couleur gris clair (#9ca3af)
- [ ] Contraste suffisant pour la visibilité

**Résultat attendu** : ✅ Scrollbar adaptée au dark mode

---

## TEST 9 : Performance (Stress Test)

### Étapes
1. Ouvrir DevTools → Performance tab
2. Démarrer l'enregistrement
3. Ajouter 50 images (stress test)
4. Scroller rapidement de gauche à droite
5. Arrêter l'enregistrement

### Vérifications
- [ ] FPS constant à ~60fps pendant le scroll
- [ ] Pas de frame drops importants (< 30fps)
- [ ] Génération de thumbnails asynchrone (pas de freeze)
- [ ] Scroll reste fluide même avec 50 items

**Résultat attendu** : ✅ Performance maintenue même en stress test

---

## TEST 10 : Cross-Browser

### Chrome/Edge (Webkit)
- [ ] Scrollbar personnalisée visible (8px, gris clair)
- [ ] Hover change la couleur
- [ ] Scroll fluide

### Firefox
- [ ] Scrollbar fine (`scrollbarWidth: thin`)
- [ ] Couleurs personnalisées (`scrollbarColor`)
- [ ] Scroll fluide

### Safari Desktop
- [ ] Scrollbar Webkit personnalisée
- [ ] Scroll fluide
- [ ] Momentum scrolling

### Safari iOS
- [ ] Touch scroll fluide
- [ ] Momentum scrolling (inertie)
- [ ] Edge bouncing (effet élastique)

**Résultat attendu** : ✅ Fonctionne sur tous les navigateurs

---

## CHECKLIST GLOBALE

### Fonctionnel
- [ ] Scroll horizontal fonctionne avec la molette
- [ ] Scroll horizontal fonctionne avec la scrollbar
- [ ] Scroll horizontal fonctionne avec touch (mobile)
- [ ] Largeur du carrousel reste fixe (= largeur textarea)
- [ ] Tous les fichiers sont accessibles via scroll
- [ ] Pas de clipping vertical des cartes

### Visuel
- [ ] Scrollbar visible et stylée (8px)
- [ ] Espacement cohérent entre les cartes (gap-3)
- [ ] Miniatures d'images chargent correctement
- [ ] Lecteurs audio/vidéo fonctionnent
- [ ] Dark mode adapte la scrollbar

### Accessibilité
- [ ] Navigation clavier fonctionne (Tab, Arrows, Home, End)
- [ ] Focus visible (outline bleu)
- [ ] ARIA labels corrects (region, list, listitem)
- [ ] Screen readers annoncent correctement

### Performance
- [ ] Scroll à 60fps
- [ ] Génération thumbnails asynchrone (pas de freeze)
- [ ] Touch scroll fluide avec momentum
- [ ] Fonctionne avec 50+ fichiers

### Cross-Browser
- [ ] Chrome : scrollbar Webkit personnalisée
- [ ] Firefox : scrollbar CSS standards
- [ ] Safari Desktop : scrollbar Webkit
- [ ] Safari iOS : touch scroll optimisé

---

## TESTS DE NON-RÉGRESSION

### Message Composer Général
- [ ] Textarea reste fonctionnel
- [ ] Bouton d'envoi fonctionne
- [ ] Sélecteur de langue fonctionne
- [ ] Citation de message (reply) s'affiche correctement
- [ ] Drag & drop de fichiers fonctionne

### Intégration Carrousel
- [ ] Carrousel s'affiche SEULEMENT si fichiers présents
- [ ] Suppression d'un fichier met à jour le carrousel
- [ ] Clear attachments après envoi fonctionne
- [ ] Upload progressif affiche la progression

---

## BUGS À SURVEILLER

### Cas Limites

1. **Aucun fichier** :
   - [ ] Carrousel caché (pas d'espace vide)

2. **1 seul fichier** :
   - [ ] Pas de scrollbar (pas nécessaire)
   - [ ] Fichier centré verticalement

3. **Fichier très large (vidéo 160x128)** :
   - [ ] Pas de clipping vertical
   - [ ] Carrousel s'ajuste en hauteur

4. **Mix audio recorder + fichiers** :
   - [ ] Audio recorder visible dans le scroll
   - [ ] Ordre correct (recorder puis fichiers)

5. **Upload pendant le scroll** :
   - [ ] Position du scroll préservée
   - [ ] Nouveaux fichiers ajoutés à droite

---

## VALIDATION FINALE

Si TOUS les tests passent :
✅ **FIX VALIDÉ** - Le scroll horizontal fonctionne de manière robuste

Si certains tests échouent :
❌ **FIX PARTIEL** - Identifier les cas d'échec et corriger

---

## COMMANDES UTILES

### DevTools Console

```javascript
// Mesurer les dimensions du carrousel
const carousel = document.querySelector('[role="list"]');
console.log({
  offsetWidth: carousel.offsetWidth,
  scrollWidth: carousel.scrollWidth,
  clientWidth: carousel.clientWidth,
  isScrollable: carousel.scrollWidth > carousel.offsetWidth
});

// Mesurer la largeur du textarea
const textarea = document.querySelector('textarea');
console.log('Textarea:', textarea.offsetWidth);

// Vérifier le match
console.log('Match:', carousel.offsetWidth === textarea.offsetWidth);

// Scroller programmatiquement
carousel.scrollTo({ left: 500, behavior: 'smooth' });

// Vérifier les attributs ARIA
console.log({
  role: carousel.getAttribute('role'),
  label: carousel.getAttribute('aria-label'),
  tabIndex: carousel.getAttribute('tabIndex')
});
```

### DevTools Performance

```javascript
// Mesurer FPS pendant le scroll
performance.mark('scroll-start');
carousel.addEventListener('scroll', () => {
  performance.mark('scroll-end');
  performance.measure('scroll-duration', 'scroll-start', 'scroll-end');
  console.log(performance.getEntriesByType('measure'));
});
```

---

## RAPPORT DE TEST

Date : ___________
Testeur : ___________

| Test | Statut | Notes |
|------|--------|-------|
| Scroll horizontal | ⬜ Pass / ⬜ Fail | |
| Largeur fixe | ⬜ Pass / ⬜ Fail | |
| Types mixtes | ⬜ Pass / ⬜ Fail | |
| Audio recorder | ⬜ Pass / ⬜ Fail | |
| Responsive | ⬜ Pass / ⬜ Fail | |
| Clavier | ⬜ Pass / ⬜ Fail | |
| Screen readers | ⬜ Pass / ⬜ Fail | |
| Dark mode | ⬜ Pass / ⬜ Fail | |
| Performance | ⬜ Pass / ⬜ Fail | |
| Cross-browser | ⬜ Pass / ⬜ Fail | |

**Résultat Global** : ⬜ PASS / ⬜ FAIL

**Commentaires** :
______________________________________
______________________________________
______________________________________

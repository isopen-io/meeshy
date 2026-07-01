# Analyse UI/UX — Itération 99i (2026-07-01) — iOS

## Composant audité
`apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift` — menu contextuel de message
(long-press) : preview de la bulle, barre d'actions rapides, barre d'emojis, players audio/vidéo
interactifs, panneau détail (`MessageDetailSheet`). Surface d'interaction critique, très utilisée.

## Contexte
Piste iOS indépendante (suffixe `i`). Poursuite du sweep Dynamic Type (55i → 98i). Contention
multi-agents forte ce run : la plupart des écrans « faciles » sont déjà en PR (92i→98i).
`MessageOverlayMenu` était **le plus gros composant non traité restant sans collision** (21 sites
`.font(.system(size:))`, 0 `relative`) et figure explicitement dans les priorités différées.

## Constats

### Typographie non-scalable (21 sites)
Aucun texte du menu contextuel ne suivait le réglage Dynamic Type :
- **Preview** : nom expéditeur, séparateur, date, corps du message texte, nom/taille de fichier.
- **Player audio** : nom, minutage, vitesse, pourcentage, glyphes de transport ±5s.
- **Player vidéo** : pourcentage, minutage, vitesse, glyphes de transport, play/pause des contrôles.

### Glyphes dans conteneurs de taille fixe (3 sites)
`doc.fill` (badge 36×36), play/pause audio (cercle 40×40), play vidéo (cercle 52×52) : un glyphe
scalable déborderait de son conteneur fixe.

## Corrections appliquées
- **18/21** `.font(.system(size:))` → `MeeshyFont.relative(size, weight:, design:)`
  (weight + design `.monospaced` préservés ; `.monospacedDigit()` chaînés conservés).
- **3 sites gardés FIXES & commentés** (glyphes dans cercles/badges de taille fixe) :
  `doc.fill` (décoratif → `.accessibilityHidden(true)` ajouté), play/pause audio et play vidéo
  (portés par des `Button` déjà labellisés VoiceOver → labels conservés, pas de double-lecture).

## Invariants respectés
- 1 fichier touché ; **0 changement de logique** (maths de positionnement du cluster inchangées) ;
  **0 clé i18n neuve** (labels a11y déjà présents) ; **0 test neuf** ; layout/palette par défaut
  inchangés ; SDK non touché.
- **Glass adoption** (`.ultraThinMaterial` du panneau) **laissée intacte** — la doctrine réserve
  l'adoption Glass 26 à un lot dédié (`AdaptiveGlassContainer`).

## Gate
CI `ios-tests.yml` (compile Xcode 26.1 + tests simu iOS 18.2). SwiftUI ne compile pas sous Linux
→ CI seule autorité.

## Statut
✅ **SOLDÉ 99i (Dynamic Type)** — `MessageOverlayMenu` : typographie scalable complète. **NE PAS
re-flagger** la typographie de ce composant ni ses 3 glyphes figés (doctrine conteneurs fixes).
⏳ **Reste ouvert** : adoption Glass 26 du panneau (lot dédié futur).

## Prochaines cibles (100i+)
`StoryViewerView+Content` (31) et `ConversationView+Composer` (22) en dernier ;
`OnboardingAnimations` (17), `ConversationListView+Overlays` (15), `ConversationMediaGalleryView` (13).

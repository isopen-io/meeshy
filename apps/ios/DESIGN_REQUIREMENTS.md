# Meeshy iOS V2 - Design Requirements

## Problèmes identifiés (Screenshot)
- Les avatars sont coupés sur le bord gauche
- Les boutons flottants sortent de l'écran
- Les catégories "Tous" sont coupées
- Le contenu ne respecte pas les safe areas

---

## EXIGENCES DE LA VUE PRINCIPALE

### 1. Structure de base
```
┌─────────────────────────────────┐
│  [SafeArea Top]                 │
│  ┌─────┐              ┌─────┐   │
│  │ ◀️  │              │ ⚙️  │   │  <- Boutons flottants (dans safe area)
│  └─────┘              └─────┘   │
│                                 │
│  [Tous] [Archivés]              │  <- Catégories (padding 16px)
│                                 │
│  ┌─────────────────────────┐    │
│  │ 🟣 Alice                │    │  <- Conversation row
│  │    Hey, are you free?   │    │     (padding horizontal 16px)
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │ 🟣 Bob                  │    │
│  │    I sent the mocks!    │    │
│  └─────────────────────────┘    │
│                                 │
│  ... (scrollable)               │
│                                 │
│  ┌─────────────────────────┐    │
│  │ 🔍 Search...            │    │  <- Search bar (padding 16px)
│  └─────────────────────────┘    │
│  [SafeArea Bottom]              │
└─────────────────────────────────┘
```

### 2. Règles de Layout OBLIGATOIRES

#### Safe Areas
- TOUJOURS respecter `safeAreaInsets` sur tous les bords
- Ne JAMAIS utiliser `.ignoresSafeArea()` sur le contenu principal
- Seul le background peut ignorer les safe areas

#### Paddings
- Padding horizontal minimum: **16 points**
- Padding entre éléments: **8-12 points**
- Les éléments ne doivent JAMAIS toucher les bords de l'écran

#### Boutons flottants
- Position: coins supérieurs, DANS la safe area
- Taille: 48x48 points
- Marge des bords: 16 points minimum
- Z-index élevé pour rester au-dessus du contenu

### 3. Composants

#### Conversation Row
```
[Avatar 44px] [12px gap] [Name + Message (flex)] [Time] [Unread dot?]
```
- Avatar: cercle 44x44 avec bordure gradient
- Le texte prend l'espace restant (flexible)
- Padding interne: 12px
- Padding externe horizontal: 16px
- Border radius: 14px

#### Categories Pills
- Padding horizontal: 16px depuis les bords
- Espacement entre pills: 10px
- Scrollable horizontalement

#### Search Bar
- Padding horizontal: 16px depuis les bords
- Padding bottom: respecte safe area + 16px
- Position: fixe en bas

### 4. Contraintes techniques

#### INTERDIT
- `GeometryReader` imbriqués
- `.frame(width: xxx)` avec valeurs fixes sur les conteneurs
- `.ignoresSafeArea()` sur le contenu
- `.offset()` pour positionner le contenu principal

#### OBLIGATOIRE
- Utiliser `VStack` / `HStack` avec `Spacer()`
- Utiliser `.padding()` pour les marges
- Utiliser `.safeAreaInset()` pour les éléments fixes
- Utiliser `ScrollView` pour le contenu défilant

### 5. Navigation

#### Swipe retour (Conversation → Liste)
- Swipe de gauche vers droite
- Seuil: 100 points ou vélocité > 500
- Animation spring

#### Tap sur conversation
- Ouvre la vue conversation
- Animation slide depuis la droite

---

## STRUCTURE DES FICHIERS

```
Views/
├── V2RootView.swift          # Conteneur principal + navigation
├── V2ConversationListView.swift  # Liste des conversations
└── V2ConversationView.swift  # Vue conversation (messages)

Components/
├── ConversationRow.swift     # Row de conversation
├── CategoryPill.swift        # Pill de catégorie
├── SearchBar.swift           # Barre de recherche
├── FloatingButton.swift      # Bouton flottant
└── MessageBubble.swift       # Bulle de message
```

---

## COULEURS

- Background: `#0F0C29` → `#302B63` → `#24243E`
- Primary (Pink): `#FF2E63`
- Secondary (Cyan): `#08D9D6`
- Accent (Purple): `#A855F7`
- Text: White avec opacités (1.0, 0.7, 0.5)
- Cards: White opacity 0.05-0.1

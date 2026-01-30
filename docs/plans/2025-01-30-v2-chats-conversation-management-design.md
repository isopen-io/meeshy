# V2 Chats - Gestion avancée des conversations

**Date** : 30 janvier 2025
**Statut** : Validé
**Scope** : `/v2/chats` - Interface de gestion des conversations

---

## Résumé

Refonte complète de la page chats V2 avec gestion avancée : catégories personnalisables, tags, épinglage, swipe actions bidirectionnelles, drag & drop, indicateurs visuels (typing, draft, photos), et drawer de paramètres.

---

## 1. Structure de la liste des conversations

### 1.1 Layout général

```
┌─────────────────────────────────┐
│ [M] Messages            [+] [⚙] │  ← Header
├─────────────────────────────────┤
│ 🔍 Rechercher...                │  ← Input recherche
├─────────────────────────────────┤
│ ┌─ Carrousel communautés ─────┐ │  ← Apparaît au focus (animé)
│ │ [Com1] [Com2] [Com3] →      │ │     scroll horizontal
│ └─────────────────────────────┘ │     disparaît au blur
├─────────────────────────────────┤
│ 📌 ÉPINGLÉES (2)               │  ← Dynamique si conversations épinglées
├─────────────────────────────────┤
│ 💼 TRAVAIL (3)                 │  ← Catégorie personnalisée
├─────────────────────────────────┤
│ 📁 NON CATÉGORISÉES (5)        │  ← Dynamique si autres catégorisées
└─────────────────────────────────┘
```

### 1.2 Catégories

- **Personnalisables** : L'utilisateur crée ses propres catégories (nom + couleur)
- **Dynamiques** :
  - "Épinglées" : Apparaît automatiquement si conversations épinglées
  - "Non catégorisées" : Apparaît si d'autres conversations sont catégorisées
- **Création à la volée** : Dans le drawer, taper un nom inexistant → bouton "Créer"
- **Suppression** : Icône poubelle à côté de chaque catégorie dans la liste

### 1.3 Carrousel de communautés

- Apparaît au **focus** du champ de recherche
- Position : Juste en dessous du champ de recherche
- Animation : `slideDown 200ms ease-out`
- Scrollable horizontalement
- Disparaît au **blur** du champ de recherche

---

## 2. Conversation item

### 2.1 Structure visuelle

```
┌─────────────────────────────────────────────────────┐
│ [🏷️ Urgent] [🏷️ Client]           ← Tags colorés   │
│ ┌────┐                              au-dessus nom  │
│ │👻  │                                              │
│ │🇯🇵 │  Yuki Tanaka                    10:34  [⋯] │
│ │ 🟢 │  À demain pour la réunion !          [2]   │
│ └────┘  ...                        ← Typing dots   │
└─────────────────────────────────────────────────────┘
```

### 2.2 Indicateurs visuels

| Type | Affichage |
|------|-----------|
| **Typing** | `...` animé (3 points pulsants) sous le dernier message |
| **Draft** | 📝 + aperçu du brouillon, remplace le dernier message |
| **Photo** | 📷 Photo |
| **Multi-fichiers** | 📷 +N fichiers |
| **Anonyme** | Badge 👻 en haut à gauche de l'avatar |
| **En ligne** | Pastille verte en bas à droite de l'avatar |
| **Non lu** | Badge numérique (ex: [2]) |

### 2.3 Swipe actions

**Swipe vers la gauche :**
| Icône | Action |
|-------|--------|
| 📥 | Archiver |
| 🗑️ | Supprimer |
| ✓ | Marquer comme lu |
| 🔇 | Sourdine |

**Swipe vers la droite :**
| Icône | Action |
|-------|--------|
| 📌 | Épingler |
| ⭐ | Marquer important |
| 🏷️ | Ajouter tag |
| 📞 | Appeler |

### 2.4 Long press (Drag & Drop)

- **Long press** : Active le mode drag & drop
- **Cibles** : Headers des catégories visibles uniquement
- **Feedback visuel** : Catégorie cible `scale(1.05)` + highlight
- **Animation** : Spring effect pendant le drag

### 2.5 Icône options [⋯]

- Toujours visible à droite de chaque conversation
- Ouvre un menu avec toutes les options (swipe + extras)
- Permet l'accès rapide sans swipe

---

## 3. Desktop - Resizer

### 3.1 Barre de redimensionnement

```
┌─────────────────────────────────────────────────────────────────┐
│ ◄───── 30% (défaut) ─────►│◄──────── 70% ───────────────────► │
│                           ║                                     │
│   Liste conversations     ║      Conversation ouverte           │
│                           ║                                     │
│                          [║] ← Barre draggable                  │
│                           ║    cursor: ew-resize                │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Contraintes

| Propriété | Valeur |
|-----------|--------|
| **Minimum** | 10% |
| **Maximum** | 50% |
| **Défaut** | 30% |
| **Persistance** | localStorage |

---

## 4. Header de conversation ouverte

```
┌─────────────────────────────────────────────────────────────┐
│ [←]  ┌────┐  Yuki Tanaka              [🔗]  [📞]  [📹]  [⋯] │
│      │👻  │  En ligne • Japonais                            │
│      │🇯🇵🟢│                                                 │
│      └────┘                                                 │
└─────────────────────────────────────────────────────────────┘
```

| Icône | Action |
|-------|--------|
| [←] | Retour (mobile) |
| [🔗] | Créer/partager lien de la conversation |
| [📞] | Appel audio |
| [📹] | Appel vidéo |
| [⋯] | Ouvre le drawer des options |

---

## 5. Drawer des options (slide gauche)

### 5.1 Vue rapide

```
┌──────────────────────────────────┐
│ [✕]     Options conversation     │
├──────────────────────────────────┤
│ 📝 Nom affiché (pour vous)       │
│ [Yuki - Projet Alpha____] ✏️     │
│                                  │
│ 🔔 Notifications                 │
│ [Tous] [Mentions] [●Aucune]      │
│                                  │
│ 🎨 Thème                         │
│ [○🔵][○🟢][●🟠][○🟣][○⚫]        │
│                                  │
├──────────────────────────────────┤
│ ⚙️  Paramètres             [→]  │
│ 👤  Voir le profil         [→]  │
│ 🔍  Rechercher             [→]  │
├──────────────────────────────────┤
│ ─── Catégorie ─────────────────  │
│ [Rechercher ou créer...]         │
│ ○ Travail                   [🗑] │
│ ● Clients ✓                 [🗑] │
│ [+ Créer "Nouveau"]              │
│                                  │
│ ─── Tags ──────────────────────  │
│ [Rechercher ou créer...]         │
│ [🏷️ Urgent ✕] [🏷️ Client ✕]     │
│ ☐ Important                 [🗑] │
│ ☐ À suivre                  [🗑] │
│ [+ Créer "Nouveau tag"]          │
├──────────────────────────────────┤
│ 🚫 Bloquer   ⚠️ Signaler         │
└──────────────────────────────────┘
```

### 5.2 Comportement

- **Slide depuis la gauche** par-dessus la liste des conversations
- **Animation** : `slideInLeft 250ms ease-out`
- **Fermeture** : Clic sur ✕ ou clic en dehors

---

## 6. Paramètres de conversation (vue complète)

### 6.1 Structure

```
┌──────────────────────────────────┐
│ [←]    Paramètres conversation   │
├──────────────────────────────────┤
│ ┌────────────────────────────┐   │
│ │ 🖼️ Bannière (éditable)    │   │
│ │  ┌─────┐                   │   │
│ │  │Avatar│ Titre officiel   │   │
│ │  └─────┘ [______________]  │   │
│ │  Description               │   │
│ │  [____________________]    │   │
│ └────────────────────────────┘   │
│                                  │
│ ─── Type de conversation ──────  │
│ ○ Privée (invitation uniquement) │
│ ○ Générale                       │
│ ○ Publique (visible par tous)    │
│ ○ Broadcast (lecture seule)      │
│                                  │
│ ─── Options ───────────────────  │
│ ☐ Associer à une communauté  [→] │
│ ☐ Autoriser les anonymes         │
│                                  │
│ ─── Participants ──────────────  │
│ 👑 Vous (Admin)                  │
│ 🛡️ Yuki (Modérateur)       [⋯]  │
│ 👤 Carlos                   [⋯]  │
│ [+ Inviter]                      │
│                                  │
│ ─── Statistiques ──────────────  │
│ 📊 1,234 messages                │
│ 🌐 4 langues : 🇫🇷 🇯🇵 🇪🇸 🇬🇧     │
│                                  │
│ ─── Contenus ──────────────────  │
│ 🖼️ Médias partagés (24)     [→] │
│ 🔗 Liens partagés (12)      [→] │
│                                  │
├──────────────────────────────────┤
│ 🗑️ Supprimer la conversation     │
└──────────────────────────────────┘
```

### 6.2 Sections

| Section | Contenu |
|---------|---------|
| **Identité** | Avatar, bannière, titre officiel, description |
| **Type** | Privée, Générale, Publique, Broadcast |
| **Options** | Association communauté, accès anonymes |
| **Participants** | Liste avec rôles (Admin 👑, Modo 🛡️, Membre 👤) |
| **Statistiques** | Nombre de messages, langues utilisées |
| **Contenus** | Médias partagés, liens partagés |

---

## 7. Vue mobile

### 7.1 Navigation

```
┌─────────────────┐      ┌─────────────────┐
│ [M] Messages    │      │ [←] Yuki    [⋯] │
│ 🔍 Rechercher   │      ├─────────────────┤
├─────────────────┤  →   │                 │
│ 📌 ÉPINGLÉES    │ tap  │   Messages...   │
│ │ Yuki...       │      │                 │
│ │ Carlos...     │      ├─────────────────┤
│ 💼 TRAVAIL      │  ←   │ [+] [____] [➤] │
│ │ ...           │ back │                 │
└─────────────────┘      └─────────────────┘
```

### 7.2 Comportement

- **Liste** : Plein écran par défaut
- **Conversation** : Plein écran avec bouton retour [←]
- **Swipe** : Fonctionne normalement sur mobile
- **Drawer** : Slide depuis la gauche, plein écran

---

## 8. Animations

| Élément | Animation |
|---------|-----------|
| Carrousel communautés | `slideDown 200ms ease-out` |
| Drawer | `slideInLeft 250ms ease-out` |
| Swipe actions | Révélation progressive avec `spring` |
| Drag & drop target | `scale(1.05)` + highlight |
| Typing indicator | 3 points avec `pulse` décalé |

---

## 9. Composants à créer

| Composant | Description |
|-----------|-------------|
| `ConversationList` | Liste avec catégories et drag & drop |
| `ConversationItem` | Item avec swipe bidirectionnel |
| `SwipeableRow` | Wrapper pour swipe actions |
| `CategoryHeader` | Header de catégorie (drop zone) |
| `CommunityCarousel` | Carrousel horizontal animé |
| `ConversationDrawer` | Drawer options (slide gauche) |
| `ConversationSettings` | Page paramètres complète |
| `TagInput` | Input avec création à la volée |
| `Resizer` | Barre de redimensionnement desktop |
| `TypingIndicator` | Animation "..." |
| `GhostBadge` | Badge anonyme 👻 |

---

## 10. Data model (types)

```typescript
interface Conversation {
  id: string;
  name: string;
  customName?: string; // Nom personnalisé par l'utilisateur
  avatar?: string;
  banner?: string;
  description?: string;

  // État
  isPinned: boolean;
  isArchived: boolean;
  isImportant: boolean;
  isMuted: boolean;

  // Catégorie et tags
  categoryId?: string;
  tags: Tag[];

  // Type
  type: 'private' | 'general' | 'public' | 'broadcast';
  allowAnonymous: boolean;
  communityId?: string;

  // Participants
  participants: Participant[];

  // Dernier message
  lastMessage: {
    content: string;
    type: 'text' | 'photo' | 'file' | 'voice';
    attachmentCount?: number;
    timestamp: Date;
    senderId: string;
  };

  // Indicateurs
  unreadCount: number;
  draft?: string;
  typingUsers: string[];

  // Stats
  messageCount: number;
  languages: string[];
  mediaCount: number;
  linkCount: number;
}

interface Category {
  id: string;
  name: string;
  color: string;
  order: number;
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Participant {
  id: string;
  name: string;
  avatar?: string;
  languageCode: string;
  isOnline: boolean;
  isAnonymous: boolean;
  role: 'admin' | 'moderator' | 'member';
}
```

---

## 11. Prochaines étapes

1. Créer les nouveaux composants V2
2. Implémenter le `SwipeableRow` avec actions bidirectionnelles
3. Implémenter le `Resizer` pour desktop
4. Créer le `ConversationDrawer` et `ConversationSettings`
5. Ajouter le drag & drop entre catégories
6. Implémenter le carrousel de communautés
7. Tester sur mobile et desktop

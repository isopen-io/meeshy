# ConversationHeader Architecture

Cette refactorisation divise un composant de 906 lignes en une architecture modulaire de ~200 lignes pour le composant principal.

## Structure

```
header/
├── types.ts                      # Types TypeScript partagés
├── index.ts                      # Exports publics
│
├── Composants UI
├── HeaderActions.tsx             # Menu dropdown des actions
├── HeaderAvatar.tsx              # Avatar avec badges (encryption, status)
├── HeaderTagsBar.tsx             # Barre de tags et catégories
├── HeaderToolbar.tsx             # Barre d'outils (vidéo, participants, menu)
├── ParticipantsDisplay.tsx       # Affichage participants/typing
├── TypingIndicator.tsx           # Indicateur de frappe
│
└── Hooks personnalisés
    ├── use-header-preferences.ts # Gestion des préférences (pin, mute, archive)
    ├── use-participant-info.ts   # Infos participants (nom, avatar, statut)
    ├── use-header-actions.ts     # Actions (upload image, partage)
    ├── use-call-banner.ts        # Gestion du banner d'appel
    ├── use-encryption-info.ts    # Infos de chiffrement
    └── use-permissions.ts        # Permissions utilisateur
```

## Principe de responsabilité unique

### Composants

**HeaderActions** - Menu dropdown
- Affiche les actions : détails, galerie, paramètres
- Gère pin/mute/archive
- Action de partage

**HeaderAvatar** - Avatar avec badges
- Avatar pour conversations directes/groupes
- Badge de statut en ligne
- Badge de chiffrement
- Upload d'image (si permissions)

**HeaderTagsBar** - Bande de tags
- Affiche catégorie
- Affiche tags avec couleurs

**HeaderToolbar** - Barre d'outils
- Bouton d'appel vidéo
- Drawer des participants
- Bouton de création de lien
- Menu des actions

**ParticipantsDisplay** - Affichage participants
- Liste de participants pour groupes
- Indicateur de frappe pour conversations directes

**TypingIndicator** - Indicateur simple
- Animation de frappe
- Nom de l'utilisateur

### Hooks

**useHeaderPreferences**
- Charge les préférences (pin, mute, archive, tags, catégorie)
- Actions toggle avec optimistic UI
- Gère les utilisateurs anonymes

**useParticipantInfo**
- Nom de la conversation
- Avatar et URL
- Statut en ligne (avec store global)
- Détection utilisateurs anonymes
- Rôle de l'utilisateur

**useHeaderActions**
- Upload d'image de conversation
- Partage de conversation
- Gestion des modales (settings, upload)

**useCallBanner**
- Détection d'appel en cours
- Calcul de durée
- Actions join/dismiss

**useEncryptionInfo**
- Retourne icône et couleurs selon le mode
- Labels de chiffrement

**usePermissions**
- Vérifie si l'utilisateur peut utiliser les appels vidéo
- Vérifie si l'utilisateur peut modifier l'image

## Props API identique

Le composant `ConversationHeader` expose exactement la même API que l'original :

```typescript
interface ConversationHeaderProps {
  conversation: Conversation;
  currentUser: User;
  conversationParticipants: ThreadMember[];
  typingUsers: Array<...>;
  isMobile: boolean;
  onBackToList: () => void;
  onOpenDetails: () => void;
  onParticipantRemoved: (userId: string) => void;
  onParticipantAdded: (userId: string) => void;
  onLinkCreated: (link: any) => void;
  onStartCall?: () => void;
  onOpenGallery?: () => void;
  t: (key: string) => string;
  showBackButton?: boolean;
}
```

## Optimisations

1. **React.memo** sur tous les sous-composants pour éviter les re-renders inutiles
2. **useCallback** dans les hooks pour stabiliser les fonctions
3. **Extraction de la logique métier** dans les hooks
4. **Séparation des responsabilités** entre UI et logique
5. **Types centralisés** pour faciliter la maintenance

## Métriques

- **Avant** : 906 lignes dans un seul fichier
- **Après** : 203 lignes dans le composant principal
- **Réduction** : ~78% du fichier principal
- **Maintenabilité** : Chaque composant/hook a une responsabilité unique

## Migration

Aucune modification requise dans les fichiers parents. Le composant expose la même interface publique.

```typescript
// Import identique
import { ConversationHeader } from '@/components/conversations/ConversationHeader';

// Usage identique
<ConversationHeader
  conversation={conversation}
  currentUser={currentUser}
  // ... autres props
/>
```

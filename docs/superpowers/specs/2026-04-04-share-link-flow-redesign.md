# Share Link Flow Redesign — iOS

## Objectif

Refondre le flux de creation et partage de lien d'invitation iOS pour offrir un apercu editable avant partage, avec feedback clair et ShareSheet en fin de flux.

## Problemes actuels

1. **Menu contextuel** : "Partager" cree un lien + ouvre le ShareSheet sans apercu ni feedback — l'utilisateur ne sait pas ce qui a ete cree
2. **CreateShareLinkView** : apres creation → `dismiss()` silencieux, aucun retour visuel, pas de ShareSheet
3. **Menu contextuel** : "Envoyer un message" apparait sur les conversations non-direct — redondant (tapper ouvre deja la conversation)
4. **Pas de flux intermediaire** entre "creation invisible" et "formulaire complet"

## Design

### 1. Menu contextuel — Modifications

**Fichier** : `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift`

**Modifier le bouton "Partager"** existant (ligne 65-73) :
- Renommer le label de "Partager" → "Inviter mes amis"
- Changer l'icone de `square.and.arrow.up` → `person.badge.plus`
- Au lieu d'appeler `shareConversationLink()` directement (qui cree + ShareSheet silencieusement), ouvrir le nouveau sheet `InviteFriendsSheet`

**Note** : l'entree "Envoyer un message" n'existe pas dans le menu contextuel actuel — pas de suppression necessaire.

### 2. InviteFriendsSheet — Nouveau composant (coeur du flux)

**Fichier** : `apps/ios/Meeshy/Features/Main/Components/InviteFriendsSheet.swift`

Sheet `.medium` → `.large` avec deux phases.

#### Phase 1 — Apercu du lien (etat initial, detent `.medium`)

A l'ouverture, le lien est cree automatiquement en background avec les valeurs par defaut. L'utilisateur voit :

```
┌─────────────────────────────────┐
│  [icone link]  Invitation       │  ← header
│                                 │
│  ┌───────────────────────────┐  │
│  │ 🗣️ Nom Conversation       │  │  ← card preview
│  │ "Rejoins moi pour..."     │  │  ← message editable (tap → edit)
│  │ 12 membres · Groupe       │  │
│  │ meeshy.me/join/xxxxx      │  │  ← URL copiable (tap → copie)
│  └───────────────────────────┘  │
│                                 │
│  Options: Jamais · Messages ✓   │  ← resume options (tap → Phase 2)
│                                 │
│  [========= Partager =========] │  ← bouton principal → ShareSheet
│  Personnaliser les options ▾    │  ← lien texte → expand Phase 2
└─────────────────────────────────┘
```

**Valeurs par defaut** (identiques a `shareConversationLink()` actuel) :
- Nom : "Rejoins la conversation \"{nom}\""
- Description/message : "Rejoins moi pour echanger sans filtre ni barriere..."
- Expiration : jamais
- Permissions : messages ✓, images ✓, fichiers ✗, historique ✓
- Exigences : pseudo requis, compte/email/naissance non requis

**Card preview** :
- Nom de la conversation (non editable ici)
- Message d'invitation : texte editable — tap ouvre un TextField inline
- Nombre de membres + type de conversation
- URL du lien : tap copie dans le clipboard avec feedback "Copie !" haptic

**Resume options** : une ligne compacte montrant expiration + permissions actives. Tap ouvre Phase 2.

**Bouton "Partager"** : cree le lien (si pas encore cree) puis ouvre `UIActivityViewController` avec l'URL.

#### Phase 2 — Options editables (expand vers `.large`)

Tap sur "Personnaliser les options" ou sur le resume → le sheet grandit en `.large` et affiche :

```
┌─────────────────────────────────┐
│  [card preview toujours visible]│  ← se met a jour en temps reel
│                                 │
│  ── IDENTITE ──                 │
│  Nom du lien    [TextField]     │
│  Message        [TextField]     │
│                                 │
│  ── LIMITES ──                  │
│  Expiration     [Picker]        │
│  Max utilisations [Toggle+Step] │
│                                 │
│  ── PERMISSIONS ──              │
│  Messages       [Toggle] ✓      │
│  Images         [Toggle] ✓      │
│  Fichiers       [Toggle] ✗      │
│  Historique     [Toggle] ✓      │
│                                 │
│  ── ACCES ──                    │
│  Compte requis  [Toggle] ✗      │
│  Pseudo requis  [Toggle] ✓      │
│  Email requis   [Toggle] ✗      │
│                                 │
│  [========= Partager =========] │
└─────────────────────────────────┘
```

Les champs reprennent les memes controles que `CreateShareLinkView` actuel mais dans un layout plus compact.

Si le lien a deja ete cree (Phase 1), et que l'utilisateur modifie des options, un nouveau lien est cree avec les nouvelles options au tap "Partager" (les liens sont immutables cote API — on ne peut pas les modifier apres creation).

#### Gestion d'etat

- `@State var linkCreated: CreatedShareLink?` — nil jusqu'a la creation
- `@State var isCreating: Bool` — spinner pendant la creation
- `@State var showOptions: Bool` — toggle Phase 1/Phase 2
- `@State var optionsModified: Bool` — true si l'utilisateur a change quelque chose apres la creation initiale (force re-creation)
- Tous les champs editables en `@State` avec valeurs par defaut
- La card preview est un computed property qui reflete les valeurs courantes

#### Lifecycle

1. Sheet s'ouvre → Phase 1 affichee → lien cree en background (Task)
2. Lien cree → URL affichee, bouton "Partager" actif
3. Utilisateur peut :
   a. Tap "Partager" → ShareSheet avec URL → dismiss apres partage
   b. Tap URL → copie clipboard + feedback
   c. Tap "Personnaliser" → Phase 2 (expand)
   d. Modifier message → marque `optionsModified = true`
4. En Phase 2, modifier options → `optionsModified = true`
5. Tap "Partager" en Phase 2 :
   - Si `optionsModified` → cree un nouveau lien avec nouvelles options → ShareSheet
   - Sinon → ShareSheet avec lien existant

### 3. Integration dans ConversationListView

**Fichier** : `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`

- Ajouter `@State private var inviteSheetConversation: Conversation? = nil`
- Le menu contextuel set cette variable au lieu d'appeler `shareConversationLink()`
- `.sheet(item: $inviteSheetConversation)` presente `InviteFriendsSheet`

### 4. Vue globale "Mes liens" — Verification

**Fichiers** : `ShareLinksView.swift`, `ShareLinkDetailView.swift`

Verifier que :
- La liste charge correctement (cache-first pattern deja en place dans le ViewModel)
- La recherche filtre par nom/conversation (ajouter si absente)
- Les actions inline fonctionnent (copier, partager, toggle actif/inactif)
- La navigation vers le detail fonctionne
- Le detail permet copier/partager/desactiver/supprimer

## Fichiers concernes

| Fichier | Action |
|---------|--------|
| `apps/ios/Meeshy/Features/Main/Components/InviteFriendsSheet.swift` | Creer |
| `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift:65-73` | Modifier — renommer "Partager" → "Inviter mes amis", ouvrir sheet |
| `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift` | Modifier — ajouter state + sheet binding pour InviteFriendsSheet |
| `apps/ios/Meeshy/Features/Main/Views/ShareLinksView.swift` | Verifier/enrichir — ajouter recherche si absente |
| `apps/ios/Meeshy/Features/Main/Views/CreateShareLinkView.swift` | Conserver — reste accessible depuis ShareLinksView pour creation globale |

## Hors scope

- Modification de liens existants (API immutable)
- Deep link handling pour /join/ URLs
- Tracking links
- Liens communaute

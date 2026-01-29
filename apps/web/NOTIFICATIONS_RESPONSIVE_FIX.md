# Fix Responsive - Page Notifications

## Problèmes identifiés et résolus

### 1. ✅ Filtres non responsive
**Problème** : Les labels de filtres étaient trop longs sur mobile, causant un débordement horizontal.

**Solution** :
- Ajout de la propriété `labelShort` à chaque filtre
- Affichage conditionnel :
  - Desktop (≥640px) : Labels complets ("Messages", "Conversations", etc.)
  - Mobile (<640px) : Labels courts ("Msg", "@", "Conv", "📞", "Amis")
- Réduction du padding horizontal sur mobile : `px-3` → `px-4` (responsive)

**Code modifié** (`page.tsx:285-310`) :
```tsx
<span className="hidden sm:inline">{filter.label}</span>
<span className="sm:hidden">{filter.labelShort || filter.label}</span>
```

---

### 2. ✅ Bouton "Marquer tout comme lu" déborde sur mobile
**Problème** : Le texte complet du bouton débordait sur les petits écrans.

**Solution** :
- Affichage conditionnel du texte :
  - Desktop : Icône + texte "Marquer tout comme lu"
  - Mobile : Icône uniquement (Check ✓)
- Ajustement de la marge de l'icône : `mr-2` → `sm:mr-2`

**Code modifié** (`page.tsx:242-252`) :
```tsx
<Button ...>
  <Check className="h-4 w-4 sm:mr-2" />
  <span className="hidden sm:inline">{t('markAllRead')}</span>
</Button>
```

---

### 3. ✅ Impossible de filtrer les notifications "mention"
**Problème** : Le type de filtre "mention" n'existait pas dans la liste.

**Solution** :
- Ajout du type `'mention'` à l'union `FilterType`
- Ajout du filtre mention dans la liste avec icône MessageSquare
- Logique de filtrage pour les types `'user_mentioned'` et `'mention'`
- Ajout du compteur de mentions dans `filterCounts`

**Code modifié** (`page.tsx:26, 55, 70, 95`) :
```tsx
type FilterType = 'all' | 'new_message' | 'conversation' | 'missed_call' | 'friend_request' | 'mention';

// Filtre
{ value: 'mention', label: t('filters.mentions'), labelShort: t('filters.mentionsShort'), icon: MessageSquare }

// Logique
(activeFilter === 'mention' && (n.type === 'user_mentioned' || n.type === 'mention'))
```

---

### 4. ✅ Pas de distinction visuelle entre notifications lues/non lues
**Problème** : Les notifications lues et non lues se ressemblaient trop.

**Solution** :
- Ajout d'opacité différenciée :
  - Non lues : `opacity-100` (pleine opacité) + fond bleu
  - Lues : `opacity-75` (75% d'opacité) + fond blanc
- Conservation du point bleu pulsant pour les notifications non lues
- Conservation du fond de couleur différent (bleu vs blanc)

**Code modifié** (`page.tsx:344-349`) :
```tsx
className={cn(
  "...",
  !notification.state.isRead
    ? "bg-blue-50/80 ... opacity-100"
    : "bg-white/60 ... opacity-75"
)}
```

---

## Traductions ajoutées

### Français (`locales/fr/notifications.json`)
```json
{
  "filters": {
    "messagesShort": "Msg",
    "mentions": "Mentions",
    "mentionsShort": "@",
    "conversationsShort": "Conv",
    "callsShort": "📞",
    "friendRequestsShort": "Amis"
  }
}
```

### Anglais (`locales/en/notifications.json`)
```json
{
  "empty": {
    "title": "No notifications",
    "description": "You have no notifications at the moment",
    "tryDifferentSearch": "Try a different search"
  },
  "noResults": "No notifications found",
  "search": "Search notifications...",
  "filters": {
    "messagesShort": "Msg",
    "mentions": "Mentions",
    "mentionsShort": "@",
    "conversationsShort": "Conv",
    "callsShort": "📞",
    "friendRequestsShort": "Friends"
  },
  "conversationTypes": {
    "private": "Private",
    "direct": "Private",
    "group": "Group"
  },
  "timeAgo": {
    "now": "just now",
    "minute": "{count} min ago",
    "hour": "{count}h ago",
    "day": "{count}d ago"
  },
  "actions": {
    "clearSearch": "Clear search"
  }
}
```

### Espagnol (`locales/es/notifications.json`)
```json
{
  "filters": {
    "messagesShort": "Msg",
    "mentions": "Menciones",
    "mentionsShort": "@",
    "conversationsShort": "Conv",
    "callsShort": "📞",
    "friendRequestsShort": "Amigos"
  },
  "conversationTypes": {
    "private": "Privado",
    "direct": "Privado",
    "group": "Grupo"
  },
  "timeAgo": {
    "now": "ahora mismo",
    "minute": "hace {count} min",
    "hour": "hace {count}h",
    "day": "hace {count}d"
  }
}
```

### Portugais (`locales/pt/notifications.json`)
```json
{
  "filters": {
    "messagesShort": "Msg",
    "mentions": "Menções",
    "mentionsShort": "@",
    "conversationsShort": "Conv",
    "callsShort": "📞",
    "friendRequestsShort": "Amigos"
  },
  "conversationTypes": {
    "private": "Privado",
    "direct": "Privado",
    "group": "Grupo"
  },
  "timeAgo": {
    "now": "agora mesmo",
    "minute": "há {count} min",
    "hour": "há {count}h",
    "day": "há {count}d"
  }
}
```

---

## Fichiers modifiés

1. **apps/web/app/notifications/page.tsx**
   - Ajout du type `'mention'` aux filtres
   - Labels responsive (court/long selon écran)
   - Bouton "Marquer tout" responsive
   - Distinction visuelle améliorée (opacity)

2. **apps/web/locales/fr/notifications.json**
   - Ajout des labels courts pour filtres
   - Déjà complet depuis la version précédente

3. **apps/web/locales/en/notifications.json**
   - Ajout des labels courts
   - Ajout de empty.{title,description,tryDifferentSearch}
   - Ajout de conversationTypes
   - Ajout de timeAgo
   - Ajout de actions.clearSearch

4. **apps/web/locales/es/notifications.json**
   - Ajout des labels courts
   - Ajout de empty.{title,description,tryDifferentSearch}
   - Ajout de conversationTypes
   - Ajout de timeAgo
   - Ajout de actions.clearSearch

5. **apps/web/locales/pt/notifications.json**
   - Ajout des labels courts
   - Ajout de empty.{title,description,tryDifferentSearch}
   - Ajout de conversationTypes
   - Ajout de timeAgo
   - Ajout de actions.clearSearch

---

## Tests à effectuer

### Test 1 : Responsive des filtres
1. Ouvrir `/notifications` sur desktop
   - ✓ Vérifier que les labels complets sont affichés ("Messages", "Conversations", etc.)
2. Réduire la fenêtre < 640px (mobile)
   - ✓ Vérifier que les labels courts s'affichent ("Msg", "@", "Conv", "📞", "Amis")
3. Vérifier le défilement horizontal fluide des filtres

### Test 2 : Bouton "Marquer tout comme lu"
1. Sur desktop :
   - ✓ Vérifier que le texte complet s'affiche : "✓ Marquer tout comme lu"
2. Sur mobile :
   - ✓ Vérifier que seule l'icône s'affiche : "✓"
   - ✓ Vérifier qu'il n'y a pas de débordement

### Test 3 : Filtre mention
1. Créer des notifications avec mentions (`user_mentioned` ou `mention`)
2. Cliquer sur le filtre "Mentions" (ou "@" sur mobile)
   - ✓ Vérifier que seules les mentions s'affichent
   - ✓ Vérifier que le compteur affiche le bon nombre

### Test 4 : Distinction visuelle lues/non lues
1. Notifications non lues :
   - ✓ Fond bleu (`bg-blue-50/80`)
   - ✓ Opacité 100%
   - ✓ Point bleu pulsant visible
2. Notifications lues :
   - ✓ Fond blanc (`bg-white/60`)
   - ✓ Opacité 75% (plus pâle)
   - ✓ Pas de point bleu
3. Cliquer sur "Marquer comme lu" :
   - ✓ Vérifier que la notification devient plus pâle immédiatement

### Test 5 : Multi-langues
1. Tester en français (déjà fait)
2. Changer la langue en anglais :
   - ✓ Vérifier les labels courts : "Msg", "@", "Conv", "📞", "Friends"
3. Changer en espagnol :
   - ✓ Vérifier les labels courts : "Msg", "@", "Conv", "📞", "Amigos"
4. Changer en portugais :
   - ✓ Vérifier les labels courts : "Msg", "@", "Conv", "📞", "Amigos"

---

## Breakpoints utilisés

| Breakpoint | Taille | Comportement |
|------------|--------|--------------|
| Mobile | < 640px | Labels courts, icône seule pour "Marquer tout" |
| Desktop | ≥ 640px | Labels complets, texte complet pour "Marquer tout" |

---

## Classes Tailwind utilisées

### Responsive display
- `hidden sm:inline` : Masqué sur mobile, visible sur desktop
- `sm:hidden` : Visible sur mobile, masqué sur desktop

### Responsive spacing
- `px-3 sm:px-4` : padding horizontal 12px mobile, 16px desktop
- `sm:mr-2` : pas de marge droite sur mobile, 8px sur desktop

### Opacity
- `opacity-100` : Notifications non lues (pleine opacité)
- `opacity-75` : Notifications lues (75% opacité)

---

## Impact

- ✅ **Page notifications entièrement responsive** mobile et desktop
- ✅ **Filtres optimisés** pour petits écrans
- ✅ **Bouton "Marquer tout"** ne déborde plus sur mobile
- ✅ **Filtre "mention"** fonctionnel
- ✅ **Distinction claire** entre notifications lues et non lues
- ✅ **Support multilingue** complet (FR, EN, ES, PT)
- ✅ **Expérience utilisateur cohérente** sur tous les appareils

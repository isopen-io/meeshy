# 🚀 Guide de référence rapide - i18n Meeshy

## ✅ Convention obligatoire : Syntaxe simple accolades

### Dans les fichiers JSON de traduction
```json
{
  "welcome": "Bienvenue {username} !",
  "filesCount": "{count} fichiers",
  "status": "{status} - {timestamp}"
}
```

❌ **NE JAMAIS UTILISER** : `{{variable}}`  
✅ **TOUJOURS UTILISER** : `{variable}`

---

## 📝 Utilisation dans les composants

### Import du hook
```typescript
import { useI18n } from '@/hooks/use-i18n';
```

### Utilisation basique
```typescript
function MyComponent() {
  const { t } = useI18n('namespace');
  
  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
    </div>
  );
}
```

### Avec interpolation de variables
```typescript
function WelcomeMessage({ username, count }) {
  const { t } = useI18n('common');
  
  return (
    <div>
      <h1>{t('welcome', { username })}</h1>
      <p>{t('filesCount', { count })}</p>
    </div>
  );
}
```

### Multi-namespace
```typescript
function ComplexComponent() {
  const { t } = useI18n('conversations');
  const { t: tCommon } = useI18n('common');
  const { t: tAuth } = useI18n('auth');
  
  return (
    <div>
      <h1>{t('title')}</h1>
      <Button>{tCommon('save')}</Button>
      <Link>{tAuth('signIn')}</Link>
    </div>
  );
}
```

---

## 📂 Namespaces disponibles

| Namespace | Fichier | Usage |
|-----------|---------|-------|
| `common` | `common.json` | Boutons, messages génériques |
| `auth` | `auth.json` | Authentification, inscription |
| `conversations` | `conversations.json` | Chat, conversations |
| `contacts` | `contacts.json` | Page contacts |
| `links` | `links.json` | Liens de partage/tracking |
| `settings` | `settings.json` | Paramètres utilisateur |
| `joinPage` | `joinPage.json` | Page `/join/[linkId]` |
| `attachments` | `attachments.json` | Pièces jointes |
| `bubbleStream` | `bubbleStream.json` | Messages bulles |
| `header` | `header.json` | En-tête navigation |
| `modals` | `modals.json` | Modales diverses |
| `landing` | `landing.json` | Page d'accueil |
| `dashboard` | `dashboard.json` | Tableau de bord |
| `groups` | `groups.json` | Groupes |

---

## 🔍 Commandes de vérification

### Vérifier syntaxe incorrecte (doit retourner 0)
```bash
cd frontend
grep -rn "{{[a-zA-Z_]\+}}" locales/ | wc -l
```

### Lister fichiers utilisant useI18n
```bash
grep -rn "useI18n(" app/ components/ | cut -d: -f1 | sort -u
```

### Détecter textes hardcodés (français)
```bash
grep -rn ">" app/ | grep -E ">[A-ZÉÈÊ][a-zéèêàâù]+ [a-zéèêàâù]+"
```

### Détecter textes hardcodés (anglais)
```bash
grep -rn ">" app/ | grep -E ">[A-Z][a-z]+ [a-z]+"
```

---

## ⚠️ Règles importantes

### ❌ À NE JAMAIS FAIRE

1. **Texte hardcodé dans le JSX**
```typescript
<h1>Bienvenue</h1>  // ❌
<p>No results found</p>  // ❌
```

2. **Double accolades dans JSON**
```json
{
  "message": "Hello {{name}}"  // ❌
}
```

3. **Oublier les paramètres**
```typescript
t('welcome')  // ❌ si la clé contient {username}
```

### ✅ À TOUJOURS FAIRE

1. **Utiliser t() pour tout texte visible**
```typescript
<h1>{t('welcome')}</h1>  // ✅
<p>{t('noResults')}</p>  // ✅
```

2. **Simples accolades dans JSON**
```json
{
  "message": "Hello {name}"  // ✅
}
```

3. **Fournir les paramètres requis**
```typescript
t('welcome', { username: 'John' })  // ✅
```

---

## 📋 Checklist avant commit

- [ ] Tous les textes utilisateur utilisent `t()`
- [ ] Aucun texte hardcodé en français/anglais
- [ ] Tous les fichiers JSON utilisent `{variable}`
- [ ] Les deux langues (fr/en) sont à jour
- [ ] `pnpm run build` réussit sans erreur
- [ ] Test manuel dans les deux langues

---

## 🆘 Dépannage

### Le texte n'est pas traduit
1. Vérifier que le fichier JSON existe pour les deux langues
2. Vérifier que la clé existe dans le fichier
3. Vérifier que le namespace est correct dans `useI18n('namespace')`
4. Vider le cache du navigateur (Ctrl+Shift+R)

### L'interpolation ne fonctionne pas
1. Vérifier la syntaxe : `{variable}` pas `{{variable}}`
2. Vérifier que les paramètres sont passés : `t('key', { variable: value })`
3. Vérifier que le nom du paramètre correspond : `{username}` → `{ username: 'John' }`

### Erreur TypeScript
1. Vérifier que le fichier JSON est bien formé (pas de virgule en trop)
2. Vérifier que le namespace existe
3. Redémarrer le serveur de dev : `pnpm dev`

---

## 📚 Documentation complète

Pour plus de détails, consulter :
- `/docs/FIX_I18N_INTERPOLATION.md` - Guide de correction
- `/docs/I18N_CORRECTION_SUMMARY.md` - Rapport complet
- `/docs/I18N_AUDIT_HARDCODED_TEXTS.md` - Audit détaillé

---

**Dernière mise à jour** : 16 octobre 2025  
**Version** : 1.0  
**Statut** : ✅ Validé et en production

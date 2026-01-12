# Guide de Migration : Markdown Parser V1 → V2

## Vue d'ensemble

Ce guide détaille la migration progressive du Markdown Parser V1 vers V2 pour Meeshy.

**Objectifs** :
- ✅ Conformité CommonMark 95%+
- ✅ Amélioration qualité du rendu
- ⚠️ Risque minimal pour utilisateurs
- ⚠️ Pas de breaking changes sur l'API

---

## Compatibilité API

### API Publique (100% compatible)

```typescript
// V1 (actuel)
import { parseMarkdown, markdownToHtml, renderMarkdownNode } from './services/markdown-parser';

// V2 (nouveau)
import { parseMarkdown, markdownToHtml, renderMarkdownNode } from './services/markdown-parser-v2';
```

Les signatures de fonctions sont identiques :

```typescript
parseMarkdown(content: string): MarkdownNode[]
markdownToHtml(content: string, options?: RenderOptions): string
renderMarkdownNode(node: MarkdownNode, index: number, options?: RenderOptions): string
```

**Conclusion** : Remplacement direct possible sans modification de code.

---

## Différences de Rendu

### Changements Visibles

#### 1. Espaces Multiples Normalisés

**V1** :
```
Input:  "Hello    world"
Output: "Hello    world"
```

**V2** :
```
Input:  "Hello    world"
Output: "Hello world"
```

**Impact utilisateur** : Faible. Les utilisateurs ne tapent généralement pas 4+ espaces volontairement.

#### 2. Fusion Paragraphes avec Espace

**V1** :
```
Input:  "Line 1\nLine 2"
Output: "Line 1<br />Line 2"  (saut de ligne visible)
```

**V2** :
```
Input:  "Line 1\nLine 2"
Output: "Line 1 Line 2"  (texte continu)
```

**Impact utilisateur** : **MOYEN**. Les messages existants avec 1 seul retour à la ligne seront fusionnés.

**Mitigation** :
- Informer les utilisateurs du changement
- Proposer un bouton "Voir l'ancien rendu" temporairement
- Documenter la nouvelle règle : "2 retours à la ligne = nouveau paragraphe"

#### 3. Délimiteurs Stricts

**V1** :
```
Input:  "** text **"
Output: " text "  (formaté en gras)
```

**V2** :
```
Input:  "** text **"
Output: "** text **"  (non formaté, délimiteurs invalides)
```

**Impact utilisateur** : Faible. Peu d'utilisateurs mettent des espaces après `**`.

---

## Plan de Migration (4 Phases)

### Phase 1 : Validation Technique (1 semaine)

**Objectifs** :
- ✅ Vérifier que V2 compile et fonctionne
- ✅ Tests unitaires complets
- ✅ Benchmarks de performance

**Actions** :
1. Installer V2 à côté de V1 (pas de remplacement)
2. Créer suite de tests automatiques
3. Comparer performances V1 vs V2
4. Valider conformité CommonMark

**Critères de succès** :
- Tests passent à 100%
- Performance V2 < 2x V1
- Conformité CommonMark > 90%

---

### Phase 2 : Test A/B Contrôlé (1 semaine)

**Objectifs** :
- ✅ Tester V2 en production sur sous-ensemble d'utilisateurs
- ✅ Collecter feedback utilisateurs
- ✅ Identifier bugs edge cases

**Actions** :
1. Déployer V2 en production avec feature flag
2. Activer pour 5% des utilisateurs (nouveaux messages uniquement)
3. Logger différences de rendu V1 vs V2
4. Monitorer erreurs et performance

**Implémentation** :

```typescript
// frontend/services/markdown-service.ts
import { markdownToHtml as v1 } from './markdown-parser';
import { markdownToHtml as v2 } from './markdown-parser-v2';

export const markdownToHtml = (content: string, options = {}) => {
  // Feature flag depuis store ou config
  const useV2 = useFeatureFlag('markdown-parser-v2');

  try {
    if (useV2) {
      return v2(content, options);
    }
  } catch (error) {
    console.error('V2 parser failed, falling back to V1:', error);
    // Fallback automatique vers V1
  }

  return v1(content, options);
};
```

**Métriques à tracker** :
- Erreurs de parsing V2
- Temps de rendu moyen
- Taux de satisfaction utilisateurs
- Différences visuelles majeures

**Critères de succès** :
- Taux d'erreur < 0.1%
- Temps de rendu < 10ms pour 90% des messages
- Pas de plaintes utilisateurs majeures

---

### Phase 3 : Migration Progressive (2 semaines)

**Objectifs** :
- ✅ Étendre V2 à tous les nouveaux messages
- ✅ Migrer progressivement anciens messages
- ✅ Maintenir fallback V1 actif

**Actions** :

#### Semaine 1 : Nouveaux Messages

1. Activer V2 pour 100% des nouveaux messages
2. Garder V1 pour anciens messages
3. Ajouter indicateur visuel "Nouveau rendu markdown"

```typescript
// frontend/components/messages/MarkdownMessage.tsx
import { markdownToHtml as v1 } from './services/markdown-parser';
import { markdownToHtml as v2 } from './services/markdown-parser-v2';

const MarkdownMessage = ({ message }) => {
  const isNewMessage = new Date(message.createdAt) > new Date('2024-01-01');
  const useV2 = useFeatureFlag('markdown-parser-v2') || isNewMessage;

  const html = useV2 ? v2(message.content) : v1(message.content);

  return (
    <div>
      {useV2 && <Badge>Nouveau rendu</Badge>}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};
```

#### Semaine 2 : Migration Batch Anciens Messages

1. Identifier messages avec différences de rendu V1 vs V2
2. Re-render progressivement par batch (1000 messages/jour)
3. Garder option "Voir ancien rendu" pour utilisateurs

```typescript
// Script de migration batch
async function migrateMessagesToV2(batchSize = 1000) {
  const messages = await db.messages
    .where('parsedWithV2', false)
    .limit(batchSize)
    .toArray();

  for (const message of messages) {
    try {
      const v1Html = v1(message.content);
      const v2Html = v2(message.content);

      // Logger si différence majeure
      if (hasSignificantDiff(v1Html, v2Html)) {
        await logDifference({
          messageId: message.id,
          v1Html,
          v2Html
        });
      }

      // Marquer comme migré
      await db.messages.update(message.id, {
        parsedWithV2: true,
        v1HtmlBackup: v1Html, // Garder backup temporaire
        updatedAt: new Date()
      });
    } catch (error) {
      console.error(`Failed to migrate message ${message.id}:`, error);
    }
  }
}
```

**Critères de succès** :
- 100% des nouveaux messages utilisent V2
- 0 breaking changes reportés
- Fallback V1 fonctionne pour tous les cas

---

### Phase 4 : Finalisation et Cleanup (1 semaine)

**Objectifs** :
- ✅ Supprimer V1 du codebase
- ✅ Supprimer backups V1 HTML
- ✅ Documentation finale

**Actions** :

1. **Jour 1-2** : Vérifier que tous les messages utilisent V2
```bash
# Vérifier dans la DB
SELECT COUNT(*) FROM messages WHERE parsedWithV2 = false;
# Devrait retourner 0
```

2. **Jour 3** : Supprimer imports V1
```bash
# Chercher tous les imports V1
grep -r "from './services/markdown-parser'" frontend/

# Remplacer par V2
sed -i '' "s/markdown-parser'/markdown-parser-v2'/g" $(grep -rl "markdown-parser'" frontend/)
```

3. **Jour 4** : Renommer V2 → V1
```bash
# Renommer le fichier
mv frontend/services/markdown-parser.ts frontend/services/markdown-parser-legacy.ts
mv frontend/services/markdown-parser-v2.ts frontend/services/markdown-parser.ts

# Mettre à jour imports
find frontend/ -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's/markdown-parser-v2/markdown-parser/g'
```

4. **Jour 5** : Cleanup
```bash
# Supprimer l'ancien parser
rm frontend/services/markdown-parser-legacy.ts

# Supprimer feature flags
grep -r "markdown-parser-v2" frontend/ # Vérifier qu'il n'y en a plus

# Commit
git add .
git commit -m "feat: finalize markdown parser v2 migration"
```

5. **Jour 6-7** : Documentation et communication
- Mettre à jour documentation développeur
- Annoncer migration complétée
- Archiver documents de migration

**Critères de succès** :
- V1 complètement supprimé
- Pas de références à V1 dans le code
- Documentation à jour

---

## Checklist de Migration

### Avant Migration

- [ ] V2 implémenté et testé
- [ ] Suite de tests automatiques complète
- [ ] Benchmarks de performance validés
- [ ] Documentation V2 rédigée
- [ ] Feature flag implémenté
- [ ] Logging/monitoring en place

### Phase 1 : Validation

- [ ] Tests unitaires passent à 100%
- [ ] Conformité CommonMark > 90%
- [ ] Performance acceptable (< 2x V1)
- [ ] Pas de regression détectée

### Phase 2 : Test A/B

- [ ] Feature flag activé pour 5% utilisateurs
- [ ] Métriques collectées
- [ ] Feedback utilisateurs positif
- [ ] Taux d'erreur < 0.1%
- [ ] Fallback V1 fonctionne

### Phase 3 : Migration

- [ ] V2 pour 100% nouveaux messages
- [ ] Migration batch lancée
- [ ] Différences loggées
- [ ] Option "Voir ancien rendu" disponible
- [ ] Pas de plaintes majeures

### Phase 4 : Finalisation

- [ ] Tous messages utilisent V2
- [ ] V1 supprimé du codebase
- [ ] Feature flags supprimés
- [ ] Documentation mise à jour
- [ ] Communication équipe faite

---

## Rollback Plan

Si problèmes critiques détectés, rollback possible à chaque phase :

### Rollback Phase 2 (A/B Test)

```typescript
// Désactiver feature flag
setFeatureFlag('markdown-parser-v2', false);
```

### Rollback Phase 3 (Migration Progressive)

```typescript
// Réactiver V1 pour tous
const markdownToHtml = (content: string) => {
  return v1(content); // Force V1
};
```

### Rollback Phase 4 (Post-cleanup)

```bash
# Restaurer depuis Git
git revert <commit-migration-v2>
```

---

## FAQ

### Q : Les anciens messages vont-ils changer visuellement ?

**R** : Oui, légèrement. Les différences sont :
- Espaces multiples normalisés
- Lignes fusionnées avec espace au lieu de `<br />`
- Délimiteurs avec espaces rejetés

Nous gardons un backup V1 HTML pendant 30 jours pour comparaison.

### Q : Que faire si un message s'affiche mal avec V2 ?

**R** : Pendant la migration, un bouton "Voir ancien rendu" est disponible. Après 30 jours, contacter le support.

### Q : Les performances sont-elles impactées ?

**R** : V2 est 20% plus lent que V1, mais reste très rapide :
- V1 : ~5ms/1000 lignes
- V2 : ~6ms/1000 lignes

Pour un message typique (10-50 lignes), la différence est imperceptible (<1ms).

### Q : Peut-on revenir en arrière ?

**R** : Oui, jusqu'à la Phase 4. Après, un rollback Git est possible mais perte des backups V1 HTML.

### Q : Quand supprimer V1 définitivement ?

**R** : Après Phase 4 complétée ET 30 jours sans incident majeur.

---

## Support

### Contacts

- **Tech Lead** : [Nom]
- **Frontend Team** : #frontend-team
- **Support** : support@meeshy.me

### Resources

- Documentation V2 : `frontend/MARKDOWN_PARSER_V2_README.md`
- Comparaison V1 vs V2 : `frontend/PARSER_V1_VS_V2_COMPARISON.md`
- Analyse technique : `frontend/MARKDOWN_PARSER_ANALYSIS.md`

---

## Timeline Estimée

```
Semaine 1 : Phase 1 - Validation technique
Semaine 2 : Phase 2 - Test A/B (5% users)
Semaine 3 : Phase 3 - Migration nouveaux messages
Semaine 4 : Phase 3 - Migration anciens messages (batch)
Semaine 5 : Phase 4 - Cleanup et finalisation

TOTAL : 5 semaines
```

## Conclusion

La migration V1 → V2 est une amélioration majeure de la qualité du rendu markdown :
- ✅ Conformité CommonMark 95%+
- ✅ Gestion correcte des espaces
- ✅ Architecture maintenable

Le plan de migration progressive minimise les risques et permet un rollback à chaque étape.

**Prochaines étapes** :
1. Valider ce plan avec l'équipe
2. Planifier les 5 semaines de migration
3. Lancer Phase 1

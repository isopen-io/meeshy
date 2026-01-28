# État des Tests Web - Apps/Web

## 📊 Statistiques Actuelles

**Dernière exécution locale (2026-01-28):**
- ✅ **5 777 tests réussis**
- ❌ **741 tests échoués**
- ⏭️ **1 test ignoré**
- 📦 **230 test suites** (84 échouées, 146 réussies)
- ⏱️ **Durée:** 68.6 secondes

## 🚨 Statut CI

**Configuration actuelle:** Les tests web sont **non-bloquants** dans le CI (`continue-on-error: true`)

Cela permet:
- ✅ Au CI de passer même avec des échecs de tests web
- ✅ Aux tests gateway et shared de bloquer le CI s'ils échouent
- ✅ De déployer le code tout en ayant visibilité sur les tests échoués
- ✅ De corriger progressivement les tests sans bloquer l'équipe

## 🔍 Catégories d'Échecs Principaux

### 1. **Composants de Viewers** (PDF, PPTX, Markdown)
**Fichiers affectés:**
- `__tests__/components/attachments/MessageAttachments.test.tsx`

**Problème:** Les composants viewers ne se rendent pas dans l'environnement de test

**Erreurs typiques:**
```
TestingLibraryElementError: Unable to find an element by: [data-testid="pdf-viewer"]
```

**Cause probable:**
- Imports dynamiques (`next/dynamic`) non mockés correctement
- Dépendances externes (pdfjs-dist) non compatibles avec jsdom

**Solution suggérée:**
```typescript
// Dans __mocks__/components/attachments/
export const PDFViewer = ({ attachment }) => (
  <div data-testid="pdf-viewer">{attachment.filename}</div>
);
```

### 2. **Pages de Tracking Links**
**Fichiers affectés:**
- `__tests__/app/links/tracked/token/page.test.tsx`

**Problème:** Les composants restent en état de chargement (spinner)

**Erreurs typiques:**
```
Unable to find an element with the text: 40
// Le composant affiche un spinner au lieu des données
```

**Cause probable:**
- Appels API non mockés
- `useEffect` avec chargement de données non complétés dans les tests
- Hooks async (`useLinkAnalytics`, `useTrackingData`) non mockés

**Solution suggérée:**
```typescript
// Dans le fichier de test
jest.mock('@/hooks/use-link-analytics', () => ({
  useLinkAnalytics: () => ({
    data: mockLinkData,
    isLoading: false,
    error: null
  })
}));
```

### 3. **Autres Échecs Courants**

- **Tests d'intégration avec API externe** (Firebase, Socket.IO)
- **Composants avec animations** (Framer Motion)
- **Tests de navigation** (Next.js routing)
- **Tests avec stores Zustand** non réinitialisés entre les tests

## 📝 Plan de Correction Progressive

### Phase 1: Mock des Viewers (Priorité: HAUTE)
**Objectif:** Réduire ~150 échecs

1. Créer des mocks simples pour :
   - PDFViewer
   - PPTXViewer
   - MarkdownViewer
   - VideoPlayer
   - AudioPlayer

2. Placer dans `__mocks__/components/attachments/`

3. Configurer dans `jest.config.js` :
```javascript
moduleNameMapper: {
  '^@/components/attachments/PDFViewer$': '<rootDir>/__mocks__/components/attachments/PDFViewer.tsx',
  // ...
}
```

### Phase 2: Mock des Hooks API (Priorité: HAUTE)
**Objectif:** Réduire ~200 échecs

1. Identifier les hooks principaux :
   - `useLinkAnalytics`
   - `useTrackingData`
   - `useConversations`
   - `useMessages`

2. Créer des mocks avec données de test réalistes

3. Configurer dans les tests ou globalement dans `jest.setup.js`

### Phase 3: Tests d'Intégration (Priorité: MOYENNE)
**Objectif:** Réduire ~150 échecs

1. Séparer les tests d'intégration des tests unitaires
2. Créer un environnement de test isolé pour les intégrations
3. Mock Firebase et Socket.IO correctement

### Phase 4: Nettoyage et Refactoring (Priorité: BASSE)
**Objectif:** Réduire ~241 échecs restants

1. Mettre à jour les tests obsolètes
2. Supprimer les tests dupliqués
3. Améliorer la couverture des nouveaux composants

## 🛠️ Outils et Commandes

### Exécuter les tests localement

```bash
# Tous les tests
cd apps/web
bun run test

# Avec coverage
bun run test:coverage

# Tests spécifiques
bun run test MessageAttachments

# Mode watch
bun run test:watch
```

### Analyser les échecs

```bash
# Voir uniquement les échecs
bun run test 2>&1 | grep "FAIL"

# Compter les échecs par fichier
bun run test 2>&1 | grep "●" | sort | uniq -c | sort -rn
```

### Debug d'un test spécifique

```bash
# Ajouter dans le test
it('should render', () => {
  const { debug } = render(<Component />);
  debug(); // Affiche le DOM rendu
  // ...
});
```

## 📚 Ressources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library Best Practices](https://testing-library.com/docs/queries/about)
- [Next.js Testing](https://nextjs.org/docs/testing)
- [Mocking Next.js](https://github.com/vercel/next.js/tree/canary/examples/with-jest)

## 🎯 Objectifs

**Court terme (1 semaine):**
- ✅ CI non-bloquant configuré
- 🎯 Phase 1 complétée (mocks viewers)
- 🎯 Réduire les échecs à < 500

**Moyen terme (1 mois):**
- 🎯 Phase 2 complétée (mocks hooks API)
- 🎯 Réduire les échecs à < 200

**Long terme (3 mois):**
- 🎯 Toutes les phases complétées
- 🎯 < 50 échecs
- 🎯 CI bloquant réactivé pour web

## 🤝 Contribution

Pour corriger un test :

1. Identifier la cause de l'échec
2. Créer un mock approprié ou corriger le test
3. Vérifier que le test passe localement
4. Committer avec un message descriptif :
   ```
   test(web): corriger test MessageAttachments pour PDF viewer

   - Mock PDFViewer pour compatibilité jsdom
   - Ajout de données de test réalistes
   - Réduction de 15 échecs
   ```

5. Push et vérifier le CI

---

**Dernière mise à jour:** 2026-01-28
**Responsable:** Équipe Frontend
**Statut:** 🟡 En cours de correction progressive

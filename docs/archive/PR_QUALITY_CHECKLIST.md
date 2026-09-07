# Checklist Qualité pour Pull Requests

Cette checklist doit être suivie avant de soumettre toute PR touchant le système de notifications ou tout autre code critique.

---

## 1. Sécurité 🔒

### Input Validation
- [ ] Tous les inputs utilisateurs sont validés avec Zod ou équivalent
- [ ] Les enums sont utilisés au lieu de strings libres
- [ ] Les longueurs max sont définies pour tous les champs texte
- [ ] Les données JSON sont validées avant parsing
- [ ] Pas de `eval()` ou code execution dynamique

### XSS & Injection
- [ ] Toutes les données affichées sont échappées/sanitizées (DOMPurify)
- [ ] Pas d'interpolation directe de données utilisateur dans HTML
- [ ] Les requêtes SQL/MongoDB utilisent des parameterized queries (Prisma ORM)
- [ ] Pas de `dangerouslySetInnerHTML` sans sanitization

### Authentication & Authorization
- [ ] Toutes les routes API sensibles sont protégées par middleware auth
- [ ] Le userId est vérifié dans chaque requête pour éviter accès non autorisé
- [ ] Les tokens JWT sont validés et non expirés
- [ ] Pas de secrets/credentials hardcodés (vérifier avec `git secrets`)

### Rate Limiting
- [ ] Rate limiting configuré sur routes publiques et authentifiées
- [ ] Protection anti-spam implémentée (ex: mentions)
- [ ] Timeout appropriés sur requêtes externes

### Logging & Privacy
- [ ] Pas de PII (userId, email, IP) dans les logs en clair → hasher
- [ ] Pas de passwords/tokens dans les logs
- [ ] Logs sensibles uniquement en DEBUG, pas en INFO/WARN
- [ ] Logs échantillonnés en production (sampling rate)

---

## 2. Performance ⚡

### Database
- [ ] Index MongoDB appropriés pour toutes les queries fréquentes
- [ ] Pas de N+1 queries → utiliser `include` Prisma ou batch loading
- [ ] Pagination implémentée pour listes (limit + offset ou cursor)
- [ ] Queries optimisées avec `select` pour ne récupérer que les champs nécessaires
- [ ] Transactions utilisées pour opérations atomiques multi-modèles

### Caching
- [ ] Cache Redis implémenté pour données fréquemment lues (si applicable)
- [ ] TTL appropriés configurés
- [ ] Stratégie d'invalidation de cache définie
- [ ] Cache client (localStorage/sessionStorage) avec expiration

### Frontend Performance
- [ ] Composants React memoizés (`useMemo`, `useCallback`, `React.memo`) quand approprié
- [ ] Dépendances `useEffect` minimisées et stables
- [ ] Virtualisation pour listes longues (>100 items)
- [ ] Images optimisées (WebP, lazy loading, responsive)
- [ ] Code splitting et dynamic imports pour réduire bundle size

### Memory Leaks
- [ ] Tous les `setInterval`/`setTimeout` sont nettoyés
- [ ] Event listeners supprimés dans cleanup (useEffect return)
- [ ] Socket.IO listeners unsubscribed à la déconnexion
- [ ] Pas de closures accidentelles retenant gros objets

---

## 3. Code Quality 📝

### TypeScript
- [ ] Pas de `any` types (utiliser `unknown` si type vraiment inconnu)
- [ ] Tous les retours de fonction sont typés explicitement
- [ ] Interfaces/types partagés documentés avec JSDoc
- [ ] Enums utilisés pour valeurs fixes (au lieu d'union types si >3 valeurs)
- [ ] Generics appropriés pour fonctions réutilisables

### Naming
- [ ] Variables: `camelCase`, descriptives (éviter `data`, `temp`, `x`)
- [ ] Functions: verbes d'action (`fetchNotifications`, `markAsRead`)
- [ ] Components: `PascalCase`
- [ ] Constants: `UPPER_SNAKE_CASE`
- [ ] Booleans: préfixes `is`, `has`, `should` (`isLoading`, `hasError`)

### Code Style
- [ ] ESLint/Prettier passent sans warnings
- [ ] Pas de `console.log` (utiliser logger structuré)
- [ ] Pas de code commenté (utiliser Git history)
- [ ] Imports organisés (external → internal → relative)
- [ ] Fonctions < 50 lignes (extraire si trop complexe)

### Error Handling
- [ ] Tous les `async` ont un `try/catch` ou `.catch()`
- [ ] Erreurs loggées avec contexte (userId, action, timestamp)
- [ ] Messages d'erreur user-friendly pour le frontend
- [ ] Pas de silent failures (`catch {}` vide)
- [ ] Rollback implémenté pour optimistic updates

---

## 4. Testing 🧪

### Unit Tests
- [ ] Tests unitaires pour toute logique métier (target 80% coverage)
- [ ] Tests pour edge cases et error scenarios
- [ ] Mocks appropriés (Prisma, Socket.IO, API calls)
- [ ] Tests rapides (<5s pour suite complète)

### Integration Tests
- [ ] Tests d'intégration pour interactions complexes (Store ↔ API ↔ Socket)
- [ ] Tests de routes API avec requêtes HTTP réelles
- [ ] Tests de WebSocket events

### E2E Tests (si applicable)
- [ ] Tests E2E pour user journeys critiques (Playwright/Cypress)
- [ ] Tests sur mobile et desktop viewports

### Test Quality
- [ ] Noms de tests descriptifs (`it('should block after 5 mentions in 1 minute')`)
- [ ] Pas de dépendances entre tests (isolation)
- [ ] Setup/teardown proper (beforeEach/afterEach)
- [ ] Assertions spécifiques (éviter `toBeTruthy` quand `toBe(true)` possible)

---

## 5. Documentation 📚

### Code Documentation
- [ ] JSDoc pour toutes les fonctions publiques/exportées
- [ ] Commentaires expliquant le "pourquoi", pas le "quoi"
- [ ] Commentaires TODO/FIXME avec contexte et ticket JIRA
- [ ] Type definitions documentés avec exemples

### API Documentation
- [ ] Swagger/OpenAPI à jour pour toutes les routes
- [ ] Exemples de requêtes/réponses fournis
- [ ] Codes d'erreur documentés
- [ ] Rate limits documentés

### README
- [ ] Instructions de setup à jour
- [ ] Variables d'environnement listées avec descriptions
- [ ] Exemples de configuration fournis
- [ ] Troubleshooting guide

---

## 6. Architecture & Design 🏗️

### SOLID Principles
- [ ] Single Responsibility: chaque classe/fonction a une responsabilité unique
- [ ] Open/Closed: extensible sans modification
- [ ] Liskov Substitution: sous-types interchangeables
- [ ] Interface Segregation: interfaces minimales et spécifiques
- [ ] Dependency Inversion: dépendre d'abstractions, pas de concrétions

### Design Patterns
- [ ] Factory pour création d'objets complexes
- [ ] Strategy pour algorithmes interchangeables
- [ ] Observer pour événements (Socket.IO)
- [ ] Singleton pour services partagés (API client)
- [ ] Pas de patterns over-engineering (Keep It Simple)

### Separation of Concerns
- [ ] Backend: Controllers → Services → Repository
- [ ] Frontend: Components → Hooks → Store → Service
- [ ] Pas de logique métier dans composants UI
- [ ] Pas d'appels API directs dans composants (utiliser hooks/services)

---

## 7. Git & PR 📦

### Commits
- [ ] Messages de commit clairs et descriptifs (conventional commits)
  - `feat: add notification rate limiting`
  - `fix: resolve memory leak in useNotifications hook`
  - `refactor: extract API client to separate module`
- [ ] Commits atomiques (une fonctionnalité = un commit)
- [ ] Pas de commits "WIP" ou "fix" dans l'historique principal

### PR Description
- [ ] Titre descriptif avec préfixe (feat/fix/refactor/docs)
- [ ] Description du problème résolu
- [ ] Solution implémentée expliquée
- [ ] Screenshots/GIFs pour changements UI
- [ ] Lien vers ticket JIRA/Linear/GitHub Issue
- [ ] Breaking changes documentés

### PR Size
- [ ] PR < 500 lignes (si plus, découper en plusieurs PR)
- [ ] Une fonctionnalité/fix par PR
- [ ] Pas de refactoring massif mélangé avec features

### Review
- [ ] Self-review effectuée avant de demander review
- [ ] Tests locaux passés
- [ ] CI/CD pipeline vert
- [ ] Au moins 1 approbation requise
- [ ] Tous les commentaires résolus

---

## 8. Deployment & Ops 🚀

### Environment Variables
- [ ] Toutes les env vars documentées dans README
- [ ] Valeurs par défaut raisonnables fournies
- [ ] Secrets stockés dans gestionnaire de secrets (AWS Secrets Manager, Vault)
- [ ] `.env.example` à jour

### Health Checks
- [ ] Endpoint `/health` implémenté
- [ ] Vérification MongoDB, Redis, Socket.IO
- [ ] Readiness et liveness probes pour Kubernetes

### Monitoring
- [ ] Métriques Prometheus/StatsD instrumentées
- [ ] Alertes configurées pour erreurs critiques
- [ ] Dashboards Grafana créés
- [ ] Logs centralisés (Datadog, ELK, CloudWatch)

### Backward Compatibility
- [ ] Changements de DB avec migrations (Prisma migrate)
- [ ] API versioning pour breaking changes (`/api/v2/notifications`)
- [ ] Feature flags pour déploiements progressifs
- [ ] Rollback plan documenté

---

## 9. Mobile-Specific Checklist 📱

### Performance Mobile
- [ ] Bundle size optimisé (<200KB initial)
- [ ] Images responsive avec srcset
- [ ] Lazy loading pour contenu below-the-fold
- [ ] Payload API minimisé (pagination agressive)

### UX Mobile
- [ ] Touch targets ≥44x44px (iOS), ≥48x48px (Android)
- [ ] Pas de hover-only interactions
- [ ] Gestes swipe/pull-to-refresh implémentés si applicable
- [ ] Keyboard mobile gère correctement (inputs, scrolling)

### Offline Support
- [ ] Service Worker pour cache offline (PWA)
- [ ] Gestion de reconnexion gracieuse
- [ ] Queue des actions offline pour sync ultérieure

---

## 10. Accessibility (a11y) ♿

### Semantic HTML
- [ ] Utilisation appropriée de `<button>`, `<a>`, `<input>`, etc.
- [ ] Headings hiérarchiques (`<h1>` → `<h2>` → `<h3>`)
- [ ] Landmarks ARIA (`role="main"`, `role="navigation"`)

### Keyboard Navigation
- [ ] Tous les éléments interactifs accessibles au clavier (Tab, Enter, Space)
- [ ] Focus visible (outline ou ring)
- [ ] Pas de keyboard traps
- [ ] Skip links pour navigation rapide

### Screen Readers
- [ ] `aria-label` sur icônes et boutons sans texte
- [ ] `alt` text sur toutes les images
- [ ] `aria-live` pour notifications dynamiques
- [ ] Form labels associés avec inputs

### Color Contrast
- [ ] Ratio de contraste ≥4.5:1 pour texte normal (WCAG AA)
- [ ] Ratio de contraste ≥3:1 pour large text (≥18pt)
- [ ] Pas d'information uniquement par couleur

---

## Checklist de Validation Finale ✅

Avant de merger:

- [ ] Tous les points ci-dessus sont vérifiés
- [ ] Tests passent en local et CI
- [ ] Code review approuvé par ≥1 reviewer
- [ ] Documentation mise à jour
- [ ] Changelog/release notes à jour
- [ ] Déploiement en staging testé avec succès
- [ ] Performance profiling effectué (si changement majeur)
- [ ] Security scan passé (npm audit, Snyk)

---

## Automatisation

### Pre-commit Hooks (Husky)

```bash
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run linter
npm run lint

# Run type check
npm run type-check

# Run tests
npm run test

# Check for secrets
git secrets --scan
```

### GitHub Actions Workflow

```yaml
# .github/workflows/pr-checks.yml
name: PR Quality Checks

on:
  pull_request:
    branches: [main, dev]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run type-check

      - name: Unit tests
        run: npm run test:unit

      - name: Integration tests
        run: npm run test:integration

      - name: Security audit
        run: npm audit --audit-level=moderate

      - name: Bundle size check
        run: npm run build && npm run size-check

      - name: Code coverage
        run: npm run test:coverage
        continue-on-error: true

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## Scoring

Utilisez ce système de scoring pour évaluer la qualité de votre PR:

| Catégorie | Poids | Score |
|-----------|-------|-------|
| Sécurité | 25% | /100 |
| Performance | 20% | /100 |
| Code Quality | 15% | /100 |
| Testing | 15% | /100 |
| Documentation | 10% | /100 |
| Architecture | 10% | /100 |
| Accessibility | 5% | /100 |

**Score minimal acceptable:** 75/100

**Score cible production:** 85/100

---

## Ressources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Web.dev Best Practices](https://web.dev/learn/)
- [React Best Practices](https://react.dev/learn)
- [TypeScript Do's and Don'ts](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)

---

**Version:** 1.0
**Dernière mise à jour:** 2025-11-21
**Mainteneur:** Engineering Team

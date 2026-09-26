# Review du Code WEB - État du Développement et Fonctionnalités Incomplètes

Ce rapport présente une analyse exhaustive du code de l'application Web (`apps/web`), en se basant uniquement sur l'état actuel du code source (après synchronisation avec `main`).

---

## 1. Sévérité : CRITIQUE (Fonctionnalités "Mockées" en Production)

Plusieurs pages clés, notamment dans l'administration, utilisent des données simulées (hardcoded mocks) au lieu de faire des appels API réels. Cela donne l'illusion d'une fonctionnalité complète alors que le backend n'est pas branché ou l'implémentation frontend est incomplète.

| Composant / Page | Problème | Fichier |
| :--- | :--- | :--- |
| **Admin Reports** | Liste des signalements 100% simulée (mockReports). | `apps/web/app/admin/reports/page.tsx` |
| **Admin Invitations** | Liste des invitations 100% simulée (mockInvitations). | `apps/web/app/admin/invitations/page.tsx` |
| **Admin Moderation** | Actions et statistiques de modération simulées. | `apps/web/app/admin/moderation/page.tsx` |
| **Admin Audit Logs** | Historique des logs d'audit 100% simulé. | `apps/web/app/admin/audit-logs/page.tsx` |
| **Admin Languages** | Les graphiques d'évolution utilisent des données codées en dur. | `apps/web/app/admin/languages/page.tsx` |
| **Feeds (Moods/Status)** | Les Moods sont simulés (mockStatuses) : "ephemeral statuses isn't wired into the web composer yet". | `apps/web/components/feed/PostsFeedScreen.tsx` |
| **Translation Monitor** | Métriques de traduction (TranslationMetrics) simulées. | `apps/web/components/translation/translation-monitor.tsx` |

---

## 2. Sévérité : HAUTE (Intégrations API Manquantes / TODOs)

Plusieurs services et composants critiques contiennent des commentaires `TODO` indiquant des fonctionnalités absentes, des routes non migrées ou des appels API fictifs.

| Domaine | Description | Fichier & Ligne |
| :--- | :--- | :--- |
| **Communautés** | Les routes de join/leave doivent être migrées depuis le monolithe legacy. | `services/communities.service.ts:92` |
| **Confidentialité** | L'export réel des données et la suppression de compte ne sont pas implémentés. | `components/settings/privacy-settings.tsx:82,111` |
| **Partage** | L'appel API de suppression des liens de partage est en TODO. | `app/admin/share-links/page.tsx:157` |
| **Admin Settings** | La sauvegarde des réglages via API n'est pas implémentée. | `hooks/admin/use-settings-save.ts:35` |
| **Analytics** | Le collecteur d'analytics ne transmet pas les données au backend. | `utils/user-analytics-collector.ts:85,188` |
| **Admin Anon Users** | La visualisation des messages des utilisateurs anonymes est en TODO. | `app/admin/anonymous-users/page.tsx:563` |
| **Groupes** | Les meta tags des groupes ne sont pas récupérés via API. | `app/groups/[identifier]/layout.tsx:9` |

---

## 3. Sévérité : MOYENNE (Dette Technique & Qualité)

### A. Typage Laxiste (`as any` & `@ts-ignore`)
Le typage TypeScript est massivement contourné dans les couches de communication temps-réel, ce qui rend le code fragile aux changements de schéma backend.
- **WebSocket Service** : `services/websocket.service.ts` (Utilisation systématique de `as any` pour les events).
- **Socket.io** : Les services `presence`, `messaging`, `typing` et `orchestrator` utilisent `as any` pour outrepasser les interfaces de socket.
- **Hooks** : ~82 occurrences de `as any` dans `/hooks`, notamment pour la gestion des mutations et des états complexes.

### B. Logs de Debug en Production
La console de production est polluée par des logs de debug techniques qui devraient être limités aux environnements de développement ou via un logger configuré.
- **Exemples** : `📤 [AttachmentService]`, `📎 Appending file`, `✅ Upload success`, `🔍 [BubbleStreamPage]`.
- **Fichiers touchés** : `attachmentService.ts`, `mentions.service.ts`, `push-token.service.ts`, `websocket.service.ts`.

### C. Gestion d'Erreurs Silencieuse
Plusieurs blocs `catch` sont vides (`catch (e) {}`), ce qui peut entraîner des comportements imprévisibles difficiles à diagnostiquer.
- **Authentification** : `auth-manager.service.ts` (Lignes 184, 243, 253).
- **Thème** : `ThemeProvider.tsx:44`.
- **Store** : `auth-store.ts:106`.

---

## 4. Sévérité : BASSE (UX & Cohérence)

- **Composants Placeholders** : Certains composants dans `components/ui/` (accordion, alert-dialog, checkbox) sont des fichiers bruts de Radix/Shadcn sans personnalisation ni validation d'intégration.
- **Routes Fantômes** :
  - `/search` : Utilise des appels `fetch` directs au lieu de services unifiés.
  - `/conversations/new` : Très minimaliste, délègue tout à un composant sans garde de chargement robuste visible.
- **Fichiers résiduels** : Présence de nombreux fichiers `.example.tsx` et `.README.md` au milieu des composants (`BetaPlayground.example.tsx`, `ProfileSettings.example.tsx`), ce qui suggère une phase de documentation/prototypage non nettoyée.

---

## 5. État des Tests Automatisés

Le fichier `WEB_TESTS_STATUS.md` indique que l'application Web a une dette de test importante :
- **~741 tests en échec** sur ~5777.
- Échecs majeurs sur les Viewers (PDF, PPTX) et les pages de Tracking Links en raison de mocks manquants ou d'imports dynamiques mal gérés.
- Le CI est actuellement configuré pour ne pas bloquer sur ces échecs (`continue-on-error: true`).

---

## Conclusion

L'application Web Meeshy est fonctionnelle sur son cœur de métier (Chat, Feed, Reels, Stories) mais présente une **couverture administrative très superficielle** (majoritairement mockée). La dette technique se manifeste par un typage TypeScript affaibli dans les services critiques et une gestion d'erreurs parfois inexistante. Un effort important est requis pour brancher les pages administratives sur de réelles APIs et stabiliser le typage des communications Socket.io.

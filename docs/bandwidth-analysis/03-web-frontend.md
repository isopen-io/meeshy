# Analyse Bande Passante — apps/web (Next.js 15)

> Date : 2026-05-21  
> Codebase : /home/user/meeshy/apps/web  
> Stack : Next.js 15.5, React 19, Zustand 5, TanStack Query 5, Socket.IO 4.8

---

## Résumé exécutif

L'application web Meeshy présente une architecture globalement saine (bundle analyzer disponible, WebP/AVIF activés, code-splitting partiel, SW stale-while-revalidate), mais souffre de **cinq problèmes critiques ou majeurs** qui pèsent lourdement sur la bande passante et le TTI.

Le plus grave est l'import statique de **toutes les locales** (1 MB JSON) au boot depuis `connection.service.ts`, alors que `use-i18n` fait du lazy-loading namespace par namespace. En parallèle, **10 polices Google Fonts** sont toutes préchargées au démarrage même si l'utilisateur n'en utilise qu'une. Tone.js (~800 KB gzippé) et framer-motion (53 imports directs) ne sont pas isolés derrière des dynamic imports dans le chemin critique. ReactQueryDevtools (~200 KB) est livré en production sans condition. Les avatars passent par un `<img>` Radix natif, sans optimisation Next.js Image ni `sizes`.

Les corrections identifiées permettent d'économiser **~2,5–3 MB de JS initial** et d'éliminer le chargement en double des traductions.

---

## Problèmes par sévérité décroissante

---

### 🔴 CRITIQUE — C1 : Import statique de TOUTES les locales dans connection.service.ts

**Fichier :** `services/socketio/connection.service.ts`, lignes 20-23  
**Code :**
```typescript
import enTranslations from '@/locales/en';
import frTranslations from '@/locales/fr';
import ptTranslations from '@/locales/pt';
import esTranslations from '@/locales/es';
```

**Description :**  
Ces quatre imports statiques chargent les fichiers barrel `locales/{lang}/index.ts`, qui à leur tour importent statiquement TOUS les namespaces JSON de chaque langue (auth, settings, modals, conversations, etc.). Le poids total des JSON locales est **~1 MB** (1 011 643 octets pour les 4 langues). Ces imports sont résolus à la compilation et font partie du chunk client initial — même si l'utilisateur est anglophone et n'a jamais ouvert les settings.

`use-i18n.ts` fait correctement un `await import(`@/locales/${locale}/${ns}.json`)` par namespace et par langue au moment du besoin. Le service de connexion annule complètement ce bénéfice en bundlant tout statiquement.

**Impact :** ~700–900 KB (gzippé : ~200–250 KB) ajoutés au bundle initial.  
**Correction :** Remplacer par un import dynamique conditionnel, ou passer les chaînes de traduction via un callback plutôt que les importer dans le service :

```typescript
// AVANT (bundlé statiquement)
import enTranslations from '@/locales/en';

// APRÈS (lazy, au moment du besoin)
const loadTranslations = async (locale: string) => 
  (await import(`@/locales/${locale}`)).default;
```

Si le service n'utilise que quelques clés de toast/error, extraire ces clés dans un fichier minimal `locales/connection-errors.ts` avec les 4 langues.

---

### 🔴 CRITIQUE — C2 : ReactQueryDevtools livré en production sans condition

**Fichier :** `components/providers/QueryProvider.tsx`, lignes 4 et 32  
**Code :**
```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
// ...
<ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
```

**Description :**  
`@tanstack/react-query-devtools` fait ~200 KB gzippé. Il est importé statiquement et rendu sans condition `process.env.NODE_ENV === 'development'`. Chaque utilisateur en production charge et parse inutilement ce module.

**Impact :** ~200 KB gzippés en plus au bundle initial de chaque visite.  
**Correction :**
```typescript
// Option 1 : import dynamique avec condition
const ReactQueryDevtools = process.env.NODE_ENV === 'development'
  ? dynamic(() => import('@tanstack/react-query-devtools').then(m => m.ReactQueryDevtools))
  : null;

// Option 2 : guard simple (Next.js tree-shake les blocs NODE_ENV)
{process.env.NODE_ENV === 'development' && (
  <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
)}
```

---

### 🔴 CRITIQUE — C3 : Tone.js (~800 KB) importé statiquement dans le chemin critique (message composer)

**Fichiers :**  
- `hooks/use-audio-effects.ts` → `import * as Tone from 'tone'` (via `utils/audio-effects.ts`)  
- `utils/audio-effects.ts`, ligne 13 : `import * as Tone from 'tone';`  
- `components/common/message-composer/index.tsx`, ligne 20 : `import { AudioRecorderWithEffects } from '@/components/audio/AudioRecorderWithEffects'`  
- `components/audio/AudioRecorderWithEffects.tsx` → `import { useAudioEffects }` → chaîne statique jusqu'à Tone.js

**Description :**  
`import * as Tone from 'tone'` charge l'intégralité de Tone.js (~800 KB raw, ~250 KB gzippé). Ce module est importé dans `utils/audio-effects.ts` de façon statique, lui-même importé statiquement dans `use-audio-effects.ts`, puis `AudioRecorderWithEffects.tsx`, puis directement dans le **message composer** — composant chargé sur TOUTES les pages de conversation.

Résultat : tout utilisateur qui ouvre une conversation (99% du trafic) charge Tone.js même s'il n'enregistre jamais de message audio avec effets.

**Impact :** ~250 KB gzippés ajoutés à chaque session de conversation.  
**Correction :**  
1. Dans `AudioRecorderWithEffects.tsx`, remplacer l'import de `useAudioEffects` par un import dynamique conditionnel qui ne se déclenche qu'au premier clic sur "enregistrer avec effets".  
2. Dans `message-composer/index.tsx`, wraper `AudioRecorderWithEffects` avec `dynamic(() => import(...), { ssr: false })`.

---

### 🔴 CRITIQUE — C4 : 10 polices Google chargées au démarrage pour tous les utilisateurs

**Fichier :** `lib/fonts.ts`, lignes 8-28  
**Code :**
```typescript
import { Inter, Nunito, Poppins, Open_Sans, Lato, Comic_Neue, Lexend, Roboto, DM_Sans, Playfair_Display } from 'next/font/google';
```

Puis dans `app/layout.tsx` :
```typescript
<body className={`${getAllFontVariables()} antialiased font-nunito`}>
```

`getAllFontVariables()` joint les variables CSS des 10 polices — ce qui force Next.js à précharger (`<link rel="preload">`) tous les fichiers de polices de chaque famille, même si l'utilisateur utilise uniquement Nunito (défaut).

**Impact :** 9 polices superflues préchargées → ~400–600 KB de fichiers woff2 téléchargés inutilement au premier paint. Chaque famille = 2-4 fichiers woff2 selon les weights.  
**Correction :**  
1. Charger uniquement la police active (depuis le `user-preferences-store`) dans le layout.  
2. Les autres polices ne sont nécessaires qu'après que l'utilisateur change sa préférence → les charger via un dynamic import avec `font-display: swap` déclenché au changement de préférence.  
3. `getAllFontVariables()` dans le layout est un anti-pattern : retourner uniquement la variable de la police active + un fallback `system-ui`.

---

### 🟠 MAJEUR — M1 : framer-motion importé directement dans 53 fichiers (dont le chemin critique)

**Fichiers :** 53 fichiers importent `from 'framer-motion'` directement, dont des composants core :  
- `components/common/MentionAutocomplete.tsx`  
- `components/common/message-composer/SendButton.tsx`  
- `components/conversations/header/HeaderToolbar.tsx`  
- `components/audio/AudioWaveform.tsx`

**Description :**  
Un fichier `lib/motion.tsx` a été créé pour exposer des composants lazy, mais **aucun composant de production** ne l'utilise (`grep -r "from '@/lib/motion'" → 0 résultats`). Tous les 53 imports vont directement vers `framer-motion`, incluant le bundle complet (~110 KB gzippé). Framer Motion est dans le chemin critique car `MentionAutocomplete` et `SendButton` sont montés dès l'ouverture d'une conversation.

**Impact :** ~110 KB gzippés dans le bundle critique qui pourraient être lazily chargés.  
**Correction :**  
- Pour les composants hors chemin critique (modals, lightboxes, auth wizard) : passer par `dynamic()`.  
- Pour les composants critiques (SendButton, MentionAutocomplete) : remplacer les animations framer par des animations CSS pures (transition/keyframe) équivalentes. L'overhead de framer pour un simple fade/slide ne se justifie pas.
- Le wrapper `lib/motion.tsx` doit être utilisé ou supprimé — dans son état actuel il crée une fausse impression de lazy loading.

---

### 🟠 MAJEUR — M2 : react-syntax-highlighter importé statiquement dans TextViewer et TextLightbox

**Fichiers :**  
- `components/text/TextViewer.tsx`, lignes 14-15  
- `components/text/TextLightbox.tsx`, lignes 8-9  
```typescript
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
```

**Description :**  
`MarkdownViewer.tsx` fait correctement un `dynamic(() => import('./CodeHighlighter'), { ssr: false })`. Mais `TextViewer` et `TextLightbox` importent directement `SyntaxHighlighter` (Prism complet = ~150 KB gzippé avec tous les langages). Ces deux composants sont eux-mêmes importés via `dynamic()` depuis les composants d'attachments, mais le code-splitting s'arrête au niveau du composant — pas à l'intérieur. Le chunk de TextViewer/TextLightbox contient donc Prism complet.

**Impact :** ~150 KB gzippés dans des chunks chargés à chaque ouverture de fichier texte/code.  
**Correction :** Appliquer le même pattern que `MarkdownViewer.tsx` : créer un `CodeHighlighter` lazily importé dans TextViewer/TextLightbox.

---

### 🟠 MAJEUR — M3 : recharts importé statiquement dans des composants admin sans dynamic wrapper

**Fichiers :**  
- `components/admin/ranking/RankingStats.tsx` : import statique de 10 exports recharts  
- `app/admin/ranking/page.tsx` : import statique de `RankingStats` depuis le barrel `@/components/admin/ranking`

**Description :**  
`components/admin/Charts.tsx` utilise correctement `dynamic()` pour ses composants `TimeSeriesChart` et `DonutChart`. Mais `RankingStats.tsx` importe recharts directement et est lui-même importé statiquement dans la page ranking (via barrel, non wrappé dans `dynamic()`). Recharts fait ~300 KB gzippé.

**Impact :** ~300 KB dans le chunk de la page admin/ranking, sans possibilité de skeleton pendant le chargement.  
**Correction :** Wraper `RankingStats` et `AgentOverviewTab` avec `dynamic()` dans leurs pages respectives, ou déplacer les imports recharts dans `ChartsImpl.tsx` qui est déjà lazily chargé.

---

### 🟠 MAJEUR — M4 : Avatars chargés en taille originale via `<AvatarImage>` Radix (HTML natif)

**Fichiers :** ~30 composants de conversation utilisent `<AvatarImage src={user.avatar} />`  
Notamment : `conversation-preview.tsx:123`, `conversation-participants.tsx:177`, `bubble-message/*`, etc.

**Description :**  
`components/ui/avatar.tsx` utilise `@radix-ui/react-avatar` qui rend un `<img>` HTML natif. Il n'y a aucune optimisation Next.js Image : pas de compression, pas de format WebP/AVIF, pas de redimensionnement, pas de lazy loading automatique. Les avatars sont chargés à leur taille originale (potentiellement plusieurs centaines de KB si l'utilisateur a uploadé une photo HD), affichés en 32×32px.

Le custom image loader (`lib/image-loader.js`) passe `?w={width}&q={quality}` en query param, mais ce loader n'est **pas configuré** dans `next.config.ts` (la clé `loaderFile` est absente) — il est donc inopérant.

**Impact :** Dans une liste de 20 conversations, chaque avatar de 200 KB = 4 MB de trafic image non compressé. En WebP/AVIF à la bonne taille : ~20 KB par avatar = 400 KB. Économie : ~3,6 MB par chargement de liste.  
**Correction :**  
1. Soit utiliser `next/image` dans `AvatarImage` avec `sizes="32px"` (ou 40px, 48px selon usage).  
2. Soit activer le `loaderFile` dans `next.config.ts` pour que le gateway serve des variants redimensionnés.  
3. Court terme : ajouter `loading="lazy"` sur les `<img>` en dehors du fold immédiat.

---

### 🟡 MODÉRÉ — Mo1 : Polices — `getAllFontVariables()` précharge des variables CSS inutilisées

(Déjà couvert en C4, mais aspect CSS distinct)

**Fichier :** `app/layout.tsx`, ligne 82 ; `lib/fonts.ts`  
**Description :** Même si les fichiers woff2 ne sont pas tous préchargés, les 10 variables CSS (`--font-inter`, `--font-nunito`, ...) sont toutes injectées dans le `<body>`, générant des règles CSS dans le bundle de base. Plus significativement, next/font injecte un bloc `<style>` par police, ce qui représente du CSS inline inutile.

**Impact :** ~5-10 KB CSS inline inutile.  
**Correction :** Charger uniquement la police active dans le layout ; charger les autres via CSS variable swap au changement de préférence.

---

### 🟡 MODÉRÉ — Mo2 : No `prefetch={false}` sur les 34 `<Link>` Next.js

**Fichier :** Tous les fichiers utilisant `from 'next/link'` (34 occurrences), aucun avec `prefetch={false}`  
**Description :** Next.js 15 précharge les routes `<Link>` quand elles entrent dans le viewport (par défaut). Sans `prefetch={false}`, une page avec plusieurs liens de navigation (dashboard, sidebar) déclenche le prefetch de tous les chunks de routes visibles dès l'idle. Sur mobile ou connexion lente, cela consomme de la bande passante inutilement.

Un hook `usePerformanceProfile()` détecte `effectiveType` et `saveData` mais n'est utilisé qu'au niveau du `message-composer` — pas au niveau des `<Link>`.

**Impact :** ~200-500 KB de JS prefetché inutilement sur connexions lentes.  
**Correction :**
```typescript
// Dans une navigation avec de nombreux liens
const { isSlowNetwork } = usePerformanceProfile();
<Link href="/conversations" prefetch={!isSlowNetwork}>...</Link>
```
Ou désactiver le prefetch sur les liens secondaires (paramètres, admin) et ne le conserver que sur les routes critiques (conversations).

---

### 🟡 MODÉRÉ — Mo3 : Polling REST dans des composants admin montés globalement

**Fichiers :**  
- `components/admin/agent/AgentLiveTab.tsx` : `setInterval(fetchLiveState, 15_000)` (auto-refresh)  
- `components/admin/agent/AgentConversationsTab.tsx` : `setInterval(fetchConfigs, 10_000)`  
- `components/admin/agent/DeliveryQueuePanel.tsx` : `setInterval(fetchQueue, 10_000)`  
- `components/admin/agent/AgentScheduleTimeline.tsx` : `setInterval(fetchSchedule, 30_000)` + `setInterval(setNow, 10_000)`  
- `components/admin/agent/TriggerSchedulingModal.tsx` : `setInterval(fetchSchedule, 30_000)`  

**Description :** Plusieurs composants admin font du polling REST toutes les 10-30 secondes. Ces composants ne sont pas chargés sur les routes utilisateurs normales (protégés par la route `/admin`), mais pour un admin qui laisse l'onglet ouvert, cela génère un flux continu de requêtes GET même quand l'onglet est en background.

**Impact :** ~5-10 requêtes/minute par admin actif. Pas critique mais prévisible.  
**Correction :** Utiliser `document.visibilityState` pour suspendre le polling quand l'onglet est invisible :
```typescript
useEffect(() => {
  const onVisibility = () => { /* start/stop interval */ };
  document.addEventListener('visibilitychange', onVisibility);
  return () => document.removeEventListener('visibilitychange', onVisibility);
}, []);
```

---

### 🟡 MODÉRÉ — Mo4 : `socketPollInterval` dans CallManager — polling de 1 000 ms

**Fichier :** `components/video-call/CallManager.tsx`, lignes 465-483  
**Description :** Quand le socket n'est pas encore disponible au montage, `CallManager` poll `meeshySocketIOService.getSocket()` toutes les **1 seconde** jusqu'à ce que le socket soit prêt. `CallManager` est monté dans `app/layout.tsx` et donc actif sur TOUTES les pages. Si la connexion socket prend du temps (reconnexion, slow network), ce polling tourne pendant plusieurs secondes avec 1 tick/s.

Ce n'est pas un problème de réseau à proprement parler (pas de fetch réseau), mais c'est un busy-wait CPU/JS qui maintient la page active et peut empêcher le navigateur de passer en idle.

**Impact :** Pas de bande passante mais maintien inutile du main thread.  
**Correction :** Remplacer par un event-based pattern avec `meeshySocketIOService.onSocketReady(callback)` ou via un `EventEmitter`.

---

### 🟡 MODÉRÉ — Mo5 : Mermaid.js non lazily chargé dans `MermaidDiagramImpl`

**Fichier :** `components/markdown/MermaidDiagramImpl.tsx`, ligne 4 : `import mermaid from 'mermaid';`  
**Description :** `MermaidDiagram.tsx` utilise `dynamic(() => import('./MermaidDiagramImpl'), { ssr: false })`, ce qui est correct. Mais `mermaid` est lui-même un import statique *dans* l'implémentation (~600 KB raw, ~180 KB gzippé). Tant que le chunk MermaidDiagramImpl est lazily chargé, ce n'est pas un problème pour le bundle initial — c'est seulement un problème si `MermaidDiagram` est importé quelque part sans `dynamic()`. À surveiller.

**Impact :** Pas de problème actuel si les usages restent lazily importés. Risque si le composant est réutilisé directement.  
**Correction :** Documenter explicitement que `MermaidDiagram` (wrapper) est le seul point d'entrée autorisé.

---

### 🟡 MODÉRÉ — Mo6 : `tus-js-client` et `browser-image-compression` scope inconnu

**Package.json :** `tus-js-client ^4.3.1` (~70 KB gzippé), `browser-image-compression ^2.0.2` (~50 KB gzippé)  
**Description :** Ces librairies sont listées en dépendances directes. `browser-image-compression` est pertinent (compression client avant upload). `tus-js-client` est lourd pour des uploads potentiellement rares. Il faut vérifier qu'ils sont importés derrière un `dynamic()`.

**Impact estimé :** ~120 KB si importés statiquement dans un chemin critique.  
**Action :** Vérifier via bundle analyzer (`ANALYZE=true npm run build`) que ces chunks sont bien séparés.

---

### 🟢 MINEUR — Mi1 : Console logs — override en prod OK mais 932 console.* restent dans le code

**Fichier :** `utils/console-override.ts`  
**Description :** L'override est bien implémenté (`console.log = noop` en production). Les 932 `console.*` calls sont donc sans impact réseau en production. Cependant, ils représentent du dead code et peuvent causer des faux positifs dans les rapports d'erreur Sentry/monitoring si des `console.error` sont captés dans des chemins non-critiques.

**Impact réseau :** Nul. Impact maintenance : modéré.  
**Correction :** Utiliser systématiquement `devConsole` ou supprimer progressivement les console.* inutiles.

---

### 🟢 MINEUR — Mi2 : Source maps en production — non configuré explicitement

**Fichier :** `next.config.ts`  
**Description :** `productionBrowserSourceMaps` n'est pas défini dans `next.config.ts`. Par défaut, Next.js **ne sert pas** les source maps en production (`productionBrowserSourceMaps: false` est le défaut). Pas de problème actuel, mais à documenter explicitement pour éviter une activation accidentelle.

**Impact :** Nul actuellement.  
**Correction :** Ajouter explicitement `productionBrowserSourceMaps: false` pour documenter l'intention.

---

### 🟢 MINEUR — Mi3 : Locale backup `fr.backup.20251025_133021` déployée

**Fichier :** `locales/fr.backup.20251025_133021/index.ts`  
**Description :** Un répertoire backup de locales est présent dans le source tree. Il ne sera probablement pas bundlé (next/dynamic import est path-based), mais il alourdit le contexte de build et peut créer des confusions.

**Impact :** Nul sur la bande passante, risque de confusion.  
**Correction :** Supprimer ou déplacer hors du répertoire `locales/`.

---

### 🟢 MINEUR — Mi4 : `libphonenumber-js` importé statiquement dans `register-form-wizard`

**Fichier :** `components/auth/register-form-wizard.tsx`, ligne 22  
```typescript
import { parsePhoneNumber, type CountryCode } from 'libphonenumber-js';
```

**Description :** `libphonenumber-js` fait ~80 KB gzippé. La version complète (`libphonenumber-js`) charge tous les métadonnées de pays. `libphonenumber-js/min` (avec métadonnées réduites) fait ~25 KB. L'import dans le wizard d'inscription n'est pas un problème critique (le wizard est lazily importé via les wizard-steps), mais l'import de la version full n'est pas nécessaire.

**Impact :** ~55 KB économisables en passant à `libphonenumber-js/min`.  
**Correction :** Remplacer par `import { parsePhoneNumber } from 'libphonenumber-js/min'`.

---

### 🟢 MINEUR — Mi5 : `ignoreBuildErrors: true` sur TypeScript et ESLint

**Fichier :** `next.config.ts`, lignes 15-19  
**Description :** Les erreurs TypeScript et ESLint sont ignorées au build. Cela signifie que des `any`, des imports inutilisés ou des barrel files créant des side effects peuvent passer inaperçus et grossir le bundle sans warning.

**Impact réseau indirect :** Peut permettre l'accrétion de code mort.  
**Correction :** Réactiver progressivement, en commençant par `eslint: { ignoreDuringBuilds: false }`.

---

### 🟢 MINEUR — Mi6 : Image loader personnalisé non enregistré dans next.config

**Fichier :** `lib/image-loader.js` — existe mais `next.config.ts` n'a pas de clé `loaderFile`  
**Description :** Le fichier `image-loader.js` passe `?w={width}&q={quality}` au backend, ce qui permettrait au gateway de servir des images redimensionnées. Mais sans la clé `images.loaderFile: './lib/image-loader.js'` dans `next.config.ts`, ce loader n'est jamais utilisé par Next.js Image. Le bénéfice potentiel (avatars, images de conversation redimensionnés côté serveur) est inexistant.

**Impact :** Les images `<next/image>` (29 usages) ne bénéficient pas du redimensionnement côté serveur.  
**Correction :** Soit supprimer `image-loader.js` (inutilisé), soit l'activer :
```typescript
images: {
  loaderFile: './lib/image-loader.js',
  // ...
}
```
Note : en activant `loaderFile`, le gateway devra implémenter le redimensionnement pour les paramètres `?w=&q=`.

---

## Tableau récapitulatif

| ID | Sévérité | Fichier principal | Économie estimée (gzippé) | Correction |
|----|----------|-------------------|--------------------------|------------|
| C1 | CRITIQUE | `services/socketio/connection.service.ts:20-23` | ~200-250 KB JS initial | Dynamic import locales |
| C2 | CRITIQUE | `components/providers/QueryProvider.tsx:4,32` | ~200 KB JS initial | Guard `NODE_ENV` |
| C3 | CRITIQUE | `utils/audio-effects.ts:13` → `message-composer/index.tsx:20` | ~250 KB JS initial | Dynamic import Tone.js |
| C4 | CRITIQUE | `lib/fonts.ts:8-28` + `app/layout.tsx:82` | ~400-600 KB fonts | Charger 1 seule police |
| M1 | MAJEUR | 53 fichiers `from 'framer-motion'` | ~110 KB (chemin critique) | Dynamic pour non-critiques |
| M2 | MAJEUR | `components/text/TextViewer.tsx:14-15` | ~150 KB par chunk texte | Dynamic SyntaxHighlighter |
| M3 | MAJEUR | `components/admin/ranking/RankingStats.tsx:4` | ~300 KB chunk ranking | Dynamic recharts |
| M4 | MAJEUR | ~30 composants `<AvatarImage src={user.avatar}>` | ~3-4 MB/session images | next/image + sizes |
| Mo1 | MODÉRÉ | `lib/fonts.ts` | ~5-10 KB CSS | 1 police active |
| Mo2 | MODÉRÉ | 34 `<Link>` sans `prefetch={false}` | ~200-500 KB prefetch | prefetch conditionnel |
| Mo3 | MODÉRÉ | `AgentLiveTab.tsx`, `DeliveryQueuePanel.tsx` etc. | N requêtes/min | visibilityState guard |
| Mo4 | MODÉRÉ | `CallManager.tsx:465` | CPU/idle | Event-based socket wait |
| Mo5 | MODÉRÉ | `MermaidDiagramImpl.tsx:4` | 0 (lazy OK) | Documenter |
| Mo6 | MODÉRÉ | `package.json` : tus-js-client | ~70 KB si statique | Vérifier avec analyzer |
| Mi1 | MINEUR | 932 console.* | 0 réseau | Nettoyage code |
| Mi2 | MINEUR | `next.config.ts` | 0 | Documenter |
| Mi3 | MINEUR | `locales/fr.backup.*` | 0 | Supprimer |
| Mi4 | MINEUR | `register-form-wizard.tsx:22` | ~55 KB | libphonenumber-js/min |
| Mi5 | MINEUR | `next.config.ts:15-19` | indirect | Réactiver TS checks |
| Mi6 | MINEUR | `lib/image-loader.js` | variable | Activer ou supprimer |

---

## Bonnes pratiques déjà en place

- WebP/AVIF activés dans `next.config.ts` (`formats: ['image/webp', 'image/avif']`)
- Bundle analyzer disponible (`ANALYZE=true npm run build`)
- `optimizePackageImports: ['lucide-react', '@radix-ui/react-icons']` et `modularizeImports` pour lucide
- `use-i18n.ts` : lazy loading par namespace et par locale (correctement implémenté)
- PDF.js : `react-pdf` lazily importé dans `PDFViewer.tsx`
- Mermaid.js : wrappé dans `dynamic()` dans `MermaidDiagram.tsx`
- `MarkdownViewer` : CodeHighlighter en `dynamic()`
- Service Worker : stale-while-revalidate correctement implémenté pour App Shell + API
- `staleTime: Infinity` + Socket.IO comme source primaire → pas de polling réseau sur les conversations
- `refetchOnMount: false` → pas de re-fetch à la navigation si données en cache
- Zustand persist + ReactQuery IndexedDB persister → données disponibles au boot sans réseau
- `console-override.ts` : logs désactivés en production
- FFmpeg.wasm : chargé uniquement à l'usage via import dynamique dans `media-compression.ts`
- PitchDetector (pitchy) : utilisé uniquement dans le contexte audio
- Tailwind CSS : purge activée via `content` array complet dans `tailwind.config.ts`

---

## Ordre de correction recommandé

1. **C2** — ReactQueryDevtools : correction en 5 minutes, gain immédiat 200 KB
2. **C1** — Locales statiques dans connection.service : correction ~30 min, gain 200-250 KB
3. **C3** — Tone.js dans message-composer : correction ~1h, gain 250 KB sur toutes les conversations
4. **C4** — Polices : correction ~2h, gain 400-600 KB de fonts
5. **M4** — Avatars : correction ~1 jour (wrapper next/image), gain 3-4 MB/session
6. **M1** + **M2** + **M3** : batch 1 jour, gains 110+150+300 KB

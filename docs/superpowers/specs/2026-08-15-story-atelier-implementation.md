# Story Atelier — Spécification technique d'implémentation

Date : 2026-08-15
Design de référence : `./2026-08-15-story-atelier-design.md` (+ artifact `./2026-08-15-story-atelier-design.html`)
Méthode : TDD strict (RED-GREEN-REFACTOR), chaque phase livrable seule, chaque incrément laisse le monorepo vert.

## 0. Invariants (à ne casser dans AUCUNE phase)

- `resolveUserLanguage()` (`packages/shared/utils/conversation-helpers.ts`) reste l'unique résolution de langue ; la langue d'origine concourt à son RANG, jamais en court-circuit (règle Prisme n°3).
- `StorySlide.computedTotalDuration()` (`packages/MeeshySDK/.../StoryModels.swift:1370`) reste l'unique autorité de durée (progression, auto-avance, export). Équivalent web : `computeStoryDurationMs` (`apps/web/lib/story-transforms.ts`).
- `AudioChipDisplay.resolve` (`MeeshyUI/Story/Controls/AudioChipDisplay.swift:15`) reste l'unique discriminant du crédit sonore (`soundId` = emprunt → marquee « titre · @pseudo · M:SS » ; piste propre → sinusoïde).
- Rail du reader : plan figé à l'entrée du slide (`StoryActionRailPlan`) — aucun bouton n'apparaît en cours de lecture.
- Hold 0,45 s + slop 24 px (`StoryGestureOverlayView`), barres segmentées 3 pt, horodatage compact (`RelativeTimeFormatter.shortString`).
- `StoryPublishQueue`, `StoryDraftStore`, pipeline Whisper→NLLB→TTS, `triggerStoryTextTranslation` (audience-driven), broadcast filtré par visibilité, `contentEditedAt` → reset d'engagement, idempotence `clientMutationId` : **conservés tels quels**.
- SDK Purity : les nouveaux composants SDK prennent des paramètres opaques (registres, descripteurs, providers) ; l'orchestration produit (quand ouvrir, quel format par défaut, politiques d'auto-DL) reste app-side.

---

## Phase 1 — Contrat & correctifs de production

### 1.1 `packages/shared/schemas/canvas.ts` (nouveau)

```ts
export const Transform = z.object({
  x: z.number(), y: z.number(),            // normalisés 0..1
  scale: z.number().positive(),
  rotation: z.number(),                    // radians
  z: z.number().int(),
});

export const Timing = z.object({
  startTime: z.number().nonnegative(),
  duration: z.number().positive(),
  fadeIn: z.number().nonnegative().optional(),
  fadeOut: z.number().nonnegative().optional(),
});

// payloads discriminés par kind : media | text | sticker | audio | location | drawing
// - TextPayload porte translations: Record<lang, string> (par objet, Prisme)
// - AudioPayload porte soundId?: ObjectId (emprunt bibliothèque), volume, isBackground
// - MediaPayload porte postMediaId: ObjectId, volume?, isBackground?
export const StoryElement = z.object({
  id: z.string().min(1),
  kind: z.enum(['media','text','sticker','audio','location','drawing']),
  transform: Transform,
  timing: Timing.optional(),
  payload: /* z.discriminatedUnion sur kind */,
});

export const CanvasV2 = z.object({
  v: z.literal(2),
  background: Background,                  // clé canonique — backgroundColor meurt ici
  aspect: z.enum(['9:16','16:9']),
  elements: z.array(StoryElement).max(80),
  transitions: Transitions.optional(),     // opening/closing + per-slide
  timelineDuration: z.number().positive().optional(), // pin auteur (autorité durée)
}).strict();                               // fini le passthrough

export const PublishIntent = z.object({
  type: z.enum(['STORY','POST','REEL']),
  content: z.string().max(5000).optional(),
  canvas: CanvasV2.optional(),
  audience: Audience,                      // visibility + visibilityUserIds (EXCEPT/ONLY)
  clientMutationId: z.string().optional(),
});
```

- Export des types TS (`z.infer`) depuis `packages/shared/types/`.
- **Codegen Swift** : script `scripts/codegen/canvas-swift.ts` → `packages/MeeshySDK/Sources/MeeshySDK/Models/CanvasV2.swift` (Codable, CodingKeys explicites). Le fichier généré porte un en-tête `// GENERATED — do not edit` ; CI échoue si le codegen diverge (`bun run codegen:check`).
- Constante partagée `EPHEMERAL_POST_TTL_HOURS` exportée de shared (gateway ET web la consomment — supprime le 24 h codé en dur du web).

Tests (RED d'abord) : `packages/shared/__tests__/canvas-schema.test.ts` — round-trip
v2, rejet de clé inconnue, rejet `backgroundColor`, bornes (80 éléments, 256 Ko),
discriminated union par kind.

### 1.2 Gateway — validation double v1/v2

`services/gateway/src/routes/posts/types.ts` :

```ts
const StoryEffectsInput = z.union([CanvasV2, LegacyStoryEffectsSchema]);
```

- v2 (`v: 2` présent) → strict ; v1 (absent) → l'actuel `passthrough()` + refine 256 Ko, **inchangé** pendant la transition.
- Normalisation à l'écriture (v1 uniquement) : `backgroundColor` → `background` dans `PostService.createPost` avant persistance. Aucune migration de données : la lecture v1 garde ses fallbacks existants.
- `CreatePostSchema` / `UpdatePostSchema` acceptent le champ `canvas` comme alias de `storyEffects` (map 1:1 vers la colonne) ; les deux noms coexistent jusqu'à la phase 6.

Tests : `services/gateway/src/__tests__/posts/canvas-v2.test.ts` — POST /posts avec
blob v2 valide/invalide (422 sur clé inconnue), blob v1 legacy toujours accepté,
normalisation backgroundColor→background persistée.

### 1.3 Web — correctifs de production (indépendants du reste)

1. **Pipeline média** : `StoryComposer.tsx` abandonne `useAttachmentUpload`
   (`/attachments/upload` → `MessageAttachment`, jamais claimable) pour
   `TusUploadService.uploadFiles(files, [{ uploadcontext: 'story' }])`
   (→ `/uploads` → `postMedia.create` pending, claimable par
   `PostService.createPost`). Même correctif dans `PostComposer.tsx`
   (`uploadcontext: 'post'`).
2. **Clé canonique** : `handlePublish` écrit `background`, plus `backgroundColor`.
3. **TTL** : `use-stories.ts` calcule `expiresAt` depuis
   `EPHEMERAL_POST_TTL_HOURS.STORY` (20 h) partagé.

Tests : RTL sur StoryComposer (publish → mediaIds issus de PostMedia, payload
`background`), jest sur l'optimistic update (expiresAt = now + 20 h).

**Livrable Phase 1 = les bugs de production sont corrigés.** Aucune vue nouvelle.

---

## Phase 2 — Noyau de rendu (registre d'éléments + Canvas)

### 2.1 Registre

- **Web** : `apps/web/components/canvas/element-renderers/{media,text,sticker,audio,location,drawing}.tsx` + `registry.ts` (`Record<Kind, ElementRenderer>`). Props : `{ element, mode: 'edit' | 'read' | 'preview', playhead, languageChain }`.
- **iOS (SDK)** : `MeeshyUI/Canvas/ElementRendererRegistry.swift`. Le moteur UIKit existant (`StoryCanvasUIView` + 14 extensions + 6 layers) est **conservé comme host** : chaque layer devient l'implémentation d'un renderer derrière une API `CanvasSurface` (protocol `CanvasSurfaceProviding`, règle iOS TDD). Pas de réécriture des gestes — on replie, on ne réinvente pas.
- Résolution de texte : les renderers `text` appellent `resolvedText(preferredLanguages:)` / équivalent web — jamais `translations.first`.

### 2.2 Reader d'abord (risque minimal)

- Brancher le Reader web (`story-transforms` → renderers) puis iOS
  (`StoryViewerView` → registre via `CanvasSurface`) sur le registre.
- **Aperçu = `Reader(mode: .preview)`** : suppression du chemin d'aperçu dédié.
- Tests : snapshots de parité (même blob v2 → même arbre de rendu web/iOS sur
  les cas canoniques : texte multi-langue, média fond, audio fenêtré, dessin).

---

## Phase 3 — Dock, descripteurs, machine à états

### 3.1 Types (SDK + shared)

```swift
struct ToolDescriptor { let id: ToolID; let icon: String; let panel: [ControlSpec] }
enum ControlSpec { case segmented(...), swatches(...), slider(...), grid(provider:),
                   list(...), tabs([...]), recorder, trim, map(provider:) }
enum DockState { case row, panel(ToolID), inspector(elementID), expanded(ExpandedMode) }
```

- Un **reducer unique** pilote `DockState` (événements : tapTool, tapElement,
  tapBackground, doubleTapText, dragHandle, choiceMade). Machine documentée §4 du
  design. Web : le même reducer en TS (`packages/shared/atelier/dock-state.ts`)
  — la logique d'états est partagée, seul le rendu est par plateforme.
- **Barre d'élément** commune (dupliquer · ordre z · timing · supprimer) : un
  composant, tous les `kind`.

### 3.2 Ordre de migration des outils

texte → dessin → audio (bibliothèque + fichier + micro en onglets) → stickers
(contrôle `grid` + provider) → lieu (provider app-side `storyLocationPickerProvided`
conservé) → timeline (état `expanded`, remplace les 32 vues).

Chaque outil migré supprime ses vues legacy **dans la même PR** (pas
d'accumulation). Le panneau de l'outil est généré depuis `ControlSpec` — tests
XCTest : un descripteur donné produit les contrôles attendus ; `filters` devient
soit un descripteur réel (atteignable), soit supprimé — plus d'état intermédiaire.

---

## Phase 4 — Étagère & publication unifiée

- **Porte unique** : `AtelierIntent { mode: create | edit(postId) | draft(draftId),
  format: PostType }` — un seul `fullScreenCover` racine (iOS), une seule route
  modale (web). Les 7 sites d'ouverture convergent vers l'émission d'un intent.
- **File offline pour tout** : `StoryPublishQueue` gagne l'édition (`PUT`) ; le
  retour du composer est toujours `accepted` → queue. Le contrat asymétrique
  création/édition disparaît (suppression de la double façade
  `StoryComposerCover` / `storyEditComposerCover`).
- **Étagère** : fusion tray « Moi » / MyStories / brouillons en une liste d'états
  (publiée · brouillon · en file · archivée). Web : nouveaux clients React Query
  pour `GET /posts/stories/mine`, `PUT /posts/:id`, `POST /posts/:id/republish`.
- **Feuille d'engagement commune** (commentaires / réactions / réponse / vues) :
  un composant par plateforme, servi par les endpoints Post existants, utilisé
  par les 3 formats. Commentaires traduits par le pipeline existant.

---

## Phase 5 — Un seul atelier (Post / Réel)

- **Sélecteur de format** dans la Barre de publication (Story · Post · Réel).
- **Mapping content** : POST/REEL → le champ texte natif du Dock voyage en
  `Post.content` (pipeline `translatePost` inchangé, exclusion STORY conservée,
  `core.ts:113-127`). STORY → `content` composé depuis les textes du canvas
  (`storyContentComposition.ts`, inchangé).
- **CanvasPlayer** :
  - Web : `apps/web/components/canvas/CanvasPlayer.tsx` — IntersectionObserver,
    **un seul player actif à la fois** (budget perf), autoplay muet, boucle,
    tap → route immersive (le Reader).
  - iOS : `FeedPostCard` intègre `CanvasPlayerView` (réutilise le playback de
    `StoryCanvasUIView` ; `computedTotalDuration()` pour la boucle).
- **Réels** : crédit sonore via `AudioChipDisplay.resolve` + décompte
  `AudioChipRemainingTimeText` dans l'en-tête (« Aïcha · ♫ Nuits d'été · 0:15 ») ;
  suppression de `ReelsPlayerView.borrowedSoundLabel` (pill dupliquée). Le
  résolveur d'en-tête considère **toutes** les pistes (fond + foreground), pas
  seulement le fond (`headerBackgroundAudioDisplay` élargi).
- Migration `PostComposer` / `AudioPostComposer` → atelier ; dégradation
  REEL → POST serveur inchangée.

---

## Phase 6 — Démolition

Supprimer : `UnifiedPostComposer` (cascade morte documentée lignes 16-23,
195-206, 238-241) · outil `filters` orphelin s'il n'a pas été réhabilité ·
`apps/ios/Meeshy/Features/Main/Models/StoryModels.swift` (doublon du SDK) ·
composeurs legacy web · support v1 du blob (union → `CanvasV2` seul) · mettre à
jour la doc du schéma Prisma (`schema.prisma:3040-3055`, format obsolète).

---

## Stratégie de tests (transverse)

- **Shared** : schémas (unit), reducer du Dock (property-based sur les
  transitions), round-trip codegen Swift (CI `codegen:check`).
- **Gateway** : jest — v1/v2, normalisation, mapping content par type,
  claim des médias par `uploadcontext`.
- **Web** : RTL sur les 5 vues ; tests de comportement (pas d'implémentation) ;
  parité bun (`bun run test:coverage`, prérequis CLAUDE.md).
- **iOS** : protocol `*Providing` AVANT chaque service (règle TDD iOS), mocks
  `Mock{Service}` avec `Result` + call counts, naming
  `test_{method}_{condition}_{expectedResult}` ; `./apps/ios/meeshy.sh test`
  vert avant tout commit. Snapshots de parité Reader/Canvas.
- **E2E** (Playwright, `tests/`) : publier story/post/réel depuis le même
  atelier ; vérifier le rendu CanvasPlayer dans le feed et le Reader immersif.

## Risques & garde-fous

| Risque | Garde-fou |
|---|---|
| Divergence blob pendant la transition v1/v2 | union stricte + normalisation à l'écriture ; métrique gateway `canvas_v2_ratio` |
| Perf CanvasPlayer dans le feed | 1 player actif, thumbHash en placeholder, pas de décodage vidéo hors viewport |
| Régression Prisme (règle 3, rang de langue) | tests jumeaux sur `resolveLastMessagePreview` / `resolvedText` maintenus |
| Régression gestes reader | seuils 0,45 s / 24 px repris tels quels, tests UI dédiés |
| Éditions lourdes média (recadrage fin) | `MeeshyImage/VideoEditorView` restent atteignables depuis l'Inspecteur (« Retouches avancées ») tant que le Dock ne couvre pas leurs cas |

---

## Addendum 2026-08-15 — correctifs issus de l'inventaire posts/réels

À intégrer dans les phases existantes (découverts par l'audit des composers
post/réel ; détail dans le design §11) :

**Phase 1 (contrat & correctifs)** :
- `PostComposer.tsx` : même bascule TUS que StoryComposer (`uploadcontext: 'post'`)
  — sans elle, aucun média de post web n'est rattaché et **aucun réel web n'est
  possible** (dégradation systématique).
- `PostService.createPost` : écrire `PostMedia.order` à l'index de `mediaIds`
  lors du claim (le tri de lecture `orderBy: { order: 'asc' }` trie une
  constante aujourd'hui).
- Web : envoyer `originalLanguage` sur les posts ordinaires
  (`PostsFeedScreen.tsx:374-382`, la valeur est déjà disponible).
- iOS : transmettre `visibilityUserIds` dans `PostService.create`
  (`PostService.swift:203-205` — le struct le porte déjà).
- Compteur/limite 5 000 partagés (`packages/shared`) — iOS n'a ni limite ni
  compteur (400 serveur générique au-delà).

**Phase 4 (étagère & publication)** :
- La file offline couvre l'audio (trou iOS documenté
  `FeedView+Attachments.swift:236-237`).
- L'intent `edit` rend `UpdatePostSchema.mediaIds` vivant (mort des deux côtés).

**Phase 5 (un seul atelier)** :
- Suppression des deux recettes iOS divergentes (`publishPostWithAttachments`
  inline + `FeedComposerSheet.publishPost`) — c'est le vecteur de la perte
  d'audience/lieu ; une seule construction de `PublishIntent`.
- Repost/quote via `repostOfId` du PublishIntent (C4-A) ; à défaut, correctif
  d'attente C4-B : envoyer `RepostSchema.visibility`.
- Mentions/hashtags : autocomplétion du champ content (C1-A), contrôleur des
  commentaires/messages réutilisé.
- Lieu : une source, deux rendus (C5-B) + premier client de
  `discoverabilityPrecision`.
- Langue : héritage publication → objets (C6-B).
- Audio express d'Amorce (C2-B) produisant le même PublishIntent.
- `allowSoundExtraction` exposé (toggle inspecteur vidéo/audio).
- Slides = carrousel en mode Post (C3-A).

**Phase 6 (démolition)** : + `AudioPostComposerView` / `AudioPostComposer.tsx`
(absorbés par le panneau son), `UnifiedPostComposer` (~40 % de code mort
compilé), branches STATUS mortes du composer.

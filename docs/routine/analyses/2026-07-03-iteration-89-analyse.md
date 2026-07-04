# Iteration 89 — Analyse d'optimisation (2026-07-03)

## Protocole (démarrage)
`main` @ `72cde65` (« docs android/calls #1418 »). Branche de travail `claude/brave-archimedes-1vl4me`
recréée à neuf depuis `origin/main` (working tree propre, aucun commit non-mergé à préserver).

PR ouvertes au démarrage : #1419 (iOS typing roster), #1416 (gateway realtime `MessageHandler`),
#1414 (calls — `CallEventsHandler` + iOS), #1413/#1412/#1410 (iOS bubble/calls/a11y). Cible retenue
**hors de tous ces fichiers** : `PostService.ts` (feature STORIES, Priorité 1, en développement
actif — cf. commits récents G2/G3/W1 sur la traduction des stories). Aucun conflit de merge attendu.

Méthode : fan-out de 3 agents d'exploration en parallèle (stories gateway, social feed gateway,
shared utils). Retenu le défaut le plus fort et le plus impactant : dérive de champ renommé sur le
texte des overlays de story.

## Cible : la gateway lit le texte des overlays de story via le champ legacy `content` au lieu de `text`

### Current state
Le composer iOS encode le texte d'un overlay de story sous la clé **`text`** ; `content` est
l'alias **legacy** pré-renommage. Cette réalité est actée partout dans la stack :
- Zod `StoryTextObjectSchema` (`routes/posts/types.ts:104-105`) : `text` canonique, `content`
  marqué `// legacy field`.
- iOS SDK `StoryModels.swift:247` : `public var text: String  // was: content (RENAMED)` ; l'encodeur
  écrit sous `text`.
- Web `apps/web/lib/story-transforms.ts:56-61` : **déjà corrigé** — « The iOS composer encodes the
  overlay text under `text`; `content` is a legacy one — without this the web dropped every text
  overlay iOS sent. »

Seule la **gateway** (`PostService.ts`) lisait encore `.content` uniquement, à **3 endroits** :
1. `createPost` l.206 — index de recherche (`searchContent = textObjects.map(t => t.content)`).
2. `createPost` l.232 — contenu de tracking des liens bruts.
3. `triggerStoryTextObjectTranslation` l.392 — `const text = obj.content?.trim()` → le texte envoyé
   au pipeline de traduction NLLB (ZMQ `translateTextObject`).

L'interface `StoryTextObjectRaw` (l.19-25) déclarait même `content: string` (requis) — dérive de type
figée sur l'ancien nom.

### Problems identified
Pour toute story créée par iOS (le producteur réel de ces overlays), `obj.content` vaut `undefined` :
- **Traduction** : `if (!text) return;` → **aucun job ZMQ n'est jamais émis** → `translations` reste
  vide → les viewers non-francophones voient le texte de l'overlay **non traduit**. Violation directe
  du **Prisme Linguistique** (le contenu doit s'afficher dans la langue préférée du viewer).
- **Index de recherche** : `searchContent` vide → la story n'est pas indexée sur le texte de ses
  overlays (invisible en recherche).
- **Tracking de liens** : une URL brute posée dans un overlay iOS n'est pas trackée.

### Root cause
Motif récurrent « champ renommé propagé partout SAUF un consommateur » (leçons #40/#42/#45/#55 :
règle non homogène entre siblings). Le renommage `content → text` a été appliqué au schéma Zod, au
modèle iOS et au transform web, mais la couche service gateway a été oubliée — alors même que le web
avait déjà rencontré et documenté exactement ce bug.

### Business impact
Feature STORIES en développement actif (Priorité 1). Les overlays de texte sont un usage central des
stories ; leur texte n'était ni traduit, ni recherchable, ni tracké dès lors que la story venait
d'iOS. Impact perçu directement par tout viewer d'une langue différente de l'auteur.

### Technical impact
1 helper statique pur (`PostService.storyTextObjectText`, SSOT de la résolution `text ?? content`),
3 sites de lecture reroutés dessus, interface élargie (`text?`/`content?` optionnels). Zéro nouvelle
dépendance, zéro changement de signature publique, zéro requête supplémentaire. Rétro-compatible : les
stories legacy (champ `content`) continuent de fonctionner.

### Risk assessment
TRÈS FAIBLE. Le helper ne fait qu'ajouter une source (`text`) prioritaire sur la source existante
(`content`), en miroir exact du décodeur iOS et du transform web. Aucun comportement changé pour une
story qui ne portait que `content`. Aucun tradeoff (contrairement au fix `getReels` — écarté car il
réduirait la largeur du pool de découverte).

### Proposed improvements
1. `static storyTextObjectText(obj): string | undefined` = `text` (canonique) sinon `content`
   (legacy) sinon `undefined`.
2. Rerouter les 3 sites (`searchContent`, `trackingContent`, `triggerStoryTextObjectTranslation`).
3. Interface `StoryTextObjectRaw` : `text?` + `content?` optionnels.

### Expected benefits
- Les overlays iOS sont traduits (Prisme), indexés en recherche et trackés — parité avec le web.
- SSOT de la résolution du champ overlay-text côté gateway (un seul point à faire évoluer).

### Implementation complexity
TRÈS FAIBLE — 1 helper + 3 one-liners + interface. 8 tests neufs (helper pur ×4, index de recherche
via `createPost` ×1, trigger de traduction ×3).

### Validation criteria
- [x] `PostService.storyTextObjectField.test.ts` : 8/8 verts.
- [x] RED prouvé : sans le fix (3 sites revenus à `.content`), les 2 tests `text`-only échouent
  (index de recherche vide + ZMQ non appelé) ; les tests legacy `content` + helper pur restent verts.
- [x] Suites `story|Post|post` : 54 suites / 1218 tests verts, 0 régression.
- [x] `tsc --noEmit` gateway : 0 nouvelle erreur (baseline pré-existant `@meeshy/shared/prisma/client`
  inchangé, 310 après build de shared, aucune ne référence les symboles neufs).

## Améliorations futures (report)
- **F52** (MEDIUM) : `triggerStoryTextTranslation` (caption) ne retire pas la langue source du set
  cible avant l'envoi ZMQ — asymétrie avec son sibling `triggerStoryTextObjectTranslation` (l.402 qui
  filtre). Une caption `fr` pour une audience `fr` déclenche un job `fr→fr` et réécrit `translations.fr`
  (self-translation). Chantier propre pour une itération dédiée (même fichier).
- **F53** (HIGH) : `getReels` (`PostFeedService.ts:479-485`) pagine par score puis prend le curseur sur
  l'item score-ordonné, alors que la requête avance chronologiquement → réels skippés/dupliqués en
  infinite scroll. Le sibling `getFeed` documente et évite exactement ce bug (fenêtre chronologique).
  Fix = miroir de `getFeed`, mais réduit le pool de scoring (décision produit) → itération dédiée.
- **F54** (HIGH) : `languageCodeSchema` (`packages/shared/utils/attachment-validators.ts:57-62`) rejette
  les codes ISO 639-3 supportés (`bas`/`ksf`/`nnh`/`dua`/`ewo`) — même classe que le fix `CommonSchemas
  .language` de l'itération 86-B. Widen le regex `{2}` → `{2,3}`.
- **F51** : supprimer/fusionner `FirebaseNotificationService` (dead code FCM parallèle) — report iter 87/88.

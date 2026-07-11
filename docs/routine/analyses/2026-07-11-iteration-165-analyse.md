# Iteration 165 — Analyse d'optimisation (2026-07-11)

## Protocole (démarrage)
`main` @ `8950109` (dernier merge : PR #1826 — android/settings change-password strength meter).
Branche `claude/brave-archimedes-hr8eoc` en phase avec `origin/main` (0/0).

Aucune PR autonome ouverte à traiter au démarrage. Ce cycle prend **165**.

Cible choisie parmi le **backlog explicitement reporté** de l'itération 163 (« candidats non
retenus, consignés pour un futur cycle ») :

> **web** — `computeStoryDurationMs` ignore l'alias legacy `content` des overlays texte
> (`apps/web/lib/story-transforms.ts:234` lit `t.text` seul alors que `parseTextObjects` lit
> `r.text ?? r.content`). Réel et non masqué (les stories legacy auto-avancent en 6 s au lieu du
> temps de lecture proportionnel). Bon candidat pour un prochain cycle.

Confirmé toujours présent en production (aucune itération 164/165 ne l'a touché).

---

## Cible retenue : F124 — `computeStoryDurationMs` compte 0 mot pour les overlays texte encodés sous l'alias legacy `content` → auto-avance à 6 s au lieu du temps de lecture proportionnel

### Current state
`apps/web/lib/story-transforms.ts`. `computeStoryDurationMs(effects)` calcule la durée
d'affichage d'une slide de story à partir des `effects` bruts (non parsés) du post. Le
composant « temps de lecture » accorde du temps supplémentaire au texte long
(> 30 mots → 6 s + 1 s par tranche de 6 mots au-delà) :

```ts
const totalWords = textObjects.reduce((acc, t) => {
  const text = typeof t.text === 'string' ? t.text.trim() : '';   // ← lit `text` SEUL
  return acc + (text ? text.split(/\s+/).length : 0);
}, 0);
```

Or le parseur canonique des mêmes objets, `parseTextObjects` (l.59-61), lit **deux** clés :

```ts
// The iOS composer encodes the overlay text under `text`; `content` is a
// decoder-only legacy alias.
const textValue = typeof r.text === 'string'
  ? r.text
  : (typeof r.content === 'string' ? r.content : undefined);
```

`computeStoryDurationMs` reçoit les `effects` **bruts** (`effects?.textObjects`), donc un overlay
peut légitimement porter son texte sous `content` (données legacy / décodeur). Le compteur de mots
ne lit jamais `content`.

### Problems identified
Une story dont les overlays texte sont keyés sous `content` (données legacy) est comptée à
**0 mot** par le calcul de durée. Le temps de lecture retombe donc à la valeur plancher
`DEFAULT_STATIC_DURATION_S = 6 s`, quelle que soit la longueur réelle du texte.

Entrée → sortie fausse :
- overlay `content` de 42 mots (aucune clé `text`) → `computeStoryDurationMs` renvoie `6000`
  au lieu de `8000` (6 s + (42−30)/6 = 8 s). L'utilisateur n'a pas le temps de lire ; la slide
  avance prématurément.

Le rendu du texte lui-même fonctionne (le pipeline d'affichage passe par `parseTextObjects` qui
gère l'alias) — seule la **durée** est fausse, d'où une incohérence visible : le texte s'affiche
correctement mais disparaît trop vite.

### Root causes
Divergence de contrat entre deux lecteurs des mêmes objets bruts : `parseTextObjects` a été
corrigé pour lire `text ?? content` (commentaire à l.56-58 : « without this the web dropped every
text overlay iOS sent »), mais `computeStoryDurationMs`, ajouté séparément (portage iOS de la
durée timeline-aware), n'a jamais reçu le même fallback.

### Business impact
Stories legacy (overlays `content`) au texte long : lecture tronquée, l'auto-avance coupe la
lecture → friction produit sur du contenu déjà publié. Silencieux (pas d'erreur), donc non
remonté.

### Technical impact
Aucun — fonction pure, `O(n)` sur les overlays, aucun round-trip. La correction aligne simplement
le compteur de mots sur le contrat déjà appliqué par `parseTextObjects`.

### Risk assessment
Très faible. Changement local à une fonction pure. Le fallback ne s'active que lorsque `text` est
absent (`typeof t.text !== 'string'`) — comportement des overlays modernes (clé `text`) strictement
inchangé. Aucun changement de signature, de schéma, d'API, d'état persistant.

### Proposed improvements
Dans la réduction `totalWords`, lire `t.text` en priorité puis retomber sur `t.content`,
identiquement à `parseTextObjects` :

```ts
const raw = typeof t.text === 'string'
  ? t.text
  : typeof t.content === 'string' ? t.content : '';
const text = raw.trim();
```

### Expected benefits
- Les stories legacy au texte long obtiennent le temps de lecture proportionnel correct.
- Un seul contrat de lecture du texte d'overlay dans tout `story-transforms.ts` (convergence SSOT).
- Cohérence rendu/durée : le texte affiché et le temps qui lui est accordé dérivent de la même clé.

### Implementation complexity
Triviale — ~4 lignes de prod, aucune dépendance nouvelle.

### Validation criteria
- RED d'abord : `computeStoryDurationMs({ textObjects: [{ content: <42 mots> }] })` doit valoir
  `8000` (échoue avant : `6000`).
- Précédence : `{ text: 'court', content: <42 mots> }` → `6000` (le `text` canonique gagne, le
  `content` legacy est ignoré).
- Non-régression : tous les tests existants de `computeStoryDurationMs` (clé `text`) restent verts.
- `tsc --noEmit` sans nouvelle erreur imputable à `story-transforms.ts`.

### Tests — absence de couverture confirmée
`apps/web/__tests__/lib/story-transforms-extended.test.ts` couvre `computeStoryDurationMs` mais
**exclusivement via la clé `text`** (`{ text }`, `{ text: 'Bravo à vous' }`, …). Aucun test ne
sème un overlay keyé sous `content`. Deux tests ajoutés dans le `describe` existant : alias
`content` (RED avant fix) + précédence `text` > `content`.

---

## Suivis (backlog, non traités ce cycle)
- **web** — réaction cross-session : mauvaise identité comparée (Participant ID vs User ID),
  `apps/web/hooks/queries/use-reactions-query.ts:411,444` (reporté depuis l'itération 164 —
  touche plusieurs call sites, non-trivial).
- **web** — `friend_story_comment` route vers `/post` au lieu de `/story` dans `resolveContentRoute`
  (`apps/web/utils/notification-helpers.ts:165`) — masqué en prod par `metadata.postType='STORY'`,
  latent, faible priorité.

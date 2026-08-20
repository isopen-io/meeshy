# Lot F — Web en lockstep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le web lit le v3 (rendu minimal fidèle : scène, ancres, fond, textes aux 18 styles), annonce le fond selon provenance/existence, aligne l'attribution `↻` sans verbe, et envoie enfin `originalLanguage`. Il se déploie EN LOCKSTEP avec le lot A — c'est ce qui rend la rupture sans fenêtre côté web.

**Architecture:** LECTURE + trois correctifs d'écriture — dont l'émission v3 du composer story EXISTANT (F5b, condition d'armement d'O15) et l'annonce de capacités (F2b). Le composer web COMPLET (bandes, stickers, collage, nouvelles surfaces) reste hors périmètre : F5b change la FORME émise par l'écran actuel, jamais ses fonctionnalités. Le rendu v3 est un composant React pur (`CanvasV3Scene`) monté par `StoryViewer.tsx` quand le blob porte `v:3` — le chemin legacy reste pour… rien après le lot A (le fil sert v3 partout), mais il reste le repli de tolérance.

**Tech Stack:** React/Next 15, TypeScript strict, Jest (`TZ=UTC bun run test`), types partagés `@meeshy/shared/types/canvas-v3`.

**Spec:** `docs/superpowers/specs/2026-08-20-meeshy-composer-execution-spec.md` (§D lot F, lois B3.2-5, R6 : pas de plancher web).

## Global Constraints

- Fichiers POSSÉDÉS : `apps/web/components/v2/StoryViewer.tsx`, `apps/web/components/v2/CanvasV3Scene.tsx` (nouveau), `apps/web/components/v2/BackgroundSoundBadge.tsx` (nouveau, F3), `apps/web/components/v2/PostCard.tsx` (attribution + annonce), `apps/web/components/v2/StoryComposer.tsx` (F5/F5b — l'appelant qui construit `storyEffects`, `:252`), `apps/web/services/posts.service.ts` (+ leurs tests). Rien d'autre.
- Consomme (gelé) : `CanvasV3Schema`/types (`@meeshy/shared/types/canvas-v3` — même chemin d'import que `@meeshy/shared/types/post`, patron vérifié), fixtures §C4.
- Gates : `cd apps/web && TZ=UTC bun run test` (714+ suites) — le `tsc` web n'est PAS un gate propre (piège documenté) : ne pas s'y fier, s'appuyer sur les tests.
- Le web n'envoie PAS `X-App-Version` et ne reçoit jamais de 426 par l'en-tête (R6) — aucune porte de version côté web.
- Dépendance : démarre après la Task **A3** (le gel est clos à cette tâche — spec §C4, revue Fable n°15) ; déploiement PRODUCTION : voir F6 — le lockstep est opérationnalisé par le drapeau `CANVAS_V3_READ`.

---

### Task F1: Le rendu v3 — `CanvasV3Scene`, un composant pur

**Files:**
- Create: `apps/web/components/v2/CanvasV3Scene.tsx`
- Test: `apps/web/__tests__/components/canvas-v3-scene.test.tsx`

**Interfaces:**
- Produces : `<CanvasV3Scene doc={CanvasV3} sceneIndex={0} />` — rendu STATIQUE v1 web (pas de timeline animée : les timings sont ignorés à l'affichage, un objet timé est simplement visible — dette explicite, pas un oubli).

- [ ] **Step 1: Tests rouges** — monter le composant avec les fixtures RÉELLES (lues depuis `packages/shared/fixtures/canvas-v3/` par chemin relatif, comme les tests gateway) :
  1. `minimal-text` : le texte « Bonjour » est rendu, positionné par `anchor.free` (style inline `left: 50%; top: 42%`) ;
  2. `reel-16x9-bands` : le conteneur scène est ratio 9:16 (`aspect-ratio`), le porteur média garde SON ratio (16:9, letterbox), « Le titre » est dans la bande HAUTE (ordre DOM ou classe `band-top`), la légende dans la bande basse ;
  3. les 18 styles : `textStyle` mappe vers la table de classes/styles — vérifier `neon` (text-shadow), `poster` (condensed bold), `italic` (italique), et le REPLI : style inconnu ⇒ style par défaut, jamais un throw ;
  4. plan `bg` rendu SOUS `content` SOUS `fg` (z-index dérivé du plan, puis de `z`) ;
  5. un kind réservé (`interactive`) dans le doc ⇒ IGNORÉ silencieusement (tolérance de lecture).
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** — cœur du rendu :

```tsx
const PLANE_Z = { bg: 0, content: 10, fg: 20 } as const;
function objectStyle(o: ObjectV3): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    zIndex: PLANE_Z[o.plane] + o.z,
    transform: `translate(-50%, -50%) scale(${o.transform.scale}) rotate(${o.transform.rotation}deg)`,
    opacity: o.transform.opacity,
  };
  if (o.anchor.t === 'free') {
    return { ...base, left: `${o.anchor.x * 100}%`, top: `${o.anchor.y * 100}%` };
  }
  return o.anchor.edge === 'top'
    ? { ...base, left: '50%', top: '6%' }
    : { ...base, left: '50%', bottom: '6%', top: 'auto' };
}
```
La table des 18 styles reprend les valeurs du résolveur iOS (grasse/serif/mono/rounded + néon en text-shadow) — mêmes noms, mêmes intentions, polices web système équivalentes (`Georgia, serif` pour italic/classic, `'American Typewriter', monospace` avec repli, etc. — un commentaire par famille cite la police iOS d'origine).
- [ ] **Step 4: Vert.** **Step 5: Commit.**

---

### Task F2: `StoryViewer` monte le v3 — le legacy devient le repli

**Files:**
- Modify: `apps/web/components/v2/StoryViewer.tsx`
- Test: `apps/web/__tests__/components/story-viewer-v3.test.tsx`

- [ ] **Step 1: Tests rouges** — une story dont `storyEffects.v === 3` rend `CanvasV3Scene` (et PAS le chemin legacy `textStyleClass`) ; une story legacy (fixture v1) rend le chemin ACTUEL inchangé (tolérance — même si le fil ne devrait plus en servir) ; blob absent ⇒ comportement actuel.
- [ ] **Step 2-5:** rouge → branchement (`isCanvasV3` = test local `blob?.v === 3`, trois lignes, pas d'import zod dans le bundle viewer) → vert → commit.

---

### Task F2b: La couche fetch annonce `X-Canvas-Caps: 3` (O17, rév. 3)

**Files:**
- Modify: le wrapper fetch/API du web (le point unique qui pose `Authorization` — le localiser au premier pas, patron `apps/web/services`)
- Test: `apps/web/__tests__/services/canvas-caps-header.test.ts`

- [ ] **Step 1: Test rouge** — toute requête API sortante porte `X-Canvas-Caps: 3` (une ligne au funnel). Sans elle, le gateway servirait au web la SENTINELLE pour les contenus v3-natifs (O17 règle 4) — le test cite cette raison en nom : `it('announces v3 capability - without it the gateway serves the update sentinel', …)`.
- [ ] **Step 2-5:** rouge → une ligne → vert → commit. Déployée AVEC F2 (le lecteur v3) — jamais avant : annoncer une capacité qu'on n'a pas ferait rendre des blobs v3 au chemin legacy.

---

### Task F3: L'annonce du fond + 🔇 — lois 3-6 côté web

**Files:**
- Create: `apps/web/components/v2/BackgroundSoundBadge.tsx`
- Modify: `StoryViewer.tsx` (après les détails d'auteur), `PostCard.tsx` (rangée auteur)
- Test: `apps/web/__tests__/components/background-sound-badge.test.tsx`

- [ ] **Step 1: Tests rouges** — le résolveur pur `backgroundAnnouncement(sound, meta)` (miroir du contrat B5, MÊMES cas) : pas de piste ⇒ `null` (le composant rend RIEN — pas de placeholder) ; `original` ⇒ `♫〰` ; `library` + méta ⇒ `titre · @pseudo · M:SS` ; `library` sans méta ⇒ forme crédit générique `♫ —`, jamais ♫〰. Le bouton 🔇 : monté seulement si annonce non nulle ; bascule `muted` du lecteur LOCAL (vidéo de fond ou `<audio>` si une URL de piste est déjà servie par le fil ; l'audio de bibliothèque SANS URL résolue ⇒ badge sans lecture — dette explicite, la résolution d'URL de son web est post-v1).
- [ ] **Step 2-5:** rouge → implémentation → vert → commit.

---

### Task F4: `↻` sans verbe — l'alignement web

**Files:**
- Modify: `apps/web/components/v2/PostCard.tsx` (ligne ~467 : `Reposted from @…`)
- Test: `apps/web/__tests__/components/post-card-repost-attribution.test.tsx`

- [ ] **Step 1: Test rouge** — la carte d'un repost rend `↻ @{handle}` et NE rend PAS « Reposted from » (assertion négative) ; l'accessibilité garde la phrase complète (`aria-label`/`title` = la traduction existante `post.repostedFrom` — l'icône est le verbe À L'ÉCRAN, jamais au lecteur d'écran).
- [ ] **Step 2-5:** rouge → remplacement (le glyphe + handle, `aria-label` conservé) → vert → commit.

---

### Task F5: `originalLanguage` — enfin envoyé

**Files:**
- Modify: `apps/web/services/posts.service.ts` (le champ EXISTE dans le type `:41` — ce sont les APPELANTS qui ne le passent pas)
- Modify: le point de publication du composer story web (l'appelant de `create` avec `storyEffects`)
- Test: `apps/web/__tests__/services/posts-original-language.test.ts`

- [ ] **Step 1: Test rouge** — `create({ …, storyEffects })` depuis le composer envoie `originalLanguage` = la locale i18n ACTIVE (le mécanisme de langue UI existant du web) ; un appel sans langue connue n'envoie PAS le champ (la détection serveur reste le repli — ne jamais envoyer une langue devinée fausse).
- [ ] **Step 2-5:** rouge → passage du paramètre → vert → commit.

---

### Task F5b: Le composer web ÉMET v3 (revue totale C5 — condition d'armement d'O15)

**Files:**
- Modify: `apps/web/components/v2/StoryComposer.tsx` (`:252` — le `onPublish` construit `{backgroundColor, textStyle, mediaObjects, audioPlayerObjects}` sans `v:3`)
- Test: `apps/web/__tests__/components/story-composer-emits-v3.test.tsx`

- [ ] **Step 1: Tests rouges** — publier depuis le composer web produit un `storyEffects` avec `v === 3` : le fond couleur devient l'objet `media` de plan `bg` (payload couleur), chaque `mediaObject` un objet `media`, chaque `audioPlayerObject` un objet `audio` de plan `content`, le `textStyle` global suit la règle G3 (texte racine → objet text SEULEMENT si aucun objet texte) ; la fixture `minimal-text` sert de forme de référence ; `CanvasV3Schema.safeParse(payload).success === true` (le schéma partagé est LE test).
- [ ] **Step 2-5:** rouge → un builder pur `buildCanvasV3(state)` (miroir de la table §C2 pour les DEUX familles du composer web — il n'a que mediaObjects/audioPlayerObjects/fond/style) → vert → commit. Tant qu'O15 n'est pas armé, le gateway accepte les deux formes — le déploiement de F5b est PRÉALABLE à l'armement, jamais simultané.

---

### Task F6: Gate final

- [ ] `cd apps/web && TZ=UTC bun run test` — suites complètes vertes.
- [ ] `cd packages/shared && bun run build` (l'import des types v3 compile).
- [ ] Merge : après B, en parallèle de D/E (ordre spec A → B → F → D → E → C). **Le lockstep, opérationnalisé (revue Fable n°13 ; rév. 2, G1)** : A merge avec `CANVAS_V3_READ` OFF (lecture inerte) ; le drapeau s'arme quand F est EN PRODUCTION **et que le lecteur v3 Android l'est aussi (lot H — Android lit et écrit le blob v1, l'armer sans lui vide ses stories-texte)** — c'est l'acte de déploiement qui fait la simultanéité, pas une promesse de calendrier. Jamais de fenêtre où un client lirait des stories vides. L'ÉCRITURE stricte (O15, `CANVAS_V3_WRITE_STRICT`) a sa propre condition : F5b déployé + parc iOS + composer Android.

## Hors périmètre (dit une fois)

Composer web COMPLET (fonctionnalités nouvelles — l'émission v3 de l'écran actuel est F5b, AU périmètre) · lecture ANIMÉE des timings/keyframes web · résolution d'URL des sons de bibliothèque · collage/stickers web · porte de version web (R6 l'interdit).

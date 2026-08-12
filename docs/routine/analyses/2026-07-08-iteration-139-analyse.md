# Iteration 139 — Analyse d'optimisation (2026-07-08)

## Protocole (démarrage)
`main` @ `75aaa31` (dernier merge PR #1655, iter 138). Branche `claude/brave-archimedes-hus6dh` recréée
depuis `origin/main`. Ce cycle prend **139**. Revue d'ingénierie fan-out élargie aux helpers purs de
`apps/web/utils`, `apps/web/lib`, `services/gateway/src/routes` (zones non touchées récemment).

## Cible : F105 — `audio-effects.snapToScale` : distance linéaire ignorant le wrap d'octave → note auto-tune fausse

### Current state
`apps/web/utils/audio-effects.ts:78-96`. L'auto-tune (Voice Coder) « snappe » la note MIDI détectée vers la
note la plus proche d'une gamme musicale :

```ts
const noteInOctave = ((midiNote % 12) + 12) % 12;
const octave = Math.floor(midiNote / 12);
let closestNote = scale[0];
let minDistance = Math.abs(noteInOctave - closestNote);
for (const scaleNote of scale) {
  const distance = Math.abs(noteInOctave - scaleNote);   // ← distance LINÉAIRE, pas circulaire
  if (distance < minDistance) { minDistance = distance; closestNote = scaleNote; }
}
return octave * 12 + closestNote + transpose;
```

### Problems identified
La « note la plus proche » se mesure sur le **cercle des hauteurs** (mod 12) : une note en haut d'octave
peut être plus proche d'une note de gamme de l'octave **au-dessus** que de toute note de sa propre octave.
La boucle ne teste que la distance linéaire dans `[0,11]`, donc rate le wrap 11↔0.

Exemple concret : gamme `pentatonic = [0,2,4,7,9]`, un **B** détecté (`midiNote = 71`, `noteInOctave = 11`).
Distances linéaires : `{0:11, 2:9, 4:7, 7:4, 9:2}` → choisit `9` (A) → retourne **69 (A4)**. Or la vraie
note la plus proche est le **C de l'octave suivante** (`0` → `12`, distance `|11-12| = 1 < 2`) → devrait
retourner **72 (C5)**. L'auto-tune corrige un B d'une tierce mineure dans la mauvaise direction.

### Root causes
Distance linéaire au lieu de circulaire ; le candidat `scaleNote ± 12` (octave voisine) n'est jamais
considéré.

### Business impact
Effet audio Voice Coder (auto-tune temps réel) des appels vidéo web. Une voix chantée dont la note tombe
près du bord d'octave (typiquement un B sur une gamme pentatonique/majeure) est corrigée vers une hauteur
erronée — artefact audible. Reachable en prod : `snapToScale` est appelé dans la boucle de détection de
pitch (`startPitchDetection`, l.220), déclenchée quand `clarity > 0.9` et `80 < freq < 1000`.

### Technical impact
Erreur mathématique pure (métrique circulaire mal implémentée). Masquée sur `chromatic` (12 notes → dist
max 0/1, jamais de wrap gagnant) et bénigne sur `major`/`minor` (le wrap crée au pire une égalité) ; se
manifeste sur `pentatonic` (trous de 3 demi-tons près du bord).

### Risk assessment
Faible. Fonction pure. Le fix ne change QUE les cas où un candidat wrappé est strictement plus proche —
c.-à-d. exactement les cas aujourd'hui faux. Les notes déjà dans la gamme et le chromatique sont inchangés
(prouvé par tests de non-régression).

### Proposed improvements
Tester, pour chaque note de gamme, les candidats `scaleNote - 12`, `scaleNote`, `scaleNote + 12`, et
retenir celui minimisant `|noteInOctave - candidate|`. La reconstruction `octave*12 + candidate` place
alors correctement la note dans l'octave voisine si le wrap gagne.

### Expected benefits
- Auto-tune correct sur toutes les gammes, y compris au bord d'octave.
- Élimination d'un artefact audio audible sur pentatonique.
- Couverture nette (aucun test n'existait pour `audio-effects.ts`).

### Implementation complexity
Faible — boucle interne de 3 candidats + `export` de `snapToScale`/`SCALES` pour testabilité. 5 tests
(wrap B→C, note in-scale inchangée, chromatique no-op, snap in-octave sans wrap, transpose).

### Validation criteria
- **RED prouvé** : `snapToScale(71, SCALES.pentatonic)` → `69` (attendu `72`) ; `…, 2)` → `71` (attendu
  `74`).
- Après : `72` / `74`. Non-régression : `snapToScale(69, pentatonic) = 69`, `snapToScale(71, chromatic) =
  71`, `snapToScale(65, pentatonic) = 64`. 5/5 vert.

## Backlog mis à jour
- **F106** (nouveau) : `apps/web/lib/user-status.ts:getUserStatus` — branche `isOnline===true` renvoie
  `'away'` au-delà de 30 min là où le docstring dit `'offline'` ; décision sémantique produit (graceful vs
  documenté) → à trancher avant fix.
- **F107** (nouveau) : `routes/user-stats.ts` + `admin/messages.ts` daily-timeline — off-by-one de bucket +
  mismatch TZ (bucket local vs clé UTC) ; nécessite extraction d'un helper pur pour test isolé.
- **F102** (report) : `packages/shared/types/attachment.ts:formatFileSize` (fenêtre étroite `1024.00 KB`).
- **F100 / F98 / F90** (report).

# Web Story Keyframes — plan de portage (W1)

Objectif : le lecteur web rend les `StoryKeyframe[]` (position/scale/opacité animées
par le composer iOS) aujourd'hui ignorés — les objets sont statiques.

Référence de fidélité : `KeyframeInterpolator.swift` + `ReaderKeyframeResolvers.swift`
(tri par time, 1 kf = constante, clamp avant/après, interpolation par segment avec
easing du keyframe BAS : linear / easeIn t² / easeOut 1-(1-t)² / easeInOut cubique).
`keyframe.time` est RELATIF au `startTime` de l'objet porteur.

## Incréments
1. ✅ (it.23) Portage 1:1 de l'interpolateur en TS pur (`story-transforms.ts`) +
   hook playhead rAF (activé UNIQUEMENT si le slide porte des keyframes ; gelé avec
   le gate W2 pause/buffering) + application aux TEXTOBJECTS (x/y/scale/opacity).
2. mediaObjects foreground (mêmes canaux, translate/scale du conteneur).
3. Rotation animée si le composer l'émet un jour (canal absent du modèle actuel).
4. Transitions inter-clips (`clipTransitions`) — dissolve/slide au changement de clip.

## Non-objectifs
- Pas de Web Animations API / CSS keyframes générées : l'easing PAR SEGMENT et les
  canaux partiels (kf sans x) se portent exactement avec l'interpolateur JS ; le rAF
  hérite du gel W2 gratuitement (le playhead cesse d'avancer).

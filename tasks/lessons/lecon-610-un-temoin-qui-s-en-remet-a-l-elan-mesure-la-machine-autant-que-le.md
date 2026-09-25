## Leçon 610 — Un témoin qui s'en remet à l'ÉLAN mesure la machine autant que le produit : rendre le geste décisif, pas emporté (2026-09-14)

`check-reels.mjs` synthétisait son balayage avec `preventFling: false` et une
distance de **35 %** de la hauteur. En local, le fling portait le défileur
au-delà du point de bascule de `scroll-snap` — la moitié — et la page
s'accrochait. **En CI, le défileur ne bougeait pas d'un pixel** : douze
invariants tombaient, et leurs messages accusaient l'application.

Le gate était arrivé AVEC sa feature (#6457), dans un push dont la CI a été
annulée par le suivant. **Il n'a donc jamais été vert sur `dev`** — et personne
ne pouvait le savoir : un verdict annulé ressemble à un verdict absent.

### Les deux fautes, et laquelle comptait

Retirer le fling a d'abord rendu le rouge REPRODUCTIBLE en local :

    le balayage tactile déplace le défileur (0 → 299)     ← sur 844
    balayer vers le haut accroche le réel SUIVANT (0)      ← revenu en arrière

Le fling n'était donc pas la cause : c'était le MASQUE. La cause est la
distance — 35 % est sous le point de bascule, et le défileur revient. L'élan
franchissait la moitié, donc le témoin passait **pour une raison qui ne lui
appartenait pas**, et tombait dès que le compositeur ne servait plus cet élan.

60 %, sans fling, dépasse la bascule de façon déterministe.

### Ce qu'il faut en retenir

- **Un geste de test ne doit rien devoir à la physique.** Le fling dépend du fil
  compositeur, que tous les hôtes ne servent pas pareil — un runner sans GPU,
  une machine chargée. L'invariant mesuré ici n'était pas « le doigt lance
  bien », c'était « un arrêt par réel ».
- **Un harnais muet accuse le produit.** Tant que le témoin ne disait pas si le
  GESTE était parti, son message désignait l'application. Un `check` de plus —
  « le balayage déplace le défileur (avant → après) » — sépare les deux, et
  c'est lui qui a donné la réponse en une exécution.
- **Un vert obtenu par l'élan est un vert emprunté.** Il ne dit pas que la
  valeur est juste, il dit que la marge l'a couverte. Quand la marge disparaît,
  le rouge semble venir de nulle part.

### Et le geste lui-même n'arrivait pas

Le correctif de distance a suffi en local, pas en CI : la seconde exécution a
rendu `déplace le défileur (0 → 0)` sur les quatre peaux. Le témoin de
déplacement — ajouté au tour précédent — a donné la réponse sans ambiguïté :
`Input.synthesizeScrollGesture` passe par le pipeline de GESTES du navigateur,
que ce runner headless ne sert pas. Deux fautes indépendantes se masquaient
l'une l'autre, et seule la première était visible en local.

`Input.dispatchTouchEvent` entre par la voie ordinaire : `touchStart`, douze
`touchMove`, `touchEnd`. Ce que reçoit la page est indiscernable d'un vrai
doigt. La cascade essaie le geste, puis les événements bruts, **et la sortie dit
laquelle a porté** (`par geste` / `par événements tactiles`).

**Un repli SILENCIEUX aurait été pire que le rouge** : le gate serait devenu
vert sur un hôte incapable de livrer un geste, sans que personne ne le sache.
Et la voie de repli s'ÉPROUVE avant d'être poussée — en neutralisant la
première localement, jamais en espérant qu'elle marche le jour où elle servira.

Voisine de [[reference_a_red_on_both_sides_of_the_diff_also_measures_the_machine]]
et du piège inverse : ici, VERT d'un seul côté mesurait la machine.

---

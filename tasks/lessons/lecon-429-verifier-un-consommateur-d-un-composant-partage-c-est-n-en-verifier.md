## Leçon 429 — Vérifier UN consommateur d'un composant partagé, c'est n'en vérifier aucun

**Le fait.** J'ai modifié `MediaCaptionOverlay` quatre fois dans la nuit — cible
tactile, ancrage, plafond de hauteur, transition, marge droite. Je l'ai vérifié
à chaque fois sur la STORY, parce que c'était la surface du défaut d'origine.

Le composant a **trois** hôtes : la story, le plein écran média, le lecteur de
réel. Les deux autres héritaient de tout, sans que je les regarde — et l'un
d'eux, le réel, appartenait à une autre session la veille encore.

> **Le rayon d'une modification est celui du composant, jamais celui du défaut
> qui l'a motivée.** Un correctif ciblé sur une surface est une modification de
> TOUTES ses surfaces dès qu'il descend dans le partagé.

**Ce que la vérification a rendu** (faite après coup, ce qui est déjà trop tard
mais mieux que jamais) : le réel est intact — sa légende rend à `x=16, w=209`,
dégagée du rail à `x=326`. Et il l'est pour une raison STRUCTURELLE que je
n'avais pas mesurée avant de changer : il dispose légende et rail dans un
`HStack`, quand la story les superpose dans un `ZStack`. C'est ce qui l'a
protégé du chevauchement que j'ai dû corriger sur la story — pas ma prudence.

**Le geste.** Avant de modifier un composant partagé, énumérer ses hôtes
(`grep` du nom du type, hors tests) et écrire, pour chacun, ce que le changement
lui fait. Les paramètres à défaut NEUTRE sont l'outil de cette discipline :
`expandedTrailingInset: 0` et `tint: .white` laissent les autres hôtes
strictement inchangés, et rendent la question « qui d'autre ? » vérifiable au
lieu d'être promise.

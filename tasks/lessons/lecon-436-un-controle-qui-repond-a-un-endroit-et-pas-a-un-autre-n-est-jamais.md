## Leçon 436 — Un contrôle qui répond à un endroit et pas à un autre n'est jamais INERTE : c'est une géométrie qui MENT

**Le fait (2026-09-02).** Les en-têtes de section de l'éditeur d'objet
rapportaient une frame de `370 × 21` à l'arbre d'accessibilité — donc « une
cible pleine largeur » à qui la LIT. `idb ui tap` au milieu de la rangée ne
déclenchait rien ; le même tap **sur le mot** ouvrait la section. Le label était
un simple `Text` dans un `DisclosureGroup` : la frame annoncée était celle de la
rangée, la zone touchable celle des glyphes.

Mon premier diagnostic a été « ce contrôle est inerte » — le plus coûteux de
tous, puisqu'il envoie chercher un défaut de câblage qui n'existe pas.

> **Le discriminant est bon marché : taper une seconde fois, AILLEURS sur le
> même contrôle.** Inerte partout ⇒ défaut du produit. Inerte à un endroit ⇒
> défaut de la géométrie, ou de la mesure.

**La même famille, l'autre bout de la chaîne.** Une session voisine a payé le
symétrique le même jour : une capture redimensionnée à 420 px pour un écran de
402 pt décalait ses taps de 30 pt en bas d'écran, et un tap sur « voir plus »
ouvrait le sélecteur de photos deux couches plus bas. Chez elle le cadre est
juste et la CONVERSION ment ; chez moi la conversion est juste et le CADRE ment.
Même symptôme, causes opposées, même second tap pour trancher.

**Le corollaire de correctif.** Agrandir la frame ne suffit pas : sans
`contentShape(Rectangle())`, on n'agrandit que le vide. Et la règle des 44 pt se
mesure sur la zone TOUCHABLE, jamais sur la frame rapportée — c'est la leçon 428
(« le MOT qu'on peut toucher est l'angle mort de la règle des 44 pt ») vue par
l'outil de mesure au lieu du doigt.

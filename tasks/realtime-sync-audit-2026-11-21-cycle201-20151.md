## Cycle 199 — le garde touche une cible qu'il ne POSSÈDE pas encore (#20151, #20108, #20040, #20035)

**Date** : 2026-11-21. **Base** : `dev` à `ed391159a`. **Issues** : #20151, #20108,
#20040, #20035 — **une seule**, décrite quatre fois. **Milestone** : #287.

### Pourquoi ce lot plutôt qu'un autre

Le rouge a bloqué, le matin même, **deux PR de cette routine** (#20149 et
#20134), dont aucune ne touche `apps/web`. Quatre issues le décrivaient depuis
le 2026-11-19 sans que le mécanisme soit mesuré ; chacune proposait une
hypothèse, toutes fausses, et chacune concluait par « à instruire en rejouant
localement ». C'est ce que ce lot a fait.

### Le défaut, mesuré image par image

Le garde ferme les rails, attend `data-call-layer === 'idle'`, puis touche
« Journal » au pied des sous-titres. Échantillonnage de chaque image après la
fermeture, au gabarit 568 × 320 :

| image | `data-call-layer` | transitions CSS en vol | le bouton possède son centre | ce qui l'occupe |
|---|---|---|---|---|
| 1 | **`idle`** | 4 | **non** | `DIV.flex min-h-0 flex-col items-center` — le rail qui SORT |
| 2 | `idle` | 4 | **non** | idem |
| 3 | `idle` | 4 | oui | le bouton |
| … | `idle` | 0 à partir de ~338 ms | oui | le bouton |

`data-call-layer` passe à `idle` **dès la première image** — c'est un état
React — alors que la colonne de rail met encore deux images à cesser d'occuper
le centre du bouton. **L'attente du garde se termine DANS la fenêtre où son
toucher ne peut pas aboutir.** Qu'il frappe dedans ou après ne dépend que de
l'ordonnancement de ses deux allers-retours CDP (`boundingBox`, puis `tap`) :
sur un coureur à l'aise, après ; sur un coureur affamé, parfois dedans.

### Le rouge, reproduit à volonté

En touchant ce que `elementFromPoint` rend à l'image *n* après la fermeture —
c'est-à-dire exactement ce que fait un toucher qui tombe là :

| image frappée | verdict |
|---|---|
| 1 | **ROUGE** — le toucher part au rail sortant, le panneau ne vient pas |
| 2 | **ROUGE** — idem |
| 3 | vert — le journal s'ouvre |

Les deux lignes du rouge sont, mot pour mot, celles des quatre issues : le
panneau absent, puis `[data-call-journal]` introuvable — la seconde étant la
conséquence de la première.

### Ce que les hypothèses manquaient, et pourquoi

Les quatre issues cherchaient une **dérive de la cible** entre le calcul du
centre et le toucher. Mesurée, cette dérive existe mais vaut **3 px** avant le
toucher (l'entrée en fondu du bandeau translate de 5,46 px au plus) — sur une
cible de 44 px, elle ne fait rien manquer. Les 46 px de déplacement visibles
au relevé arrivent **après** le toucher, quand la pilule grandit pour héberger
le panneau : une conséquence prise pour une cause. Allonger le délai entre le
calcul et la frappe (0, 100, 200, 400 ms) ne rougit jamais.

> **Une cible immobile n'est pas une cible atteignable.** La question n'était
> pas « où est-elle ? » mais « à qui appartient cet endroit ? ».

Et c'est cette forme qui explique ce qu'aucune hypothèse de dérive
n'expliquait : **pourquoi une seule pose sur quatre rougit.** 568 × 320 est la
seule qui touche un contrôle **dans la pilule** juste après avoir refermé les
rails ; les trois autres redimensionnent la fenêtre et ne touchent plus rien.
La pose n'était pas « la plus contrainte », elle était **la seule exposée**.

### Le correctif : la POSSESSION, pas les animations

`centerOfSelector` ne rend un centre qu'une fois la cible **propriétaire de ce
centre** — `document.elementFromPoint` rendant la cible ou un de ses
descendants — sur deux images consécutives, rect stable. Site unique : les
cinq touchers du garde en héritent sans qu'une ligne d'appel change.

Un `railsSettled` de plus aurait fermé cette fenêtre-ci : les quatre
transitions la couvrent. Il aurait manqué la suivante — **un recouvrement n'a
pas besoin d'animer pour avaler un toucher**. L'attente porte donc sur ce que
l'invariant exige vraiment, pas sur un proxy qui s'en approche aujourd'hui.

Et jamais un délai : un `waitForTimeout` ne mesure rien et se périme au premier
coureur plus lent — c'est l'interdit que les quatre issues posaient, à raison.

### Une cible qui ne possède JAMAIS son centre fait LEVER

Au bout de 3 000 ms, `centerOfSelector` lève en **nommant** le rect et
l'occupant, et le `try/catch` de la pose en fait une ligne d'invariant rompu.
Ce n'est pas une prudence : c'est la **loi 4** du dépôt — un contrôle existe
s'il a un effet. Un toucher perdu en silence sur un contrôle inatteignable est
précisément le défaut que #19670 a corrigé sur le produit ; le garde ne doit pas
pouvoir le traverser sans rien dire.

### La preuve

| mesure | résultat |
|---|---|
| le rouge aux images 1 et 2 (mutation : frapper ce qui occupe le centre) | **2 rouges sur 2** |
| le vert à l'image 3 | 1 vert |
| `centerOfSelector` durci : à quelle image il consent | **images 6 et 7**, jamais 1 ni 2 |
| la pose 568 × 320 rejouée avec le durcissement | **0 rouge sur 20** |
| le garde ENTIER, `check-calls-controls.mjs` | **vert, 255 invariants** |

Vingt rejeux parce qu'un garde intermittent qui passe une fois n'est pas
réparé — c'est le critère que #20108 écrivait, et il est tenu.

### Ce que ce lot NE fait pas

Le produit n'est pas touché. Le rail sortant garde son recouvrement de deux
images : il est **invisible à l'usage** (un doigt qui vise « Journal » arrive
bien après 33 ms de la fermeture d'un menu qu'il vient lui-même de fermer), et
le corriger demanderait de retirer la saisie au pointeur d'un élément en
sortie — un changement de produit pour un défaut que seul un automate atteint.
Si une mesure d'usage le contredit, ce sera son issue.

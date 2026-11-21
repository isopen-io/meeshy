## Une cible immobile n'est pas une cible atteignable

**2026-11-21 — #20151, #20108, #20040, #20035 (cycle 201).**

**La leçon**

`boundingBox()` dit **où** une cible est. Il ne dit pas qu'un toucher à cet
endroit **lui parvient**. Entre les deux, il y a tout ce qui s'en va.

Un garde Playwright touchait « Journal » juste après avoir refermé les rails
d'un appel, en attendant `data-call-layer === 'idle'`. Mesuré image par image :
cet attribut passe à `idle` **dès la première image** — c'est un état React —
alors que la colonne de rail qui SORT occupe encore le centre du bouton pendant
**deux images**. `document.elementFromPoint` y rend un `DIV` que le bouton ne
contient pas. Un toucher qui tombe dans cette fenêtre part au rail sortant : le
panneau ne s'ouvre jamais.

**La question n'était pas « où est-elle ? » mais « à qui appartient cet
endroit ? »**

**Ce que quatre issues ont cherché, et pourquoi elles ne l'ont pas trouvé**

Les quatre descriptions successives (#20035, #20040, #20108, #20151) ont toutes
posé la même hypothèse : une **dérive de la cible** entre le calcul du centre et
la frappe. Chacune l'a énoncée avec prudence (« à confirmer », « piste non
vérifiée »), aucune ne l'a mesurée, et la quatrième l'a affinée en citant la
pose « la plus contrainte » comme candidate naturelle.

Mesurée, la dérive existe et vaut **3 px** avant le toucher. Sur une cible de
44 px, elle ne fait rien manquer. Les **46 px** de déplacement qu'on relève bien
arrivent **après** le toucher, quand la pilule grandit pour héberger le
panneau : une conséquence prise pour une cause. Allonger le délai entre la
lecture et la frappe (0, 100, 200, 400 ms) ne rougit jamais — c'est la mesure
qui réfute l'hypothèse, et elle coûtait quatre exécutions.

> **Une hypothèse plausible répétée quatre fois ressemble à un diagnostic.**
> Les trois reprises n'ont pas ajouté de mesure : elles ont ajouté de la
> confiance. La quatrième a d'ailleurs corrigé, à juste titre, une affirmation
> trop forte de la troisième (« il ne reproduit pas ») — mais sur
> l'intermittence, pas sur le mécanisme.

**Le discriminant qui était là depuis le début**

**Une seule pose sur quatre rougissait.** Les quatre issues l'ont noté, et
toutes l'ont expliqué par la contrainte de hauteur (320 px, la plus serrée).
C'est une corrélation : la vraie raison est que **568 × 320 est la seule pose qui
touche un contrôle DANS la pilule juste après avoir refermé les rails** — les
trois autres redimensionnent la fenêtre et ne touchent plus rien.

La pose n'était pas la plus *contrainte*, elle était la seule **exposée**.

> Devant un défaut qui ne frappe qu'un cas sur N, la question utile n'est pas
> « qu'est-ce que ce cas a de plus extrême ? » mais **« qu'est-ce que ce cas
> fait que les autres ne font pas ? »** — la première invite à chercher une
> cause de degré, la seconde une cause de nature. Ici la différence était dans
> la SÉQUENCE du garde, pas dans les dimensions de la fenêtre.

**La forme du correctif : la possession, pas les animations**

Le fichier avait déjà `railsSettled` et `stageSettled`, et il les appelle quand
les rails **entrent** — pas quand ils **sortent**. Ajouter l'appel manquant
aurait fermé cette fenêtre-ci : les quatre transitions la couvrent.

C'est pourtant le mauvais correctif, et pour une raison qui se généralise :
**un recouvrement n'a pas besoin d'animer pour avaler un toucher.** Attendre la
fin des animations est un *proxy* qui s'approche aujourd'hui de l'invariant
voulu. L'invariant voulu, c'est que la cible **possède** son centre.

L'attente porte donc sur ce qu'on exige — `elementFromPoint` rendant la cible
ou un de ses descendants, sur deux images consécutives, rect stable — au **site
unique** qui calcule les centres, d'où les cinq touchers du garde l'héritent
sans qu'une ligne d'appel change.

Et jamais un délai : un `waitForTimeout` ne mesure rien et se périme au premier
coureur plus lent.

**Le corollaire sur les gardes intermittentes**

Une cible qui ne possède **jamais** son centre fait désormais **lever**, en
nommant le rect et l'occupant. Ce n'est pas une prudence, c'est la **loi 4** du
dépôt — un contrôle existe s'il a un effet. Un toucher perdu en silence sur un
contrôle inatteignable est précisément le défaut que le produit a corrigé une
fois (#19670) ; le garde ne doit pas pouvoir le traverser muet.

> Et un garde intermittent coûte à **chaque PR du dépôt**, pas à celle qui a eu
> la malchance : celui-ci a bloqué deux PR de la routine le matin de sa
> correction, dont aucune ne touchait `apps/web`. Un cliquet non déterministe est
> plus coûteux qu'un cliquet absent — il consomme l'attention qu'il réclame,
> puis la perd.

**La preuve, et pourquoi elle se compte en rejeux**

| mesure | résultat |
|---|---|
| le rouge aux images 1 et 2 (frapper ce qui occupe le centre) | **2 rouges sur 2**, aux deux lignes exactes du CI |
| le vert à l'image 3 | 1 vert |
| le durcissement : à quelle image il consent | **images 6 et 7**, jamais 1 ni 2 |
| la pose rejouée avec le durcissement | **0 rouge sur 20** |
| le garde entier | vert, 255 invariants |

Vingt rejeux, parce qu'un garde intermittent qui passe **une** fois n'est pas
réparé : il est retombé du bon côté. C'est la seule mesure qui distingue les
deux, et c'est #20108 qui l'avait écrite.

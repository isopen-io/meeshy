## Leçon 515 — Une décision différée énumère des options, et l'énumération vieillit comme les autres

**Ce qui s'est passé.** `/feed` n'écoutait rien d'entrant, et le doc-comment de
son module portait la raison, longuement : un socket coûterait 12 849 o gzip sur
l'écran destiné à la 3G rurale. Il renvoyait à une question ouverte — « socket
dédié, `GET /sync`, ou instantané assumé ? » — et concluait : *« voir § 11
question 13 avant d'y toucher »*.

Trois options, présentées comme le champ des possibles. En les vérifiant une par
une :

- le **socket** coûte ce que le commentaire dit, et c'est rédhibitoire ;
- **`GET /sync` n'était pas une option du tout** : ses collections sont
  `conversations`, `messages`, `reactions`, `participants`
  (`services/gateway/src/routes/sync/budget.ts`) — **jamais les publications**.
  L'option supposait un endpoint qui n'existe pas, et l'adopter aurait demandé
  une modification du gateway, hors du périmètre ;
- l'**instantané assumé** est le statu quo, c'est-à-dire le renoncement.

La **quatrième** — redemander le DOCUMENT `/feed` au retour et échanger ses
publications — n'était dans aucune des trois. Elle coûte **+1 674 o gzip**, sept
fois et demie moins qu'un socket, et couvre le cas dominant : on quitte
l'onglet, on revient dix minutes après, le fil n'est pas celui de tout à
l'heure. Le motif existait déjà dans le dépôt (`commentaires.ts`, #5091 : « le
document frais EST la réponse »).

**La règle.** *Une décision différée fige un CHAMP D'OPTIONS au moment où elle
est écrite, et ce champ vieillit comme n'importe quelle énumération.* Avant de
choisir dans une liste d'options héritée, vérifier **la prémisse de chacune** —
et se demander ce que la liste ne contient pas. C'est la leçon 261 (« une
énumération de sites dit *ces sites appliquent la règle*, presque jamais *ce sont
les sites où elle s'applique* ») déplacée du SITE vers l'OPTION : une
énumération d'options dit *ces options ont été envisagées*, jamais *ce sont les
options qui existent*.

**Le signe qui l'annonçait.** Le commentaire pesait le SOCKET avec un chiffre
mesuré, et les deux autres options sans aucun chiffre. Une comparaison où une
seule branche est chiffrée n'est pas une comparaison — c'est un argument contre
une branche, et les autres n'ont jamais été instruites.

Sites : `apps/web-v3/lib/realtime/feed-etat.ts` (`doitRafraichirLeFil`,
`TOLERANCE_DE_TETE_PX` — la règle, pure et opposable sans navigateur),
`apps/web-v3/lib/realtime/feed.ts` (`rafraichis`, `suisLAbsence`),
`apps/web-v3/e2e/visual/v3-feed-fraicheur.spec.ts`. Issue #5031.

**Corollaire de rendu, tiré du même lot.** Le rafraîchissement n'échange QUE
`#publications` et le lien « plus », jamais le `<main>` entier : le corps porte
`#journal-des-gestes`, une région `aria-live`, et **une région `aria-live`
remplacée n'est plus surveillée** — le navigateur ne suit que celles qui
existaient quand il a construit l'arbre. L'échanger rendrait muette chaque
confirmation de geste suivante, sans que rien à l'écran ne le montre. C'est le
même fait de plateforme qui fait SERVIR la région de la bannière plutôt que la
créer (leçon 512, #4454) : il se paie une fois à la création, et une seconde
fois à chaque remplacement.

## Leçon 263 — la troisième famille se trouve en POSANT la question de la 261, pas en la citant

Le cycle 120 a ouvert sur la leçon 261 comme sur une consigne à EXÉCUTER, pas à
réciter. Elle dit : devant une énumération de sites qui
accompagne une règle, demander **« cette règle gouverne-t-elle un autre TYPE DE
CONTENU, et qui le résout ? »**. Le Prisme y répond d'avance — « il s'applique à
TOUT le contenu ». Deux familles étaient recensées (aperçu de liste, audio) ;
poser la question a fait apparaître la **troisième** : les POSTS et
COMMENTAIRES, résolus par `APIPost.resolveTranslation` (iOS),
`LanguageResolver.preferredTranslation` (Android) et — côté web —
`TranslationToggle` + `usePostTranslation`.

Les deux jumeaux natifs DESCENDENT la liste ordonnée des langues du lecteur. Le
web ne consultait que le rang 1 (`userLanguage` unique). Conséquence mécanique,
identique aux cycles 118/119 : la locale appareil entrant au rang 4 (règle 2),
tout lecteur dont l'appareil diffère de sa langue applicative — cas NOMINAL —
voyait l'original là où iOS/Android servaient une traduction d'un rang inférieur.

> La 261 disait qu'une énumération porte deux affirmations, dont « ce sont les
> sites où la règle s'applique » n'est presque jamais vérifiée. La 262 est le mode
> d'emploi : **on ne la vérifie qu'en nommant un TYPE de contenu que la liste ne
> couvre pas, puis en cherchant son résolveur sur chaque client.** Citer la leçon
> ne trouve rien ; instancier sa question sur un type concret (« et les posts ? »)
> trouve la famille manquante à tous les coups tant que le Prisme n'est pas
> intégralement recensé.

### Corollaire — le témoin de rang à FIXTURE vide ne mesure pas la recherche

`usePostTranslation` portait déjà des témoins de rangs 3 et 4 — tous verts, tous
inutiles : ils passaient `{}` comme carte de traductions. Ils attestaient le
calcul de `preferredLanguage`, jamais la RECHERCHE d'une traduction à ce rang. La
forme « fixture » de la 261 (l'assertion est juste, le harnais bon, c'est le jeu
de données qui rend la règle inobservable) a ici une seconde arête : **un témoin
de rang doit non seulement exercer un rang > 1, mais aussi FOURNIR une traduction
à ce rang.** Un prisme long au-dessus d'une carte vide ne teste toujours qu'une
présence, jamais un ordre.

### Corollaire — une capacité additive DÉSAMORCE le piège même là où elle n'est pas encore câblée

Le correctif a rendu `TranslationToggle` capable de descendre le prisme via une
prop additive `preferredLanguages`, puis ne l'a câblée que sur la surface POSTS.
Commentaires, stories et status restent au rang 1 — corrects, non encore
rang-conscients. Mais le PIÈGE armé (un résolveur qui écrit le court-circuit
interdit) est déjà retiré : le résolveur SAIT descendre, il ne lui manque que la
liste en entrée. C'est la bonne façon de borner un lot large sans laisser un
demi-correctif dangereux : **corriger le résolveur pour tous, câbler les
surfaces une par une.** L'inverse — câbler une surface en laissant le résolveur
faux ailleurs — rearme le piège à chaque site non touché.

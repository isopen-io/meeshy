## 2026-08-09 (11) — Une même question posée sous plusieurs FORMES dérive par le nom, pas par le code

**Contexte** — Cycle 31. « Celui-là a-t-il le droit de lire ce post ? » avait trois implémentations,
imposées par la manière dont la question se pose : une clause `where` pour les requêtes de liste, un
verdict pairwise pour un destinataire unique, un filtre borné pour un lot de candidats arbitraires.
Trois formes légitimes — mais la troisième s'était mise à répondre avec une AUTRE audience (amis
stricts au lieu d'amis ∪ contacts DM), et personne ne l'a vu pendant des cycles.

**Ce qui a permis la dérive** — le nom. `filterPostAudience` ne dit pas DE QUELLE audience il parle.
Ses deux voisines, elles, le disent (`canUserConsumePost`, `canUserInteractWithPost`) : le cycle 29
avait posé la règle « un point d'entrée choisit son audience en la NOMMANT », et c'est exactement la
fonction qui ne la suivait pas qui a dérivé. Un nom qui décrit le MÉCANISME (« filtre une audience »)
au lieu du VERDICT (« qui peut consommer ») laisse deux lectures coexister sans jamais se contredire.

**Règle** — Quand une même règle métier existe en plusieurs formes techniques, aucune ne doit porter
un nom générique. Chacune nomme le verdict qu'elle rend ; la forme (lot / unitaire / clause `where`)
est un détail d'implémentation, jamais le nom.

**Corollaire — l'anti-dérive est un test de CONFORMITÉ, pas une fusion.** La tentation, une fois la
divergence vue, est de n'en garder qu'une. C'eût été faux : les deux formes diffèrent par leurs coûts
d'accès (matérialiser les co-membres contre trancher en pairwise), et c'est leur raison d'être. Faire
traverser les MÊMES fixtures aux deux, depuis le même double de graphe, verrouille l'accord sans
détruire la raison d'avoir deux implémentations. Si les fixtures venaient de doubles distincts,
l'accord ne prouverait rien.

**Corollaire — la sous-livraison mérite la même défiance que la fuite.** Les cycles 28 à 30 ont tous
corrigé des fuites, et l'écart restant avait été noté comme « conservateur, donc pas urgent ». Il ne
l'était pas : un contact DM voyait le post dans son feed, recevait la notification de réponse, et
rien à la mention. Une garde trop stricte ne se signale par aucune alerte — juste par un utilisateur
qui ne comprend pas pourquoi il n'a pas été prévenu.

**Corollaire — brancher une garde neuve est le meilleur détecteur de garde absente.** Le trou grave de
ce cycle (`previousCommenterIds`, ensemble arbitraire filtré par une table locale qui rendait `true`
sur `FRIENDS`) n'a pas été trouvé en relisant du code, mais en cherchant où réutiliser l'outil qu'on
venait de construire. Et la leçon 10 s'applique à nouveau, dans l'autre sens : ici la table locale
RESSEMBLAIT à une garde d'admission alors qu'elle n'était correcte que pour un seau d'énumérateur.
Vérifier d'où vient l'ensemble filtré, pas seulement qu'un filtre existe.

**Corollaire — un `?` avec défaut permissif ment aussi dans les harnais.** Le cycle 28 promettait que
rendre le paramètre requis déplace la faute au build. Faux ici : `services/gateway/tsconfig.json`
exclut `**/__tests__/**`, donc les harnais ne sont typés que par ts-jest, en diagnostics lâches. La
requiredness protège la PRODUCTION (routes, services), pas la suite. Avant d'annoncer « le build
l'attrapera », vérifier que le fichier concerné est bien dans le `include` du tsconfig.

**Corollaire — un délégué Prisma absent d'un double transforme un refus d'ACL en exception avalée.**
Trois harnais « prouvaient » qu'un inconnu était refusé alors qu'ils prouvaient seulement que
`prisma.participant` était `undefined`. Quand une garde apprend à lire une table de plus, les doubles
qui la taisent continuent de passer — au vert, et pour la mauvaise raison. Compléter les doubles fait
partie du correctif, pas de son nettoyage.

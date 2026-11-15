## Leçon 558 — Un gate qui ne peut pas distinguer deux causes ne garde rien, et un gate rouge en permanence est un gate MORT

2026-09-09. `Deploy to staging` rougissait à chaque déploiement RÉUSSI : la
sonde de fumée de #5644 déclarait douze routes « absentes du conteneur servi ».
Les six images se construisaient, se scannaient et se déployaient ; seule la
sonde échouait, sur les **douze mêmes routes**, run après run — vérifié
identique sur trois révisions dont une antérieure à mon travail.

La sonde interroge chaque `:param` avec un ObjectId **qui n'existe pas**
(`000000000000000000000000`), puis classait tout 404 en « route absente ». Or
une route PUBLIQUE de lecture-par-identifiant répond légitimement 404 pour un
identifiant inconnu. Le classificateur ne pouvait pas distinguer les deux
causes — il était **structurellement incapable** de rendre un verdict juste,
quel que soit son seuil : le signal qui les sépare n'était pas dans les données
qu'on lui remettait (`SmokeFetchResponse` ne portait que `{ status }`).

> **Devant un gate rouge, la première question n'est pas « pourquoi
> échoue-t-il ? » mais « PEUT-IL être vert ? »** — et la seconde : « les
> données qu'il reçoit contiennent-elles de quoi trancher ? ». Un gate dont
> l'entrée ne porte pas le discriminant ne se règle pas, il se recâble.

Ce qui l'a rendu invisible : les routes GARDÉES échappaient au piège **par
accident** — elles rendent 401/403 AVANT de chercher quoi que ce soit. La
couverture apparente était donc de 539/551, et l'échec avait l'air d'une
anomalie locale plutôt que d'un vice de conception.

Le discriminant existait, une couche plus bas — dans le CORPS :

    /api/v1/users/000…0   404 {"success":false,"error":"User not found"}
    /api/v1/inexistante   404 {"error":"Not Found","statusCode":404}

Le premier est `sendError()`, producteur UNIQUE des réponses du gateway : le
reconnaître PROUVE que notre handler a tourné. La règle retenue est donc
POSITIVE et fail-closed — présent seulement sur cette signature ; la forme
Fastify, un corps vide, du HTML de proxy n'ont rien prouvé et restent absent.
Conclure l'inverse (absent SI forme Fastify) pencherait du mauvais côté : le
jour où cette forme change, une route vraiment disparue passerait pour
présente, soit exactement la panne que le gate existe pour attraper.

**Et la vérification d'un correctif de gate a DEUX directions.** Faire passer
un gate est trivial — il suffit de désarmer sa condition. Les deux mesures,
contre l'hôte réel :

    manifeste complet                    ✓ 551/551 servies      sortie 0
    manifeste piégé d'une route fantôme  ✗ 1 absente détectée   sortie 1

> **Un correctif qui rend un gate vert sans prouver qu'il rougit encore est une
> alarme ÉTEINTE, pas une alarme réparée.** La seconde mesure coûte trois
> minutes et c'est la seule qui distingue les deux.

Voisines : leçon 275 (une protection se mesure sur tout ce que la charge
TRANSPORTE), et la famille « un contrôle existe s'il a un effet ».

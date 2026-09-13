# Inventaire de parité — ce que la v4 doit servir avant que le legacy s'éteigne

> **Source** : `node scripts/route-inventory.mjs` (et `--json`). Ce tableau est
> une PROJECTION de ce script ; le jour où il rend une route absente d'ici,
> c'est ce document qui a tort. Issue : #5492. Lot : #5491.
> Relevé du **2026-09-09**.

## Ce que la mesure a rendu, et qui change le cadrage de #5492

| application | routes | où elle tourne |
|---|---|---|
| `apps/web` (legacy) | **80** | **la PRODUCTION, seule — 100 % du trafic utilisateur** |
| `apps/web-old-version3` | 48 | n'a jamais servi un écran ; **annulée** le 2026-09-07, quitte le dépôt avec #5882 |
| `apps/web-v2` (la v3.1) | **29** — 24 écrans + 5 documents pré-rendus | **le STAGING**, depuis la bascule du 2026-09-07 |

**L'ancienne refonte n'a jamais servi un seul écran à un utilisateur réel.**

> **Correction du 2026-09-12.** Ce tableau est resté à « 14 » (relevé du
> 2026-09-09) : la table de routes a gagné `/conversations/new` (le rail de
> stories et ses deux boutons d'en-tête, #5652), `/stories`, `/stories/new` et
> les trois sous-vues de progression (`/me/progression/badges`,
> `/me/progression/defis`, `/me/progression/succes`) depuis lors. `node
> scripts/route-inventory.mjs` rend désormais **20** routes v3.1 / **88**
> adresses distinctes en union avec le legacy — ce document vient de se
> réaligner dessus. Comme la correction du 2026-09-09 le disait déjà : c'est
> le script qui fait foi, jamais ce tableau, et l'écart n'est gardé par aucun
> gate sur son propre delta.

> **Correction du 2026-09-13 (revue-correction #5817).** Le tableau était
> resté à « 20 » alors que la table de routes avait gagné neuf adresses
> depuis. Mesure du jour, `node scripts/route-inventory.mjs` : **29** routes
> v3.1 (24 écrans + 5 documents pré-rendus) / **91** adresses distinctes en
> union avec le legacy. Ce lot en apporte UNE (`/story/$post`) ; les huit
> autres étaient déjà là et personne n'avait reprojeté le script — c'est
> exactement le mode de dérive que l'absence de gate sur ce delta rend
> silencieux, et il vient de se reproduire pour la troisième fois.

> **Correction du 2026-09-08 (#5669).** Ce tableau a porté « `apps/web-v2` — 0 —
> nulle part encore » pendant tout le cadrage de #5492, et c'était FAUX : la
> v3.1 servait déjà quatre écrans et cinq documents. Le script n'énumérait que
> la convention Next.js (`page.tsx` / `route.ts`), que la v3.1 n'a pas — ses
> adresses sont écrites à la main dans `src/routes/route-table.tsx` (D-3) et ses
> documents institutionnels sont pré-rendus hors du routeur. **Un énumérateur
> aveugle à une application ne dit pas « zéro » : il ne dit RIEN, et son silence
> se lit comme un zéro.** Les deux lignes de la v3 se confondaient de surcroît
> sous le même nom, l'annulée et le chantier, ce qui rendait l'erreur illisible.
>
> `scripts/lib/v31-routes.mjs` lit désormais les deux familles à leur source, et
> `src/routes/route-inventory.test.ts` en est la jumelle : il IMPORTE `ROUTES`
> et REJOUE l'extraction, si bien qu'une route ajoutée à la table que
> l'inventaire ne verrait pas fait rougir `bun test`.

### Ce que les 20 adresses de la v3.1 disent de la bascule

`node scripts/route-inventory.mjs --json` : la moitié existe déjà dans le
legacy (`/`, `/login`, `/signup`, `/about`, `/contact`, `/partners`,
`/privacy`, `/terms`, `/forgot-password`, `/auth/magic-link` (+ `/validate`)).
Les adresses que la v3.1 introduit sans équivalent legacy (`legacy=false`
dans l'inventaire) sont `/c/:conversation` (le fil), `/conversations/new`
(#5652), `/stories` et `/stories/new` (le rail de la Lentille, #5652), `/welcome`
et `/me/progression` + ses trois sous-vues `badges`/`defis`/`succes` (niveau,
série, succès). La parité d'URL n'est donc pas le chantier ; c'est la parité
d'ÉCRANS qui l'est, et l'écart se compte sur les **80** routes du legacy, pas
sur un espace de nommage à réconcilier.

> **Correction du 2026-09-09.** Ce document est resté à « 9 » (relevé du
> 2026-09-08) alors que `/me/progression` (commit `beb7cffbfb`) avait déjà
> rejoint la table des routes avant cette date-là — un écart entre le script
> et sa projection qui a duré un tour entier sans qu'aucun gate ne le
> signale, `route-inventory.mjs` n'étant vérifié qu'à la marge par le gate
> composite (segment 5), pas sur son propre delta. `node
> scripts/route-inventory.mjs` fait foi ; ce tableau vient de se réaligner
> dessus.

> **Correction du 2026-09-07.** Une première version de ce document déduisait le
> déploiement de `docker-compose.prod.yml`, qui décrit un routeur `frontend-v3`
> publiant trois préfixes d'actifs (`/__v3/_next`, `/__v3/rt/`, `/__v3/sw`). Le
> porteur a corrigé : **la production ne fait tourner que le legacy** ; la v3
> tourne en staging. Un fichier de compose décrit une intention de
> déploiement, pas un déploiement — et sur ce point c'est celui qui exploite
> l'infrastructure qui fait foi, pas le dépôt. La conclusion, elle, n'est pas
> affaiblie : elle est renforcée. La v3 n'a même pas servi d'actifs en
> production.

Le commentaire qui accompagne cette règle reste instructif pour la v4, parce
qu'il énonce la doctrine de bascule : *« `next build` n'émet aujourd'hui aucune
PAGE d'App Router (seul `/healthz`) … un chemin PUBLIC prioritaire sur le legacy
ne se publie pas avant que la zone ait de quoi y répondre. »*

Trois conséquences, et elles portent tout le reste de ce document :

1. **Aucune URL de la v3 n'a de lien à sauver.** `/chats/:cle`, `/stories/:id`,
   `/chat/:lien` n'ont jamais été partageables. Le renommage d'espace d'URL
   qu'avait entrepris la v3 ne coûte donc rien à annuler.
2. **Le risque de casser un lien vient ENTIÈREMENT du legacy**, et de lui seul.
   Cadrer l'inventaire sur la v3 — ce que demandait l'énoncé de #5492 — aurait
   laissé tomber **62 routes**, dont `/signup/affiliate/:token`,
   `/auth/magic-link` et les quatre adresses de conversation.
3. **Le mécanisme de bascule progressive est ÉCRIT, et exercé en staging** :
   Traefik donne au conteneur v3 une `priority=100` sur des chemins NOMMÉS,
   « tout chemin absent de cette règle est servi par `apps/web` ». La v4 s'y
   branche à l'identique. `scripts/check-v3-pipeline.mjs` gardait les deux sens
   (un actif servi hors règle, un chemin de la règle que la zone ne sert pas)
   pour `apps/web-old-version3` — **ce garde n'était câblé à aucune étape de
   CI et a été retiré (#5623) : le routage de la v4 n'a donc AUCUNE protection
   automatisée équivalente aujourd'hui**, et il n'a jamais tourné en
   production même du temps où il existait. Le premier chemin public de la v4
   sera le premier essai réel de ce routage, sans filet — à traiter comme tel,
   pas comme un acquis.

## La stratégie de bascule, qui découle de ce qui précède

**Aucun lien ne meurt à la V4.0.0**, à une condition : le legacy continue de
tourner et reçoit tout ce que la v4 ne réclame pas nommément.

```
Traefik  ──▸ apps/web-v2   sur les chemins de la V4.0.0 (priority haute)
         └─▸ apps/web      TOUT LE RESTE  (défaut, inchangé)
```

Ce routage **n'a jamais tourné en production** (voir la correction ci-dessus) :
le premier chemin public de la v4 en sera l'essai réel. Le poser d'abord sur les
cinq pages institutionnelles — sans session, sans API — est la façon la moins
risquée de le vérifier, et c'est une raison de plus de commencer par elles.

Le décommissionnement du legacy (#5496) n'est donc **pas** un préalable à la
mise en production de la v4 : c'est ce qui reste à faire **après** que chaque
ligne `legacy` de ce tableau a trouvé sa réponse.

---

## V4.0.0 — le périmètre arrêté par le porteur (2026-09-07)

Dix-sept adresses. Une feature n'est livrée que si elle **fonctionne de bout en
bout** — pas si l'écran s'affiche.

### Pages statiques — aucune session requise

| route | legacy | ce qu'elle sert |
|---|---|---|
| `/privacy` | ✅ | politique de confidentialité |
| `/terms` | ✅ | conditions d'utilisation |
| `/about` | ✅ | présentation du produit |
| `/contact` | ✅ | prise de contact |
| `/partners` | ✅ | partenaires |

Elles sont **le premier test de l'architecture** : rendues sans session, sans
API, sans temps réel, elles doivent tenir la première peinture la plus basse du
produit. Ce sont aussi les pages que les moteurs et les plateformes de partage
lisent — donc les seules où les métadonnées (`og:`, `lang`) comptent autant que
les pixels.

### Entrer dans le produit

| route | legacy | ce qu'elle sert |
|---|---|---|
| `/login` | ✅ | connexion par identifiant + mot de passe |
| `/signup` | ✅ | inscription |
| `/signup/affiliate/:token` | ✅ | inscription porteuse d'une **clé d'affiliation** |
| `/auth/magic-link` | ✅ | demande d'un lien de connexion par e-mail |
| `/auth/magic-link/validate` | ✅ | consommation du lien reçu |

**La clé d'affiliation ne vit pas dans l'URL d'inscription.** Directive du
porteur : *« qu'on y arrive de n'importe où si on a une clé d'affiliation, il
faut la retenir pour lier lorsque le visiteur s'inscrit »*. La clé se capte donc
sur **n'importe quelle** entrée du site, se retient à travers toute la
navigation — y compris une session interrompue et reprise plus tard —, et se
consomme à l'inscription. C'est une feature à part entière, pas un paramètre de
`/signup/affiliate/:token` : cette route n'en est qu'une porte parmi d'autres.

### Ne pas tuer les liens existants

| route | legacy | ce qu'elle sert |
|---|---|---|
| `/l/:token` | ✅ | résolution d'un lien de redirection |
| `/l/:token/expired` | — (v3) | l'état clos d'un lien mort |

`/l/:token` est **la** raison pour laquelle la V4.0.0 ne peut pas se contenter
des pages statiques : ces liens circulent déjà, dans des messages qu'on ne
maîtrise pas.

### Le cœur

| route | legacy | ce qu'elle sert |
|---|---|---|
| `/` | ✅ | la **liste des conversations**, comme l'app iOS |
| `/c/:conversation` | **adresse NEUVE** | le fil |
| `/chat/:share_link` | `/chat/:id` | **rejoindre** une conversation — anonyme ET connecté |
| `/me` | ✅ | son profil : avatar, bannière, configuration |
| `/settings` | ✅ | les réglages d'usage de l'application |

---

## L'arbitrage des adresses de conversation — TRANCHÉ (porteur, 2026-09-07)

> « On va garder les autres nomenclatures de la Legacy, juste ajouter d'autres
> web de base : `/c` pour les conversations, `/chat/` pour les liens publics. »

**Aucune redirection.** Les quatre adresses du legacy — `/conversation/:id`,
`/conversations/[[...id]]`, `/chat/:id`, `/groups/:identifier` — sont
**conservées telles quelles** et continuent d'être servies par `apps/web`. La v4
n'en renomme aucune : elle **ajoute** deux adresses à elle.

| adresse | qui la sert | rôle |
|---|---|---|
| `/c/:conversation` | **v4** | l'adresse du MEMBRE — privée |
| `/chat/:share_link` | **v4** | l'adresse PUBLIQUE — un lien de partage |
| `/conversation/:id`, `/conversations/[[...id]]`, `/chat/:id`, `/groups/:identifier` | legacy | inchangées, aucun lien ne bouge |

Ce que ça coûte, et qu'il faut assumer les yeux ouverts : un vieux lien continue
d'ouvrir l'ancienne application. **Ce n'est pas un lien mort, c'est deux
produits vivants sur un domaine** — moins grave qu'une perte de lien, plus
difficile à diagnostiquer. La décision est prise ; le point se rouvrira au
décommissionnement (#5496), où ces quatre adresses devront enfin trouver une
cible.

**`/chat/:id` du legacy et `/chat/:share_link` de la v4 sont la MÊME route.**
Vérifié : `apps/web/app/chat/[id]/page.tsx:21` lit son paramètre comme un
`linkId`, et `ConversationShareLink.linkId` / `.identifier` sont préfixés
`mshy_` (`schema.prisma:609-613`). Le legacy sert donc déjà l'adresse d'un lien
de partage ; la V4.0.0 la nomme mieux, elle n'en crée pas une seconde. **`/chat/*`
passe en bloc à la v4**, sans que le routage ait à distinguer une forme de
segment. Le préfixe `mshy_` reste utile à `/c/:conversation`, qui peut refuser
d'emblée un segment qui n'est pas un ObjectId.

## Ce qui se passe quand on atterrit sur une conversation — arrêté par le porteur

Les deux adresses de la v4 ne servent pas le même public, et leur comportement
face à un visiteur qui n'est **pas membre** est explicitement différent.

### `/c/:conversation` — l'adresse du membre

| état du visiteur | comportement |
|---|---|
| membre | le fil |
| **sans compte** | **sortie immédiate vers `/`** |
| connecté, conversation de **groupe** | une **modale** demande de valider qu'on rejoint le groupe |
| connecté, conversation **directe** | **redirection immédiate vers `/`** |

La règle de fond : **`/c/` ne révèle rien d'une conversation dont on n'est pas
membre.** Pas de titre, pas de participants, pas d'aperçu — la sortie est
immédiate. C'est une garde fail-closed, et elle se teste comme telle : ce qui
compte n'est pas ce que l'écran affiche, mais ce que la **charge servie
contient**.

> **Question de sécurité à trancher avant d'implémenter la modale.** « Connecté
> + groupe ⇒ modale pour rejoindre » implique-t-il que **tout** compte connaissant
> l'identifiant d'un groupe peut le rejoindre ? Si oui, l'identifiant devient un
> secret, ce qu'un identifiant n'est jamais. La lecture sûre est : la modale ne
> s'affiche que pour un groupe que ce visiteur **a le droit** de rejoindre
> (groupe ouvert, ou invitation le concernant) ; tout autre cas retombe sur la
> sortie vers `/`, indistinguable d'un groupe inexistant. **À confirmer par le
> porteur** — c'est la différence entre une porte et une fuite d'inventaire.

### `/chat/:share_link` — l'adresse publique

On demande à rejoindre, **par un compte ou en anonyme**. C'est la seule des deux
qui sert quelqu'un sans compte, et donc la seule où l'écran d'invitation existe.
Rien de la conversation ne part avant le choix (voir #5561).

## L'inventaire complet — 80 routes du legacy

Vocabulaire des verdicts :
**`V4.0.0`** livré dans la première version en production ·
**`legacy`** reste servi par `apps/web` jusqu'à son décommissionnement, à porter
dans une version ultérieure ·
**`abandonnée`** ne sera pas reconstruite, avec sa raison ·
**`à arbitrer`** demande une décision du porteur, avec ma recommandation.

### Entrée et identité

| route | verdict | note |
|---|---|---|
| `/login` | **V4.0.0** | |
| `/signup` | **V4.0.0** | |
| `/signup/affiliate/:token` | **V4.0.0** | une porte parmi d'autres vers la clé d'affiliation |
| `/auth/magic-link` | **V4.0.0** | |
| `/auth/magic-link/validate` | **V4.0.0** | |
| `/forgot-password` | **V4.0.0** | porté par #5816 : le MÊME écran répond à 200 et à 404 — l'existence d'une adresse ne se lit pas dans la réponse. Le flux TÉLÉPHONE et `/reset-password` restent `legacy` |
| `/forgot-password/check-email` | `legacy` | état d'attente du précédent |
| `/reset-password` | `legacy` | consommation du lien de réinitialisation |
| `/auth/verify-email` | `legacy` | vérification d'adresse |
| `/auth/verify-phone` | `legacy` | vérification de téléphone |
| `/auth/verify-2fa` | `legacy` | second facteur |
| `/settings/verify-email-change` | `legacy` | confirmation d'un changement d'adresse |
| `/auth-status` | **à arbitrer** | page de diagnostic ; recommandation : **abandonnée**, un état de session n'est pas un écran |
| `/account/deletion` | `legacy` | suppression de compte — obligation réglementaire, à porter avant le décommissionnement |

### Conversations

| route | verdict | note |
|---|---|---|
| `/` | **V4.0.0** | la liste |
| `/conversation/:conversationId` | `legacy` | **conservée sans redirection** (porteur 2026-09-07) |
| `/conversations/[[...id]]` | `legacy` | idem |
| `/conversations/new` | **V4.0.0** | création d'une conversation — **servie par la v3.1 depuis #5652** (recherche `GET /directory/people`, `POST /conversations`, direct seul : le GROUPE reste au legacy) ; nomenclature du legacy reprise (D-5) |
| `/chat/:id` | **V4.0.0** | c'est DÉJÀ l'adresse d'un lien de partage — `/chat/*` passe en bloc à la v4 |
| `/groups`, `/groups/:identifier` | `legacy` | idem |
| `/c/:conversation` | **V4.0.0** | **adresse neuve** — le fil du membre |
| `/chat/:share_link` | **V4.0.0** | **adresse neuve** — rejoindre par lien public |
| `/call/:callId` | `legacy` | appel en cours |

### Profil et réglages

| route | verdict | note |
|---|---|---|
| `/me` | **V4.0.0** | avatar, bannière, configuration du profil |
| `/settings` | **V4.0.0** | réglages d'usage de base |
| `/u`, `/u/:id` | `legacy` | profil public d'un autre utilisateur |
| `/notifications` | `legacy` | |
| `/notifications/preferences` | `legacy` | |

### Contenu social

| route | verdict | note |
|---|---|---|
| `/feed`, `/feeds`, `/feed/posts`, `/feed/reels` | `legacy` | **quatre** adresses de fil : fusionner à la reprise, pas porter à l'identique |
| `/post/:postId`, `/feeds/post/:postId` | `legacy` | deux adresses pour un post |
| `/story/:postId` | **`v3.1`** | **PORTÉ** le 2026-09-13 (#5817) — `/story/$post`, le lecteur plein écran ; l'adresse LEGACY est reprise telle quelle (D-5), un lien déjà partagé continue de mener au bon endroit |
| `/reel/:postId`, `/mood/:postId` | `legacy` | **liens partageables publiquement** — à porter avant tout décommissionnement |
| `/hashtag/:tag` | `legacy` | |
| `/search` | `legacy` | |
| `/communities`, `/communities/:id` | `legacy` | |
| `/contacts` | `legacy` | |
| `/links`, `/links/tracked/:token` | `legacy` | `/l/:token` de la V4.0.0 en est le pendant public |

### Liens et redirections

| route | verdict | note |
|---|---|---|
| `/l/:token` | **V4.0.0** | |
| `/dashboard` | **à arbitrer** | recommandation : **redirigée** vers `/` |

### Administration — 25 routes

`/admin` et ses 24 sous-routes (`agent`, `analytics`, `anonymous-users`,
`audit-logs`, `broadcasts` ×3, `communities`, `invitations`, `languages`,
`messages`, `moderation`, `monitoring`, `ranking`, `reports`, `settings`,
`share-links`, `tracking-links`, `translations`, `users` ×3).

**Verdict : `legacy`, et recommandation de l'y laisser durablement.** Ce sont des
écrans d'exploitation, pour une poignée d'utilisateurs internes, sur un réseau
qui n'est pas celui de la zone rurale. Rien de ce qui justifie la v4 — poids,
hors-ligne, fidélité iOS — ne s'y applique. Les porter par réflexe, ce serait
doubler la surface de la v4 pour un public qui n'a jamais demandé le changement.
**À trancher explicitement**, parce que c'est un tiers de l'inventaire.

### Techniques — pas des écrans

| route | verdict | note |
|---|---|---|
| `/api/health` | `legacy` | la v4 a son propre équivalent à écrire |
| `/api/client-error` | `legacy` | collecte d'erreurs client |
| `/api/metadata` | `legacy` | |
| `/api/upload/avatar`, `/api/upload/banner` | **V4.0.0** | requis par `/me` (avatar, bannière) |
| `/.well-known/apple-app-site-association` | **V4.0.0** | **les liens universels iOS en dépendent** — le servir depuis la v4 ou le laisser au legacy est un choix d'infrastructure, jamais un oubli |

---

## Les 48 routes de la v3 — toutes abandonnées, et sans coût

Aucune n'a jamais été servie à un utilisateur (voir le premier § ). Elles ne
demandent **ni portage ni redirection**. Ce qu'elles gardent de valeur est leur
CONCEPTION, pas leur URL : l'anatomie de `/chats`, le découpage de `/settings`
en neuf sous-écrans, l'état clos de `/l/:token/expired`, le module de
participation de `/rt/:nom`. La v4 s'en inspire ; elle n'en hérite aucune
adresse.

Deux exceptions qui ne sont pas des pages et qui se portent :
`/healthz` (sonde) et `/sw` (service worker) — la v4 a déjà le second, par
`vite-plugin-pwa`.

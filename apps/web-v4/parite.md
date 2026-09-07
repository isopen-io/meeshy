# Inventaire de parité — ce que la v4 doit servir avant que le legacy s'éteigne

> **Source** : `node scripts/inventaire-routes.mjs` (et `--json`). Ce tableau est
> une PROJECTION de ce script ; le jour où il rend une route absente d'ici,
> c'est ce document qui a tort. Issue : #5492. Lot : #5491.
> Relevé du **2026-09-07**.

## Ce que la mesure a rendu, et qui change le cadrage de #5492

| application | routes | ce qu'elle sert en production |
|---|---|---|
| `apps/web` (legacy) | **80** | **100 % du trafic utilisateur** |
| `apps/web-v3` | 48 | **`/__v3/_next`, `/__v3/rt/`, `/__v3/sw` — des ACTIFS, aucune page** |
| `apps/web-v4` | 0 | rien encore |

**La v3 n'a jamais servi un seul écran à un utilisateur réel.** Sa règle Traefik
(`docker-compose.prod.yml`, routeur `frontend-v3`) ne publie que trois préfixes
d'actifs, et le commentaire qui l'accompagne l'écrit noir sur blanc : *« `next
build` n'émet aujourd'hui aucune PAGE d'App Router (seul `/healthz`) … un chemin
PUBLIC prioritaire sur le legacy ne se publie pas avant que la zone ait de quoi
y répondre. »*

Trois conséquences, et elles portent tout le reste de ce document :

1. **Aucune URL de la v3 n'a de lien à sauver.** `/chats/:cle`, `/stories/:id`,
   `/chat/:lien` n'ont jamais été partageables. Le renommage d'espace d'URL
   qu'avait entrepris la v3 ne coûte donc rien à annuler.
2. **Le risque de casser un lien vient ENTIÈREMENT du legacy**, et de lui seul.
   Cadrer l'inventaire sur la v3 — ce que demandait l'énoncé de #5492 — aurait
   laissé tomber **62 routes**, dont `/signup/affiliate/:token`,
   `/auth/magic-link` et les quatre adresses de conversation.
3. **Le mécanisme de bascule progressive existe déjà et il est éprouvé** :
   Traefik donne au conteneur v3 une `priority=100` sur des chemins NOMMÉS,
   « tout chemin absent de cette règle est servi par `apps/web` ». La v4 s'y
   branche à l'identique. `scripts/check-v3-pipeline.mjs` garde même les deux
   sens (un actif servi hors règle, un chemin de la règle que la zone ne sert
   pas) — il se porte.

## La stratégie de bascule, qui découle de ce qui précède

**Aucun lien ne meurt à la V4.0.0**, à une condition : le legacy continue de
tourner et reçoit tout ce que la v4 ne réclame pas nommément.

```
Traefik  ──▸ apps/web-v4   sur les chemins de la V4.0.0 (priority haute)
         └─▸ apps/web      TOUT LE RESTE  (défaut, inchangé)
```

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

## Le point qui demande un arbitrage avant d'écrire une ligne

`/c/:conversation` est une **troisième** nomenclature. Le legacy sert
aujourd'hui **quatre** adresses distinctes vers une conversation :

| adresse legacy | ce qu'elle fait |
|---|---|
| `/conversation/:conversationId` | le fil, par identifiant |
| `/conversations/[[...id]]` | la liste, et le fil en segment optionnel |
| `/chat/:id` | le fil par lien de partage |
| `/groups/:identifier` | le fil d'un groupe, par identifiant lisible |

Tant que le legacy tourne, ces quatre-là continuent de répondre et **rien ne
casse**. Mais elles ne pointeront pas vers la v4 : un utilisateur qui rouvre un
vieux lien restera sur l'ancienne application, avec l'ancienne apparence, hors
du temps réel de la v4. **Ce n'est pas un lien mort, c'est pire à diagnostiquer**
— deux produits vivants sur le même domaine.

Trois issues possibles, à trancher :
1. Les quatre redirigent (308) vers `/c/:id` dès la V4.0.0 — demande de résoudre
   `identifier` et `share_link` vers un id côté v4.
2. Elles restent sur le legacy jusqu'au décommissionnement — simple, mais deux
   produits coexistent visiblement.
3. La v4 adopte `/conversation/:id` au lieu de `/c/:id` — un renommage de moins.

---

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
| `/forgot-password` | `legacy` | mot de passe oublié ; le magic link en couvre une partie de l'usage — mesurer avant de porter |
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
| `/conversation/:conversationId` | **à arbitrer** | voir « le point qui demande un arbitrage » |
| `/conversations/[[...id]]` | **à arbitrer** | idem |
| `/conversations/new` | `legacy` | création d'une conversation |
| `/chat/:id` | **V4.0.0** | devient `/chat/:share_link` |
| `/groups`, `/groups/:identifier` | **à arbitrer** | idem |
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
| `/story/:postId`, `/reel/:postId`, `/mood/:postId` | `legacy` | **liens partageables publiquement** — à porter avant tout décommissionnement |
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

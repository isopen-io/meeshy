# Identifier un client proprement — Meeshy comme moteur de messagerie pour des développeurs et des organisations (design)

> Demande porteur du 2026-11-14 : « permettre à des développeurs d'intégrer Meeshy et
> de faire leurs vues comme ils l'entendent, ET permettre à des entreprises de
> s'enrôler pour gérer leur SAV avec le client natif ou dans leur workflow ».
> Cas concret : une marketplace SaaS veut Meeshy comme moteur de messagerie pour ses
> organisations et leurs clients.
> Statut : **BROUILLON à valider par le porteur** — rien n'est construit. Les
> décisions ouvertes sont au § 9 et portées par une issue `décision-produit`.

## 0. Réponse courte à « est-ce que Meeshy permet tout cela ? »

**Non, pas aujourd'hui.** Meeshy sait recevoir des invités sans compte, ajouter ou
retirer des participants en cours de conversation, et un service d'agent IA existe.
Mais rien ne permet à un TIERS de s'identifier comme application, de créer des
comptes pour ses utilisateurs, de rattacher un invité à un compte, d'être prévenu
par webhook ni de poser un robot nommé dans une conversation. Le tableau du § 2 le
mesure point par point.

## 1. Intention

Deux publics, un seul socle.

- **Le développeur** veut Meeshy sans son interface : il garde le moteur (messages,
  temps réel, traduction, médias, appels) et dessine ses propres vues dans son
  produit. Il a besoin d'une identité d'application, de jetons pour ses utilisateurs,
  d'événements qui lui arrivent, d'un SDK et d'une documentation.
- **L'organisation** (une entreprise, un SAV, une marketplace et ses vendeurs) veut
  Meeshy tel qu'il est, ou intégré à son outil : ses agents répondent à ses clients
  dans la langue de chacun, font entrer un collègue à tout moment, et un robot
  assiste chaque conversation.

Le lien entre les deux : **l'identité du client**. Aujourd'hui une requête dit QUI
parle (un JWT ou un jeton d'invité) mais jamais D'OÙ elle parle (quelle application,
pour quelle organisation). Le chantier donne à chaque appel deux axes explicites :
**le sujet** (un compte, un invité, un robot) et **le client** (l'application qui
l'émet, l'organisation qui la possède). Tout le reste en découle : portées, quotas,
webhooks, provisionnement, rattachement.

## 2. État des lieux (mesuré le 2026-11-14)

| Besoin exprimé | Ce qui existe | Ce qui manque |
|---|---|---|
| Identifier l'application appelante | rien : l'origine est devinée (`Origin`, bundle `me.meeshy.app`, `AnonymousClientDescriptor.client`) | un modèle `Application` avec identifiant public, secret, origines, portées, quotas |
| Un tiers appelle l'API | OpenAPI 3.1 auto-générée (`services/gateway/src/server.ts:605-672`, `/docs` servi même en production), catalogue d'endpoints `packages/shared/api/endpoints.ts` avec générateurs Swift et Kotlin | aucune clé d'API, aucun OAuth, aucune portée ; le limiteur est par IP, jamais par client ; #12940 (jetons à portée) et #12941 (serveur MCP) sont ouverts et non commencés |
| Créer des comptes automatiquement | `POST /auth/register`, lien magique qui crée le compte si l'adresse est inconnue | aucun provisionnement par un tiers, aucun `externalId` |
| Compte anonyme rattaché à un compte réel | invité = ligne `Participant` `type: 'anonymous'` sans `userId`, jeton `X-Session-Token` haché ; `Message.senderId` pointe vers `Participant.id` | **aucun rattachement** : revenir avec son compte crée une SECONDE ligne `Participant`, l'historique anonyme reste orphelin ; le web l'écrit (#8816) ; aucun parcours « créer un compte pour garder cet historique » |
| L'utilisateur se connecte sur Meeshy et est redirigé vers la plateforme | rien : ni OAuth, ni OIDC, ni `redirect_uri` ; `loginMethod: 'oauth'` est déclaré « sans producteur » | « Se connecter avec Meeshy » (code d'autorisation + PKCE, écran de consentement) |
| Faire entrer X à tout moment | `POST /conversations/:id/participants` (modérateur ou plus, membre actif), `participant:*` et `conversation:participant-*` sur le socket | un agent d'organisation non membre ne peut ni lire ni rejoindre une conversation de son organisation : seul le personnel de PLATEFORME (ADMIN+) le peut, par les routes souveraines |
| Un robot par conversation | `UserRole.AGENT` (enum, « SAV, FAQ »), `Participant.type: 'bot'` (jamais créé), `Message.messageSource: 'agent' \| 'app' \| 'authority'` (servi, rendu iOS derrière un drapeau OFF), `services/agent` avec `AgentConfig.agentType: 'support' \| 'faq'` | aucun compte robot nommé ; **l'agent écrit sous l'identité de vrais utilisateurs inactifs** et sa quality-gate refuse tout message qui révèle une IA (#9925) ; aucun robot pilotable par un tiers |
| Événements vers le tiers | un seul `webhookUrl`, celui de la traduction vocale asynchrone, sans garde SSRF visible | webhooks sortants signés, catalogue d'événements, rejeu |
| Organisation, équipe SAV | `Community` (social : posts, membres admin/moderator/member) ; `PartnerProfile` pour les éditeurs de lens | aucun modèle `Organization`, aucun rôle d'organisation, aucun périmètre : les rôles d'administration sont PLANÉTAIRES |
| Intégrer l'interface chez le tiers | universal links, app links, page `/chat/:lien` | CSP `frame-ancestors 'self' meeshy.me` : aucun embed possible ; aucun widget |
| SDK pour tiers | `packages/shared` (`private`, `UNLICENSED`, sans client HTTP), `MeeshySDK` Swift (152 singletons, App Group et hôtes codés en dur), `:sdk-core` Android (sans `maven-publish`) | rien n'est publiable en l'état ; la page « Partenaires » (`apps/web/src/institutional/partners.ts`) promet API documentée, SDK JS/Python/Go, webhooks et SSO qui n'existent pas |

Trois faits gouvernent la conception :

1. **`Message.senderId` est un `Participant.id`, pas un `User.id`.** Tout
   rattachement d'un invité à un compte se joue sur la ligne `Participant`, jamais
   en réécrivant les messages.
2. **La base est mono-tenant** et le restera (moins de 1 000 utilisateurs, #9232) :
   l'organisation est un PÉRIMÈTRE logique (`organizationId`), pas une base.
3. **L'agent IA actuel est inexposable à un tiers tel qu'il est** : il emprunte des
   identités humaines. Le robot de SAV est une identité NOMMÉE, étiquetée, qui ne
   parle jamais au nom d'un humain.

## 3. Les deux architectures

Elles partagent un socle (§ 4) et se distinguent par QUI tient l'identité des
utilisateurs finaux.

### 3.1 Architecture A — « Meeshy sans son interface » (plateforme développeur)

Le développeur garde le moteur et dessine ses vues. Meeshy reste l'autorité
d'identité : les utilisateurs finaux sont des comptes Meeshy, ou des invités.

```
produit du développeur ──(jeton d'application, portées)──▶ passerelle Meeshy
       ▲                                                        │
       │  webhooks signés (message:new, participant:*, …)       │ REST + Socket.IO
       └────────────────────────────────────────────────────────┘
utilisateur final ──« Se connecter avec Meeshy » (code + PKCE)──▶ jeton à portée
```

- **Application** : le tiers déclare une application dans sa console (identifiant
  public, secret haché, origines autorisées, URI de redirection, portées demandées,
  quotas). Chaque appel porte l'application (jeton signé ou en-tête `X-Meeshy-Client`
  vérifié).
- **Deux flux de jetons** : *client credentials* (serveur à serveur, agit au nom de
  l'application) et *code d'autorisation + PKCE* (« Se connecter avec Meeshy » :
  l'utilisateur se connecte sur Meeshy, consent aux portées, est redirigé vers la
  plateforme avec un code ; la plateforme obtient un jeton à portée et le profil
  minimal). Ce second flux est exactement « un utilisateur se connecte sur Meeshy et
  est redirigé sur la plateforme ».
- **Temps réel** : le Socket.IO existant accepte un jeton à portée ; le serveur
  n'ouvre que les rooms que les portées autorisent.
- **Webhooks sortants** : abonnement par application, charge signée HMAC avec
  horodatage, tentatives avec recul exponentiel, rejeu depuis la console, liste de
  destinations vérifiée contre les adresses privées (SSRF).
- **SDK** : `@meeshy/client` (TypeScript, généré depuis le catalogue d'endpoints qui
  produit déjà Swift et Kotlin), publié sur npm ; Swift et Kotlin plus tard, une fois
  le SDK iOS déchargé de ses singletons. L'UI reste chez le développeur.
- **Embed optionnel** : `frame-ancestors` étendu aux origines déclarées d'une
  application, pour ceux qui veulent le fil Meeshy tel quel dans leur page.

Ce que A ne fait pas : il ne crée pas de comptes pour le tiers et ne connaît pas la
notion d'équipe. Un utilisateur final est toujours « quelqu'un qui a un compte
Meeshy ou qui entre par un lien ».

### 3.2 Architecture B — « Meeshy pour les organisations » (SAV, marketplace)

L'organisation tient l'identité de SES utilisateurs (ses agents, ses clients) et
Meeshy les héberge comme **identités gérées**. C'est l'architecture du cas concret.

```
marketplace ──(client credentials de son Application)──▶ passerelle Meeshy
   │  POST /organizations/{org}/identities { externalId, kind }   provisionne
   │  POST /oauth/token grant_type=token-exchange subject=externalId  → jeton du client final
   ▼
vendeur / client final ──(jeton d'identité gérée)──▶ SDK ou client natif Meeshy
                                                      │
       conversation de SAV : client + agents de l'organisation + robot nommé
```

- **Organization** : un périmètre logique qui possède des Applications, des membres
  avec des rôles d'organisation (`owner`, `admin`, `agent`, `viewer`), des guichets
  (§ 3.3), des robots, des liens de partage et des conversations.
- **Identité gérée** (`ManagedIdentity`) : un couple (`organizationId`, `externalId`)
  que la plateforme crée par l'API et qui pointe vers un `Participant` invité (kind
  `guest`) ou vers un `User` provisionné (kind `account`). C'est « la plateforme crée
  des comptes anonymes et maintient le lien ». Un compte provisionné naît sans mot de
  passe, avec une adresse ou un numéro facultatifs ; il se connecte par **échange de
  jeton** (la plateforme, authentifiée en client credentials, demande un jeton pour
  `externalId`), jamais par un formulaire Meeshy.
- **Rattachement** : une identité gérée `guest` devient `account` quand la personne
  le veut (« garder mon historique ») ou quand la plateforme l'exige. Règle : **par
  référence, jamais par réécriture** — la ligne `Participant` anonyme reçoit
  `claimedByUserId` + `claimedAt` ; les lectures résolvent l'expéditeur vers le
  compte ; `senderId` ne bouge pas. Le même mécanisme sert à un invité ordinaire de
  lien de partage qui crée un compte Meeshy (la lacune du § 2, hors B2B).
- **Portée sociale des identités gérées** (décision porteur, § 9) : par défaut une
  identité gérée est **scellée dans son organisation** — invisible dans World, les
  contacts, le fil, les suggestions ; elle n'apparaît que dans les conversations de
  l'organisation. Elle sort du scellé seulement si la personne la rattache à un vrai
  compte Meeshy. Sans ce scellé, une marketplace déverserait ses clients dans le
  graphe social de Meeshy.
- **Le client natif Meeshy sert tel quel** aux agents comme aux clients : un agent
  d'organisation ouvre l'app, voit ses guichets, répond. Un client final peut aussi
  recevoir un lien de partage classique vers sa conversation de SAV.

B contient A : une organisation possède ses applications et peut, en plus,
proposer « Se connecter avec Meeshy » à ceux de ses utilisateurs qui ont déjà un
compte. Les deux parcours du porteur coexistent et se rejoignent par le
rattachement.

#### 3.2.1 Qui sont les agents, qui sont les clients, et comment chacun entre (appels du rédacteur)

- **Les agents de l'organisation sont de vrais comptes Meeshy**, invités comme
  membres de l'organisation avec un rôle. Ils utilisent le client natif avec leur
  compte ; leurs conversations de guichet apparaissent dans leur boîte, marquées de
  l'organisation. En v1 les trois clients rendent seulement cette **marque** et le
  **libellé du robot** ; une vue « Guichets » dédiée est un lot ultérieur.
- **Les clients finaux sont des identités gérées.** Ils parlent par l'interface de
  la plateforme (SDK, jeton d'échange). S'ils veulent le client natif, deux portes :
  un **lien de partage** vers leur conversation (le mécanisme invité existant), ou le
  **rattachement** à un compte Meeshy, après quoi la conversation est dans leur boîte.
- **Un ancien client** voit une conversation de guichet comme un groupe ordinaire :
  rien n'y casse, il lui manque seulement la marque.

#### 3.2.2 Rattachement : ce qui est permis, ce qui est refusé (appels du rédacteur)

- **Seule une identité `guest` se rattache** (par référence sur son `Participant`).
  Un `User` provisionné (`account`) ne FUSIONNE jamais avec un autre `User` : il se
  **complète** quand la personne y pose un contact vérifié et un moyen de connexion.
  C'est le même `User` qui mûrit, pas deux qui se joignent.
- **Un `User` provisionné naît sans contact vérifié.** L'adresse ou le numéro fourni
  par la plateforme est une déclaration, jamais un droit de connexion ; il ne porte
  ni `emailVerifiedAt` ni `phoneVerifiedAt`. **Provisionner un contact déjà vérifié
  par un compte Meeshy est refusé** (`409`), jamais rattaché en silence : c'est la
  garde contre la prise de compte par une plateforme.
- **Une personne cliente de deux organisations a deux identités gérées**, chacune
  rattachable au même compte, l'une après l'autre, chacune avec le consentement de
  la personne connectée. Le scellé se lève identité par identité.
- Après rattachement, l'historique est **dans la boîte du compte** : c'est le sens
  de « garder mon historique ».

#### 3.2.3 Périmètre d'une conversation d'organisation (appel du rédacteur)

- La clé du périmètre est **`organizationId` seul** ; `deskId` est facultatif. Une
  plateforme peut créer par l'API des conversations entre ses identités gérées
  (un vendeur et son acheteur autour d'une commande) sans guichet.
- Un utilisateur Meeshy ordinaire qui entre par lien de partage dans une
  conversation d'organisation **reste un invité ou un membre ordinaire** : la
  conversation reste dans le périmètre, et le personnel de l'organisation ne voit de
  lui que ce que les lois existantes de visibilité servent déjà (présence, fiche).
  Aucune loi nouvelle ne s'écrit pour ce cas.

#### 3.2.4 Cycle de vie et effacement (appel du rédacteur, à confirmer par `conformite-juridique`)

- **Effacer un `externalId`** : la ligne `Participant` est anonymisée (nom d'affichage
  neutre, profil vidé), les messages restent, comme pour un expéditeur orphelin
  aujourd'hui ; le `User` provisionné non rattaché est désactivé puis purgé à
  échéance. Une identité **déjà rattachée** n'est pas touchée : ses messages sont
  ceux de la personne.
- **Supprimer une organisation** : suppression douce, purge à échéance de ses
  applications, jetons, robots et identités non rattachées.
- **Export** : une organisation obtient l'export JSON de ses conversations et de ses
  identités gérées (lot 4). Ce qui appartient à des comptes rattachés en est exclu.

### 3.3 Le SAV : guichet, intervention, robot

- **Guichet** (`ServiceDesk`) : une boîte de l'organisation (nom, langues servies,
  horaires, robot par défaut, règle d'affectation). Une demande = une conversation
  de type `group` marquée `organizationId` + `deskId`, avec le client, zéro ou
  plusieurs agents et le robot du guichet.
- **Faire intervenir X à tout moment** : les membres `agent` et `admin` de
  l'organisation ont, sur les conversations de LEURS guichets, un droit de périmètre
  (lire, rejoindre, ajouter un collègue, se retirer, transférer) sans être
  participants d'avance. Ce droit est une **loi unique** côté passerelle
  (`resolveOrganizationScope(viewer, conversation)`), interrogée par les gardes
  existantes des routes participants, jamais réécrite par site. Il ne vaut que
  dans le périmètre : un agent de l'organisation A n'a rien sur B, et rien sur une
  conversation privée de Meeshy.
- **Le robot** : un `User` de rôle `AGENT` possédé par l'organisation (`BotProfile` :
  nom, avatar, propriétaire, mode), posé dans la conversation comme `Participant`
  `type: 'bot'`, qui écrit en `messageSource: 'agent'` (réponse d'un modèle) ou
  `'app'` (réponse d'un automate du tiers). Il est **nommé et étiqueté** sur les
  trois clients (#14742 prépare le rendu Android ; iOS porte déjà le style, derrière
  un drapeau à lever). Deux modes de pilotage, au choix du guichet : le service
  `services/agent` de Meeshy en type `support`/`faq`, nourri d'une base de
  connaissance du guichet ; ou le **webhook du tiers**, qui reçoit les événements et
  répond avec le jeton du robot. Dans les deux cas le robot ne parle **jamais** au
  nom d'un humain : la sélection d'utilisateurs inactifs de l'agent est désactivée
  par construction dans les conversations d'organisation.
- **Traduction** : un agent écrit dans sa langue, le client lit dans la sienne. Le
  Prisme existant fait ce travail sans rien de neuf ; c'est l'argument produit du
  SAV Meeshy et il est déjà là.
- **Chiffrement** : une conversation de guichet est en mode **Serveur** (le robot et
  la traduction serveur exigent le clair), l'interface le dit, et le choix est posé
  à la création comme pour toute conversation (#14303).

## 4. Le socle commun — ce que les deux architectures partagent

1. **`Application`** : `id`, `organizationId?` (nul pour une application
   personnelle), `name`, `clientId` (public), `clientSecretHash`, `redirectUris[]`,
   `allowedOrigins[]`, `scopes[]`, `webhookEndpoints[]`, `rateLimitPerMinute`,
   `revokedAt?`. Les applications de Meeshy (iOS, web, Android) deviennent des
   `Application` marquées `firstParty`, pour que l'axe « client » soit UN axe et non
   une exception.
2. **Jetons à portée** (#12940, bloc B du milestone 208) : portées nommées
   `conversations:read`, `messages:send`, `participants:write`, `identities:write`,
   `webhooks:manage`, `profile:read`… ; `403` si la portée manque, `401` si le jeton
   est révoqué ; journal d'audit par jeton. Le JWT utilisateur actuel devient UN type
   de jeton, à portée complète, inchangé pour les clients existants (rétrocompat).
3. **Flux OAuth 2.1** sur `/oauth/*` : `client_credentials`, `authorization_code` +
   PKCE, `token-exchange` (RFC 8693, réservé aux applications d'une organisation
   pour leurs identités gérées), `refresh_token`, révocation, introspection. Déclaré
   dans l'OpenAPI.
4. **Limiteur par client** : clé `app:{clientId}` en plus de l'IP, quotas par
   application, refus explicite avec `Retry-After`.
5. **Console** dans l'administration web : applications, secrets (écriture seule),
   webhooks et leurs livraisons, jetons actifs, journal. Portée par
   `Organization` quand elle existe, par le compte sinon.
6. **Documentation** : portail généré depuis l'OpenAPI, guide de démarrage, et la
   page « Partenaires » ramenée à ce qui existe (dire vrai).

## 5. Rétrocompatibilité et sécurité (invariants)

- Aucun client existant ne change : JWT, `X-Session-Token`, routes et événements
  actuels restent servis. Les nouveautés sont des AJOUTS (nouveaux modèles, nouvelles
  routes, nouveaux champs optionnels).
- Chaque garde est **fail-closed** et testée : une portée absente, une application
  révoquée, un `externalId` hors organisation, un agent hors périmètre ⇒ refus.
- **Ce qui part à côté** (leçon 275) : un jeton à portée `conversations:read` ne doit
  pas emporter la présence, les contacts ou les champs voisins ; chaque projection
  servie à un tiers est déclarée, jamais `additionalProperties: true`.
- Les lots d'authentification, de jetons et de rattachement passent par
  `auditeur-adversarial` avant fusion (#9226) ; le rattachement et le provisionnement
  passent aussi par `conformite-juridique` (sous-traitance : l'organisation est
  responsable de traitement de ses identités gérées, Meeshy sous-traitant — contrat
  type à prévoir).
- Secrets : jamais relus ni affichés ; `clientSecretHash` seul en base.
- Les webhooks ne visent jamais une adresse privée ; la charge ne contient que ce que
  les portées de l'application autorisent.

## 6. Ce que le chantier NE fait pas (non-objectifs)

- Pas de base par organisation, pas de déploiement sur site, pas de marque blanche.
- Pas de SAML ni d'OIDC entrant (Meeshy ne consomme pas l'annuaire du tiers) : le
  tiers s'authentifie par client credentials et provisionne par l'API.
- Pas de facturation ni de quotas payants : Meeshy est gratuit (#9227) ; les quotas
  sont des bornes de sûreté.
- Pas de chiffrement de bout en bout dans les conversations de guichet en v1.
- Pas de SDK Swift ou Kotlin publié en v1 (le SDK iOS doit d'abord perdre ses
  singletons et ses hôtes codés en dur) ; TypeScript d'abord.
- Rien n'est exposé à un tiers tant que #9925 (l'agent qui emprunte des identités)
  n'est pas tranché pour les conversations d'organisation.

**Anti-objectifs** (ce qui ferait échouer même si « ça marche ») : des identités
gérées qui fuient dans le graphe social ; un robot pris pour un humain ; un agent
d'organisation qui lit une conversation hors de son périmètre ; un client existant
qui doit se mettre à jour.

## 7. Découpage proposé en lots (chaque lot = une issue, un milestone nommé par le résultat)

| # | Lot | Résultat attendu | Dépend de | Réutilise |
|---|---|---|---|---|
| 1 | Application et jetons à portée | Une application tierce appelle l'API avec un jeton à portée, et une portée manquante est refusée | — | #12940, OpenAPI existante |
| 2 | Limiteur et console | Chaque application a son quota et sa console (secrets, jetons, journal) | 1 | #10489 |
| 3 | Organisation et membres | Une organisation existe, avec ses rôles, et possède ses applications | 1 | `Community` comme modèle de rôles, pas comme base |
| 4 | Identités gérées et échange de jeton | Une plateforme provisionne un invité ou un compte par `externalId`, obtient son jeton, l'efface et exporte ses données | 1, 3 | invités existants (`Participant` anonyme) |
| 5 | Rattachement invité → compte | Un invité garde son historique en rattachant un compte ; vaut aussi pour un lien de partage ordinaire | 4 | milestone 247 (reconnexion des invités) |
| 6 | Robot nommé | Un robot possédé par une organisation écrit, étiqueté, dans une conversation ; jamais au nom d'un humain | 3 | `UserRole.AGENT`, `Participant.type: 'bot'`, `messageSource`, #14742, #9925 |
| 7 | Webhooks sortants | Une application reçoit les événements signés qu'elle a souscrits, avec rejeu | 1 | catalogue `socketio-events` |
| 8 | Guichet et intervention | Un agent d'organisation entre, ajoute un collègue, transfère ; le robot du guichet est posé par défaut ; les trois clients marquent la conversation et nomment le robot | 3, 6 | routes participants existantes, #14742 |
| 9 | Se connecter avec Meeshy | Un utilisateur se connecte sur Meeshy et revient sur la plateforme avec un jeton consenti | 1 | — |
| 10 | SDK TypeScript et portail | `@meeshy/client` publié ; portail généré ; page Partenaires alignée | 1, 7 | générateurs du catalogue d'endpoints |
| 11 | Embed par origine déclarée | Le fil Meeshy s'affiche dans une page du tiers qui l'a déclarée | 1 | CSP du gateway |
| 12 | Serveur MCP | Un agent IA tiers agit par outils sur un jeton à portée | 1 | #12941 |

Le cas concret de la marketplace est servi par les lots 1, 3, 4, 5, 6, 8 (dans cet
ordre), puis 7. Les lots 9 à 12 sont la plateforme développeur au sens large.

## 8. Ce qui est laissé au bâtisseur

Le nommage exact des portées, la forme des tables de webhooks et de leurs
livraisons, la rotation des secrets, le format du jeton d'application (JWT signé ou
opaque avec introspection), les écrans de la console (le design system web existe),
le choix entre un `kind` sur `Community` ou un modèle `Organization` neuf si le
porteur tranche « séparer » (recommandation § 9).

## 9. Décisions à trancher par le porteur (issue `décision-produit`)

1. **Périmètre maintenant vs roadmap.** La roadmap du 2026-08 posait « pas de
   nouvelles surfaces produit avant la fin de l'horizon 2 » et rangeait le B2B en
   horizon 4. Ce chantier ouvre une surface. Le porteur confirme-t-il qu'il passe
   devant, et sur quel horizon ?
2. **Organisation : modèle neuf ou `Community` étendue ?** Recommandation : un modèle
   `Organization` neuf. `Community` est sociale (posts, découverte) ; l'organisation
   est une entité de possession et de responsabilité. Les mélanger ferait fuir le
   social dans le B2B.
3. **Portée sociale des identités gérées.** Recommandation : scellées dans leur
   organisation tant qu'elles ne sont pas rattachées à un vrai compte. L'inverse
   (clients de la marketplace visibles dans World et les contacts) est un choix de
   produit lourd, à ne prendre qu'explicitement.
4. **Rattachement : qui décide ?** La personne seule (« garder mon historique »), ou
   aussi la plateforme par l'API ? Recommandation : les deux, mais la plateforme ne
   rattache qu'à un compte qu'elle a elle-même provisionné ; rattacher à un compte
   Meeshy préexistant exige toujours le consentement de la personne connectée.
5. **Le robot : quel pilotage par défaut ?** L'agent IA de Meeshy (type `support`,
   base de connaissance du guichet) ou le webhook du tiers ? Recommandation : les
   deux disponibles, le webhook par défaut pour une plateforme (elle connaît ses
   commandes), l'agent Meeshy par défaut pour une entreprise sans équipe technique.
   Dans tous les cas, l'emprunt d'identités humaines est éteint dans ces
   conversations, et #9925 reste à trancher pour le reste de Meeshy.
6. **« Se connecter avec Meeshy » : v1 ou plus tard ?** Le cas marketplace n'en a
   pas besoin (elle tient ses identités). Recommandation : lot 9, après le socle.
7. **Licence du SDK publié.** `@meeshy/shared` est `UNLICENSED`, le dépôt MIT,
   libsignal AGPL (#11548). Publier `@meeshy/client` exige une licence choisie et
   un découpage qui n'emporte pas libsignal.
8. **Contrat de sous-traitance.** Une organisation qui provisionne des identités
   fait de Meeshy son sous-traitant : conditions B2B, DPA type, qui les rédige et
   quand ? Avis `conformite-juridique` d'abord, juriste signataire ensuite.
9. **Forme de la marketplace : une organisation, ou une par vendeur ?** Le cas
   concret dit « ses organisations et leurs clients ». Recommandation : la
   marketplace est une **organisation parente** qui possède l'Application de
   plateforme ; chaque vendeur est une **organisation enfant** qu'elle crée par
   l'API (`parentOrganizationId`). Le cloisonnement vaut entre enfants (le vendeur A
   ne lit jamais B) ; la parente voit ses enfants ; `externalId` est unique par
   organisation. Sans hiérarchie, soit tous les vendeurs se voient, soit la
   marketplace ne peut rien administrer : les deux sont faux.
10. **Y a-t-il un client pilote, avec son mode d'intégration et son échéance ?**
   S'il veut ses propres vues, le SDK TypeScript et le contrat temps réel (lot 10)
   remontent avant le guichet natif (lot 8) ; sa volumétrie fixe les quotas ; une
   mise en production vise la rétrocompatibilité et l'audit du § 5.

## 10. Sources

Inventaires du 2026-11-14 (code et issues) : `packages/shared/prisma/schema.prisma`
(`Participant` :990, `ConversationShareLink` :933, `Community` :2389, `AgentConfig`
:5238, `ExternalConversationPeer` :872, `UserRole` :18), `services/gateway/src/routes/conversations/link-admission.ts`,
`services/gateway/src/middleware/auth.ts`, `services/gateway/src/socketio/agent-response-bridge.ts`,
`services/agent/src/memory/mongo-persistence.ts`, `services/gateway/src/server.ts`
(OpenAPI, CORS, CSP), `apps/web/src/institutional/partners.ts`,
`docs/product/api-simplification/README.md`, `docs/product/roadmap-produit-2026-08.md` § 229 et 243.
Issues : #12940, #12941, #9925, #14742, #10489, #11548, #14303, #9226, #9232, #9227,
milestones 208 et 247.

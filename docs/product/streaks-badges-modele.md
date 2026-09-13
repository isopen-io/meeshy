# Streaks & badges — le modèle

> Source de vérité de la **sémantique** des quatre notifications de réengagement
> `ACHIEVEMENT_UNLOCKED`, `STREAK_MILESTONE`, `LEVEL_UP`, `BADGE_EARNED`
> (`packages/shared/types/notification.ts:154-157`), décidée et cadrée par
> l'issue [#3695](https://github.com/isopen-io/meeshy/issues/3695).
>
> Décision du porteur (2026-09-03, commentaire de #3695) : les quatre types
> sont **gardés** ; ce document définit ce qui les émet. Il ne remplace pas
> l'arbitrage produit sur les valeurs de seuils — celles-ci sont un **socle
> initial, tunable**, à valider une fois l'instrumentation posée (§ 7).

## 1. Les quatre types, et ce qui les distingue

| type | déclencheur | granularité | portée |
|---|---|---|---|
| `BADGE_EARNED` | un **compteur d'axe** franchit un seuil de sa propre échelle | par axe (§ 2) | un badge par (axe, palier) |
| `STREAK_MILESTONE` | une **série de jours consécutifs** avec au moins une activité qualifiante franchit un palier | globale (tous axes confondus) | un jalon par palier de série |
| `LEVEL_UP` | un **score agrégé**, somme pondérée de tous les axes, franchit un palier de niveau | globale | un niveau, monotone croissant |
| `ACHIEVEMENT_UNLOCKED` | une **condition composée**, sur un ou plusieurs axes, se satisfait pour la première fois | croisée | un succès nommé, non répétable |

Les quatre partagent la même mécanique de bas niveau (§ 3, § 4) et ne
diffèrent que par la fonction qui décide « ce seuil est-il franchi ? ».

### Ce qui se CÉLÈBRE et ce qui se NOTIFIE (directive porteur 2026-09-09, #5847)

Les quatre types partagent la mécanique, **pas la surface**.

> *« On a facilement la vue d'achievement qui s'affiche lorsqu'on a réalisé une
> opération qui déclenche un succès, le reste ce sont des notifications rien de
> plus ! »*

| type | au moment du geste | au tap de la notification |
|---|---|---|
| `ACHIEVEMENT_UNLOCKED` | **la vue de révélation s'ouvre, sans rien toucher** | la vue de révélation, puis le tableau de bord |
| `BADGE_EARNED` | notification | tableau de bord |
| `STREAK_MILESTONE` | notification | la vue de révélation, puis le tableau de bord |
| `LEVEL_UP` | notification | la vue de révélation, puis le tableau de bord |

La raison tient en une phrase : **un succès nomme un fait rare et non
répétable — il mérite qu'on interrompe ; un badge, une série, un niveau
tombent au fil de l'usage.** Les célébrer tous ferait de la célébration un
bruit, et le premier bruit qu'on apprend à ignorer est celui qui devait faire
plaisir. Le TAP, lui, reste servi pour les trois formes : quelqu'un qui touche
la notification d'une série a demandé à la voir.

Loi unique, côté client : `EngagementReveal.celebratesUnprompted`
(`packages/MeeshySDK/.../Models/EngagementReveal.swift`), lue par
`EngagementRevealHost`, l'hôte MONTÉ SUR LES DEUX RACINES — un hôte écrit deux
fois diverge, et la divergence ne rougit nulle part.

### Ce qui ANNONCE, et ce qui se tait

L'attribution d'un succès a un site unique côté serveur —
`graveEtAnnonce` (`services/gateway/src/services/achievements/AchievementAnnounce.ts`),
partagé par `CerclesAchievements` et `GlobalAchievements` — et **l'annonce
dépend de l'ORIGINE de l'attribution, jamais du palier** :

- `origin: 'geste'` ⇒ le palier s'annonce ;
- `origin: 'balayage'` ⇒ il se tait. Le balayage (`GlobalAchievements.sweep`,
  joué à l'ouverture de `GET /me/engagement`) est un RATTRAPAGE : il découvre
  ce qui était déjà vrai. Notifier ferait tomber des dizaines de bannières d'un
  coup à la première ouverture de l'écran, pour des gestes vieux de plusieurs
  jours ;
- un geste qui franchit plusieurs paliers d'UNE famille n'annonce que **le plus
  haut** — « 1 000 messages envoyés » subsume « 1 message envoyé ». Le cas se
  produit au premier geste d'un compte qui a déjà de l'historique ;
- un geste qui franchit **deux FAMILLES** annonce les deux : ce sont deux faits
  distincts, et en taire un garderait un acquis pour soi. La rafale se gouverne
  à l'AFFICHAGE (le client célèbre l'un après l'autre, `EngagementRevealQueue`),
  jamais en perdant un fait.

## 2. Les axes (socle dicté par le porteur, § « etc. » assumé — extensible)

| famille | axe | ce qui incrémente le compteur |
|---|---|---|
| **contenu produit** | messages audio | un message avec pièce jointe audio est envoyé avec succès (ACK serveur) |
| | messages texte | un message texte (sans pièce jointe audio) est envoyé avec succès |
| | posts | un post est publié (`status: PUBLISHED`, pas brouillon) |
| | stories | une story est publiée |
| | réels | un réel est publié |
| **commentaires** | commentaires audio | un commentaire avec pièce jointe audio est publié |
| | commentaires texte | un commentaire texte est publié |
| **conversations** | conversations privées | l'utilisateur envoie un premier message dans une conversation privée **distincte** (dédupliqué par conversationId) |
| | conversations publiques | idem, conversation de type public |
| | conversations communautaires | idem, conversation rattachée à une communauté |
| **usage d'outils** | stickers posés | un sticker est inséré dans un message envoyé avec succès |
| | montage in-app | un média passe par l'éditeur de montage avant publication (post/story/réel) |
| | publication simple directe | un post/story/réel est publié SANS passer par le montage (chemin direct) |

Chaque axe est identifié par une **clé stable** (`snake_case`, ex.
`content.audio_message`, `comment.text`, `conversation.private`,
`tool.sticker`) — jamais un libellé humain, pour que renommer l'affichage
n'invalide pas les compteurs déjà écrits.

Le « etc. » du porteur reste ouvert : ajouter un axe = ajouter une clé au
catalogue (§ 6) et un point d'appel (§ 3) — aucune migration de schéma
requise, cf. § 3.

## 3. Le modèle de compteur — lieu et incrémentation

### Décision : incrémenté à l'écriture, derrière un service UNIQUE

La question structurante posée par le porteur (« où vit le compteur : dérivé
à la lecture ou incrémenté à l'écriture ? ») se tranche pour
**l'incrémentation à l'écriture**, pour deux raisons :
- un compteur dérivé à la lecture (agrégation sur `Message`/`Post`/… à
  chaque consultation) coûterait une requête d'agrégation par écran de
  progression, sur des collections déjà volumineuses ;
- la mécanique anti-rejeu (§ 4) a besoin d'un événement de franchissement
  ponctuel, que seule l'écriture peut produire proprement.

Le risque nommé par le porteur — « un compteur incrémenté à l'écriture est
aussi juste que la liste des chemins qui écrivent » — se traite en réduisant
cette liste à **UN SEUL point d'appel** : `EngagementService.recordActivity(userId, axisKey)`
(`services/gateway/src/services/engagement/EngagementService.ts`). Aucune
route, aucun handler socket n'incrémente un compteur directement ; chacun
des treize points d'écriture énumérés § 2 appelle cette unique méthode une
fois son ACK métier posé (message persisté, post publié, etc. — jamais avant
la confirmation, pour ne pas compter un envoi qui échoue).

### Schéma (Prisma, `packages/shared/prisma/schema.prisma`)

```prisma
model EngagementCounter {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  userId    String   @db.ObjectId
  axisKey   String   // ex. "content.audio_message" — catalogue § 6
  count     Int      @default(0)
  updatedAt DateTime @updatedAt

  @@unique([userId, axisKey])
  @@index([userId])
}
```

Un document par (utilisateur, axe) — jamais une colonne par axe sur `User` :
ajouter un axe n'ajoute aucune migration de schéma, seulement une entrée au
catalogue § 6. C'est le même choix que `AdminAuditLog`/`Ban` (une ligne par
occurrence plutôt qu'un champ par variante).

## 4. Anti-rejeu — un seuil franchi une fois ne se re-notifie jamais

```prisma
model EngagementMilestone {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  userId        String   @db.ObjectId
  milestoneType String   // "badge" | "streak" | "level" | "achievement"
  milestoneKey  String   // "content.audio_message:10", "streak:7", "level:3", "achievement.first_post"
  reachedAt     DateTime @default(now())

  @@unique([userId, milestoneType, milestoneKey])
  @@index([userId, milestoneType])
}
```

`EngagementService.recordActivity` :
1. incrémente `EngagementCounter` (upsert `$inc`) ;
2. calcule les paliers **franchis par cet incrément précis** (le compteur
   vient de passer de N à N+1 : seul un palier dans `]N, N+1]` peut être
   neuf) ;
3. pour chaque palier franchi, tente un `create` sur `EngagementMilestone`
   avec la contrainte unique ci-dessus — un conflit (palier déjà écrit)
   n'émet rien, silencieusement : c'est la garde anti-rejeu, portée par la
   base, pas par une relecture avant écriture (évite la course entre deux
   écritures concurrentes du même utilisateur) ;
4. chaque `create` qui réussit produit une notification du type approprié
   (§ 1) via `NotificationService`, existant.

Recalculer un compteur (migration, correction de bug) ne re-déclenche donc
jamais un palier déjà servi — la table `EngagementMilestone` est la mémoire
de ce qui a déjà été notifié, indépendante de la valeur courante du
compteur.

## 5. Streak (série de jours) et niveau — les deux mécaniques globales

### Streak

Champs sur `User` (pas une collection à part — une série est un état, pas un
historique à interroger) :

```prisma
currentStreakDays Int       @default(0)
longestStreakDays Int       @default(0)
lastStreakDate    DateTime? // date (UTC, jour civil) de la dernière activité qualifiante
```

Une activité qualifiante = tout appel à `recordActivity` (n'importe quel
axe). À chaque appel, `EngagementService` compare `lastStreakDate` au jour
civil courant (fuseau UTC, cohérent avec le reste du gateway) :
- même jour → rien ne change ;
- jour suivant → `currentStreakDays += 1` ;
- saut de plus d'un jour → `currentStreakDays = 1` (série rompue, on
  repart) ;
- `longestStreakDays = max(longestStreakDays, currentStreakDays)`.

Paliers `STREAK_MILESTONE` (§ 7) évalués sur `currentStreakDays` après mise
à jour, avec la même garde anti-rejeu (`milestoneType: "streak"`,
`milestoneKey: "streak:{N}"`).

### Niveau

Score agrégé = somme pondérée des `EngagementCounter.count` de l'utilisateur
(poids par axe, § 7 — un message texte pèse moins qu'un réel monté). Calculé
à chaque `recordActivity` à partir des compteurs déjà en mémoire de l'appel
courant (pas de scan de collection) : le service connaît le compteur qu'il
vient d'incrémenter, additionne le delta pondéré à un `User.engagementScore`
maintenu de la même façon qu'`EngagementCounter` (`$inc` atomique). Paliers
`LEVEL_UP` évalués sur ce score, anti-rejeu `milestoneType: "level"`.

## 6. Catalogue des clés d'axe (`packages/shared/types/engagement.ts`, à créer)

Une seule énumération, importée par le gateway (producteur) et les clients
(affichage) — même discipline que `packages/shared/utils/languages.ts` pour
les langues :

```ts
export const ENGAGEMENT_AXES = [
  'content.audio_message', 'content.text_message', 'content.post',
  'content.story', 'content.reel',
  'comment.audio', 'comment.text',
  'conversation.private', 'conversation.public', 'conversation.community',
  'tool.sticker', 'tool.in_app_edit', 'tool.direct_publish',
] as const;
export type EngagementAxisKey = typeof ENGAGEMENT_AXES[number];
```

## 7. Seuils — socle initial, tunable

Valeurs de départ, choisies pour une progression lisible tôt (premier badge
atteignable en une session) puis espacée (évite le bruit de notification) —
**à valider avec des données d'usage réelles avant d'être considérées
définitives**, cf. dimension 10 (Utilité) du CLAUDE.md racine :

| échelle | paliers |
|---|---|
| **par axe** (`BADGE_EARNED`) | 1, 10, 50, 100, 500 |
| **streak** (`STREAK_MILESTONE`) | 3, 7, 14, 30, 60, 100 jours |
| **niveau** (`LEVEL_UP`, score agrégé) | 10, 50, 150, 400, 1000, 2500 points |
| **poids par axe** (score) | contenu produit ×3, commentaires ×2, conversations ×5 (une seule fois par conversation distincte), outils ×1 |

`ACHIEVEMENT_UNLOCKED` (§ 8) a ses propres conditions, pas une échelle.

## 8. Succès composés (`ACHIEVEMENT_UNLOCKED`) — socle

Conditions ponctuelles, non répétables, sur un ou plusieurs axes :

| clé | condition |
|---|---|
| `achievement.first_content` | premier axe de « contenu produit » atteint (n'importe lequel) |
| `achievement.all_content_types` | au moins 1 sur CHACUN des 5 axes de contenu produit |
| `achievement.first_voice` | premier message OU commentaire audio |
| `achievement.editor` | premier montage in-app |
| `achievement.three_conversation_kinds` | au moins 1 sur les 3 axes de conversation |

Même mécanique anti-rejeu (`milestoneType: "achievement"`).

### La GRAMMAIRE des succès (#5758, #5759) — ce que ce socle est devenu

Les cinq conditions ci-dessus restent servies, mais elles ne sont plus le
catalogue : elles en sont l'amorce. Le porteur en a demandé des **milliers**
(« une conversation de plus de 10, 100, 1 000, 10 000 membres ; même chose pour
une communauté, pour un appel lancé, pour un message, un vocal, une image… »),
ce qu'une énumération ne peut pas porter — des milliers d'entrées × sept
langues, fausses dès la première divergence de traduction.

La clé est donc **composée**, et le libellé aussi :

```
achievement.<section>.<sujet>.<geste>.<échelle>:<palier>
achievement.cercles.conversation.join.size:1000
achievement.parole.message.send.count:10000
```

Le nombre de chaînes à traduire suit le nombre de **familles** (sujet, geste,
échelle) — 22 aujourd'hui —, pas le nombre de succès (114). Sources de vérité :
`packages/shared/types/achievement-catalog.ts` (la grammaire),
`achievement-families.ts` (les familles), `utils/achievement-labels.ts` (les
gabarits), `utils/achievement-view.ts` (l'ordre, l'atteignabilité, la fenêtre).
Miroir iOS : `packages/MeeshySDK/.../Models/AchievementCatalog.swift`, dont
`parse(key:)` est l'INVERSE exact de `key(tier:)` — c'est lui qui permet à une
clé composée reçue sur le fil de se célébrer.

**Deux namespaces de clés cohabitent donc**, et c'est délibéré : les cinq clés
plates (`achievement.first_content`…) sont gravées par `EngagementService`, les
composées par les deux producteurs de la section « achievements ». Un client
lit d'abord l'énumération legacy, puis la grammaire — leurs formes ne se
confondent pas (une clé plate n'a ni `:` ni cinq segments).

**Un succès ne crédite AUCUN point** (#5758) : il nomme un fait, il n'alimente
pas la monnaie — sinon la course aux succès deviendrait une pompe à Meeshes.

## 9. Écran de consultation

Les notifications existantes (fil de notifications, 3 clients) restent le
canal de LIVRAISON. Un écran « Progression » (profil) restitue l'état
courant — badges obtenus par axe, niveau, série en cours — sans qu'il soit
nécessaire d'avoir vu chaque notification : une lecture directe de
`EngagementCounter` + `EngagementMilestone` + `User.{currentStreakDays,
engagementScore}` pour l'utilisateur courant, exposée par
`GET /me/engagement`.

## 10. Ce que ce document NE tranche PAS

- Les poids et seuils exacts (§ 7) sont un socle — l'issue d'implémentation
  du modèle de score (§ 6/13 ci-dessous) doit les rendre configurables
  (constante nommée, pas un magic number dispersé), pas les figer.
- L'illustration visuelle des badges (iconographie) n'est pas spécifiée ici
  — dimension 8 (UX), à traiter avec le design system Meeshy au moment de
  l'écran § 9.
- La rétroactivité (compter l'historique existant au lancement) n'est pas
  demandée : les compteurs démarrent à zéro au déploiement, seule l'activité
  future est comptée. Une décision explicite serait nécessaire pour un
  backfill.

## 11. Issues d'implémentation

Une issue par axe, jamais un lot unique (le premier compteur faux
emporterait les autres) — voir les sous-issues de
[#3695](https://github.com/isopen-io/meeshy/issues/3695).

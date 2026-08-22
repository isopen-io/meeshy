# Cycle 85 — Le module que le cycle 84 a audité n'est pas celui qui sert

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-761vij`
**Périmètre** : passerelle (`routes/communities.ts`), le paquet partagé
(`utils/presence-visibility.ts`) et deux suites neuves

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile temps réel modifiée, aucune ligne de
Socket.IO touchée. Une réponse REST change de contenu — voir §5.

---

## 1. D'où vient ce cycle

Le cycle 84 a déclaré close la famille « présence non filtrée » du cycle 81 : ses
quatre surfaces traitées, deux gatées, deux requalifiées en charge utile morte.
Il a laissé au cycle 85 la convergence des neuf collapses prefs-only recopiés à
la main.

Ce cycle a commencé là. Il s'est arrêté au premier fichier ouvert.

`routes/communities/members.ts` porte un gate `resolvePrefsOnly` depuis
plusieurs cycles. `routes/communities.ts` — le fichier VOISIN, 64 Ko, legacy —
n'en porte aucun. Les deux exportent `communityRoutes`. Un seul est chargé.

## 2. La découverte : `routes/communities/` n'a jamais été branché

`route-registration.ts` importe sans extension :

```ts
import { communityRoutes } from './routes/communities';
```

Node résout **LOAD_AS_FILE avant LOAD_AS_DIRECTORY**. Vérifié empiriquement
plutôt que déduit :

```
resolves to: …/routes/communities.js
value:       FROM_FILE_communities.js
```

C'est donc `routes/communities.ts` qui sert la production, et le répertoire
`routes/communities/` — `core.ts`, `members.ts`, `settings.ts`, `search.ts`,
~1 900 lignes — est **INJOIGNABLE**.

**Le dépôt connaît pourtant le bon geste, trois fois.** `routes/users.ts`,
`routes/voice.ts` et `routes/attachments.ts` sont des coquilles de six à
quatorze lignes :

```ts
export { userRoutes } from './users/index';
```

C'est l'étape finale d'une scission de module, celle qui garde l'import
extensionless valide. `communities` est la seule scission à ne l'avoir jamais
reçue. Le répertoire a été écrit, testé, maintenu — et jamais atteint.

**Conséquence sur le cycle 84 :** le témoin qu'il a posé sur
`routes/communities/search.ts` garde du code mort. Sa conclusion de fond tient
quand même — la route LIVE `GET /communities/search` porte le même
`members: { type: 'array', items: { type: 'object' } }` nu, donc le même aperçu
d'objets vides — mais elle tient par coïncidence, pas parce qu'il l'avait
vérifié sur le bon fichier.

## 3. Ce que sert vraiment `routes/communities.ts`

Le fichier live contient **zéro import de gate** et dix `select: { isOnline: true }`.
Traversée du sérialiseur, route par route — la méthode que le cycle 84 a
justement rendue obligatoire :

| Route | `select` | Schéma pour cette clé | Au fil ? |
|---|---|---|---|
| `GET /communities` | `members[].user.isOnline` | `communitySchema` ne déclare pas `members` | non |
| `GET /communities/search` | idem | `items: { type: 'object' }` nu | non — objets vides |
| `GET /communities/:id` | idem | `communitySchema` sans `members` | non |
| `GET /communities/:id/members` | `user.isOnline`, `user.lastActiveAt` | `communityMemberSchema.user` = `userMinimalSchema` | **isOnline FUIT** |
| `POST /communities/:id/members` | `user.isOnline` | idem | **FUIT** |
| `POST /communities/:id/invite` | `user.isOnline` | idem | **FUIT** |
| `POST /communities/:id/join` | `user.isOnline` | idem | sert — mais la cible est le LECTEUR |
| `GET /communities/:id/conversations` | `participants[].user.isOnline` | clé `members` ≠ `participants`, et `user: { type: 'object' }` nu | non — doublement supprimé |

`userMinimalSchema` ne déclare pas `lastActiveAt` : ce champ ne sort d'aucune de
ces portes.

**Trois fuites réelles, en production.** Et la quatrième route sert bien la
présence, mais celle du lecteur sur lui-même : `POST /join` crée l'adhésion avec
`userId = authContext.userId`. Ce n'est pas une fuite, et ce cycle ne la filtre
PAS — filtrer sa propre présence « par symétrie » serait un bug.

## 4. Les deux régimes, sur la même route

`GET /communities/:id/members` est une porte **MIXTE**, et c'est le point le plus
délicat du lot. Son contrôle d'accès ne referme que les communautés privées :

```ts
if (!hasAccess && community.isPrivate) return sendForbidden(…);
```

Sur une communauté **publique**, `hasAccess` est faux et la route répond quand
même : le lecteur est un non-membre qui parcourt une liste de tiers.

- lecteur co-membre ⇒ l'appartenance commune est un contexte d'accès garanti des
  deux côtés ⇒ **`resolvePrefsOnly`**, et une entrée absente reste VISIBLE ;
- lecteur non-membre ⇒ c'est une porte de **DÉCOUVERTE** ⇒ **`resolveForTargets`**
  (blocage, amitié, co-participation), et une entrée absente MASQUE.

C'est exactement la distinction que le cycle 84 avait nommée en §7 à propos de
l'aperçu de communautés, et le cycle 82 pour les défauts opposés. Ici les deux
régimes tombent sur **la même route**, décidés par le même booléen `hasAccess`.

`POST /members` et `POST /invite` : l'acteur est admin ou modérateur, la cible
devient co-membre ⇒ prefs-only.

## 5. Ce qui change

- `GET /communities/:id/members` : `data[].user.isOnline` vaut `false` quand la
  préférence de la cible l'exige, ou — pour un lecteur non-membre — quand le
  critère strict ne l'autorise pas.
- `POST /communities/:id/members` et `POST /communities/:id/invite` :
  `data.user.isOnline` vaut `false` quand la préférence de la cible l'exige.
- `POST /communities/:id/join` : **inchangé** (§3).
- Aucune autre route ne change : les cinq restantes ne servaient rien.

**Le paquet partagé** gagne le choix explicite que le cycle 84 avait réclamé en
§8 — un applicateur qui exprime les DEUX défauts d'entrée absente :

```ts
applyPresenceVisibilityAsOffline(profile, visibility, { onMissingEntry: 'reveal' })
```

`'hide'` reste le défaut : les six sites stricts existants passent deux arguments
et ne changent pas de comportement. `'reveal'` sert le régime prefs-only, où une
entrée absente est la situation NORMALE (un anonyme n'a pas de préférences) et
non une anomalie.

## 6. Témoins

**`communities-presence-gate.test.ts` (neuf, +10).** Il monte le VRAI module de
routes ET les VRAIS schémas — `api-schemas` n'est pas mocké — donc ce qu'il
observe est ce que fast-json-stringify laisse sortir. C'est la leçon du cycle 84
appliquée d'emblée plutôt qu'en rattrapage.

Il fige aussi trois bornes qui ne sont pas des redites :
- l'`authContext` porte `type: 'user'`, la forme RÉELLE que pose
  `middleware/auth.ts` — les suites voisines écrivent `type: 'registered'`, sur
  quoi `viewerFromAuthContext` rend `null` et masque tout : le test passerait
  pour la mauvaise raison ;
- le non-membre bascule bien sur `resolveForTargets`, et une entrée absente y
  masque — le défaut inverse du régime voisin ;
- `POST /join` ne consulte **aucun** gate.

**ROUGE prouvé** : 6 des 10 témoins tombent sur le code d'avant. Les 4 autres
sont des bornes (self, `lastActiveAt` non déclaré, conservation autorisée) qui
passent trivialement et délimitent la correction.

**`module-shadowing.test.ts` (neuf, +4).** Il garde l'ombrage lui-même, par deux
voies indépendantes : un balayage des paires `routes/X.ts` + `routes/X/index.ts`
qui exige une coquille de ré-export partout sauf sur une liste nommée
(`KNOWN_UNREACHABLE = ['communities']`), et une preuve **par le comportement** —
le module chargé enregistre `/communities/mine`, `/join`, `/leave`, `/invite`
(que seul le legacy porte) et n'enregistre PAS
`POST /communities/:id/conversations/:conversationId` (que seul le répertoire
porte).

Il tombe dans les deux sens : une nouvelle scission sans coquille, ou la
consolidation de `communities`. C'est sa raison d'être — **il garde une porte,
pas un bug.**

**Paquet partagé (+4)** : les deux défauts d'entrée absente, la préférence
explicitement négative qui masque malgré `'reveal'`, et le défaut `'hide'`
conservé sans option.

**Suites rejouées** : gateway **808 suites / 18 867 témoins verts**, paquet
partagé 98 fichiers / 2 368 témoins verts, `tsc --noEmit` propre.

## 7. Ce que ce cycle ne fait PAS, et pourquoi

**Il ne bascule pas `communities.ts` en coquille.** Le répertoire ne porte pas
`/communities/mine`, `/:id/join`, `/:id/leave`, `/:id/invite` : brancher la
coquille **supprimerait quatre routes de production**. Et il porte
`POST /communities/:id/conversations/:conversationId`, qui n'a jamais servi.

La consolidation exige de diffuser quinze handlers deux à deux, de décider quelle
version gagne à chaque divergence, et de vérifier ce que les clients appellent
vraiment. C'est un cycle entier — pas un geste en passant, et surtout pas un
geste d'agent de maintenance à 5 h du matin. Le témoin structurel le rend
impossible à faire par accident.

**Il ne supprime pas non plus le répertoire mort.** Le supprimer serait défendable
et serait la décision INVERSE de la consolidation ; les deux sont ouvertes, et
c'est au propriétaire du domaine de trancher.

**Il ne converge pas les huit collapses prefs-only restants** (cycle 84 §8).
L'applicateur qu'ils attendaient existe désormais et est prouvé sur trois portes.
La conversion mécanique des huit sites revient au cycle 86 — un lot propre, sans
découverte à absorber en même temps.

## 8. Ce qui reste ouvert

- **Consolidation `communities`** : brancher le répertoire (en portant les quatre
  routes manquantes) OU supprimer le répertoire. Décision de domaine.
- **Convergence prefs-only** : huit sites, applicateur prêt (cycle 86).
- **Les deux domaines voisins du cycle 80** : appartenance à une communauté (ce
  cycle en traite la présence, pas l'appartenance), épinglage / archivage.
- **`GET /communities/search`** : l'aperçu de 5 membres reste payé à chaque
  recherche pour des objets vides (cycle 84 §7, inchangé et toujours vrai sur la
  route live).
- **Dette d'environnement**, inchangée depuis le cycle 79 : `npx eslint` échoue
  dans ce conteneur (ESLint global sous `/opt/node22` résolu à la place de celui
  du dépôt). C'est l'environnement, pas le diff.

## 9. La leçon

> **Un audit prouve quelque chose du fichier qu'il a ouvert, pas du code qui
> s'exécute.** Le cycle 84 a conclu « entre la requête et le fil il y a un
> sérialiseur, et il faut l'avoir traversé pour parler ». C'est vrai, et
> insuffisant d'un cran : **entre le fichier et le fil il y a aussi un résolveur
> de modules.** Trois cycles ont gaté, testé et documenté `routes/communities/`
> avec application. Aucun n'a vérifié que quelque chose l'importait.

Et le corollaire, qui est ce que ce cycle livre vraiment :

> **Une scission de module inachevée ne ressemble à rien.** Elle ne casse pas le
> build, ne rougit aucun test, ne lève aucun avertissement : le répertoire
> compile, ses suites passent, sa couverture monte. Le seul symptôme est un
> correctif qui ne produit aucun effet — et personne ne mesure l'effet d'un
> correctif de confidentialité, justement parce qu'il n'a rien à montrer quand il
> marche. Le geste juste n'est pas de terminer la scission à la place de son
> auteur : c'est de poser le témoin qui rend son inachèvement VISIBLE, et de
> gater, en attendant, le fichier qui sert pour de vrai.

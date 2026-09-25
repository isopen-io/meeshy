## Leçon 349 — Un champ qu'un émetteur SERT depuis toujours, et qu'aucun décodeur client ne DÉCLARE

**Le porteur produit signale, 2026-08-30 : la bannière in-app ne dit pas de quel
type de notification il s'agit — seulement l'auteur et le contenu.** Un
commentaire sur un réel, une réaction à une story et la publication d'une humeur
rendaient toutes trois « Alice » / « super ! ».

Le diagnostic évident était « la phrase d'action n'atteint pas le client », et il
menait vers la passerelle — d'autant que `NotificationService.createNotification`
calcule un titre riche persisté (« Alice a commenté votre réel ») **puis
l'écrase** sur le fil : `socketPayload = { ...formatted, title: pushTitle,
subtitle: pushSubtitle }`. La première issue rédigée demandait de « cesser
d'écraser le titre riche ». Elle était FAUSSE.

`buildPushHeader` promeut l'ACTION en `subtitle` — justement parce qu'iOS réécrit
le TITRE d'une Communication Notification avec le `displayName` de l'`INPerson`
expéditeur (c'est écrit sur place, et onze témoins de
`SocialNotificationPrecision.test.ts` l'attestent). Le fil portait donc
« elvira ndjiki » ET « a commenté votre réel », côte à côte, depuis toujours.

**Ce qui manquait n'était pas la donnée. C'était sa DÉCLARATION chez le lecteur :**

| lecteur | ce qu'il faisait de `subtitle` |
|---|---|
| iOS (`SocketNotificationEvent`) | **ne le déclarait pas** — le décodeur le jetait, silencieusement |
| web (`buildNotificationTitle`) | lisait `title` (l'acteur) et ne regardait jamais à côté |

> **C'est l'exacte SYMÉTRIE de la leçon `_seq`** (« un champ que trois clients
> LISENT et qu'aucun contrat ne déclare »). Ici : un champ que l'émetteur SERT et
> qu'aucun décodeur ne déclare. Les deux formes ont le même mode de panne — rien
> ne rougit, rien n'échoue, la valeur voyage bien formée jusqu'à un lecteur qui
> ne la nomme pas — et elles se cherchent aux deux bouts du même fil.

Trois règles de méthode en sortent :

- **Devant « la donnée n'arrive pas », ouvrir le DÉCODEUR avant l'émetteur.** Un
  champ absent du `struct Decodable` est indiscernable d'un champ absent du fil :
  aucun des deux ne produit d'erreur. L'émetteur, lui, a des témoins ; le
  décodeur n'en a que sur ce qu'il déclare — par construction, il n'en a aucun
  sur ce qu'il ignore.
- **Un `select`/`CodingKeys` incomplet est le seul défaut qu'un témoin de
  l'émetteur ne peut PAS voir.** Le dépôt le dit déjà de la passerelle (« le
  `select` est le seul des trois qu'aucun témoin de rang ne peut voir ») ; c'est
  la même phrase, portée du serveur au client.
- **Une issue rédigée avant l'instruction porte une hypothèse, pas un constat.**
  Celle-ci a été corrigée dans son propre commentaire de clôture plutôt que
  livrée telle quelle : le lot n'a finalement touché AUCUNE source de la
  passerelle. Écrire le diagnostic qu'on a VÉRIFIÉ, et dire lequel on croyait
  tenir — sinon le prochain lot reprend l'hypothèse pour un fait.

Deux corollaires attrapés dans le même lot, tous deux déjà écrits ailleurs et non
portés jusqu'ici :

- **La seule pièce qui ne peut pas venir du serveur est celle qu'il ne connaît
  pas.** Le nom du groupe d'un message est LOCAL (renommage + emoji favori, pas
  forcément synchronisés) : « X dans <groupe> » se compose donc chez le client,
  et lui seul. Tout le reste — la phrase d'action, dans les huit langues — reste
  serveur (Prisme). Une frontière se trace sur ce que chaque côté SAIT, jamais
  sur ce qui serait pratique.
- **Un champ ajouté à un décodeur doit avoir un LECTEUR dans le même lot.**
  `postPreview` et `excerpt` avaient été ajoutés au décodage du fil « pendant
  qu'on y était » ; ils n'étaient lus par personne (le corps servi les contient
  déjà). Retirés. Un champ décodé sans lecteur est le même angle mort que celui
  qu'on vient de corriger, dans l'autre sens.

### Corollaire, payé dans le même lot : le double PARTIEL, quatrième exemplaire

Le correctif ci-dessus a fait tomber quatre témoins du web sur un `TypeError`
qui ne disait rien du comportement testé — `getActorDisplayName is not a
function`. Les deux suites de `use-notifications-manager-rq` mockaient
`@/utils/notification-helpers` par une fabrique qui ÉNUMÉRAIT quatre exports à
la main. La bannière s'est mise à en lire deux de plus ; ils sont sortis
`undefined`.

C'est le **quatrième** exemplaire d'une règle déjà écrite, datée et motivée dans
`services/gateway/CLAUDE.md` (« un double PARTIEL d'un module perd en silence
tout ce que le module GAGNE », cycles 91, 93, 104). Elle n'avait jamais été
portée côté web — elle l'est maintenant, dans `apps/web/CLAUDE.md`. Même forme
que la leçon 307 : **une règle ne se propage pas depuis son énoncé, elle vaut là
où quelqu'un l'a récitée.**

Et la faute de MÉTHODE, qui est la mienne : le lot avait fait tourner
`__tests__/utils/` — ses propres témoins, verts — et pas la suite complète. **Un
lot lance les suites qui EXERCENT le module changé, jamais seulement celles
qu'il vient d'écrire** ; ici la suite entière met trois minutes et aurait nommé
le défaut avant la CI. Un module nouvellement importé par un consommateur
existant est exactement le cas où ses doubles ont un inventaire en retard.

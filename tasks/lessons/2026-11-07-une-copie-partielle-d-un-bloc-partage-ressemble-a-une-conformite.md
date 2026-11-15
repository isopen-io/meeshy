## 2026-11-07 — Une copie PARTIELLE d'un bloc partagé ressemble à une conformité, et c'est ce qui la rend durable (#16578, #16581)

Suite directe de la leçon du 2026-11-06 (#16558 : *une règle qui oblige les AUTRES
fichiers se relève par les SERVEURS de la donnée, jamais par les importateurs de la
constante*). L'énumération qu'elle prescrivait a rendu treize serveurs de
`Message.content` hors du bloc de protection. Les deux qui servaient une bulle
complète à un lecteur ordinaire portaient le **même** défaut sous **deux** formes,
et c'est la première qui est instructive.

### Le site qui ne ressemblait à rien : quatre champs sur sept

`GET /conversations/:id/pinned-messages` n'ignorait pas la règle. Il la récitait à
la main, et à **quatre** des sept champs :

```ts
isViewOnce: true,      // ✓
isBlurred: true,       // ✓
expiresAt: true,       // ✓ chargé — et servi BRUT
effectFlags: true,     // ✓
//  maxViewOnceCount   ✗
//  viewOnceCount      ✗
//  ephemeralDuration  ✗
```

> **Un site qui ne connaît pas une règle se trouve ; un site qui en connaît les
> deux tiers se LIT comme conforme.** C'est ce qui l'a tenu hors de quatre cycles
> de gardes posées sur cette même famille : quiconque ouvrait ce fichier y voyait
> des noms de protection, et passait.

Et le tiers manquant n'était pas un détail. `ephemeralDuration` est le champ dont
les trois clients dérivent leur décompte local (#7451) : un éphémère épinglé
n'avait donc **aucun** décompte. Pire, `expiresAt` était servi en colonne BRUTE —
l'heure INTERNE de destruction, qui vaut le plafond de rétention de sept jours
tant que personne n'a reçu : « ce message disparaît dans 7 jours » sous un
éphémère de trente secondes.

**Le schéma, lui, déclarait les trois.** `messageSchema` porte
`ephemeralDuration`, `viewOnceCount` et `maxViewOnceCount` ; le gestionnaire ne
les produisait pas. C'est la forme 2 du § « Un schéma de réponse sans
`properties` » **lue à l'envers** : d'ordinaire le gestionnaire envoie ce que le
schéma supprime ; ici le schéma attend ce que le gestionnaire n'envoie pas. Aucun
des trois cliquets de schéma ne voit ce sens-là.

### Le doc-comment d'un helper ÉNUMÈRE ses portes, et cette énumération est une affirmation sur le MONDE

`keepAliveForReader` porte les deux coupures de service d'une page lue par UN
lecteur — l'éphémère échu pour lui (#7451), la réponse à ce qui est mort pour lui
(#8630). Son doc-comment dit, mot pour mot :

> « pour une porte qui n'avait ni l'une ni l'autre (recherche, fil, lien de
> partage) »

Trois portes nommées. Il y en avait **cinq** : la liste des épingles et
`GET /messages/:messageId` n'avaient ni l'une ni l'autre non plus, et ne
figuraient nulle part. C'est la leçon 261 déplacée d'un cran — d'un inventaire de
sites vers **le doc-comment de l'unité elle-même** :

> Une liste de portes écrite chez le helper affirme deux choses : « ces portes
> m'appellent » (vérifiable en une commande) et « ce sont les portes qui
> devraient m'appeler » (presque jamais vérifiée). La seconde se lit comme un
> périmètre, et sert d'alibi à quiconque cherche s'il manque un appelant.

La forme OUTILLÉE de la question est celle du cycle 123 bis : **compter les
appelants de production du helper, puis chercher les sites qui posent la même
question sans lui.** Ici : `grep -l 'prisma\.message\.' | xargs grep -L 'keepAliveForReader'`,
croisé avec « cette porte sert-elle `content` à un lecteur ? ».

### Et la borne n'est pas la même pour servir et pour faire sortir

En portant la coupure à `GET /messages/:messageId`, l'erreur facile était de
prendre la composition déjà écrite — `contentStillVisibleToReader`, qui lit la
chaîne de citations de façon ciblée. Elle borne à `D(u)` **sans grâce**, parce
qu'elle garde un geste de SORTIE (transfert, téléchargement). Cette porte, elle,
SERT une bulle — et son seul consommateur mesuré est la NSE iOS, dont le travail
est précisément de rattraper un retard **pendant** la grâce d'une heure.

> **Deux lois qui gardent « le même » éphémère peuvent différer d'une heure, et
> l'heure est le sujet.** Avant d'emprunter une composition existante, lire ce
> qu'elle garde (`servir` ou `faire sortir`) et non ce qu'elle lit.

Conséquence : la case « chaîne citée CIBLÉE + borne de SERVICE » n'existe pas dans
le dépôt, et les deux compositions disponibles défont chacune la moitié de ce
qu'on vient d'obtenir. Elle n'a donc pas été livrée — elle est **écrite sur place
et suivie** (#16582). Un lot qui découvre une case manquante la nomme ; il ne la
remplit pas de travers pour clore sa phrase.

### Ce qu'on en fait

1. **Devant un site qui récite une règle partagée à la main, compter les champs
   contre la constante** — jamais lire « il y a des noms de protection ici, donc
   c'est gardé ». La réparation est l'étalement de la constante, pas l'ajout des
   champs manquants : ajouter les trois aurait reproduit le piège à quatre
   champs près.
2. **Un témoin de projection lit ses clés DEPUIS la constante partagée**
   (`Object.keys(MESSAGE_PROTECTION_SELECT)`), pas depuis une liste recopiée —
   une cinquième famille ajoutée demain le fait tomber au lieu de passer en
   silence.
3. **Un doc-comment qui énumère des appelants se vérifie comme un compte ou un
   tri** : il se compte, il ne s'hérite pas.

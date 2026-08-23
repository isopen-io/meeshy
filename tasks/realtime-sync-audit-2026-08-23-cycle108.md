# Cycle 108 — le garde avait raison, et il gardait plus qu'un chiffre

Suivi direct du cycle 107 bis, dont le premier suivi neuf était : « le même
cast, côté WEB ». Il en comptait trois. Il y en avait seize, sous deux formes.

Mais le cycle n'a pas commencé là. Il a commencé sur `main` en rouge.

---

## 1. `main` était rouge, et rien ne tournait

La CI de `main` échouait depuis le matin, sur les quatre dernières exécutions.
Un seul job en cause — `Quality (bun)` — mais il garde tous les autres : Build
et **toutes** les suites de tests (passerelle, translator, audio, voix) étaient
`skipped`. `main` n'avait donc plus aucun signal de test, pas seulement un lint
rouge. C'est la propriété désagréable d'un job-portier : son échec ne se lit pas
comme « une vérification a échoué » mais comme « les vérifications n'ont pas eu
lieu », et la seconde est bien plus grave que ce que la couleur suggère.

L'étape fautive : `Type-check (apps/web — debt ratchet)`, 1240 erreurs pour une
baseline de 1239. **+1.**

## 2. Le +1 n'était pas une coquille de typage — c'était le défaut produit

```
components/feed/PostsFeedScreen.tsx(596,85): error TS2339:
  Property 'type' does not exist on type '{ id: string; author?: string; content?: string; }'
```

Le commit précédent (`feat(web): le repost miroite le format de sa source`)
câblait `targetType` sur les quatre sites de story et de réel, puis laissait le
fil derrière avec cette justification, en commentaire dans le code :

> « Le fil ne sert que POST et REEL, donc rien d'observable ne change ici. »

C'est l'inverse. **Si le fil sert REEL, alors reposter un réel depuis le fil
produit un POST** — la perte de nature que la loi du miroir existe pour
empêcher, décrite mot pour mot dans la doc de `RepostRequest.targetType` :
« Un réel y perdait aussi sa nature et quittait le fil des réels ».

L'état `repostingPost` ne portait pas `type`. Donc :

| geste | ce qu'il envoyait | signalé ? |
|---|---|---|
| repost sec (l. 596) | `targetType: undefined` | oui — le TS2339 ci-dessus |
| citation (l. 611) | **rien du tout** | **non** |

Les deux retombaient sur le `?? POST` de la passerelle. Les sites frères
l'envoient pourtant sur leurs DEUX gestes (`reel/[postId]` 203 et 218,
`feeds/post/[postId]` 202 et 223). Le fil était le seul site où la loi était
ÉCRITE sans être CÂBLÉE — et c'est la surface de repost la plus fréquentée.

**Ce que le cliquet a démontré au passage.** Il n'a pas attrapé une erreur de
frappe : il a attrapé le défaut que le commit précédent croyait avoir corrigé.
Relever la baseline d'un cran — le geste qui « débloque la CI » — l'aurait
enterré. Un budget de dette n'est pas qu'un budget : c'est un filet sous les
corrections incomplètes.

La citation, elle, n'a été trouvée par aucun garde. Elle OMETTAIT le champ, et
omettre un champ optionnel est licite. Le compilateur voyait la moitié bruyante
du défaut ; la moitié silencieuse ne se lisait qu'en relisant les deux gestes
côte à côte. **Un garde qui attrape une occurrence n'a pas attrapé la famille.**

## 3. Le cliquet dérivait de 3 avec l'état du build

Son en-tête énumère trois sources de dérive et les déclare absentes, dont :

> `@meeshy/shared` is resolved by web's `paths` to the shared package's SOURCE,
> not to its `dist/`, so whether shared was built does not matter.

**Vrai de l'ALIAS, faux du PAQUET.**
`__tests__/lentille/shared-law-dist-parity.test.ts` atteint la sortie construite
par chemin RELATIF (`../../../../packages/shared/dist/utils/*.js`), ce qui ne
consulte jamais `paths`. Mesure sur un arbre INCHANGÉ : **1243 sans le build,
1240 avec.** Une dérive de exactement 3.

Le défaut est celui de l'en-tête, pas du test : un test dont l'objet est de
comparer la source au `dist/` doit évidemment importer `dist/`.

Le coût a été payé dans ce cycle même : j'ai lu 1243, cru à une régression de 4,
et cherché trois erreurs qui n'existaient pas. Le sens inverse est pire — une
baseline prise un jour depuis un poste sans build offrirait 3 points
silencieusement dépensables, ce que ce cliquet existe précisément pour empêcher.

**L'état est ÉPINGLÉ plutôt que les erreurs exclues.** Exclure ces trois-là par
chemin (comme `.next/` l'est) stabiliserait aussi le chiffre, mais rendrait ce
fichier libre de toute dette à jamais. Refuser de mesurer dans un état indéfini
ne coûte rien et garde chaque fichier compté. Self-test étendu aux trois états
(absent, construit, **vide** — un build interrompu produit les mêmes TS2307).

## 4. Seize casts, deux formes, et la seconde est la nuisible

Le contrat existait déjà : `TypedSocket = Socket<ServerToClientEvents,
ClientToServerEvents>`, et `getSocket()` le rend typé.

**Forme A — `(socket as unknown).emit(…)`, 9 sites.**
Ce n'est pas une échappatoire : `.emit` sur un `unknown` est une **erreur de
compilation**. 30 des 1239 erreurs du cliquet venaient de là. Le geste avait
l'apparence d'un contournement et l'effet d'une panne. Vraisemblablement une
transformation `as any` → `as unknown` passée en masse pour satisfaire la règle
« pas de `any` » : elle a converti des types SUPPRIMÉS en dette COMPTÉE.

**Forme B — `(socket as unknown as { emit: (e: string, d: unknown) => void })`, 7 sites.**
Celle-ci **compile**. Elle ne contourne pas le contrat : elle en fabrique un
FAUX, permissif, qui accepte n'importe quel nom d'événement et n'importe quelle
charge. Aucun compteur ne la voit — ni avant, ni après.

Trois fonctions de `CallManager` déclaraient en outre `socket: unknown` en
PARAMÈTRE (le contrat jeté à la signature), alors que les trois appelants
passent tous le retour typé de `getSocket()`.

## 5. Ce que le contrat a trouvé une fois appliqué

`call:end` déclarait son ack **REQUIS**. Il ne l'est pas.

| bout | réalité mesurée |
|---|---|
| passerelle | enregistre `ack?:`, invoque `ack?.({ success })` partout → fonctionne sans |
| iOS | émet les DEUX façons — `emit("call:end", …)` et `emitWithAck` |
| Android | `CallSignalManager.kt` — sans ack |
| web | trois sites — sans ack |

Le déclarer requis **interdisait le motif majoritaire que la passerelle soutient
explicitement**.

C'est le même symptôme que `CallMediaToggleClientEvent` au cycle 107 bis et la
résolution **INVERSE**, parce que la mesure diffère : là-bas l'ack a été RETIRÉ
(personne ne l'envoyait, la passerelle ne l'appelait jamais) ; ici il est réel et
devient donc OPTIONNEL. **Un même symptôme sur un ack a deux résolutions justes,
et seule la mesure des deux bouts dit laquelle.** Le réflexe « retirer, comme la
dernière fois » aurait cassé les variantes `emitWithAck` d'iOS.

## 6. Sur le chemin de messagerie : six casts recopiaient le contrat à côté du contrat

Les six `.on` de `messaging.service.ts` sont partis **sans une seule erreur** :
le contrat déclarait déjà ces six événements avec exactement les charges que les
listeners transcrivaient à la main. Les casts ne compensaient aucun manque — ils
dupliquaient ce qui existait. Leurs voisines immédiates (`MESSAGE_CONSUMED`,
`MENTION_CREATED`) s'écrivaient d'ailleurs déjà sans cast : le fichier était
incohérent avec lui-même.

Le septième (`emitWithTimeout`) n'est **pas entièrement résolu**, et c'est
délibéré. Son nom d'événement est désormais vérifié ; sa charge ne l'est pas,
parce que corréler nom→charge exige un `messageData` TYPÉ, or il naît
`Record<string, unknown>` et se complète par MUTATION (chiffrement, pièces
jointes). Le typer suppose de rendre cette construction immuable — ce que le
style du dépôt demande par ailleurs, et qui touche le chemin E2EE. Lot à part,
consigné, pas forcé à la fin d'un cycle.

**Ce lot ne bouge pas le cliquet (1209 → 1209), et c'est sa leçon.** La forme B
compile : son retrait n'est pas chiffrable. Un progrès réel peut être invisible
au garde qui mesure — et le corollaire est plus inquiétant : la forme B peut
revenir sans que rien ne rougisse.

## 7. Gates

- `tsc` passerelle / shared / agent : **0 erreur** (prisma généré).
- Cliquet web : 1240 (rouge) → **1209**, aucun fichier en hausse
  (`CallManager` 31→6, `VideoCallInterface` 11→6 ; le reste de ces fichiers
  appartient à une autre famille — `window`, `constraints`, `event`).
- Suites web : appels 39/39 (391 témoins) + 11/11 (127), services 54/54 (1791),
  cache-sync 1/1 (93), repost 6/6 (dont **2 RED prouvés** avant correction).
- Suites passerelle : `CallEventsHandler` 2/2 (302 témoins).

## 8. Suivis

- [ ] **La forme B est hors de portée du cliquet.** Reintroduire un
      `(socket as unknown as { emit: … })` ne rougit rien. C'est le seul garde
      manquant de cette famille — un balayage textuel, sur le modèle du
      `client-receive-door-sweep` du cycle 107 bis, est la réponse ; il n'a pas
      été écrit ici pour ne pas ajouter un garde non éprouvé en fin de cycle.
- [ ] **`messageData` naît `Record<string, unknown>` et se complète par
      mutation** (`messaging.service.ts` l. 333–377). C'est la racine du dernier
      cast, et le typer est aussi une mise en conformité avec la règle
      d'immuabilité du dépôt. Touche le chemin E2EE — à faire avec ses témoins.
- [ ] **79 autres sites `(x as unknown).membre` dans `apps/web`**, hors socket
      (`window`, `user`, `conversation`, `constraints`…). Même transformation en
      masse, même effet : des types supprimés devenus dette comptée. Chacun
      demande une décision de domaine (le champ manque-t-il vraiment au type ?),
      donc ce n'est pas un balayage mécanique — mais c'est ~1/3 de la dette web.
- [ ] Suivi hérité (107 bis) — **la bivariance reste la limite générale.**
      `strictFunctionTypes: false` : aucune porte typée n'attrape une charge
      divergente. Décision qui dépasse Socket.IO.
- [ ] Suivi hérité — trois services de la passerelle prennent encore un `Server`
      NU pour ÉMETTRE.
- [ ] Suivi hérité (106) — la LECTURE depuis Redis reste non validée à
      l'exécution.

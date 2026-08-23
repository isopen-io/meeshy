# Cycle 108 — le garde disait « RÉGRESSION » sur un arbre intact

## 0. Ce que le cycle cherchait, et ce qu'il a trouvé à la place

Le cycle 107 bis laissait deux suivis de la même famille : le cast d'émission
côté WEB (`(socket as unknown).emit(…)`) et trois services de la passerelle qui
prennent encore un `Server` NU. Le balayage d'ouverture a d'abord CORRIGÉ le
recensement de ces suivis — puis il a buté sur autre chose, et c'est cet
autre chose qui fait le lot.

**Recensement corrigé du suivi web.** Le cycle 107 bis annonçait « trois fois
dans `VideoCallInterface.tsx` ». Mesuré : **13 sites de production**, dans
quatre fichiers.

| Fichier | Sites |
|---|---|
| `components/video-call/CallManager.tsx` | 6 |
| `components/video-calls/VideoCallInterface.tsx` | 5 |
| `hooks/conversations/use-video-call.ts` | 1 |
| `services/socketio/messaging.service.ts` | 1 |

Le suivi sous-estimait d'un facteur quatre. Il reste ouvert, corrigé (§5).

## 1. Le défaut : un gate qui rend un verdict faux, en rouge, sur un arbre que
personne n'a touché

Sur un clone frais, aux commandes que le dépôt lui-même prescrit :

```
$ bun install --ignore-scripts        # la recette « Local Test Parity » du CLAUDE.md
$ bash scripts/check-type-debt.sh
✗ RÉGRESSION : 1242 erreurs de types, baseline 1239 (+3).

Fichiers les plus touchés :
     66 __tests__/components/admin/agent/AgentConfigDialog.test.tsx
     42 __tests__/hooks/use-audio-translation.test.ts
     ...
```

Rien n'avait régressé. `main` était vert — la CI l'a prouvé au même arbre
(run 32630361948, étape « Type-check (apps/web — debt ratchet) » : succès).
Et les dix fichiers nommés comme « les plus touchés » n'avaient AUCUN rapport
avec les trois erreurs en cause.

Le chiffre bougeait avec l'ENVIRONNEMENT, ce que l'en-tête du garde jure
explicitement qu'il ne fait pas.

## 2. La mesure, et le tiers exact

Compté sur le MÊME arbre, une seule variable changée :

| `packages/shared/dist` | compte | verdict du garde |
|---|---|---|
| absent (clone frais) | **1242** | ✗ RÉGRESSION +3 |
| présent (`bun run build`) | **1239** | ✓ la dette n'a pas bougé |

Le diff des deux listes ne contient QUE ceci — les trois seules erreurs de la
différence :

```
__tests__/lentille/shared-law-dist-parity.test.ts(65,28): error TS2307:
  Cannot find module '../../../../packages/shared/dist/utils/focus-curve.js'
__tests__/lentille/shared-law-dist-parity.test.ts(66,35): … scroll-activity.js
__tests__/lentille/shared-law-dist-parity.test.ts(67,35): … river-lanes.js
```

(Cinq autres lignes diffèrent entre les deux listes, mais ce sont les MÊMES
erreurs : TypeScript rend l'ordre des membres d'union différemment d'une passe
à l'autre — `"medium" | "low" | "high"` contre `"low" | "high" | "medium"`.
Elles s'annulent au compte. Un diff textuel montre huit lignes ; le delta réel
est trois.)

## 3. La cause : une affirmation vraie du mécanisme, aveugle au fichier bâti
pour le contourner

L'en-tête du garde énumère trois sources de dérive « vérifiées et absentes ».
La troisième :

> `@meeshy/shared` is resolved by web's `paths` to the shared package's SOURCE,
> not to its `dist/`, so whether shared was built does not matter.

La première moitié est VRAIE. C'est précisément pourquoi la seconde est fausse :
`apps/web/__tests__/lentille/shared-law-dist-parity.test.ts` existe pour rejouer
les lois gelées **à travers la frontière `dist/`**, et son propre en-tête
explique longuement que le spécificateur `@meeshy/shared/...` ne peut PAS
atteindre le build. Il le contourne donc par chemin relatif :

```ts
import { focusCurve } from '../../../../packages/shared/dist/utils/focus-curve.js';
```

Trois imports. `packages/shared/dist/` est gitignoré. Le type-check de `apps/web`
dépend donc du build de `shared` — par le seul fichier construit pour échapper au
mécanisme que l'en-tête examinait.

> **Un invariant documenté peut être exact sur le mécanisme qu'il inspecte et
> faux sur le système.** La dérive n'était pas absente ; elle passait par la
> porte que le raisonnement venait lui-même de déclarer infranchissable.

C'est l'octave suivante de la leçon du cycle 107 bis (« un gate dont on silence
la sortie ne mesure plus ce qu'on croit ») : ici la sortie était lue, le code de
sortie honnête, le compteur self-testé — et le verdict faux quand même, parce que
la PRÉCONDITION de la mesure n'était ni vérifiée ni vérifiable.

## 4. Le coût réel, et pourquoi il n'est pas théorique

Ce cycle a passé sa première heure à instruire une urgence CI inexistante :
mesure de `main`, archéologie sur quatre commits, mesure de trois arbres
historiques, jusqu'à ce que la CI tranche en montrant 1239 là où le poste
montrait 1244. **Un rapport d'incident a failli partir.** Un garde qui crie au
loup sur un arbre intact coûte plus qu'il ne rapporte : il dépense la confiance
dont il a besoin les fois où il a raison.

## 5. Ce que le lot pose

- [x] `unresolved_dist_imports()` — le garde REFUSE DE MESURER tant que les
      artefacts dont le compte dépend manquent, au lieu de rendre un verdict
      faux. Il ne code en dur ni les trois chemins ni le fichier : il balaye
      `apps/web` pour les imports relatifs de `packages/shared/dist/**` et
      vérifie leur DÉCLARATION. Un import ajouté demain est couvert sans
      retouche.
- [x] Message actionnable à la place du faux verdict — il nomme les modules
      réellement non résolus et la commande qui y remédie, là où l'ancien
      nommait dix fichiers innocents.
- [x] C'est la DÉCLARATION `.d.ts` qui est consultée, pas le `.js` : c'est elle
      que TypeScript résout, donc elle seule qui décide du compte. Un build
      partiel (émission JS sans déclarations) reste détecté.
- [x] En-tête corrigé : la troisième puce ne prétend plus l'inverse de ce qui
      est mesurable. Elle dit ce qui est vrai (le spécificateur), ce qui le
      contourne (le fichier de parité, et pourquoi), et où la dérive est
      désormais gardée.
- [x] Trois cas de self-test neufs (4, 5, 6) — la doctrine du fichier est qu'un
      garde qui peut devenir silencieusement aveugle est pire que pas de garde ;
      le garde neuf s'y plie comme le compteur.
- [x] **RED prouvé sur 4 mutations**, chacune tombant sur le cas écrit pour
      elle : garde aveugle → cas 4 et 6 tombent ; garde qui signale tout →
      cas 5 tombe ; garde qui consulte le `.js` au lieu du `.d.ts` → cas 6
      tombe (c'est le cas ajouté exactement pour cette distinction).
- [x] RED prouvé sur l'ARBRE RÉEL : `dist/` mis de côté, le garde rend
      « MESURE IMPOSSIBLE » et nomme les trois modules, au lieu de
      « RÉGRESSION +3 ».
- [x] Gates : self-test 6/6, cliquet ✓ 1239 inchangé, `bash -n` propre. Codes de
      sortie lus DIRECTEMENT, jamais à travers un pipe (leçon du cycle 107 bis
      appliquée — un premier `| head` de ce cycle a rendu 141, SIGPIPE).

## 6. Suivis

- [ ] **Corrigé et toujours ouvert — le cast d'émission côté WEB : 13 sites,
      pas 3** (tableau §0). Le contrat `TypedSocket = Socket<ServerToClientEvents,
      ClientToServerEvents>` existe (`apps/web/services/socketio/types.ts`) et
      chaque site le retire à l'appel. Ces casts ne sont pas seulement muets :
      `(socket as unknown).emit(…)` est lui-même une ERREUR de type (TS2571,
      « Object is of type 'unknown' »), comptée dans les 1239 et tolérée par le
      cliquet. Les fermer FAIT DESCENDRE la dette — le cliquet le capturera.
- [ ] **Neuf, à instruire — `call:end` déclare un ack REQUIS que le web n'envoie
      jamais.** `ClientToServerEvents` :
      `(data: { callId; reason? }, ack: (r: { success: boolean }) => void) => void`.
      Les trois émetteurs web (`CallManager.tsx` ×2, `use-video-call.ts`) passent
      la charge SEULE. Le cast les soustrait à la vérification, donc rien ne l'a
      jamais dit. Reste à trancher CONTRE la passerelle laquelle des deux moitiés
      ment — comme le cycle 107 bis l'a fait pour `call:toggle-*`, où la mesure a
      conclu au retrait de l'ack du contrat.
- [ ] **Neuf — `CallJoinAck` transcrit en ligne, deux fois, dans le MÊME
      fichier.** `CallManager.tsx:810` déclare
      `{ success?; data?: { iceServers? } }` et `:1005`
      `{ success?; error?: { code?; message?; endReason? } }` — deux vues
      partielles et divergentes d'un type qui EXISTE
      (`packages/shared/types/video-call.ts`), et dont les deux transcriptions
      rendent `success` optionnel là où le contrat le déclare requis. Même
      famille que `call:analytics` au cycle 107 bis.
- [ ] Hérité — la bivariance (`strictFunctionTypes: false`) reste la limite de
      toute porte typée du dépôt.
- [ ] Hérité — trois services (`CallCleanupService`,
      `StoryTextObjectTranslationService`, `NotificationService`) prennent un
      `Server` NU pour émettre.
- [ ] Hérité — lecture Redis non validée à l'exécution ; `_seq` déclaré sur le
      seul `NotificationEventData` ; `ReactionUpdateEvent`/`…EventData` en
      doublon ; signature d'index de `ConversationUpdatedEventData`.

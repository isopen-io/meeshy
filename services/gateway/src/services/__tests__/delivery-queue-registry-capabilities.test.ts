/**
 * Les capacités du registre de la file, tenues AU COMPILATEUR.
 *
 * ## Pourquoi ce fichier naît avec #18616, et pourquoi c'est le sujet du lot
 *
 * `delivery-queue-registry.ts` affirme depuis sa création que l'instance de
 * production porte `enqueue` « par PREUVE DU COMPILATEUR, non par confiance :
 * `delivery-queue-registry-capabilities.test.ts` affirme
 * `RedisDeliveryQueue extends QueuedPersonalMarkEnqueuer`, de sorte qu'un
 * renommage de `enqueue` ne compile plus ».
 *
 * **Ce fichier n'existait pas.** Mesuré pendant l'audit adversarial de #18616 :
 * la seule occurrence de son nom dans le dépôt était le doc-comment qui le
 * citait. Et `SharedDeliveryQueue` déclare `enqueue` sous un `Partial`, donc
 * `setSharedDeliveryQueue(this.deliveryQueue)` ne constituait pas cette preuve
 * non plus.
 *
 * C'est exactement la classe de défaut que #18616 existe pour fermer — une
 * AFFIRMATION posée à l'endroit où l'on irait vérifier — trouvée dans le
 * fichier que #18616 réécrit, et que le lot avait d'abord enrichi de deux
 * doc-comments sans la voir. La réponse n'est pas de retirer la phrase : c'est
 * de la rendre vraie.
 *
 * ## Pourquoi des assertions de TYPE et non des témoins d'exécution
 *
 * Un témoin qui appelle `queue.enqueue(...)` passe au vert tant que la méthode
 * existe sous N'IMPORTE QUEL nom qu'on lui donne au site d'appel. Ce qu'on
 * garde ici est le CONTRAT : que la classe de production reste assignable aux
 * projections que le registre publie.
 *
 * **Le gate qui les tient rouges est le A — `tsc -p tsconfig.test.json` — et
 * lui seul.** La première rédaction de ce commentaire créditait aussi `ts-jest`
 * de ne pas museler `TS2344` ; c'est vrai de sa liste d'amnistie et sans objet
 * depuis #10203, qui lui a retiré le typecheck (il transpile en modules
 * isolés, sans types). Mesuré sur ce fichier : sous la mutation qui narrower
 * `enqueue` à deux paramètres, `npx jest` reste **VERT** et le gate A rend
 * `TS2344` à la ligne de l'assertion d'arité, portant son compte de 76 à 77.
 *
 * L'erreur valait d'être laissée écrite : le lot qui porte ce fichier existe
 * pour fermer une AFFIRMATION posée à l'endroit où l'on irait vérifier, et sa
 * première rédaction en a écrit une de plus, deux paragraphes sous le récit de
 * la précédente.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { RedisDeliveryQueue } from '../RedisDeliveryQueue';
import type {
  QueuedEntryEnqueuer,
  QueuedMessagePurger,
  QueuedPersonalMarkEnqueuer,
  SharedDeliveryQueue,
} from '../delivery-queue-registry';

type Assert<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;

/**
 * Les trois projections que le registre publie, et la classe qui les remplit
 * toutes. Un renommage de `purgeMessage` ou d'`enqueue` casse ici.
 */
type _PurgerSatisfied = Assert<Extends<RedisDeliveryQueue, QueuedMessagePurger>>;
type _PersonalMarkSatisfied = Assert<Extends<RedisDeliveryQueue, QueuedPersonalMarkEnqueuer>>;
type _OfflineEnqueuerSatisfied = Assert<Extends<RedisDeliveryQueue, QueuedEntryEnqueuer>>;
type _RegistrableAsIs = Assert<Extends<RedisDeliveryQueue, SharedDeliveryQueue>>;

/**
 * **Le troisième paramètre, gardé par son ARITÉ** — et c'est la seule forme de
 * garde que cette propriété admette.
 *
 * `{ sealAtRest }` décide si l'entrée est SCELLÉE avant d'atteindre Redis. Une
 * projection qui l'omet reste **assignable** à celle qui le déclare : les
 * paramètres sont bivariants, une fonction à deux paramètres satisfait un type
 * à trois. Mesuré pendant le lot, narrower `QueuedEntryEnqueuer.enqueue` à deux
 * paramètres laisse `tsc --noEmit` à `EXIT=0` et ne fait tomber aucun des
 * 41 000 témoins du service : la mutation était INVISIBLE, et le journal du
 * cycle l'a d'abord publiée comme « une garde qu'aucun témoin ne peut tenir ».
 *
 * Elle se tient — en interrogeant l'arité plutôt que l'assignabilité, et c'est
 * le gate A qui la tient (voir le préambule : `npx jest` est vert sous cette
 * mutation).
 *
 * **Le SENS de l'interrogation compte, et sa première rédaction était fausse.**
 * `Parameters<…>['length']` d'une fonction à paramètre OPTIONNEL vaut `2 | 3`,
 * jamais `3` : `Extends<Parameters<…>['length'], 3>` se résout donc en
 * `boolean` et l'assertion était **ROUGE DANS LES DEUX ÉTATS**. Elle avait
 * l'air d'une garde parce que la mutation la faisait passer de `boolean` à
 * `false` — deux `TS2344` différents, pour quelqu'un qui ne lisait que le fait
 * qu'elle tombe. Le sens juste est l'autre : **3 est-il une arité POSSIBLE ?**
 * (`3 extends 2 | 3` ⇒ vrai ; `3 extends 2` ⇒ faux.)
 *
 * > **Prouver le ROUGE ne suffit pas : il faut prouver le VERT du même
 * > témoin.** Une assertion cassée tombe sous toutes les mutations, y compris
 * > celles qu'elle ne garde pas — et c'est indiscernable d'une garde qui marche
 * > tant qu'on ne mesure que l'état muté.
 *
 * Ce que ça garde n'est pas un comportement de production (l'objet résolu est la vraie
 * `RedisDeliveryQueue`, qui honore l'option quoi qu'en dise sa projection) :
 * c'est un DOUBLE futur, déclaré sous la projection et sourd au scellement.
 */
type _EnqueueDeclaresTheOption = Assert<Extends<3, Parameters<QueuedEntryEnqueuer['enqueue']>['length']>>;

describe('registre de la file — les capacités publiées sont celles de la classe', () => {
  /**
   * Les assertions ci-dessus n'ont aucune ligne exécutable : un cliquet de type
   * doit être ATTEIGNABLE par le compilateur, et c'est le chargement de cette
   * suite qui l'y amène. Ce témoin existe pour que la suite CHARGE le fichier —
   * et il vérifie la seule moitié qu'un type ne peut pas voir : que les méthodes
   * sont bien sur le PROTOTYPE, donc présentes sur une instance réelle.
   */
  it('une instance de production porte les deux méthodes que le registre publie', () => {
    const queue = new RedisDeliveryQueue({ getNativeClient: () => null } as never);

    expect(typeof queue.purgeMessage).toBe('function');
    expect(typeof queue.enqueue).toBe('function');
  });

  /**
   * `getSharedPersonalMarkEnqueuer` et `getSharedOfflineEnqueuer` testent la
   * MÉTHODE et non la présence de l'objet, parce qu'un double qui ne déclare
   * que `purgeMessage` est un enregistrement parfaitement valide — c'est la
   * forme de tous ceux du dépôt. Ce témoin fige la clé qu'ils interrogent : la
   * renommer sans toucher aux accesseurs les rendrait muets, en silence.
   */
  it('la méthode que les deux accesseurs interrogent s’appelle `enqueue`', () => {
    expect(Object.getOwnPropertyNames(RedisDeliveryQueue.prototype)).toContain('enqueue');
  });
});

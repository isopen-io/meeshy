/**
 * **LES SPECTATEURS DE LA ROOM D'UN POST QU'UN BLOCAGE SÉPARE D'UN COMPAGNON**
 * (#20779, suivi de #20711).
 *
 * #20711 sert à chaque lecteur séparé d'un COMPAGNON du post (`repostOf`,
 * l'aperçu des commentaires) une charge amputée de ce seul compagnon. Il le
 * fait en excluant ces lecteurs de la charge commune — par `except` sur leur
 * room `user:`, qui porte sur TOUTES les adresses de l'émission,
 * `ROOMS.post(postId)` comprise — puis en servant à chacun la sienne.
 *
 * **Cette seconde moitié n'itère que `recipients`**, seule liste énumérable.
 * Un spectateur présent dans la room du post SANS être dans l'audience sortait
 * donc de la charge commune sans en recevoir aucune autre : zéro livraison.
 * La room du post est la seule adresse d'une diffusion de contenu qui ne
 * s'énumère pas autrement — d'où ce module, et d'où son coût.
 *
 * ─── LE COÛT, MESURÉ (critère de fin de #20779) ──────────────────────────
 *
 * Banc : `socket.io` 4.8.4 + `@socket.io/redis-adapter` 8.3.0 (les versions du
 * dépôt), 200 appels par ligne, commandes Redis comptées sur le client `pub`.
 *
 * | adaptateur | latence moyenne | commandes Redis / appel |
 * |---|---|---|
 * | mémoire (défaut) | 2–6 µs | 0 |
 * | Redis, **1 nœud** | 63–71 µs | **1** (`PUBSUB NUMSUB`) |
 * | Redis, **2 nœuds** | 313–477 µs | 1 + publish + attente des réponses |
 *
 * La production attache l'adaptateur Redis (`docker-compose.prod.yml` pose
 * `REDIS_URL`) avec UNE réplique : `fetchSockets()` y fait sa lecture locale,
 * un `serverCount()`, voit `numSub <= 1` et s'arrête — un aller-retour Redis,
 * indépendant du nombre de sockets de la room. C'est ce chiffre qui a permis de
 * retenir la forme EXACTE plutôt que d'amputer la room du post de TOUS ses
 * compagnons : ~70 µs sur un chemin d'édition qui paie déjà deux lectures Mongo
 * (`pairsAround`) dans la même branche.
 *
 * **Au-delà d'un nœud, le coût change de nature** : l'adaptateur publie une
 * requête, attend les `numSub - 1` réponses — chacune portant le `handshake`
 * complet de chaque socket de la room — et **REJETTE** après `requestsTimeout`
 * (5 000 ms par défaut, non configuré). Le lot qui ajoutera une seconde
 * passerelle (#9232, cf. #20780) doit relire ce paragraphe : la garde ci-dessous
 * tient le rejet, elle ne tient pas la latence.
 *
 * ─── CE QUE CE MODULE REFUSE DE FAIRE, ET POURQUOI ───────────────────────
 *
 * Il ne rend JAMAIS un lecteur que l'axe de l'AUTEUR sépare (#20430). Lui
 * servir sa charge amputée des compagnons lui livrerait le POST, que le blocage
 * de l'auteur lui refuse : la forme exacte ouvrirait une fuite plus grave que
 * celle qu'elle répare. `closedRooms` porte cette soustraction, et elle est la
 * raison d'être du paramètre — pas un raffinement.
 *
 * Il ne rend JAMAIS un lecteur DÉJÀ servi (l'audience, l'auteur). Tout
 * utilisateur connecté se tient dans sa propre `ROOMS.feed(soi)`
 * (`feed:subscribe`), donc la boucle de #20711 l'a déjà atteint ; le servir une
 * seconde fois à sa socket livrerait DEUX `post:updated` pour une édition, la
 * forme exacte du défaut que `emitToUserFeedAndPostRoom` existe pour empêcher.
 */
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'SeparatedCompanionSpectators' });

/**
 * Le préfixe se DÉRIVE de `ROOMS.user`, il ne se recopie pas : une room
 * personnelle d'invité porte un `Participant.id` et non un `User.id`, et le
 * jour où le format change, un préfixe littéral mentirait en silence.
 */
const PREFIXE_ROOM_PERSONNELLE = ROOMS.user('');

/** Un socket de la room du post, tel que `fetchSockets()` le rend. */
export type PostRoomSocket = {
  readonly id: string;
  readonly rooms: ReadonlySet<string>;
};

/**
 * La surface d'`io` que ce module exige, et rien de plus. Le `MeeshyIOServer`
 * de production la satisfait structurellement — c'est `tsc` au site d'appel qui
 * le prouve, jamais un cast.
 */
export type PostRoomSpectatorsIO = {
  in(room: string): { fetchSockets(): Promise<readonly PostRoomSocket[]> };
};

/** Une socket à servir, et le lecteur dont elle porte la séparation. */
export type SeparatedSpectator = {
  readonly socketId: string;
  readonly readerId: string;
};

export type SeparatedCompanionSpectatorsInput = {
  readonly io: PostRoomSpectatorsIO;
  /** `ROOMS.post(postId)` — l'adresse non énumérable. */
  readonly postRoom: string;
  /** Les lecteurs qu'un blocage sépare d'un compagnon (`companions.keys()`). */
  readonly separatedFromCompanion: ReadonlySet<string>;
  /**
   * Ceux que la boucle par lecteur a déjà servis : l'audience et l'auteur.
   *
   * Des LISTES, pas des `Set`, et c'est délibéré : les deux ensembles ne se
   * construisent qu'APRÈS le court-circuit du cas nominal, donc une diffusion
   * sans aucun lecteur séparé ne paie pas O(audience) d'allocation. Le
   * court-circuit n'a qu'UN propriétaire (ce module), ce qui est la raison de ce
   * choix de forme — voir la note de `separatedCompanionSpectators`.
   */
  readonly alreadyServed: readonly string[];
  /** Les rooms `user:` que l'axe de l'AUTEUR exclut : elles ne reçoivent RIEN. */
  readonly closedRooms: readonly string[];
};

/**
 * Rend les sockets de la room du post à servir À PART, une entrée par socket —
 * un lecteur à deux appareils dans la room reçoit sa charge sur les deux, et
 * seulement sur ceux qui regardent.
 *
 * Rend `[]` sans rien énumérer quand personne n'est séparé d'un compagnon : le
 * cas nominal ne paie pas l'aller-retour. Rend `[]` aussi quand l'énumération
 * ÉCHOUE — le repli est l'état d'avant ce lot (le spectateur hors audience ne
 * reçoit rien), donc une perte de direct, jamais une fuite.
 *
 * **Ce court-circuit n'a qu'UN propriétaire, et c'est une correction mesurée.**
 * Il a d'abord été écrit DEUX fois — ici, et dans la condition d'appel de
 * `emitPostToAudience`. Mutée, la seconde couche laissait **131 témoins verts** :
 * deux couches mutuellement redondantes dont aucune n'était tenue, exactement la
 * forme que l'audit adversarial de #20711 a relevée (« une défense en profondeur
 * dont aucune couche n'est tenue perd une couche en silence »). La redondance est
 * retirée plutôt que doublée d'un témoin : le site d'appel ne décide plus que de
 * ce que lui seul sait — la room du post est-elle adressée ? — et ce module
 * décide seul s'il y a quelque chose à énumérer.
 */
export async function separatedCompanionSpectators(
  input: SeparatedCompanionSpectatorsInput,
): Promise<readonly SeparatedSpectator[]> {
  if (input.separatedFromCompanion.size === 0) return [];

  let sockets: readonly PostRoomSocket[];
  try {
    sockets = await input.io.in(input.postRoom).fetchSockets();
  } catch (err) {
    logger.warn('Énumération de la room du post impossible — aucun spectateur séparé servi', {
      postRoom: input.postRoom,
      err,
    });
    return [];
  }

  const dejaServis = new Set(input.alreadyServed);
  const fermees = new Set(input.closedRooms);
  const aServir: SeparatedSpectator[] = [];
  for (const socket of sockets) {
    for (const room of socket.rooms) {
      if (!room.startsWith(PREFIXE_ROOM_PERSONNELLE)) continue;
      if (fermees.has(room)) continue;
      const readerId = room.slice(PREFIXE_ROOM_PERSONNELLE.length);
      if (!input.separatedFromCompanion.has(readerId)) continue;
      if (dejaServis.has(readerId)) continue;
      aServir.push({ socketId: socket.id, readerId });
    }
  }
  return aServir;
}

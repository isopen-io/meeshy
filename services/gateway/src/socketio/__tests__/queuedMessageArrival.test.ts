import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { announcesMessageArrival } from '../queuedMessageArrival';

type QueuedEventType = NonNullable<QueuedMessagePayload['eventType']>;

/**
 * La table est un `Record` COMPLET sur l'union : ajouter une famille à
 * `QueuedMessagePayload['eventType']` sans lui donner sa réponse ici ne compile
 * pas. C'est la seule forme de garde qui tienne — un simple compte d'entrées se
 * met à jour tout seul sous les doigts de celui qui ajoute la famille, et c'est
 * précisément par ce silence que `link-message` s'est retrouvée classée en
 * mutation alors qu'elle est une création.
 */
const EXPECTED: Record<QueuedEventType, boolean> = {
  new: true,
  'link-message': true,

  edited: false,
  deleted: false,
  // Un message auto-détruit ANNONCE SA DISPARITION, il n'annonce aucune
  // arrivée : même famille que `deleted`, dont il ne diffère que par la cause
  // (l'horloge plutôt qu'un geste). Le drain ne doit pas bumper d'accusé de
  // réception pour un message que le destinataire ne verra jamais.
  expired: false,
  'reaction-added': false,
  'reaction-removed': false,
  'attachment-reaction-added': false,
  'attachment-reaction-removed': false,
  pinned: false,
  unpinned: false,
  'attachment-updated': false,
  translation: false,
  // Les trois MARQUES PERSONNELLES du lecteur (#16688) : elles décrivent l'état
  // d'un message DÉJÀ arrivé — étoilé, masqué « pour moi », rendu — pour les
  // autres APPAREILS du même compte. Accuser réception d'une étoile
  // affirmerait une remise qui n'a pas eu lieu : le message, lui, était arrivé
  // depuis longtemps, et c'est son AUTEUR que l'accusé informerait.
  //
  // C'est ce `Record` qui a exigé le verdict : le lot qui a ajouté les trois
  // familles à l'union ne compilait plus tant qu'elles n'avaient pas été
  // tranchées ici — exactement la garde que ce fichier décrit, et la raison
  // pour laquelle `link-message` ne pourrait plus se glisser en silence.
  starred: false,
  'hidden-for-me': false,
  'restored-for-me': false,
};

describe('announcesMessageArrival', () => {
  it.each(Object.entries(EXPECTED))('classifies %s as arrival=%s', (eventType, expected) => {
    expect(announcesMessageArrival(eventType as QueuedEventType)).toBe(expected);
  });

  /**
   * Les entrées écrites avant l'existence du champ sont des `message:new` : le
   * drain le suppose partout ailleurs (`_drainedEventName` rend MESSAGE_NEW par
   * défaut), et l'accusé doit dire la même chose.
   */
  it('treats a legacy entry with no eventType as an arrival', () => {
    expect(announcesMessageArrival(undefined)).toBe(true);
  });

  /**
   * Une arrivée au moins, une mutation au moins : sans ça, une implémentation
   * constante (`() => true`) passerait la table ci-dessus le jour où l'union se
   * réduirait à une seule famille.
   */
  it('separates the two families rather than answering the same thing to all', () => {
    const answers = Object.values(EXPECTED);
    expect(answers).toContain(true);
    expect(answers).toContain(false);
  });
});

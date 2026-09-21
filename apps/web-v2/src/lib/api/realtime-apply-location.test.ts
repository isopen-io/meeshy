import { describe, expect, test } from 'bun:test';

import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';

import { placeOf, storyCitationOf } from '@/lib/view/message-body';
import { rawMessageFromSocket } from './realtime-apply';

/**
 * **LE LIEU REÇU EN DIRECT ATTEINT LA BULLE (#7328).**
 *
 * `placeOf` (`lib/view/message-body.ts`) lit la RACINE d'abord, `metadata` en
 * repli — et son doc-comment dit pourquoi : la charge `message:new` NE PORTE
 * PAS `metadata` (`messageNewPayload.ts`, lu ligne à ligne), seulement les
 * champs HISSÉS par la passerelle (`MessageHandler.ts:1354` pour l'envoi
 * socket, `MeeshySocketIOManager.ts:3010-3019` pour l'envoi REST).
 *
 * Cette loi était juste et INATTEIGNABLE : `rawMessageFromSocket` ÉNUMÈRE les
 * clés qu'elle recopie, et `location` n'y figurait pas. Le champ était servi,
 * déclaré (`SocketIOMessage.location`), lu par une loi qui l'attendait — et
 * jeté par le décodeur, une couche AVANT. « Qui AFFICHE ce qu'on élit » a une
 * jumelle : **qui ALIMENTE ce qu'on affiche** (CLAUDE.md racine, § Prisme,
 * cycle 122).
 *
 * Conséquence pour l'EXPÉDITEUR, et c'est elle qui rendait le défaut muet :
 * l'écho socket de son propre envoi est ce qui PROMEUT la rangée optimiste
 * (`applyMessageNew`, D-11/D-28). Un écho amputé du lieu ne pouvait donc pas
 * réparer ce que la bulle optimiste n'avait pas.
 *
 * `sticker` et `postReplyTo` sont dans le MÊME sac (`HoistedFields` les nomme
 * tous les trois) et tombaient par la MÊME énumération — on ne corrige pas un
 * tiers d'une famille en laissant les deux autres sous la même ligne.
 */
const socketMessage = (partial: Partial<SocketIOMessage>): SocketIOMessage => ({
  id: 'm-remote-1',
  conversationId: 'c-a',
  senderId: 'u-other',
  content: 'je suis là',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: '2026-09-21T09:05:00.000Z' as unknown as Date,
  ...partial,
});

const PLACE_ÉCLAIRÉE = {
  latitude: 48.8584,
  longitude: 2.2945,
  name: 'Tour Eiffel',
  address: 'Champ de Mars, Paris',
  category: 'landmark',
} as const;

describe('rawMessageFromSocket — les champs HISSÉS survivent au décodage (#7328)', () => {
  test('un lieu reçu d’un autre client atteint `placeOf`', () => {
    const décodé = rawMessageFromSocket(socketMessage({ location: PLACE_ÉCLAIRÉE }));
    expect(placeOf(décodé)).toEqual({
      latitude: 48.8584,
      longitude: 2.2945,
      name: 'Tour Eiffel',
      address: 'Champ de Mars, Paris',
    });
  });

  /** LE LIEU SANS NOM — le cas NOMINAL du web aujourd'hui : aucun géocodeur
   * inverse, la tuile n'envoie que des coordonnées. La carte doit exister
   * quand même, sinon le cas le plus fréquent est le seul non rendu. */
  test('un lieu SANS nom ni adresse reste un lieu', () => {
    const décodé = rawMessageFromSocket(socketMessage({ location: { latitude: -33.8688, longitude: 151.2093 } }));
    expect(placeOf(décodé)).toEqual({ latitude: -33.8688, longitude: 151.2093, name: null, address: null });
  });

  /** L'ÉCHO DE SON PROPRE ENVOI — le `clientMessageId` fait de cette charge la
   * PROMOTION de la rangée optimiste, pas une rangée de plus. */
  test('l’écho d’un envoi propre porte son lieu ET son clientMessageId', () => {
    const décodé = rawMessageFromSocket(
      socketMessage({ senderId: 'u-viewer', clientMessageId: 'cmid-7', location: PLACE_ÉCLAIRÉE }),
    );
    expect(décodé.clientMessageId).toBe('cmid-7');
    expect(placeOf(décodé)?.name).toBe('Tour Eiffel');
  });

  test('une charge SANS lieu ne pose aucune clé', () => {
    expect(placeOf(rawMessageFromSocket(socketMessage({})))).toBeNull();
    expect(Object.hasOwn(rawMessageFromSocket(socketMessage({})), 'location')).toBe(false);
  });

  /** LES DEUX AUTRES DU MÊME SAC — `HoistedFields` en nomme trois, l'énumération
   * les jetait tous les trois. */
  test('le sticker hissé survit', () => {
    const décodé = rawMessageFromSocket(socketMessage({ sticker: { emoji: '🎈' } as never }));
    expect((décodé as { readonly sticker?: unknown }).sticker).toEqual({ emoji: '🎈' });
  });

  test('la citation de story hissée survit', () => {
    const décodé = rawMessageFromSocket(
      socketMessage({
        storyReplyToId: 'p-1',
        postReplyTo: { id: 'p-1', content: 'la scène', createdAt: '2026-09-21T08:00:00.000Z' },
      } as Partial<SocketIOMessage>),
    );
    expect(storyCitationOf(décodé)?.id).toBe('p-1');
  });
});

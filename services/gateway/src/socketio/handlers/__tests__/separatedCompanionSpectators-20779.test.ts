/**
 * Les témoins du module `separatedCompanionSpectators` (#20779), pris SEUL.
 *
 * Pourquoi un fichier à part, quand les témoins d'intégration
 * (`post-spectateur-compagnon-20779.test.ts`) exercent déjà ce module par
 * `broadcastPostUpdated` ? **Parce qu'une des décisions de ce module est
 * INOBSERVABLE depuis l'intégration** : « ne RIEN énumérer quand personne n'est
 * séparé d'un compagnon » ne se distingue de « énumérer et ne rien trouver »
 * que si l'on regarde l'appel lui-même. Elle a d'abord été écrite deux fois —
 * ici et dans la condition d'appel — et mutée, la couche d'en haut laissait
 * **131 témoins verts**, chacune couvrant l'autre.
 *
 * La redondance a été retirée ; ces témoins sont ce qui tient la couche
 * restante. C'est le seul endroit du dépôt où le COÛT de ce lot est gardé — un
 * aller-retour Redis mesuré à ~70 µs (cf. le doc-comment du module).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { separatedCompanionSpectators, type PostRoomSocket } from '../separatedCompanionSpectators';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const ROOM = 'post:507f191e810c19729de20779';

const socket = (id: string, userId: string, extra: readonly string[] = []): PostRoomSocket => ({
  id,
  rooms: new Set([id, `user:${userId}`, `feed:${userId}`, ROOM, ...extra]),
});

function io(sockets: readonly PostRoomSocket[], options: { panne?: boolean } = {}) {
  const fetchSockets = jest.fn(async () => {
    if (options.panne) throw new Error('timeout reached while waiting for fetchSockets response');
    return sockets;
  });
  /**
   * Le double DÉCLARE le paramètre que la production lui passe. Sans lui,
   * `toHaveBeenCalledWith(ROOM)` ne compile pas (`TS2554`) — et c'est le gate
   * de types du corpus de test (`tsc -p tsconfig.test.json`) qui l'a dit, parce
   * que `ts-jest` transpile sans types depuis #10203 : un double dont la
   * signature ment passe donc l'exécution, et ne rougit qu'au cliquet.
   */
  const dans = jest.fn((_room: string) => ({ fetchSockets }));
  return { io: { in: dans }, fetchSockets, dans };
}

/** L'auteur par défaut n'est AUCUN des lecteurs des témoins : il ne soustrait
 *  donc rien tant qu'un témoin ne le nomme pas. */
const AUTEUR_HORS_JEU = 'auteur-hors-jeu';

const appel = (
  surface: ReturnType<typeof io>,
  separes: readonly string[],
  dejaServis: readonly string[] = [],
  fermees: readonly string[] = [],
  auteur: string = AUTEUR_HORS_JEU,
) =>
  separatedCompanionSpectators({
    io: surface.io,
    postRoom: ROOM,
    separatedFromCompanion: new Set(separes),
    audience: dejaServis,
    authorId: auteur,
    closedRooms: fermees,
  });

describe('#20779 — l’énumération de la room du post', () => {
  it('n’ÉNUMÈRE RIEN quand personne n’est séparé d’un compagnon', async () => {
    const surface = io([socket('s1', 'u1')]);
    expect(await appel(surface, [])).toEqual([]);
    expect(surface.fetchSockets).not.toHaveBeenCalled();
    expect(surface.dans).not.toHaveBeenCalled();
  });

  it('énumère la room du POST, et elle seule', async () => {
    const surface = io([socket('s1', 'u1')]);
    await appel(surface, ['u1']);
    expect(surface.dans).toHaveBeenCalledWith(ROOM);
    expect(surface.fetchSockets).toHaveBeenCalledTimes(1);
  });

  it('rend la socket d’un lecteur séparé', async () => {
    const surface = io([socket('s1', 'u1')]);
    expect(await appel(surface, ['u1'])).toEqual([{ socketId: 's1', readerId: 'u1' }]);
  });

  it('ne rend PAS un socket dont le lecteur n’est séparé de personne', async () => {
    const surface = io([socket('s1', 'u1'), socket('s2', 'u2')]);
    expect(await appel(surface, ['u1'])).toEqual([{ socketId: 's1', readerId: 'u1' }]);
  });

  it('ne rend PAS un lecteur DÉJÀ servi par la boucle de l’audience', async () => {
    const surface = io([socket('s1', 'u1')]);
    expect(await appel(surface, ['u1'], ['u1'])).toEqual([]);
  });

  it('ne rend PAS l’AUTEUR, dont l’écho part toujours sur sa feed room', async () => {
    const surface = io([socket('s1', 'u1')]);
    expect(await appel(surface, ['u1'], [], [], 'u1')).toEqual([]);
  });

  it('ne rend PAS un lecteur dont l’axe de l’AUTEUR ferme la room', async () => {
    const surface = io([socket('s1', 'u1')]);
    expect(await appel(surface, ['u1'], [], ['user:u1'])).toEqual([]);
  });

  it('rend les DEUX appareils d’un même lecteur présents dans la room', async () => {
    const surface = io([socket('s1', 'u1'), socket('s2', 'u1')]);
    expect(await appel(surface, ['u1'])).toEqual([
      { socketId: 's1', readerId: 'u1' },
      { socketId: 's2', readerId: 'u1' },
    ]);
  });

  it('ignore les rooms qui ne sont pas des rooms personnelles', async () => {
    const surface = io([{ id: 's1', rooms: new Set(['s1', ROOM, 'conversation:c1', 'feed:u1']) }]);
    expect(await appel(surface, ['u1', 'c1', 's1'])).toEqual([]);
  });

  it('une énumération qui ÉCHOUE rend `[]` — jamais un rejet, jamais une fuite', async () => {
    const surface = io([socket('s1', 'u1')], { panne: true });
    await expect(appel(surface, ['u1'])).resolves.toEqual([]);
  });
});

/**
 * #17086 — l'émission par LANGUE, site unique, et son enrobage PAR GROUPE.
 *
 * Elle vivait deux fois : `MessageHandler._emitMessageNewByLanguage` (transport
 * socket) et `MeeshySocketIOManager._emitMessageNewByLanguage` (REST/ZMQ), les
 * deux portant la même doctrine multi-nœud, écrite deux fois et déjà divergente
 * — la seconde ignorait `excludeSocketId` et prenait `Record<string, any>`.
 *
 * Les DEUX portaient aussi le même défaut de granularité : la diffusion
 * inter-nœuds et les émissions par groupe de langue sont indépendantes, et une
 * seule exception les perdait toutes. Un double qui lève par ROOM le montre ;
 * un double qui lève partout ne prouverait que la survie à un harnais mort.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

import { emitMessageNewByLanguage, type MessageNewByLanguageIO } from '../messageNewByLanguage';

const ROOM = 'conversation:c1';

type Served = { rooms: string[]; except: string[]; payload: { translations?: Array<{ targetLanguage: string }> } };

function ioWith(localSockets: readonly string[], throwOn: readonly string[] = []) {
  const served: Served[] = [];
  const operator = (rooms: string[], except: string[] = []): ReturnType<MessageNewByLanguageIO['to']> => ({
    to: (room: string) => operator([...rooms, room], except),
    except: (r) => operator(rooms, [...except, ...(Array.isArray(r) ? r : [r])]),
    emit: (_event, payload) => {
      const hit = rooms.find((r) => throwOn.includes(r));
      if (hit) throw new TypeError(`encodeur en défaut sur ${hit}`);
      served.push({ rooms, except, payload: payload as never });
      return undefined;
    },
  });
  return {
    io: {
      to: (room: string) => operator([room]),
      sockets: { adapter: { rooms: new Map([[ROOM, new Set(localSockets)]]) } },
    } as unknown as MessageNewByLanguageIO,
    served,
  };
}

const PAYLOAD = {
  id: 'm1',
  originalLanguage: 'fr',
  translations: [
    { targetLanguage: 'en', translatedContent: 'hello' },
    { targetLanguage: 'es', translatedContent: 'hola' },
  ],
} as never;

/** s1 → un lecteur anglophone ; s2 → un hispanophone. Deux groupes distincts. */
const lookups = {
  socketToUser: (sid: string) => ({ s1: 'u1', s2: 'u2' })[sid],
  resolveLanguages: (uid: string) => ({ u1: ['en'], u2: ['es'] })[uid],
  userLanguage: (uid: string) => ({ u1: 'en', u2: 'es' })[uid],
};

const base = { room: ROOM, payload: PAYLOAD, exclusion: {}, ...lookups };
const langsOf = (s: Served) => (s.payload.translations ?? []).map((t) => t.targetLanguage).sort();

describe('#17086 — émission par langue : chaque groupe survit à la perte des autres', () => {
  it('la diffusion inter-nœuds qui lève laisse les DEUX groupes de langue servis', () => {
    const { io, served } = ioWith(['s1', 's2'], [ROOM]);

    emitMessageNewByLanguage({ ...base, io });

    expect(served.map((s) => s.rooms)).toEqual([['s1'], ['s2']]);
    // La charge n'a pas de traduction `fr` : le français est la langue
    // D'ORIGINE, donc le contenu lui-même. Chaque groupe garde sa seule
    // traduction utile — c'est tout le gain que l'élagage mesure.
    expect(served.map(langsOf)).toEqual([['en'], ['es']]);
  });

  it("un groupe dont l'émission lève n'emporte pas l'autre groupe", () => {
    const { io, served } = ioWith(['s1', 's2'], ['s1']);

    emitMessageNewByLanguage({ ...base, io });

    expect(served.map((s) => s.rooms)).toEqual([[ROOM], ['s2']]);
  });

  it("la panne est NOMMÉE à l'appelant, une fois par audience perdue", () => {
    const { io } = ioWith(['s1', 's2'], [ROOM, 's2']);
    const onEmissionError = jest.fn();

    emitMessageNewByLanguage({ ...base, io, onEmissionError });

    expect(onEmissionError).toHaveBeenCalledTimes(2);
  });

  it("NOMINAL : une diffusion inter-nœuds excepté les sockets LOCAUX et l'expéditeur, puis une émission élaguée par groupe", () => {
    const { io, served } = ioWith(['s1', 's2']);

    emitMessageNewByLanguage({ ...base, io, exclusion: { excludeUserId: 'u-sender' } });

    expect(served).toHaveLength(3);
    expect(served[0]).toMatchObject({ rooms: [ROOM], except: ['s1', 's2', 'user:u-sender'] });
    expect(langsOf(served[0] as Served)).toEqual(['en', 'es']);
    expect(served.slice(1).map((s) => s.rooms)).toEqual([['s1'], ['s2']]);
  });

  it("un expéditeur ANONYME est exclu par son SOCKET — ce que la jumelle REST/ZMQ ne savait pas faire", () => {
    const { io, served } = ioWith(['s1', 's2']);

    emitMessageNewByLanguage({ ...base, io, exclusion: { excludeSocketId: 's1' } });

    expect(served[0]).toMatchObject({ rooms: [ROOM], except: ['s1', 's2', 's1'] });
    expect(served.slice(1).map((s) => s.rooms)).toEqual([['s2']]);
  });

  it('une room sans socket LOCAL ne diffuse QUE vers les nœuds distants', () => {
    const { io, served } = ioWith([]);

    emitMessageNewByLanguage({ ...base, io });

    expect(served).toEqual([{ rooms: [ROOM], except: [], payload: PAYLOAD }]);
  });
});

/**
 * #17086 — le chemin de ROOM de `message:new` porte QUATRE audiences
 * indépendantes ; un enrobage unique les perd ensemble.
 *
 * La prémisse de l'issue est MESURÉE sur le paquet installé (socket.io 4.8.4),
 * et elle est vraie : `io.to(room).emit(...)` lève SYNCHRONEMENT et PAR CHARGE
 * — une charge non sérialisable (`BigInt`, cycle) lève, et l'émission SUIVANTE
 * d'une charge saine vers une autre room passe. Les quatre audiences de ce
 * chemin portent des charges DIFFÉRENTES (`senderPayload` seule porte
 * `clientMessageId`, chaque masqué a sa variante, chaque groupe de langue sa
 * copie élaguée) : l'échec par charge n'est donc pas une hypothèse de confort,
 * c'est le cas nominal d'un encodeur en défaut.
 *
 * Précision que la mesure APPORTE à l'issue, et qui corrige sa moitié
 * « adaptateur » : l'adaptateur Redis ne lève PAS d'ici. Ses commandes sont
 * tirées sans `await` et observées (`redis-adapter.ts`) — une panne Redis
 * arrive en rejet de promesse journalisé, jamais en `throw` synchrone. Le seul
 * producteur de `throw` dans `emit` est l'ENCODEUR, et il est par charge.
 *
 * Le double lève PAR ROOM, jamais sur tout : un double qui lève partout ne
 * prouverait que la survie à un harnais mort (patron
 * `message-new-producer-parity.test.ts`).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

import { emitMessageNew, type MessageNewIO, type MessageNewSenderSocket } from '../messageNewEmission';

const CONVERSATION = 'conversation:c1';
const SENDER_USER = 'u-sender';
const H1 = 'u-hidden-1';
const H2 = 'u-hidden-2';

type Served = { room: string; except: string[]; payload: { tag: string } };

/** Un double dont `emit` LÈVE pour les rooms nommées, et sert les autres. */
function ioThrowingOn(rooms: readonly string[]) {
  const served: Served[] = [];
  const operator = (room: string, except: string[] = []): ReturnType<MessageNewIO['to']> => ({
    except: (r) => operator(room, [...except, ...(Array.isArray(r) ? r : [r])]),
    emit: (_event, payload) => {
      if (rooms.includes(room)) throw new TypeError(`encodeur en défaut sur ${room}`);
      served.push({ room, except, payload: payload as never });
      return undefined;
    },
  });
  return { io: { to: (room: string) => operator(room) } as MessageNewIO, served };
}

const payloads = {
  senderPayload: { tag: 'sender' } as never,
  peerPayload: { tag: 'peer' } as never,
};

const base = {
  room: CONVERSATION,
  ...payloads,
  senderParticipantId: 'p-sender',
  payloadForKey: (key: string) => ({ tag: `hidden:${key}` }) as never,
};

describe('#17086 — chemin de room : chaque audience survit à la perte des autres', () => {
  it("la diffusion de room qui lève laisse l'expéditeur et les DEUX masqués servis", () => {
    const { io, served } = ioThrowingOn([CONVERSATION]);

    emitMessageNew({ ...base, io, senderUserId: SENDER_USER, hiddenKeys: [H1, H2] });

    expect(served.map((s) => s.room)).toEqual([`user:${SENDER_USER}`, `user:${H1}`, `user:${H2}`]);
    expect(served.map((s) => s.payload.tag)).toEqual(['sender', `hidden:${H1}`, `hidden:${H2}`]);
  });

  it("la room personnelle de l'expéditeur qui lève laisse la room de conversation et les masqués servis", () => {
    const { io, served } = ioThrowingOn([`user:${SENDER_USER}`]);

    emitMessageNew({ ...base, io, senderUserId: SENDER_USER, hiddenKeys: [H1] });

    expect(served.map((s) => s.room)).toEqual([CONVERSATION, `user:${H1}`]);
  });

  it("un masqué dont la room lève n'emporte pas l'autre masqué", () => {
    const { io, served } = ioThrowingOn([`user:${H1}`]);

    emitMessageNew({ ...base, io, senderUserId: SENDER_USER, hiddenKeys: [H1, H2] });

    expect(served.map((s) => s.room)).toEqual([CONVERSATION, `user:${SENDER_USER}`, `user:${H2}`]);
  });

  it("un `payloadForKey` qui lève pour un masqué n'emporte ni l'autre masqué ni l'expéditeur", () => {
    const { io, served } = ioThrowingOn([]);

    emitMessageNew({
      ...base,
      io,
      senderUserId: SENDER_USER,
      hiddenKeys: [H1, H2],
      payloadForKey: (key: string) => {
        if (key === H1) throw new Error('variante du masqué incalculable');
        return { tag: `hidden:${key}` } as never;
      },
    });

    expect(served.map((s) => s.room)).toEqual([CONVERSATION, `user:${SENDER_USER}`, `user:${H2}`]);
  });

  // C7 — `emitByLanguage` est une fonction INJECTÉE, et son type permet qu'elle
  // lève ; la délégation de production, elle, ne lève plus (elle enrobe par
  // groupe). Ce témoin garde donc le CONTRAT du point d'injection, pas un
  // comportement de notre implémentation — dit comme tel, parce qu'un témoin
  // dont on croit qu'il garde la production atteste en fait son harnais.
  it("un `emitByLanguage` injecté qui lève laisse l'expéditeur servi (contrat du point d'injection)", () => {
    const { io, served } = ioThrowingOn([]);
    const emitByLanguage = jest.fn((_payload: never, _exclusion: { excludeUserId?: string; excludeSocketId?: string }) => {
      throw new Error('émission par langue en défaut');
    });

    emitMessageNew({ ...base, io, senderUserId: SENDER_USER, hiddenKeys: [], emitByLanguage: emitByLanguage as never });

    expect(emitByLanguage).toHaveBeenCalledTimes(1);
    expect(served.map((s) => s.room)).toEqual([`user:${SENDER_USER}`]);
  });

  it("expéditeur ANONYME : la diffusion depuis son socket qui lève laisse sa propre bulle et les masqués servis", () => {
    const { io, served } = ioThrowingOn([]);
    const senderEmit = jest.fn(() => undefined);
    const senderSocket = {
      id: 's-anon',
      emit: senderEmit,
      broadcast: {
        to: () => ({
          except: () => ({ emit: () => { throw new TypeError('encodeur en défaut sur la diffusion'); } }),
          emit: () => { throw new TypeError('encodeur en défaut sur la diffusion'); },
        }),
      },
    } as unknown as MessageNewSenderSocket;

    emitMessageNew({ ...base, io, senderUserId: null, senderSocket, hiddenKeys: [H1] });

    expect(senderEmit).toHaveBeenCalledTimes(1);
    expect(served.map((s) => s.room)).toEqual([`user:${H1}`]);
  });

  // Ces deux témoins assertent l'ARGUMENT, jamais le nombre d'appels. C'est le
  // constat C5 de l'audit, et il était juste : leur première version disait
  // « NOMMÉE … avec sa room » dans son TITRE et ne vérifiait que
  // `toHaveBeenCalledTimes(2)`. Mesuré par mutation : remplacer les ONZE
  // étiquettes du lot par la constante `'MUTANT'` laissait 46/46 témoins verts.
  // Un titre n'est pas une assertion.
  it("la panne est NOMMÉE à l'appelant avec SA room, une fois par audience perdue", () => {
    const { io } = ioThrowingOn([CONVERSATION, `user:${H1}`]);
    const labels: string[] = [];

    emitMessageNew({ ...base, io, senderUserId: SENDER_USER, hiddenKeys: [H1, H2], onEmissionError: (_e, label) => labels.push(label) });

    expect(labels).toEqual([`message:new (room ${CONVERSATION})`, `message:new (masqué user:${H1})`]);
  });

  it("deux audiences perdues ne rendent pas DEUX FOIS la même phrase", () => {
    const { io } = ioThrowingOn([`user:${SENDER_USER}`, `user:${H1}`]);
    const labels: string[] = [];

    emitMessageNew({ ...base, io, senderUserId: SENDER_USER, hiddenKeys: [H1], onEmissionError: (_e, label) => labels.push(label) });

    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual([`message:new (expéditeur user:${SENDER_USER})`, `message:new (masqué user:${H1})`]);
  });

  // C6 — la ligne que le lot AJOUTE à `emitPerReader` n'était couverte par
  // RIEN : la retirer laissait 1072/1072 témoins verts sur 29 suites. Elle
  // l'est par celui-ci, qui tombe si elle disparaît.
  it("le chemin PAR LECTEUR nomme la cible perdue à l'appelant", () => {
    const { io, served } = ioThrowingOn(['user:r2']);
    const labels: string[] = [];
    const plan = {
      targets: [
        { room: 'user:r1', key: 'r1', participantId: 'p1' },
        { room: 'user:r2', key: 'r2', participantId: 'p2' },
        { room: 'user:r3', key: 'r3', participantId: 'p3' },
      ],
      signFor: <P extends object>(payload: P) => payload,
      signAttachment: <A extends object>(attachment: A) => attachment,
    };

    emitMessageNew({
      ...base,
      io,
      senderUserId: SENDER_USER,
      hiddenKeys: [],
      readerSigned: plan as never,
      onEmissionError: (_e, label) => labels.push(label),
    });

    expect(served.map((s) => s.room)).toEqual(['user:r1', 'user:r3']);
    expect(labels).toEqual(['message:new (per reader user:r2)']);
  });

  it('le cas NOMINAL sert exactement une charge par audience, et ne distingue pas les deux granularités', () => {
    const { io, served } = ioThrowingOn([]);

    emitMessageNew({ ...base, io, senderUserId: SENDER_USER, hiddenKeys: [H1] });

    expect(served).toEqual([
      { room: CONVERSATION, except: [`user:${SENDER_USER}`, `user:${H1}`], payload: { tag: 'peer' } },
      { room: `user:${SENDER_USER}`, except: [], payload: { tag: 'sender' } },
      { room: `user:${H1}`, except: [], payload: { tag: `hidden:${H1}` } },
    ]);
  });
});

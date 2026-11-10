/**
 * Le scénario SANS TÊTE de la coquille « ami WhatsApp » (#17116) — la preuve de
 * bout en bout sans Meta (design DMA § 4). Le recetteur le lance depuis une
 * session cloud contre le STAGING (`scripts/dma-coquille-scenario.ts`) :
 *
 *   ouvrir la coquille → un appareil Meeshy de recette écrit à l'ami simulé →
 *   la coquille reçoit un blob opaque, le déchiffre → répond chiffré → Meeshy
 *   ouvre la réponse.
 *
 * Il vérifie aussi que le serveur REFUSE un clair, et que ce qu'il relaie ne
 * contient pas le texte envoyé. Il s'arrête à la première étape qui échoue et
 * la nomme. Sa sortie ne porte jamais un mot de passe, un jeton ni un clair.
 */
import type { LibsignalBridge } from '../e2ee/libsignal-bridge';

import { createCoquilleDevice, type CoquilleDevice, type Received } from './coquille-device';
import {
  PORTE_PATH,
  PorteError,
  createPorteClient,
  signIn,
  toBase64,
  type ExternalParty,
  type FetchLike,
  type MeeshyParty,
  type PorteClient,
  type PorteParty,
} from './porte-client';

export type ScenarioOptions = {
  readonly baseUrl: string;
  readonly fetch: FetchLike;
  readonly bridge: LibsignalBridge;
  readonly account: { readonly username: string; readonly password: string };
  readonly handle: string;
  readonly message: string;
  readonly reply: string;
  readonly meeshyDeviceId?: number;
  readonly log: (line: string) => void;
};

export type ScenarioStep = { readonly name: string; readonly ok: boolean; readonly detail: string | null };
export type ScenarioReport = { readonly ok: boolean; readonly steps: readonly ScenarioStep[] };

type Context = {
  readonly options: ScenarioOptions;
  readonly porte: PorteClient | null;
  readonly userId: string | null;
  readonly meeshy: CoquilleDevice | null;
  readonly coquille: CoquilleDevice | null;
};

type Step = { readonly name: string; readonly run: (context: Context) => Promise<Context> };

class StepFailure extends Error {}

const required = <T>(value: T | null, what: string): T => {
  if (value === null) throw new StepFailure(`${what} absent`);
  return value;
};

const textOf = (bytes: string): string => {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(bytes), (character) => character.charCodeAt(0)));
  } catch {
    return '';
  }
};

const partyName = (party: PorteParty): string => (party.side === 'meeshy' ? `meeshy:${party.userId}` : `whatsapp:${party.handle}`);

const fromExpected = (party: PorteParty) => (item: Received): boolean => partyName(item.from) === partyName(party) && item.from.deviceId === party.deviceId;

/** Ce qui arrive de `from`, ouvert ; une enveloppe illisible ou un clair relayé fait échouer l'étape sans rien recopier. */
const expectOpened = (received: readonly Received[], from: PorteParty, plaintext: string): void => {
  const mine = received.filter(fromExpected(from));
  if (mine.length === 0) throw new StepFailure('aucune enveloppe reçue de l’expéditeur attendu');
  if (mine.some((item) => textOf(item.body).includes(plaintext))) throw new StepFailure('le serveur a relayé le texte en clair');
  if (!mine.some((item) => item.text === plaintext)) throw new StepFailure('enveloppe reçue mais illisible ou différente du message envoyé');
};

const meeshyParty = (context: Context): MeeshyParty => ({ side: 'meeshy', userId: required(context.userId, 'compte'), deviceId: context.options.meeshyDeviceId ?? 42 });
const friendParty = (context: Context): ExternalParty => ({ side: 'external', network: 'whatsapp', handle: context.options.handle, deviceId: 1 });

const STEPS: readonly Step[] = [
  {
    name: 'connexion du compte de recette',
    run: async (context) => {
      const { baseUrl, fetch, account } = context.options;
      const signed = await signIn({ baseUrl, fetch, username: account.username, password: account.password });
      return { ...context, userId: signed.userId, porte: createPorteClient({ baseUrl, fetch, token: signed.token }) };
    },
  },
  {
    name: 'la coquille est servie',
    run: async (context) => {
      const response = await context.options.fetch(`${context.options.baseUrl}${PORTE_PATH}/coquille/`, { method: 'GET', headers: {} });
      if (response.status !== 200) throw new StepFailure(`statut ${response.status} (la porte est-elle ouverte au staging ?)`);
      if (!(await response.text()).includes('data-coquille')) throw new StepFailure('la page servie n’est pas la coquille');
      return context;
    },
  },
  {
    name: 'l’appareil Meeshy publie son bundle',
    run: async (context) => {
      const meeshy = await createCoquilleDevice({ bridge: context.options.bridge, porte: required(context.porte, 'porte'), party: meeshyParty(context) });
      await meeshy.publish();
      await meeshy.receive();
      return { ...context, meeshy };
    },
  },
  {
    name: 'la coquille publie son bundle',
    run: async (context) => {
      const coquille = await createCoquilleDevice({ bridge: context.options.bridge, porte: required(context.porte, 'porte'), party: friendParty(context) });
      await coquille.publish();
      await coquille.receive();
      return { ...context, coquille };
    },
  },
  {
    name: 'Meeshy écrit à l’ami',
    run: async (context) => {
      await required(context.meeshy, 'appareil Meeshy').send(friendParty(context), context.options.message);
      return context;
    },
  },
  {
    name: 'le serveur refuse un clair',
    run: async (context) => {
      const attempt = await required(context.porte, 'porte')
        .deliver({ from: meeshyParty(context), to: friendParty(context), type: 2, body: toBase64(new TextEncoder().encode(context.options.message)) })
        .then(
          () => null,
          (error: unknown) => error,
        );
      if (!(attempt instanceof PorteError) || attempt.code !== 'EXTERNAL_PEER_PLAINTEXT_REFUSED') throw new StepFailure('un clair a été accepté par la porte');
      return context;
    },
  },
  {
    name: 'la coquille reçoit un blob opaque et le déchiffre',
    run: async (context) => {
      expectOpened(await required(context.coquille, 'coquille').receive(), meeshyParty(context), context.options.message);
      return context;
    },
  },
  {
    name: 'la coquille répond chiffré',
    run: async (context) => {
      await required(context.coquille, 'coquille').send(meeshyParty(context), context.options.reply);
      return context;
    },
  },
  {
    name: 'Meeshy ouvre la réponse',
    run: async (context) => {
      expectOpened(await required(context.meeshy, 'appareil Meeshy').receive(), friendParty(context), context.options.reply);
      return context;
    },
  },
];

const reasonOf = (error: unknown): string => {
  if (error instanceof PorteError) return `${error.step} (${error.status}${error.code ? ` ${error.code}` : ''})`;
  if (error instanceof StepFailure) return error.message;
  return error instanceof Error ? error.name : 'erreur inconnue';
};

export const runCoquilleScenario = async (options: ScenarioOptions): Promise<ScenarioReport> => {
  const total = STEPS.length;
  const played = await STEPS.reduce<Promise<{ readonly context: Context | null; readonly steps: readonly ScenarioStep[] }>>(async (previous, step, index) => {
    const { context, steps } = await previous;
    if (context === null) return { context, steps };
    try {
      const next = await step.run(context);
      options.log(`✓ ${index + 1}/${total} ${step.name}`);
      return { context: next, steps: [...steps, { name: step.name, ok: true, detail: null }] };
    } catch (error) {
      const detail = reasonOf(error);
      options.log(`✗ ${index + 1}/${total} ${step.name} — ${detail}`);
      return { context: null, steps: [...steps, { name: step.name, ok: false, detail }] };
    }
  }, Promise.resolve({ context: { options, porte: null, userId: null, meeshy: null, coquille: null }, steps: [] }));

  const failed = played.steps.findIndex((step) => !step.ok);
  options.log(failed < 0 ? `SUCCÈS — ${total}/${total} étapes` : `ÉCHEC — étape ${failed + 1}/${total} : ${played.steps[failed]?.name ?? ''}`);
  return { ok: failed < 0, steps: played.steps };
};

/**
 * La PAGE de la coquille « ami WhatsApp » (#17116) : l'interface du recetteur,
 * servie par la passerelle de staging sous `/api/v1/external-peer/whatsapp/coquille/`.
 * DOM nu, sans cadre ni dépendance (elle se construit seule dans l'image de la
 * passerelle) ; outil interne de l'équipe, en français, hors de l'application.
 *
 * Le clair d'un message n'existe que dans cette page, le temps de l'onglet.
 */
import type { LibsignalBridge } from '../src/lib/e2ee/libsignal-bridge';

import { createCoquilleDevice, type CoquilleDevice, type Received } from './coquille-device';
import { PorteError, createPorteClient, signIn, type ExternalParty, type FetchLike, type PorteParty } from './porte-client';

export type CoquillePageOptions = {
  readonly origin: string;
  readonly fetch: FetchLike;
  readonly openBridge: () => Promise<LibsignalBridge>;
};

/** Un numéro de la plage fictive réservée aux fictions par l'Ofcom (+44 7700 900000–900999) : jamais un vrai abonné. */
export const fictitiousHandle = (random: () => number = Math.random): string => `+447700900${String(Math.floor(random() * 1000)).padStart(3, '0')}`;

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Readonly<Record<string, string>> = {}, text = ''): HTMLElementTagNameMap[K] => {
  const created = document.createElement(tag);
  Object.entries(attributes).forEach(([name, value]) => created.setAttribute(name, value));
  if (text) created.textContent = text;
  return created;
};

const labelled = (id: string, label: string, attributes: Readonly<Record<string, string>>): { readonly row: HTMLElement; readonly input: HTMLInputElement } => {
  const row = element('p');
  const input = element('input', { id, ...attributes });
  row.append(element('label', { for: id }, label), input);
  return { row, input };
};

const describeParty = (party: PorteParty): string => (party.side === 'meeshy' ? `Meeshy ${party.userId}, appareil ${party.deviceId}` : `${party.handle}, appareil ${party.deviceId}`);

const reasonOf = (error: unknown): string => {
  if (error instanceof PorteError) return `${error.step} (${error.status}${error.code ? ` ${error.code}` : ''})`;
  return error instanceof Error ? error.message : 'erreur inconnue';
};

export const mountCoquillePage = (root: HTMLElement, { origin, fetch, openBridge }: CoquillePageOptions): void => {
  const username = labelled('coquille-username', 'Identifiant de l’équipe', { autocomplete: 'username', required: '' });
  const password = labelled('coquille-password', 'Mot de passe', { type: 'password', autocomplete: 'current-password', required: '' });
  const handle = labelled('coquille-handle', 'Numéro WhatsApp simulé', { inputmode: 'tel', value: fictitiousHandle() });
  const form = element('form', { 'aria-label': 'Connexion à la coquille' });
  const open = element('button', { type: 'submit' }, 'Ouvrir la coquille');
  const status = element('div', { role: 'status', 'aria-live': 'polite' });
  const inbox = element('section', { 'aria-label': 'Messages reçus', hidden: '' });
  const relever = element('button', { type: 'button' }, 'Relever les messages');
  const list = element('ul');
  const reply = labelled('coquille-reply', 'Réponse', { autocomplete: 'off' });
  const send = element('button', { type: 'button' }, 'Répondre chiffré');

  root.append(
    element('h1', {}, 'Coquille « ami WhatsApp » — staging'),
    element('p', {}, 'Outil de recette de l’équipe : joue un utilisateur WhatsApp simulé contre le faux WhatsApp du staging. Aucun appel vers Meta.'),
    form,
    status,
    inbox,
  );
  form.append(username.row, password.row, handle.row, open);
  inbox.append(relever, list, reply.row, send);

  const say = (text: string): void => {
    status.textContent = text;
  };

  let device: CoquilleDevice | null = null;
  let lastSender: PorteParty | null = null;

  const show = (received: readonly Received[]): void => {
    received.forEach((item) => {
      list.append(element('li', { 'data-message': '' }, `De ${describeParty(item.from)} : ${item.text ?? 'enveloppe illisible'}`));
      if (item.text !== null) lastSender = item.from;
    });
    say(received.length === 0 ? 'Aucun message en attente' : `${received.length} message(s) relevé(s)`);
  };

  const guarded = (action: () => Promise<void>) => () => {
    action().catch((error: unknown) => say(`Échec — ${reasonOf(error)}`));
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    openCoquille();
  });

  const openCoquille = guarded(async () => {
    say('Connexion…');
    const signed = await signIn({ baseUrl: origin, fetch, username: username.input.value, password: password.input.value });
    password.input.value = '';
    const party: ExternalParty = { side: 'external', network: 'whatsapp', handle: handle.input.value.trim(), deviceId: 1 };
    device = await createCoquilleDevice({ bridge: await openBridge(), porte: createPorteClient({ baseUrl: origin, fetch, token: signed.token }), party });
    await device.publish();
    inbox.removeAttribute('hidden');
    say(`Coquille ouverte : ${party.handle}, appareil ${party.deviceId}`);
  });

  relever.addEventListener('click', guarded(async () => {
    if (!device) return say('Ouvrez d’abord la coquille');
    return show(await device.receive());
  }));

  send.addEventListener('click', guarded(async () => {
    if (!device || !lastSender) return say('Aucun message auquel répondre');
    await device.send(lastSender, reply.input.value);
    reply.input.value = '';
    return say('Réponse remise chiffrée');
  }));
};

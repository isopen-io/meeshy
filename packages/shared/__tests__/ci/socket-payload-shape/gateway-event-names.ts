// packages/shared/__tests__/ci/socket-payload-shape/gateway-event-names.ts
//
// « La passerelle épelle-t-elle ce nom ? » — le site UNIQUE de cette question.
//
// ─── Pourquoi un site unique ──────────────────────────────────────────────
//
// `socket-event-emitter-gate` posait la question pour la direction DESCENDANTE
// (« tout `SERVER_EVENTS` a-t-il un émetteur ? ») et portait le scan chez lui.
// `socket-event-handler-gate` la pose pour la direction MONTANTE (« tout
// `CLIENT_EVENTS` a-t-il un écouteur ? ») : le même fait, relevé deux fois.
//
// Deux relevés du même fait, gardés séparément, sont la forme que ce dépôt a
// déjà payée plusieurs fois — le cycle 161 a fait de `eventsNamedByClients`
// l'UNION de `eventsNamedByPlatform` pour exactement cette raison. Le scan
// vit donc ici, et les deux cliquets le consomment.
//
// ─── Ce que « nommé » veut dire, et pourquoi c'est volontairement permissif ─
//
// « Nommé », et non « passé à un `.emit(` » ou « passé à un `socket.on(` » : la
// passerelle émet et écoute aussi par indirection (`const name = …;
// socket.emit(name, …)`, `emission.event`, des tables d'enregistrement). Une
// recherche qui n'accepterait que la forme littérale du site d'appel rendrait
// rouges des canaux parfaitement vivants.
//
// Le critère se trompe donc du côté PERMISSIF : il ne prouve pas qu'un
// événement part ou qu'il est reçu, il prouve que la passerelle CONNAÎT son
// nom. C'est suffisant pour la classe de défaut visée — un canal que RIEN,
// nulle part, ne mentionne côté serveur — et cela ne peut pas rougir à tort.
//
// ─── Les trois cartes, et pourquoi il en faut trois ────────────────────────
//
// Un même nom de fil est épelé sous la clé de N'IMPORTE laquelle des cartes
// qui le déclarent : `call:initiated` s'écrit `CALL_EVENTS.INITIATED` dans
// `CallEventsHandler`, jamais `SERVER_EVENTS.CALL_INITIATED`. Chercher la seule
// clé de `SERVER_EVENTS` ferait passer pour orphelins dix-neuf canaux d'appel
// parfaitement émis.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';

import { CLIENT_EVENTS, SERVER_EVENTS } from '../../../types/socketio-events';
import { CALL_EVENTS } from '../../../types/video-call';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

export const GATEWAY_SOURCE_ROOT = 'services/gateway/src';

function buildNameToTokens(): ReadonlyMap<string, ReadonlySet<string>> {
  const byName = new Map<string, Set<string>>();

  const record = (mapName: string, map: Record<string, string>): void => {
    for (const [key, value] of Object.entries(map)) {
      const tokens = byName.get(value) ?? new Set<string>();
      tokens.add(`${mapName}.${key}`);
      byName.set(value, tokens);
    }
  };

  record('SERVER_EVENTS', SERVER_EVENTS);
  record('CLIENT_EVENTS', CLIENT_EVENTS);
  record('CALL_EVENTS', CALL_EVENTS);

  for (const [name, tokens] of byName) {
    tokens.add(`'${name}'`);
    tokens.add(`"${name}"`);
    tokens.add(`\`${name}\``);
  }

  return byName;
}

/**
 * Retire commentaires de bloc et de ligne. La garde `([^:])` avant `//` évite
 * de tronquer une URL (`https://…`) au milieu d'une chaîne.
 *
 * Sans ce dépouillement, la mention d'un nom dans un doc-comment — « jamais
 * émis par la passerelle », par exemple — créditerait l'événement de
 * l'émetteur que le commentaire dit précisément absent.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function collectGatewaySources(absoluteRoot: string): ReadonlyArray<string> {
  let entries: ReadonlyArray<string>;
  try {
    entries = readdirSync(absoluteRoot);
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') return [];
    const absolute = join(absoluteRoot, entry);
    if (statSync(absolute).isDirectory()) return collectGatewaySources(absolute);
    return extname(absolute) === '.ts' ? [absolute] : [];
  });
}

const NAME_TO_TOKENS = buildNameToTokens();

/**
 * Le code exécutable de la passerelle, commentaires retirés. Exporté pour que
 * chaque cliquet consommateur puisse attester que le scan trouve ENCORE la
 * passerelle : un chemin déplacé ou une extension changée viderait ce tableau
 * et rendrait TOUT événement orphelin — la garde rougirait pour la mauvaise
 * raison, et l'on croirait à cent défauts.
 */
export const GATEWAY_CODE: ReadonlyArray<string> = collectGatewaySources(
  join(REPO_ROOT, GATEWAY_SOURCE_ROOT)
).map((absolute) => stripComments(readFileSync(absolute, 'utf8')));

export function isNamedByGateway(eventName: string): boolean {
  const tokens = NAME_TO_TOKENS.get(eventName) ?? new Set([`'${eventName}'`]);
  return GATEWAY_CODE.some((code) => [...tokens].some((token) => code.includes(token)));
}

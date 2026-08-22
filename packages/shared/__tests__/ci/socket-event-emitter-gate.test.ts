// packages/shared/__tests__/ci/socket-event-emitter-gate.test.ts
//
// La moitié manquante de `socket-event-name-gate.test.ts` : « qui l'ÉCOUTE ? »
// y est vérifié, « qui l'ÉMET ? » ne l'était nulle part.
//
// ─── D'où vient cette garde ────────────────────────────────────────────────
//
// Le cycle 75 a trouvé un contrat écrit, un récepteur iOS complet et testé, et
// AUCUN émetteur serveur (`call:force-leave`). Le cycle 76 a trouvé le défaut
// symétrique — deux abonnements Android sur des noms que personne ne prononce —
// et a déposé la garde voisine, qui compare les noms épelés par les clients au
// contrat. Cette garde-ci ferme l'autre bout du fil, et c'est la piste que le
// cycle 76 laissait explicitement ouverte :
//
//   « Tout événement déclaré au contrat a-t-il un émetteur ? »
//
// Un canal serveur→client déclaré que la passerelle n'émet jamais n'est pas
// inerte. Le contrat AFFIRME qu'il existe ; un client le croit et s'y abonne ;
// l'abonnement se tait pour toujours sans lever la moindre erreur. Le dépôt en
// porte déjà la trace, écrite dans `SERVER_EVENTS` lui-même à l'endroit où
// `REACTION_SYNC` a été retiré : un client s'y était abonné et versait
// l'instantané de réactions dans le seau INCRÉMENTAL de `reaction:added`.
// Le canal fantôme n'avait pas seulement manqué sa fonction — il avait produit
// un bug.
//
// ─── Ce que la garde vérifie ───────────────────────────────────────────────
//
// Tout nom de `SERVER_EVENTS` doit être NOMMÉ quelque part dans le code
// exécutable de la passerelle — ou déclaré RÉSERVÉ dans le contrat.
//
// « Nommé », et non « passé à un `.emit(` » : la passerelle émet aussi par
// indirection (`const errorEventName = …; socket.emit(errorEventName, …)`,
// `emission.event`), et une garde qui n'accepterait que la forme littérale du
// site d'appel rendrait rouges des émetteurs parfaitement vivants. Le critère
// retenu se trompe donc du côté PERMISSIF : il ne prouve pas qu'un événement
// part, il prouve que la passerelle connaît son nom. C'est suffisant pour la
// classe de défaut visée — un canal que RIEN, nulle part, ne mentionne côté
// serveur — et cela ne peut pas rougir à tort.
//
// Les commentaires sont retirés avant la recherche. Sans cela, la mention d'un
// nom dans une prose d'explication — et `system:message` est justement cité
// dans un commentaire de `MeeshySocketIOHandler` qui raconte que la passerelle
// ne l'émet PLUS — vaudrait preuve d'émission. La garde bénirait le défaut
// qu'elle est écrite pour interdire, exactement comme une lecture textuelle du
// contrat l'aurait fait dans la garde voisine.
//
// ─── Pourquoi « réservé » se déclare dans le CONTRAT ───────────────────────
//
// Certains noms sont écrits avant leur émetteur, délibérément (la traduction en
// appel). Il fallait donc une porte de sortie — mais PAS une table d'exceptions
// vivant dans ce fichier de test : une liste d'exceptions cachée dans une garde
// est un endroit où l'on dépose ce qu'on ne veut pas traiter, et personne ne la
// relit.
//
// `RESERVED_SERVER_EVENTS` est donc exporté par le contrat, à côté des noms
// qu'il qualifie. Réserver un canal devient un acte visible en revue, dans le
// fichier que l'on modifie de toute façon pour ajouter l'événement.
//
// Et la réservation est vérifiée DANS LES DEUX SENS : un nom réservé dont
// l'émetteur a fini par atterrir doit sortir de la liste. Sans cette seconde
// assertion la liste pourrit en silence — ce qui était DÉJÀ arrivé : le bloc
// « Call events RESERVED (no emitter yet) » du contrat énumérait, au moment où
// cette garde a été écrite, six événements dont la passerelle avait entre-temps
// implémenté l'émission. Une exemption qui survit à sa raison d'être finit par
// couvrir un vrai défaut.
//
// ─── Placement ─────────────────────────────────────────────────────────────
//
// `packages/shared` tourne sur CHAQUE PR (`ci.yml`, matrice `test`) — même
// raison que ses voisins de dossier, dont `socket-event-name-gate.test.ts`
// dont ce fichier est la moitié symétrique.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, join, relative } from 'node:path';

import { CLIENT_EVENTS, RESERVED_SERVER_EVENTS, SERVER_EVENTS } from '../../types/socketio-events';
import { CALL_EVENTS } from '../../types/video-call';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const GATEWAY_SOURCE_ROOT = 'services/gateway/src';

/**
 * Un même nom d'événement est épelé par la passerelle sous la clé de N'IMPORTE
 * laquelle des maps qui le déclarent : `call:initiated` s'écrit
 * `CALL_EVENTS.INITIATED` dans `CallEventsHandler`, jamais
 * `SERVER_EVENTS.CALL_INITIATED`. Chercher la seule clé de `SERVER_EVENTS`
 * ferait passer pour orphelins dix-neuf canaux d'appel parfaitement émis.
 */
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
 */
function stripComments(source: string): string {
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

const GATEWAY_CODE: ReadonlyArray<string> = collectGatewaySources(
  join(REPO_ROOT, GATEWAY_SOURCE_ROOT)
).map((absolute) => stripComments(readFileSync(absolute, 'utf8')));

function isNamedByGateway(eventName: string): boolean {
  const tokens = NAME_TO_TOKENS.get(eventName) ?? new Set([`'${eventName}'`]);
  return GATEWAY_CODE.some((code) => [...tokens].some((token) => code.includes(token)));
}

const DECLARED_SERVER_EVENT_NAMES: ReadonlyArray<string> = [
  ...new Set(Object.values(SERVER_EVENTS)),
];

describe('every declared server→client channel has an emitter', () => {
  // Sans ce témoin, un chemin déplacé ou une extension changée viderait le scan
  // et rendrait TOUT événement orphelin — la garde rougirait pour la mauvaise
  // raison et l'on croirait à cent défauts. Le seuil est très en dessous du
  // compte réel : il atteste que le scan trouve encore la passerelle.
  it('still reads the gateway sources', () => {
    expect(GATEWAY_CODE.length).toBeGreaterThanOrEqual(200);
  });

  // Le témoin NÉGATIF. Le précédent prouve que le scan lit quelque chose ; sans
  // celui-ci, une comparaison devenue universelle (un `includes('')` par
  // exemple) déclarerait tout émis et la garde serait verte à jamais.
  it('does not credit a name the gateway never spells', () => {
    expect(isNamedByGateway('conversation:sixty-eight-lanterns')).toBe(false);
  });

  it('names every declared server event, or declares it reserved', () => {
    const orphaned = DECLARED_SERVER_EVENT_NAMES.filter(
      (name) =>
        !isNamedByGateway(name) && !(RESERVED_SERVER_EVENTS as ReadonlySet<string>).has(name)
    );

    expect(orphaned.sort()).toEqual([]);
  });

  // Une exemption qui survit à sa raison d'être finit par couvrir un vrai
  // défaut. Le bloc « RESERVED (no emitter yet) » du contrat en était rendu là :
  // six des événements qu'il énumérait avaient reçu leur émetteur depuis.
  it('keeps the reserved list free of channels the gateway now emits', () => {
    const landed = [...RESERVED_SERVER_EVENTS].filter((name) => isNamedByGateway(name));

    expect(landed.sort()).toEqual([]);
  });

  // `RESERVED_SERVER_EVENTS` doit rester une liste de noms RÉELS. Une entrée
  // mal orthographiée n'exempterait rien et, pire, se lirait comme une
  // couverture accordée.
  it('reserves only names the contract actually declares', () => {
    const unknown = [...RESERVED_SERVER_EVENTS].filter(
      (name) => !DECLARED_SERVER_EVENT_NAMES.includes(name)
    );

    expect(unknown.sort()).toEqual([]);
  });
});

/**
 * #16964 — inventaire des écritures qui RALLUMENT une participation et ne
 * remettent pas les sockets du compte dans `conversation:<id>`.
 *
 * Jumeau de `participant-reactivation-writers-sweep.test.ts`, sur le MÊME
 * inventaire de sites et pour une AUTRE propriété. Celui-là demande « cette
 * écriture peut-elle rallumer un banni ? » ; celui-ci demande « l'appareil
 * qu'elle réintègre reçoit-il encore les événements du fil ? ».
 *
 * Pourquoi la question ne se répond pas au site : l'ÉVICTION est partagée et
 * explicite (`endConversationMembership`, qui sort TOUTES les sockets du compte
 * — appelée par le départ, le bannissement et `delete-for-me`), la
 * RÉINTÉGRATION ne l'est pas. Chaque porte doit rebrancher chez elle, et une
 * porte qui l'oublie laisse l'appareil dans l'état que
 * `participant-ban-core.ts` décrit : `connectedUsers` le rapporte EN LIGNE,
 * donc tout expéditeur saute la file de remise hors ligne pour lui, pendant
 * qu'aucun événement de room ne l'atteint. Rien ne rejoue : les messages,
 * réactions, éditions et accusés émis entre-temps sont perdus, pas différés.
 *
 * Quatre des cinq portes rebranchaient ; `restore-for-me` était la cinquième,
 * et le symptôme n'avait aucun signal — c'est le propre d'une absence
 * d'événement. Le balayage ne garde donc pas un bug, il garde une PORTE : la
 * prochaine écriture qui rallume une participation doit dire ce qu'elle fait
 * des sockets avant d'entrer.
 *
 * L'inventaire des exemptions est VIDE, et il n'y a pas de réintégration muette
 * légitime à y porter : quand ce test tombe, la réparation est l'appel, jamais
 * une ligne de plus ci-dessous.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { REACTIVATION_MARKERS, reactivatingFiles as scanReactivatingFiles } from '../helpers/participant-reactivation-scan';

const SRC = join(__dirname, '..', '..');

/**
 * Les marqueurs d'une écriture qui RALLUME, repris du balayage frère (#10436) —
 * et le scanner avec eux depuis #19688 : il était recopié ici, et les DEUX
 * copies sont devenues aveugles ensemble le jour où les trois portes de rentrée
 * sont passées par `commitParticipantRejoin`. Celui-ci n'a rougi que par sa
 * sonde de non-vacuité (« ≥ 5 sites », tombée à 2), ce qui est exactement ce
 * qu'elle existe pour attraper. Détail : `helpers/participant-reactivation-scan.ts`.
 */
const MARKERS = REACTIVATION_MARKERS;

/**
 * Le verbe qui remet les sockets du compte dans la room du fil.
 * `MeeshySocketIOManager.joinUserToConversationRoom` en est l'unique
 * implémentation ; les noyaux de gestes le reçoivent par la passerelle typée
 * (`PasserelleSocketDeConversation`).
 */
const REJOIN = 'joinUserToConversationRoom';

/**
 * Un site peut déléguer sa jointure au module qui décide de l'admission plutôt
 * que de l'appeler lui-même. La délégation se DÉCLARE ici, elle ne se devine
 * pas — sans quoi « le fichier n'appelle pas » et « quelqu'un d'autre appelle
 * pour lui » seraient indistinguables.
 */
const REJOIN_DELEGATE: Readonly<Record<string, string>> = {
  // #16964 — le noyau du geste appelle `rejoinRestoredMembership`, l'unité
  // partagée qui porte les deux règles d'emploi (n'appeler qu'après une
  // restauration EFFECTIVE, et AVANT la diffusion du fait) et le journal d'un
  // échec non fatal. Déléguer n'est pas se taire : la délégation se DÉCLARE
  // ici, sans quoi « ce fichier n'appelle pas » et « quelqu'un appelle pour
  // lui » seraient indistinguables.
  'routes/conversations/restore-for-me.ts': 'routes/conversations/utils/rejoin-restored-membership.ts',
};

/** VIDE, et à défendre : voir l'en-tête. */
const SANS_REJOIN: ReadonlyArray<{ readonly file: string; readonly raison: string }> = [];

const reactivatingFiles = (): string[] => scanReactivatingFiles(SRC);

function rejoins(file: string): boolean {
  const delegate = REJOIN_DELEGATE[file];
  const sources = [file, ...(delegate ? [delegate] : [])];
  return sources.some((candidate) => readFileSync(join(SRC, candidate), 'utf8').includes(REJOIN));
}

describe('toute porte qui rallume une participation rebranche ses sockets (#16964)', () => {
  it('le balayage voit bien des écritures de réintégration (sans quoi il resterait vert à vide)', () => {
    // La moitié qui donne son sens à un inventaire vide : sans elle, exclure un
    // fichier du balayage suffirait à rendre le test vert.
    expect(reactivatingFiles().length).toBeGreaterThanOrEqual(5);
  });

  it('le verbe de jointure existe bien sous ce nom (un balayage de chaîne ne vaut que par sa cible)', () => {
    const manager = readFileSync(join(SRC, 'socketio/MeeshySocketIOManager.ts'), 'utf8');
    expect(manager).toContain(`async ${REJOIN}(`);
  });

  it('aucune porte de réintégration ne laisse ses sockets hors de la room du fil', () => {
    const muettes = reactivatingFiles().filter((file) => !rejoins(file));
    expect(muettes).toEqual(SANS_REJOIN.map((entry) => entry.file).sort());
  });

  it('restore-for-me rebranche, et sur la conversation qu’il vient de rendre', () => {
    const core = readFileSync(join(SRC, 'routes/conversations/restore-for-me.ts'), 'utf8');
    expect(core).toContain('rejoinRestoredMembership(fastify, { roomKey: userId, conversationId })');
    // Et l'unité déléguée appelle bien le verbe : une délégation déclarée vers
    // un module qui ne rebranche rien serait une exemption déguisée.
    const delegate = readFileSync(join(SRC, 'routes/conversations/utils/rejoin-restored-membership.ts'), 'utf8');
    expect(delegate).toContain(`${REJOIN}(params.roomKey, params.conversationId)`);
  });
});

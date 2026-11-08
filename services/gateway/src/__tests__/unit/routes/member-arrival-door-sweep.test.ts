/**
 * Cliquet d'inventaire des PORTES D'ARRIVÉE (#16837).
 *
 * Trois portes font entrer un membre dans une conversation, et UNE SEULE
 * annonçait son arrivée. Le défaut n'est pas un oubli isolé : c'est la forme
 * d'une règle qu'il faut RETAPER à chaque site, et qu'un site finit donc par ne
 * pas avoir. `announceMemberArrival` est le site unique ; ce balayage garde
 * l'inventaire de ceux qui doivent l'appeler.
 *
 * Pourquoi un BALAYAGE et pas trois témoins de route. Le voisin
 * `conversation-new-member-rights-parity.test.ts` écrit la raison : « un témoin
 * posé sur UNE SEULE porte ne peut pas rougir si les deux divergent à
 * nouveau ». Un témoin par porte ne dit rien de la QUATRIÈME — celle qu'un lot
 * futur ajoutera, en toute bonne foi, sans savoir que cette loi existe.
 *
 * Son discriminant est la CRÉATION d'une ligne `Participant`, et il balaie
 * `routes/` ET `services/` : la porte muette vivait dans `routes/`, mais rien
 * n'oblige la prochaine à y vivre.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', '..');

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === '__tests__' || entry === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
    }
  };
  walk(root);
  return out;
}

const relative = (path: string): string => path.slice(SRC.length + 1).split('\\').join('/');

/**
 * Les TROIS verbes qui posent une ligne, pas le seul `create`. La première
 * version de cette sonde ne cherchait que `participant.create(` et manquait
 * `InitService`, qui emploie `createMany` : un balayage qui cherche UN idiome
 * mesure sa popularité, pas une propriété.
 *
 * Et seulement les lignes de CODE : `InitService` CITE `participant.create`
 * dans un commentaire, et un inventaire qui compterait les commentaires
 * retrouverait les commentaires des lots précédents au lieu des sites.
 */
const createsAParticipantRow = (source: string): boolean =>
  source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*'))
    .some((line) => /\bparticipant\.(create|createMany|upsert)\(/.test(line));

/**
 * Les sites qui créent une ligne `Participant` SANS être une porte d'arrivée,
 * chacun avec sa raison. Une entrée EN TROP ⇒ une porte neuve vient d'entrer :
 * la réparation est l'appel à `announceMemberArrival`, jamais une ligne de plus
 * ici. Une entrée EN MOINS ⇒ un site a disparu, et retirer sa ligne fait partie
 * du lot qui l'a fait disparaître.
 */
const NOT_AN_ARRIVAL_DOOR: Record<string, string> = {
  'services/InitService.ts':
    "amorçage du dépôt : il crée les conversations système et leurs membres avant qu'aucun socket n'existe",
  'services/conversations/ensureGlobalConversationMembership.ts':
    "appartenance IMPLICITE à Global, posée à la demande — personne n'y « arrive », et l'annoncer pousserait un événement par première lecture",
  'services/messaging/MessagingService.ts':
    "crée la ligne de l'AUTEUR d'un message dans une conversation qu'il ouvre lui-même ; son arrivée est le fait de la porte qui l'a créée",
  'services/messaging/repairOrphanedMessageSenders.ts':
    'réparation de lignes ORPHELINES : elle rétablit un passé, elle n\'annonce pas un présent',
  'services/world/worldConversation.ts':
    "adhésion à World, du même régime implicite que Global",
};

/** Les portes d'ARRIVÉE : un membre entre, les autres doivent le savoir. */
const ARRIVAL_DOORS = [
  'routes/conversations/participants-writes.ts',
  'routes/conversations/sharing-invite.ts',
  'routes/conversations/link-admission.ts',
] as const;

describe('inventaire des portes d\'arrivée (#16837)', () => {
  const creators = [...sourceFiles(join(SRC, 'routes')), ...sourceFiles(join(SRC, 'services'))]
    .filter((path) => createsAParticipantRow(readFileSync(path, 'utf8')))
    .map(relative)
    .sort();

  it('le balayage trouve bien des sites — une sonde vide resterait verte sans rien garder', () => {
    expect(creators.length).toBeGreaterThanOrEqual(ARRIVAL_DOORS.length);
  });

  it('tout site qui crée une ligne Participant est une porte d\'arrivée, ou nommé avec sa raison', () => {
    const unaccounted = creators.filter(
      (path) => !(ARRIVAL_DOORS as readonly string[]).includes(path) && !(path in NOT_AN_ARRIVAL_DOOR),
    );

    expect(unaccounted).toEqual([]);
  });

  it('chaque porte d\'arrivée appelle le site UNIQUE de l\'éventail', () => {
    const silent = ARRIVAL_DOORS.filter(
      (door) => !readFileSync(join(SRC, door), 'utf8').includes('announceMemberArrival('),
    );

    expect(silent).toEqual([]);
  });

  it('l\'inventaire des non-portes ne porte aucune entrée MORTE', () => {
    const stale = Object.keys(NOT_AN_ARRIVAL_DOOR).filter((path) => !creators.includes(path));

    expect(stale).toEqual([]);
  });
});

/**
 * **Toute porte d'adhésion dont l'arrivant n'est PAS l'auteur du geste émet les
 * trois diffusions, par leur site unique** (#17032) — et l'inventaire de ses
 * exemptions est GELÉ ici, avec la raison de chacune.
 *
 * Pourquoi un cliquet plutôt que quatre témoins. `POST …/invite` n'émettait
 * qu'UNE des trois pendant que sa jumelle les émettait toutes, et aucun témoin
 * ne pouvait le voir : chacun était écrit porte par porte, sur un événement à
 * la fois, et un témoin par événement **ne voit pas une porte qui n'en émet
 * aucun**. #16837 avait rapatrié l'arrivée et laissé les deux autres derrière —
 * la même porte, le même oubli, deux lots de suite.
 *
 * Le discriminant d'une porte n'est pas inventé pour ce fichier : c'est
 * `postJoinSystemMessage`, le message système d'arrivée que les QUATRE portes
 * partagent déjà, et dont chacune se nomme dans son commentaire (« troisième
 * des quatre portes », « quatrième et dernière porte »). Une cinquième porte
 * qui le poste entre donc dans ce balayage sans que personne y pense.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOORS_DIR = join(__dirname, '../../../routes/conversations');

/** Le marqueur d'une porte d'adhésion : elle poste le message système d'arrivée. */
const DOOR_MARKER = 'postJoinSystemMessage(';
const FAN_OUT = 'announceMembershipAdmission(';

/**
 * Les portes EXEMPTÉES, et pourquoi. Le discriminant n'est pas la porte, c'est
 * **qui agit** : ces deux-là servent un arrivant qui EST l'auteur du geste, et
 * à qui la réponse HTTP rend la conversation. `conversation:new` lui
 * apprendrait ce qu'il vient de lire.
 */
const EXEMPT: ReadonlyArray<{ readonly file: string; readonly reason: string }> = [
  {
    file: 'link-admission.ts',
    reason:
      "jointure PAR LIEN : l'arrivant est l'auteur du geste et reçoit la conversation dans la réponse "
      + "qu'il attend. Il n'est pas un tiers à prévenir — il annonce son arrivée aux autres "
      + '(`announceMemberArrival`), ce qu\'il fait déjà.',
  },
  {
    file: 'link-admission-guest.ts',
    reason:
      "invité SANS COMPTE : il n'a pas de room personnelle d'utilisateur à adresser, et il ne peut pas "
      + "être le SUJET de l'arrivée (`ConversationParticipantJoinedEventData` déclare `userId` NON "
      + 'optionnel, décodeurs clients stricts — #16838).',
  },
];

const doorFiles = (): string[] =>
  readdirSync(DOORS_DIR)
    .filter((name) => name.endsWith('.ts'))
    .filter((name) => readFileSync(join(DOORS_DIR, name), 'utf8').includes(DOOR_MARKER))
    .sort();

describe("les portes d'adhésion partagent le site unique de leurs trois diffusions (#17032)", () => {
  // Un balayage négatif dont le scan rend `[]` reste VERT : la première
  // assertion est donc que le balayage balaie. Le dépôt en compte quatre, et
  // chacune le dit dans son propre commentaire.
  it('le balayage trouve bien les portes — sans quoi il ne peut rien garder', () => {
    const doors = doorFiles();
    expect(doors.length).toBeGreaterThanOrEqual(4);
    expect(doors).toContain('sharing-invite.ts');
    expect(doors).toContain('participants-writes.ts');
  });

  it('chaque porte appelle le site unique, ou figure dans l’inventaire avec sa raison', () => {
    const exemptFiles = new Set(EXEMPT.map((entry) => entry.file));
    const silent = doorFiles().filter(
      (name) => !exemptFiles.has(name) && !readFileSync(join(DOORS_DIR, name), 'utf8').includes(FAN_OUT),
    );

    // Quand ce témoin tombe, la réparation est l'APPEL — pas une ligne de plus
    // dans `EXEMPT`. Une exemption se paie d'une raison écrite qui dit POURQUOI
    // l'arrivant n'a pas besoin d'apprendre la conversation, et la seule raison
    // mesurée à ce jour est « c'est lui qui l'a demandée ».
    expect(silent).toEqual([]);
  });

  it('l’inventaire ne gèle que des portes qui existent, chacune motivée', () => {
    const doors = new Set(doorFiles());
    EXEMPT.forEach((entry) => {
      expect(doors.has(entry.file)).toBe(true);
      expect(entry.reason.length).toBeGreaterThan(60);
    });
  });

  it('les deux portes non exemptées émettent les trois, et par le MÊME appel', () => {
    ['sharing-invite.ts', 'participants-writes.ts'].forEach((name) => {
      const source = readFileSync(join(DOORS_DIR, name), 'utf8');
      expect(source).toContain(FAN_OUT);
      // Et aucune des trois n'est retapée à côté : c'est ce qui a produit la
      // divergence que ce lot referme.
      expect(source).not.toContain('SERVER_EVENTS.CONVERSATION_JOINED');
      expect(source).not.toContain('announceConversationNew(');
      expect(source).not.toContain('announceMemberArrival(');
    });
  });
});

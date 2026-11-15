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

/**
 * #18384 — ET L'ADMISSION DANS LA ROOM PRÉCÈDE LE MESSAGE D'ARRIVÉE.
 *
 * Le balayage ci-dessus garde ce qu'une porte ÉMET. Celui-ci garde l'ORDRE de
 * deux gestes qu'elles font toutes : admettre la socket de l'arrivant dans
 * `conversation:<id>`, et y poster son message d'arrivée.
 *
 * Les trois portes qui servent un COMPTE les faisaient dans l'ordre inverse.
 * L'arrivant ne recevait donc pas son propre message d'arrivée — et la file
 * hors ligne ne le rattrapait pas : il figure déjà dans `connectedUsers` et ne
 * porte aucun marqueur d'injoignabilité (#18381). Deux d'entre elles lançaient
 * en plus l'admission SANS L'ATTENDRE, ce qui faisait courir la fenêtre
 * jusque dans les diffusions d'adhésion — que le doc-comment de la troisième
 * déclarait pourtant précédées par elle.
 *
 * Un balayage TEXTUEL, et il faut dire pourquoi : l'ordre de deux appels dans
 * une fonction n'a pas de témoin de comportement bon marché aux quatre portes
 * (chacune a son harnais, sa base, ses doubles). Celui de la porte PAR LIEN
 * existe et observe le vrai ordre — `link-join-room-admission.test.ts` — ; ce
 * balayage-ci garde les trois autres, et surtout la CINQUIÈME, qui entrera ici
 * sans que personne y pense.
 */
describe("l'admission dans la room précède le message d'arrivée (#18384)", () => {
  /** Les deux façons d'admettre : l'appel direct, et le relais que la porte par lien passe à son cœur. */
  const ADMISSION = ['joinUserToConversationRoom(', 'admitToRoom('];

  const premierIndex = (source: string, marqueurs: readonly string[]): number => {
    const found = marqueurs.map((m) => source.indexOf(m)).filter((i) => i >= 0);
    return found.length === 0 ? -1 : Math.min(...found);
  };

  it('le balayage LIT bien les portes', () => {
    expect(doorFiles().length).toBeGreaterThanOrEqual(4);
  });

  it("aucune porte ne poste l'arrivée avant d'avoir admis l'arrivant", () => {
    const inversees = doorFiles()
      .map((name) => ({ name, source: readFileSync(join(DOORS_DIR, name), 'utf8') }))
      .filter(({ source }) => premierIndex(source, ADMISSION) >= 0)
      .filter(({ source }) => premierIndex(source, ADMISSION) > source.indexOf(DOOR_MARKER))
      .map(
        ({ name }) =>
          `${name} — poste le message d'arrivée AVANT d'admettre l'arrivant dans ` +
          `\`conversation:<id>\`. Il ne reçoit alors pas son propre message d'arrivée, et la ` +
          `file hors ligne ne le rattrape pas. Hisser l'admission, et l'ATTENDRE.`,
      );

    expect(inversees).toEqual([]);
  });

  /*
   * Lancer l'admission sans l'attendre ne fait que RÉTRÉCIR la fenêtre, de
   * façon non déterministe — ce qui est pire qu'une fenêtre franche : le défaut
   * devient intermittent, donc attribué au réseau.
   */
  it("l'admission est ATTENDUE, jamais lancée en arrière-plan", () => {
    const nonAttendues = doorFiles()
      .map((name) => ({ name, source: readFileSync(join(DOORS_DIR, name), 'utf8') }))
      .filter(({ source }) => /(?<!await )(?<!\. *)\bsocketManager\.joinUserToConversationRoom\(|(?<!await )\binviteSocketManager\.joinUserToConversationRoom\(/.test(source))
      .map(({ name }) => `${name} — admet l'arrivant sans attendre : la fenêtre devient intermittente.`);

    expect(nonAttendues).toEqual([]);
  });
});

/**
 * **Une réintégration efface les colonnes de DÉPART qu'elle a le droit
 * d'effacer — toutes, pas celle qui a eu son lot** (#17072).
 *
 * `Participant` porte TROIS colonnes de départ, et le dépôt le dit lui-même à
 * l'endroit qui les lit ensemble : `routes/sync/conversations.ts` interroge
 * `OR: [{leftAt:{gt}}, {bannedAt:{gt}}, {deletedForMe:{gt}}]` et sert un
 * TOMBSTONE de conversation dès que l'une est postérieure au curseur du client.
 *
 * `REJOIN_PARTICIPANT_STATE` — l'état partagé que les trois portes de rentrée
 * répandent — en effaçait DEUX sur trois :
 *
 * | colonne | la rentrée doit-elle l'effacer ? |
 * |---|---|
 * | `leftAt` | **oui** — on revient d'un départ, et la constante le faisait |
 * | `deletedForMe` | **oui** — et la constante ne le faisait PAS |
 * | `bannedAt` | **non, jamais** — une rentrée ne débannit personne, et les trois portes refusent un banni en amont (`resolveConversationEntry`) |
 *
 * Ce que l'omission coûtait : `delete-for-me` écrit les deux colonnes ENSEMBLE
 * (`{ deletedForMe: now, isActive: false }`), `resolveConversationEntry` ne voit
 * qu'une ligne inactive non bannie ⇒ `'rejoin'`, et la ligne redevient VIVANTE
 * pour tout le service — `PARTICIPATION_VIVANTE` est `isActive` + `bannedAt`,
 * sans aucune mention de `deletedForMe`. L'intéressée reçoit les messages, peut
 * écrire, apparaît dans le trombinoscope des autres, et `GET /conversations` ne
 * lui sert JAMAIS la conversation (`core-list` exige
 * `OR: [{deletedForMe: null}, {deletedForMe: {isSet: false}}]`). Elle la voit
 * même dans sa CORBEILLE, et `/sync` lui sert son tombstone.
 *
 * **Le témoin est RELATIONNEL, et c'est ce qui le rend incontournable.** Il ne
 * demande pas « la constante porte-t-elle ce champ ? » — ça, un lot futur peut
 * le satisfaire sans comprendre — mais « des trois colonnes que le flux de
 * tombstones lit, lesquelles la rentrée efface ? », avec la réponse écrite pour
 * chacune. Une QUATRIÈME colonne de départ ferait rougir le balayage avant
 * d'avoir à être devinée.
 *
 * Et il ne pouvait PAS être posé au cas nominal : une première entrée passe par
 * `create`, qui n'a aucune colonne de départ antérieure. Seul le rang « ligne
 * inactive AVEC `deletedForMe` » discrimine.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REJOIN_PARTICIPANT_STATE } from '../../services/conversations/conversationEntryAdmission';

const SRC = join(__dirname, '..', '..');

/**
 * Les colonnes que le flux de tombstones lit — relevées DANS son source, pas
 * recopiées : une seconde liste écrite ici dériverait, et c'est exactement la
 * dérive que ce témoin existe pour attraper.
 */
const departureColumns = (): readonly string[] => {
  const stream = readFileSync(join(SRC, 'routes/sync/conversations.ts'), 'utf8');
  return [...new Set([...stream.matchAll(/\{\s*(leftAt|bannedAt|deletedForMe)\s*:\s*\{\s*gt\b/g)].map((m) => m[1]!))].sort();
};

/** Ce que la rentrée doit faire de chacune, et pourquoi. */
const VERDICT: Readonly<Record<string, { readonly cleared: boolean; readonly why: string }>> = {
  leftAt: { cleared: true, why: 'on revient d’un départ : le laisser posé garde la conversation dans les tombstones du client' },
  deletedForMe: {
    cleared: true,
    why: "`delete-for-me` l’écrit AVEC `isActive: false`, et `resolveConversationEntry` ne lit que la seconde : "
      + 'le laisser posé rend une appartenance vivante pour le service et absente de `GET /conversations`',
  },
  bannedAt: {
    cleared: false,
    why: 'une rentrée ne DÉBANNIT pas — les trois portes refusent un banni en amont, et l’effacer ici serait un contournement',
  },
};

describe('une rentrée efface les colonnes de départ qu’elle a le droit d’effacer (#17072)', () => {
  it('le relevé trouve bien les colonnes de départ — un balayage à vide resterait vert', () => {
    expect(departureColumns()).toEqual(['bannedAt', 'deletedForMe', 'leftAt']);
  });

  it('chaque colonne de départ a un verdict écrit, et la constante le respecte', () => {
    const divergent = departureColumns().filter((column) => {
      const verdict = VERDICT[column];
      if (!verdict) return true;
      const cleared = (REJOIN_PARTICIPANT_STATE as Record<string, unknown>)[column] === null;
      return cleared !== verdict.cleared;
    });

    expect(divergent).toEqual([]);
  });

  it('la rentrée rallume la ligne — sans quoi il n’y aurait rien à effacer', () => {
    expect(REJOIN_PARTICIPANT_STATE.isActive).toBe(true);
  });

  it('`bannedAt` n’est pas dans la constante : l’effacer serait un contournement de la garde de bannissement', () => {
    expect(Object.keys(REJOIN_PARTICIPANT_STATE)).not.toContain('bannedAt');
  });

  it('`delete-for-me` écrit bien les DEUX colonnes ensemble — la prémisse du constat, lue dans son source', () => {
    const source = readFileSync(join(SRC, 'routes/conversations/delete-for-me.ts'), 'utf8');
    expect(source).toContain('deletedForMe: now');
    expect(source).toContain('isActive: false');
  });
});

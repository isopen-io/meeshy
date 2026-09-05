/**
 * #3909 — la reprise de lecture repart de la position SERVIE, et le champ qui
 * la porte ne peut plus mourir en silence.
 *
 * ## Ce que ce témoin garde, et pourquoi il est en DEUX parties
 *
 * `currentUserConsumption` a déjà vécu. Le gateway le calculait depuis juin
 * 2026 — une requête bornée par page, scopée au participant — et
 * `fast-json-stringify` le retirait de CHAQUE réponse, faute d'être déclaré au
 * `messageAttachmentSchema`. Deux requêtes Prisma par page payées pour un champ
 * qu'aucun client ne recevait ; #4177 a retiré ce travail mort, à raison.
 *
 * > **Une projection non déclarée ne rougit nulle part.** Elle coûte, elle
 * > s'exécute, elle passe les tests de route (qui lisent le handler, pas la
 * > charge sérialisée) — et le client qui l'attend devient un contrôle non
 * > alimenté, ce qui se voit encore moins qu'un champ absent.
 *
 * D'où deux parties indissociables : la DÉCLARATION (sans quoi la projection
 * remourrait) et la PROJECTION (sans quoi la déclaration ne sert rien). Retirer
 * l'une des deux doit faire rougir ce fichier.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { messageAttachmentSchema } from '@meeshy/shared/types/api-schemas';
import { loadCurrentUserConsumptionMap } from '../../../routes/conversations/messages-list-query';

// ─── Partie 1 — la DÉCLARATION ───────────────────────────────────────────────

describe('#3909 · le champ est DÉCLARÉ au schéma partagé', () => {
  it('`currentUserConsumption` figure dans `messageAttachmentSchema`', () => {
    const props = (messageAttachmentSchema as any).properties;
    expect(props).toHaveProperty('currentUserConsumption');
  });

  it('les quatre grandeurs de la reprise y sont, audio ET vidéo', () => {
    const champ = (messageAttachmentSchema as any).properties.currentUserConsumption;
    expect(champ.nullable).toBe(true);
    expect(Object.keys(champ.properties).sort()).toEqual([
      'lastPlayPositionMs',
      'lastWatchPositionMs',
      'listenedComplete',
      'watchedComplete',
    ]);
  });
});

// ─── Partie 2 — la PROJECTION ────────────────────────────────────────────────

type Ligne = {
  attachmentId: string;
  lastPlayPositionMs: number | null;
  listenedComplete: boolean | null;
  lastWatchPositionMs: number | null;
  watchedComplete: boolean | null;
};

/**
 * Un prisma factice qui HONORE le `where`.
 *
 * Un stub qui rend ses lignes quel que soit le filtre ne prouve rien de la
 * requête : il prouve que le code sait lire un tableau. C'est le filtre — page
 * bornée, participant scopé — qui est la propriété à garder.
 */
function fakePrisma(lignes: Ligne[], espion?: (args: any) => void) {
  return {
    attachmentStatusEntry: {
      findMany: jest.fn(async (args: any) => {
        espion?.(args);
        const ids: string[] = args?.where?.attachmentId?.in ?? [];
        const participantId: string | undefined = args?.where?.participantId;
        if (!participantId) return [];
        return lignes.filter((l) => ids.includes(l.attachmentId));
      }),
    },
  } as any;
}

const messages = [
  { attachments: [{ id: 'att-1' }, { id: 'att-2' }] },
  { attachments: [{ id: 'att-3' }] },
];

describe('#3909 · la progression du participant est PROJETÉE', () => {
  it('rend la position et la complétion, par pièce jointe', async () => {
    const prisma = fakePrisma([
      { attachmentId: 'att-2', lastPlayPositionMs: 42_000, listenedComplete: false, lastWatchPositionMs: null, watchedComplete: null },
    ]);

    const carte = await loadCurrentUserConsumptionMap(prisma, messages, 'part-1');

    expect(carte.get('att-2')).toEqual({
      lastPlayPositionMs: 42_000,
      listenedComplete: false,
      lastWatchPositionMs: null,
      watchedComplete: false,
    });
    // Une pièce jointe jamais consommée est ABSENTE de la carte : le
    // sérialiseur en fait `null`, que le client distingue de « position 0 ».
    expect(carte.has('att-1')).toBe(false);
  });

  it('borne la requête aux pièces jointes de la PAGE et au participant', async () => {
    let vu: any = null;
    const prisma = fakePrisma([], (args) => { vu = args; });

    await loadCurrentUserConsumptionMap(prisma, messages, 'part-1');

    expect(vu.where.attachmentId.in).toEqual(['att-1', 'att-2', 'att-3']);
    expect(vu.where.participantId).toBe('part-1');
    // Une seule requête pour toute la page — c'est ce qui rendait la
    // projection payable, et ce que le retrait de #4177 ne remettait pas en
    // cause.
    expect(prisma.attachmentStatusEntry.findMany).toHaveBeenCalledTimes(1);
  });

  it('ne demande RIEN sans participant, ni sans pièce jointe', async () => {
    const prisma = fakePrisma([]);

    expect((await loadCurrentUserConsumptionMap(prisma, messages, undefined)).size).toBe(0);
    expect((await loadCurrentUserConsumptionMap(prisma, [], 'part-1')).size).toBe(0);
    expect((await loadCurrentUserConsumptionMap(prisma, [{ attachments: [] }], 'part-1')).size).toBe(0);
    expect(prisma.attachmentStatusEntry.findMany).not.toHaveBeenCalled();
  });

  it('une lecture en échec coûte une reprise, jamais la conversation', async () => {
    const prisma = {
      attachmentStatusEntry: {
        findMany: jest.fn(async () => { throw new Error('base indisponible'); }),
      },
    } as any;

    await expect(loadCurrentUserConsumptionMap(prisma, messages, 'part-1')).resolves.toEqual(new Map());
  });
});

import type { MessageServi } from '@/app/(public)/chats/[lien]/fil-modele';
import type { Verdict } from '@/lib/api/messagerie';
import {
  PLAFOND_DE_LA_FILE,
  enfile,
  videLaFile,
  type EntreeDeFile,
} from '@/lib/realtime/queue/offline-queue';

/**
 * LA FILE HORS-LIGNE — § 7, ligne « retour en ligne » : « les messages grisés
 * passent en envoyés DANS L'ORDRE D'ÉCRITURE. Ceux refusés (410) passent en
 * “non envoyé” avec leur raison et un bouton “réessayer” — JAMAIS perdus en
 * silence. »
 *
 * Ces trois propriétés — l'ordre, l'arrêt sur coupure, la visibilité du refus —
 * ne se mesurent pas depuis un navigateur : elles se mesurent ici, sur une
 * fonction qui reçoit son transport en paramètre.
 */

const entree = (cle: string, ecriteA: number): EntreeDeFile => ({
  cle,
  texte: `message ${cle}`,
  langue: 'fr',
  ecriteA,
});

const servi = (id: string): MessageServi => ({
  id,
  auteur: 'Tolu',
  moi: true,
  anonyme: true,
  contenu: 'peu importe',
  langueOriginale: 'fr',
  traductions: {},
  instantMs: 0,
});

describe('l’ordre d’écriture est celui du départ', () => {
  it('envoie les entrées une par une, dans l’ordre, jamais en parallèle', async () => {
    const partis: string[] = [];
    let enVol = 0;

    const resultat = await videLaFile({
      file: [entree('a', 1), entree('b', 2), entree('c', 3)],
      envoie: async (candidate) => {
        enVol += 1;
        // Deux envois en vol rendraient l'ordre d'ARRIVÉE indéterminé.
        expect(enVol).toBe(1);
        await Promise.resolve();
        partis.push(candidate.cle);
        enVol -= 1;
        return { etat: 'servi', valeur: servi(candidate.cle) };
      },
    });

    expect(partis).toEqual(['a', 'b', 'c']);
    expect(resultat.partis.map((message) => message.id)).toEqual(['a', 'b', 'c']);
    expect(resultat.restantes).toEqual([]);
    expect(resultat.refus).toBeNull();
  });

  /**
   * Une coupure n'annule RIEN. Elle ARRÊTE — et ce qui n'est pas parti reste en
   * file, dans son ordre : reprendre au troisième pendant que le second attend
   * inverserait la conversation sous les yeux des autres.
   */
  it('s’arrête à la première coupure et conserve la file dans son ordre', async () => {
    const resultat = await videLaFile({
      file: [entree('a', 1), entree('b', 2), entree('c', 3)],
      envoie: async (candidate) =>
        candidate.cle === 'a'
          ? { etat: 'servi', valeur: servi('a') }
          : { etat: 'indisponible' },
    });

    expect(resultat.partis.map((message) => message.id)).toEqual(['a']);
    expect(resultat.restantes.map((reste) => reste.cle)).toEqual(['b', 'c']);
    expect(resultat.refus).toBeNull();
  });
});

describe('un refus ANNULE la file, et la rend visible', () => {
  it('rend la cause et les entrées annulées sur un lien mort (410)', async () => {
    const resultat = await videLaFile({
      file: [entree('a', 1), entree('b', 2)],
      envoie: async () => ({ etat: 'lien-mort', cause: 'lien-desactive' }),
    });

    expect(resultat.partis).toEqual([]);
    expect(resultat.restantes).toEqual([]);
    expect(resultat.refus?.cause).toEqual({ type: 'lien-mort', cause: 'lien-desactive' });
    expect(resultat.refus?.annulees.map((annulee) => annulee.cle)).toEqual(['a', 'b']);
  });

  it('annule aussi sur une place fermée (401), sans jamais rejoindre', async () => {
    const resultat = await videLaFile({
      file: [entree('a', 1)],
      envoie: async () => ({ etat: 'close' }),
    });

    expect(resultat.refus?.cause).toEqual({ type: 'place-fermee' });
    expect(resultat.refus?.annulees.map((annulee) => annulee.cle)).toEqual(['a']);
  });

  /**
   * Ce qui est DÉJÀ parti reste parti : un refus sur la troisième entrée
   * n'efface pas les deux premières, qui sont dans la conversation des autres.
   */
  it('garde ce qui est parti avant le refus', async () => {
    const resultat = await videLaFile({
      file: [entree('a', 1), entree('b', 2)],
      envoie: async (candidate) =>
        candidate.cle === 'a'
          ? ({ etat: 'servi', valeur: servi('a') } satisfies Verdict<MessageServi>)
          : ({ etat: 'lien-mort', cause: 'lien-expire' } satisfies Verdict<MessageServi>),
    });

    expect(resultat.partis.map((message) => message.id)).toEqual(['a']);
    expect(resultat.refus?.annulees.map((annulee) => annulee.cle)).toEqual(['b']);
  });
});

describe('la file est BORNÉE', () => {
  /**
   * `MAX_QUEUE_SIZE` du patron mesuré (`apps/web/services/socketio/orchestrator.service.ts`).
   * Une file non bornée est un cache non borné, et le § « Optimisation mémoire »
   * en fait une rétention.
   */
  it('refuse d’enfler au-delà de son plafond, en gardant les PLUS ANCIENNES', () => {
    const pleine = Array.from({ length: PLAFOND_DE_LA_FILE }, (_, rang) =>
      entree(`e${rang}`, rang),
    );

    const suite = enfile(pleine, entree('trop', 999));

    expect(suite).toHaveLength(PLAFOND_DE_LA_FILE);
    expect(suite[suite.length - 1]?.cle).toBe(`e${PLAFOND_DE_LA_FILE - 1}`);
  });

  it('ajoute en QUEUE, jamais en tête', () => {
    expect(enfile([entree('a', 1)], entree('b', 2)).map((e) => e.cle)).toEqual(['a', 'b']);
  });
});

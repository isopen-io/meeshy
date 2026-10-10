/**
 * Le double `findFirstHonouringWhere` TRIE une relation quand la requête le
 * demande (#9776) — il ne l'ignore pas en silence, et il ne la refuse plus :
 * toute lecture des pièces d'un message passe `MESSAGE_ATTACHMENT_ORDER`, et un
 * double qui rendrait la liste dans l'ordre de semis laisserait passer une
 * production qui oublierait de trier.
 */
import { describe, it, expect } from '@jest/globals';
import { findFirstHonouringWhere } from './helpers/find-first-honouring-where';
import { MESSAGE_ATTACHMENT_ORDER } from '../services/attachments/attachmentIncludes';

const piece = (id: string, champs: Record<string, unknown>) => ({ id, ...champs });

const message = (attachments: ReadonlyArray<Record<string, unknown>>) => ({ id: 'm1', attachments });

const idsServis = async (attachments: ReadonlyArray<Record<string, unknown>>, orderBy: unknown) => {
  const ligne = await findFirstHonouringWhere([message(attachments)])({
    where: { id: 'm1' },
    select: { id: true, attachments: { select: { id: true }, orderBy } },
  });
  return (ligne?.attachments as ReadonlyArray<{ id: string }>).map((piece) => piece.id);
};

describe('findFirstHonouringWhere — l’ordre d’une relation est HONORÉ', () => {
  it('range les pièces par rang, quel que soit l’ordre de semis', async () => {
    const servis = await idsServis(
      [piece('c', { rank: 2 }), piece('a', { rank: 0 }), piece('b', { rank: 1 })],
      MESSAGE_ATTACHMENT_ORDER
    );
    expect(servis).toEqual(['a', 'b', 'c']);
  });

  it('met EN TÊTE une pièce sans rang, comme MongoDB, puis départage par createdAt et id', async () => {
    const t0 = new Date('2026-10-01T10:00:00Z');
    const t1 = new Date('2026-10-01T10:00:01Z');
    const servis = await idsServis(
      [
        piece('rang', { rank: 0, createdAt: t0 }),
        piece('z', { createdAt: t0 }),
        piece('tard', { createdAt: t1 }),
        piece('y', { createdAt: t0 }),
      ],
      MESSAGE_ATTACHMENT_ORDER
    );
    expect(servis).toEqual(['y', 'z', 'tard', 'rang']);
  });

  it('honore un ordre descendant donné en objet seul', async () => {
    const servis = await idsServis([piece('a', { rank: 0 }), piece('b', { rank: 1 })], { rank: 'desc' });
    expect(servis).toEqual(['b', 'a']);
  });

  it('refuse une direction qu’il ne connaît pas plutôt que de l’ignorer', async () => {
    await expect(idsServis([piece('a', { rank: 0 })], { rank: 'random' })).rejects.toThrow(/orderBy/);
  });

  it('refuse toujours une borne (`take`) qu’il ne modélise pas', async () => {
    const appel = findFirstHonouringWhere([message([piece('a', {})])]);
    expect(() => appel({ select: { attachments: { select: { id: true }, take: 1 } } })).toThrow(/take/);
  });
});

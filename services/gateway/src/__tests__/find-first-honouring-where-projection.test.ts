/**
 * `projectDocument` — ce que Prisma rend d'UNE ligne sous un `select` (#9899).
 *
 * Un double qui lit déjà sa ligne (`findUnique` par identifiant, `findMany`) n'a
 * besoin que de la PROJECTION de `findFirstHonouringWhere`, pas de sa recherche :
 * un double qui rend la ligne entière sous un `select` cache la colonne que la
 * requête a oubliée de demander, et le témoin reste vert alors que la
 * production lit `undefined`. La règle est donc celle de `findFirstHonouringWhere`
 * (une seule jumelle) : `true` garde une colonne, `{ select }` descend dans une
 * relation, une liste est filtrée par son `where` puis projetée.
 */
import { describe, it, expect } from '@jest/globals';
import { projectDocument } from './helpers/find-first-honouring-where';

const participant = () => ({
  id: 'p1',
  userId: 'u1',
  role: 'member',
  isActive: true,
  permissions: { canSendMessages: false },
  anonymousSession: null,
  user: { role: 'USER', birthDate: new Date('1990-03-01T00:00:00.000Z'), email: 'ada@example.com' },
});

describe('projectDocument — la projection d’une ligne sous `select`', () => {
  it('ne rend que les colonnes demandées', () => {
    const projected = projectDocument(participant(), { select: { id: true, role: true } });

    expect(projected).toEqual({ id: 'p1', role: 'member' });
    expect(Object.keys(projected)).toEqual(['id', 'role']);
  });

  it('garde une colonne structurée telle quelle quand le `select` la demande par `true`', () => {
    const projected = projectDocument(participant(), { select: { permissions: true } });

    expect(projected).toEqual({ permissions: { canSendMessages: false } });
  });

  it('descend dans une relation vers UN : seules ses colonnes demandées partent', () => {
    const projected = projectDocument(participant(), { select: { user: { select: { role: true, birthDate: true } } } });

    expect(projected).toEqual({ user: { role: 'USER', birthDate: new Date('1990-03-01T00:00:00.000Z') } });
    expect(Object.keys(projected.user as object)).toEqual(['role', 'birthDate']);
  });

  it('laisse nulle une relation vers UN qui n’est pas là', () => {
    const projected = projectDocument(participant(), { select: { anonymousSession: { select: { rights: true } } } });

    expect(projected).toEqual({ anonymousSession: null });
  });

  it('laisse ABSENTE une colonne que la ligne ne porte pas — un champ absent n’est pas un champ à null', () => {
    const projected = projectDocument(participant(), { select: { id: true, historyVisibleFrom: true } });

    expect('historyVisibleFrom' in projected).toBe(false);
  });

  it('filtre une relation vers PLUSIEURS par son `where`, PUIS la projette', () => {
    const conversation = {
      id: 'c1',
      type: 'direct',
      participants: [
        { userId: 'u1', isActive: true, role: 'creator' },
        { userId: 'u2', isActive: true, role: 'member' },
        { userId: 'u3', isActive: false, role: 'member' },
      ],
    };

    const projected = projectDocument(conversation, {
      select: { type: true, participants: { where: { isActive: true }, select: { userId: true } } },
    });

    expect(projected).toEqual({ type: 'direct', participants: [{ userId: 'u1' }, { userId: 'u2' }] });
  });

  it('rend la ligne entière quand l’appel ne demande aucun `select`', () => {
    const row = participant();

    expect(projectDocument(row, {})).toEqual(row);
  });

  it('ne modifie pas la ligne qu’il projette', () => {
    const row = participant();

    projectDocument(row, { select: { id: true, user: { select: { role: true } } } });

    expect(row).toEqual(participant());
  });

  it('refuse une borne de relation qu’il ne modélise pas plutôt que de l’ignorer', () => {
    const conversation = { participants: [{ userId: 'u1' }, { userId: 'u2' }] };

    expect(() => projectDocument(conversation, { select: { participants: { select: { userId: true }, take: 1 } } })).toThrow(/take/);
  });
});

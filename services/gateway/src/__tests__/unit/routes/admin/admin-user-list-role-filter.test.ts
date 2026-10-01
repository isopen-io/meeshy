import { userListFilters } from '../../../../routes/admin/user-list-filters';

/**
 * Le filtre `role` de `GET /admin/users` est une LISTE (#8876) : le rang d'administration est
 * BIGBOSS et ADMIN, et la tuile « Administrateurs » du tableau de bord les compte tous les deux —
 * l'ouvrir sur `role=ADMIN` seul listait zéro compte quand le seul administrateur est le créateur.
 */
describe('userListFilters — role', () => {
  const rolesOf = (role: string | undefined) => userListFilters({ role }, true).role;

  it('lit un rôle seul comme une liste d’un élément', () => {
    expect(rolesOf('USER')).toEqual(['USER']);
  });

  it('lit une liste séparée par des virgules — le rang d’administration est BIGBOSS et ADMIN', () => {
    expect(rolesOf('BIGBOSS,ADMIN')).toEqual(['BIGBOSS', 'ADMIN']);
  });

  it('retire les rôles inconnus, les espaces et les doublons', () => {
    expect(rolesOf('ADMIN,ROOT, USER,ADMIN')).toEqual(['ADMIN', 'USER']);
  });

  it('ne restreint rien quand aucun rôle n’est connu, ou quand le filtre est absent', () => {
    expect(rolesOf('ROOT,OWNER')).toBeUndefined();
    expect(rolesOf('')).toBeUndefined();
    expect(rolesOf(undefined)).toBeUndefined();
  });

  it('un rôle en minuscules n’est pas un rôle', () => {
    expect(rolesOf('admin')).toBeUndefined();
  });
});

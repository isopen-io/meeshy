/**
 * Témoins de `useGroupModal` — la modale « créer une communauté » du tableau
 * de bord (#4222).
 *
 * Ce que le défaut coûtait : le hook postait vers `/groups`, une adresse
 * qu'AUCUNE route du gateway ne sert, puis lisait `data.group.id`, une
 * enveloppe qu'aucune route du dépôt ne rend. Chaque tentative retombait donc
 * dans la branche d'erreur — la fonctionnalité était à l'écran et n'avait
 * jamais pu aboutir une seule fois.
 *
 * DÉCISION (critère 1) : ce que la modale crée est une COMMUNAUTÉ, pas une
 * conversation de groupe. L'interface le dit déjà dans les quatre langues
 * servies (titre, libellés, bouton, toast de succès), `isPrivate` n'existe que
 * sur `Community`, la navigation de sortie vise `/groups/:identifier` qui EST
 * la page communauté, et `services/groups.service.ts` avait déjà tranché le
 * même mot vers `/communities`. Le tableau de l'issue disait « pas de
 * memberIds à la création ; exige un identifier » : les deux moitiés sont
 * fausses sur le code réel — `identifier` est optionnel (dérivé du nom) et les
 * membres s'ajoutent par `POST /communities/:id/members`, que le créateur,
 * ADMIN par construction, a le droit d'appeler.
 *
 * Les témoins ci-dessous nomment l'ADRESSE et la FORME servie : ce sont les
 * deux choses que le code d'origine avait inventées.
 */

import { renderHook, act } from '@testing-library/react';
import { useGroupModal } from '@/hooks/use-group-modal';
import type { User } from '@/types';

jest.mock('@/services/auth-manager.service', () => ({
  authManager: { getAuthToken: jest.fn(() => 'jeton-de-test') },
}));

const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
jest.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

const utilisateur = (id: string): User =>
  ({ id, username: `u-${id}`, displayName: `U ${id}` }) as unknown as User;

/** Toutes les URL touchées par le hook, dans l'ordre d'appel. */
const urlsAppelées = () =>
  (global.fetch as jest.Mock).mock.calls.map((appel) => String(appel[0]));

const corpsDe = (rang: number) =>
  JSON.parse(String((global.fetch as jest.Mock).mock.calls[rang][1].body));

const réponse = (status: number, corps: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corps,
});

/** La forme RÉELLEMENT servie par `POST /communities` : `sendSuccess(..., 201)`. */
const communautéCréée = (id = 'comm-1', identifier = 'mshy_equipe') =>
  réponse(201, { success: true, data: { id, identifier, name: 'Équipe', isPrivate: false } });

const membreAjouté = () => réponse(200, { success: true, data: { id: 'membre-1' } });

describe('useGroupModal — créer une communauté depuis le tableau de bord (#4222)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  const remplirEtCréer = async (
    membres: User[] = [],
    options: { description?: string; privée?: boolean; nom?: string } = {}
  ) => {
    const { result } = renderHook(() => useGroupModal('moi'));

    act(() => {
      result.current.setGroupName(options.nom ?? 'Équipe Marketing');
      if (options.description) result.current.setGroupDescription(options.description);
      if (options.privée) result.current.setIsGroupPrivate(true);
    });
    act(() => {
      membres.forEach((m) => result.current.toggleUserSelection(m));
    });

    let rendu: string | null = null;
    await act(async () => {
      rendu = await result.current.createGroup();
    });
    return { result, rendu: rendu as string | null };
  };

  it('poste vers /api/v1/communities — jamais vers /groups, qu’aucune route ne sert', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(communautéCréée());

    await remplirEtCréer();

    const [urlCréation] = urlsAppelées();
    expect(urlCréation).toMatch(/\/api\/v1\/communities$/);
    expect(urlsAppelées().some((u) => /\/groups(\/|$)/.test(u))).toBe(false);
  });

  it('envoie la charge que `POST /communities` attend — et n’y glisse aucun memberIds', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(communautéCréée());

    await remplirEtCréer([utilisateur('a')], { description: 'La bande', privée: true });

    expect((global.fetch as jest.Mock).mock.calls[0][1].method).toBe('POST');
    expect(corpsDe(0)).toEqual({
      name: 'Équipe Marketing',
      description: 'La bande',
      isPrivate: true,
    });
  });

  it('lit la forme servie `{ success, data }` et rend de quoi ouvrir la communauté', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(communautéCréée('comm-42', 'mshy_equipe-42'));

    const { rendu } = await remplirEtCréer();

    expect(rendu).toBe('mshy_equipe-42');
  });

  it('rend l’id quand la charge servie ne porte pas d’identifier', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      réponse(201, { success: true, data: { id: 'comm-7' } })
    );

    const { rendu } = await remplirEtCréer();

    expect(rendu).toBe('comm-7');
  });

  it('n’annonce PAS un succès quand la charge servie ne porte aucun identifiant', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(réponse(201, { success: true, data: {} }));

    const { rendu } = await remplirEtCréer();

    expect(rendu).toBeNull();
    expect(mockToastError).toHaveBeenCalled();
  });

  it('ajoute chaque membre sélectionné par la route des membres, une fois la communauté née', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(communautéCréée('comm-1'))
      .mockResolvedValueOnce(membreAjouté())
      .mockResolvedValueOnce(membreAjouté());

    await remplirEtCréer([utilisateur('a'), utilisateur('b')]);

    const urls = urlsAppelées();
    expect(urls).toHaveLength(3);
    expect(urls[1]).toMatch(/\/api\/v1\/communities\/comm-1\/members$/);
    expect(urls[2]).toMatch(/\/api\/v1\/communities\/comm-1\/members$/);
    expect([corpsDe(1), corpsDe(2)]).toEqual(
      expect.arrayContaining([{ userId: 'a' }, { userId: 'b' }])
    );
  });

  it('n’appelle pas la route des membres quand la création a échoué', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      réponse(500, { success: false, error: 'boom', message: 'boom' })
    );

    const { rendu } = await remplirEtCréer([utilisateur('a')]);

    expect(rendu).toBeNull();
    expect(urlsAppelées()).toHaveLength(1);
    expect(mockToastError).toHaveBeenCalledWith('boom');
  });

  it('désambiguïse en silence quand l’identifiant dérivé du nom est déjà pris (409)', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(réponse(409, { success: false, error: 'exists', message: 'exists' }))
      .mockResolvedValueOnce(communautéCréée('comm-9', 'mshy_famille-a1b2'));

    const { rendu } = await remplirEtCréer([], { nom: 'Famille' });

    expect(corpsDe(0).identifier).toBeUndefined();
    expect(String(corpsDe(1).identifier)).toMatch(/^famille-[a-z0-9]+$/);
    expect(rendu).toBe('mshy_famille-a1b2');
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('ne parle à personne tant que le nom est vide', async () => {
    const { result } = renderHook(() => useGroupModal('moi'));

    let rendu: string | null = 'pas-encore';
    await act(async () => {
      rendu = await result.current.createGroup();
    });

    expect(rendu).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ne double pas le toast de succès du tableau de bord', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(communautéCréée());

    await remplirEtCréer();

    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});

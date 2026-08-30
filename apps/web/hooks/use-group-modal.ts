import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import type { User } from '@/types';
import { authManager } from '@/services/auth-manager.service';
import { buildApiUrl } from '@/lib/config';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';

/**
 * DÉCISION (#4222) — ce que cette modale crée est une COMMUNAUTÉ, pas une
 * conversation de groupe. Elle postait vers `/groups`, une adresse qu'AUCUNE
 * route du gateway ne sert, puis lisait `data.group.id`, une enveloppe
 * qu'aucune route du dépôt ne rend : chaque tentative retombait dans la
 * branche d'erreur, et la fonctionnalité — entièrement dessinée, entièrement
 * câblée, présente à l'écran — n'avait jamais abouti une seule fois.
 *
 * Ce qui tranche, dans cet ordre :
 *   1. L'INTERFACE le dit déjà, dans les quatre langues servies : titre
 *      « Créer une nouvelle communauté », « Nom de la communauté »,
 *      « Communauté privée », bouton « Créer la communauté », toast
 *      « Communauté créée avec succès ». Seul le CODE disait « groupe ».
 *      Renommer dans l'autre sens réintroduirait le mot « groupe » à côté de
 *      « communauté » dans le même tableau de bord — exactement l'ambiguïté à
 *      lever (dimension 6, cohérence de positionnement).
 *   2. `isPrivate` est un vrai contrôle, avec deux libellés distincts. Il
 *      n'existe que sur `Community` ; le brancher sur `/conversations` le
 *      laisserait INERTE, et un contrôle sans effet n'existe pas.
 *   3. La sortie navigue vers `/groups/:identifier`, qui EST la page
 *      communauté de cette application.
 *   4. `services/groups.service.ts` avait déjà tranché le même mot :
 *      `baseEndpoint = '/communities'`. Un mot, un sens, une source.
 *
 * Et la liste de membres n'était pas l'argument contraire qu'elle paraissait :
 * `POST /communities/:id/members` existe, et le créateur — ADMIN par
 * construction, la route de création l'y inscrit — a le droit de l'appeler.
 */

/** `POST /communities` accepte `identifier` en OPTION et le dérive du nom sinon. */
type ChargeCréationCommunauté = {
  name: string;
  description?: string;
  isPrivate: boolean;
  identifier?: string;
};

/**
 * La forme RÉELLEMENT servie — `sendSuccess(reply, communauté, { statusCode: 201 })`
 * rend `{ success, data }`. Elle est nommée ici plutôt que laissée en `any`
 * implicite de `response.json()` : c'est l'invention d'une enveloppe
 * (`{ group: … }`) qui a rendu cette modale inopérante depuis toujours.
 */
type CommunautéServie = { id?: string; identifier?: string };
type EnveloppeServie = { data?: CommunautéServie };

/** `sendError` rend une enveloppe PLATE : `{ success, error, message, code }`. */
type ErreurServie = { message?: string } | null;

/**
 * Rejoue la règle de `generateIdentifier()` du gateway — mais UNIQUEMENT pour
 * désambiguïser après un 409. Le chemin nominal n'envoie aucun identifiant :
 * c'est le serveur qui le dérive, et il reste la source de vérité.
 *
 * Pourquoi ce détour existe : cette modale n'offre PAS de champ identifiant
 * (celui de la page communautés, si). Sans lui, deux personnes nommant leur
 * communauté « Famille » — le deuxième exemple proposé par le placeholder, dans
 * les quatre langues — voyaient un 409 en anglais et n'avaient aucun moyen d'en
 * sortir. La complexité se paie dans le CODE, jamais chez l'utilisateur.
 */
const identifiantDésambiguïsé = (nom: string): string => {
  const base = nom
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\-_@]/g, '-')
    .replace(/--+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
  const suffixe = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${suffixe}` : suffixe;
};

export function useGroupModal(currentUserId?: string) {
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [isGroupPrivate, setIsGroupPrivate] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const selectedUsersRef = useRef(selectedUsers);

  useEffect(() => {
    selectedUsersRef.current = selectedUsers;
  }, [selectedUsers]);

  const loadUsers = useCallback(
    async (searchQuery: string = '') => {
      setIsLoadingUsers(true);
      try {
        const token = authManager.getAuthToken();
        if (!token) return;

        const trimmedQuery = searchQuery.trim();

        // En deçà de deux caractères, on ne demande RIEN. Le repli visait
        // auparavant `GET /users`, une route qui rendait
        // `{ message: '… to be implemented' }` : le `.filter(...)` ci-dessous
        // levait sur un objet, et la modale affichait « Error loading users ».
        // Ce repli n'a jamais montré personne (#4185).
        if (trimmedQuery.length < 2) {
          setAvailableUsers([]);
          setIsLoadingUsers(false);
          return;
        }

        const url = `${buildApiUrl(API_ENDPOINTS.users.search)}?q=${encodeURIComponent(trimmedQuery)}`;

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          const users = (data.data || data.users || []).filter(
            (fetchedUser: User) =>
              fetchedUser.id !== currentUserId &&
              !selectedUsersRef.current.some((selected) => selected.id === fetchedUser.id)
          );
          setAvailableUsers(users);
        } else {
          console.error('API error:', response.status, response.statusText);
          toast.error('Error loading users');
        }
      } catch (error) {
        console.error('Error loading users:', error);
        toast.error('Error loading users');
      } finally {
        setIsLoadingUsers(false);
      }
    },
    [currentUserId]
  );

  const toggleUserSelection = useCallback((userToToggle: User) => {
    setSelectedUsers((prev) => {
      const isSelected = prev.some((u) => u.id === userToToggle.id);
      if (isSelected) {
        return prev.filter((u) => u.id !== userToToggle.id);
      } else {
        return [...prev, userToToggle];
      }
    });
  }, []);

  const resetForm = useCallback(() => {
    setGroupName('');
    setGroupDescription('');
    setIsGroupPrivate(false);
    setSelectedUsers([]);
    setGroupSearchQuery('');
    setAvailableUsers([]);
  }, []);

  const createGroup = useCallback(async () => {
    if (!groupName.trim()) {
      toast.error('Please enter a community name');
      return null;
    }

    setIsCreatingGroup(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authManager.getAuthToken()}`,
      };
      const name = groupName.trim();
      const description = groupDescription.trim() || undefined;

      const créer = (charge: ChargeCréationCommunauté) =>
        fetch(buildApiUrl(API_ENDPOINTS.communities.root), {
          method: 'POST',
          headers,
          body: JSON.stringify(charge),
        });

      let response = await créer({ name, description, isPrivate: isGroupPrivate });

      // 409 = l'identifiant dérivé du nom est déjà pris. Une seule reprise, avec
      // un identifiant explicite : l'utilisateur ne voit rien, il voit sa
      // communauté. Un second 409 relève, lui, de la branche d'erreur.
      if (response.status === 409) {
        response = await créer({
          name,
          description,
          isPrivate: isGroupPrivate,
          identifier: identifiantDésambiguïsé(name),
        });
      }

      if (!response.ok) {
        const erreur: ErreurServie = await response.json().catch(() => null);
        toast.error(erreur?.message || 'Error creating community');
        return null;
      }

      // La forme SERVIE est `{ success, data }` (`sendSuccess`, 201) — jamais
      // `{ group: … }`, que ce hook lisait et qu'aucune route ne rend.
      const { data: communauté } = ((await response.json()) ?? {}) as EnveloppeServie;
      if (!communauté?.id) {
        toast.error('Error creating community');
        return null;
      }

      // Les membres viennent APRÈS : `POST /communities` n'en accepte aucun.
      // `allSettled` parce qu'un refus sur un membre ne doit pas effacer une
      // communauté qui, elle, existe désormais — on dit combien manquent.
      const refusés = (
        await Promise.allSettled(
          selectedUsers.map((membre) =>
            fetch(buildApiUrl(API_ENDPOINTS.communities.byIdMembers(communauté.id)), {
              method: 'POST',
              headers,
              body: JSON.stringify({ userId: membre.id }),
            }).then((r) => {
              if (!r.ok) throw new Error(String(r.status));
            })
          )
        )
      ).filter((issue) => issue.status === 'rejected').length;

      if (refusés > 0) {
        toast.error(`Community created, but ${refusés} member(s) could not be added`);
      }

      resetForm();

      // Le segment de `/groups/[identifier]` porte bien un IDENTIFIER : le
      // rendre évite au tableau de bord une résolution par le réseau. L'id
      // reste un repli — `GET /communities/:id` accepte les deux formes.
      return communauté.identifier ?? communauté.id;
    } catch (error) {
      console.error('Error creating community:', error);
      toast.error('Error creating community');
      return null;
    } finally {
      setIsCreatingGroup(false);
    }
  }, [groupName, groupDescription, isGroupPrivate, selectedUsers, resetForm]);

  return {
    groupName,
    setGroupName,
    groupDescription,
    setGroupDescription,
    isGroupPrivate,
    setIsGroupPrivate,
    availableUsers,
    selectedUsers,
    groupSearchQuery,
    setGroupSearchQuery,
    isLoadingUsers,
    isCreatingGroup,
    loadUsers,
    toggleUserSelection,
    resetForm,
    createGroup,
  };
}

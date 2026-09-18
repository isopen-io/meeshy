import { minutesAgo, portraitStandIn, VIEWER_ID } from './fixtures-base';
import type { FriendRequestAction, FriendRequestBucket, FriendRequestRecord, PersonSummary } from './friend-requests';
import type { ApiResult } from './http';

/**
 * **LE CORPUS DE RECETTE DE LA DÉCOUVERTE** (#6363, #6321) — trois demandes
 * REÇUES (le compte que la pastille du barreau « Découvrir » et le profil
 * portent), une ENVOYÉE, un CONTACT, une personne BLOQUÉE, et deux inconnus
 * que la recherche rend sans relation.
 *
 * Les noms reprennent ceux des autres corpus (`fixtures-base.ts`) ; aucun des
 * nouveaux ne contient « am », la recherche que `check-list-actions.mjs` tape
 * sur « Nouvelle conversation », qui lit le même port de recherche.
 *
 * `state` mémorise, pour la durée du processus, ce que la passerelle SIMULÉE a
 * enregistré — même discipline que `fixtures-notifications.ts` : une page relue
 * après un geste le reflète, et `resetFixtureFriendsForTests` évite qu'un
 * témoin dépende d'un autre.
 */

/**
 * `avatar` (#6975) — le corpus servait `avatar: null` pour TOUT LE MONDE, donc
 * aucun témoin ne pouvait distinguer « la surface ne sert pas la photo » de
 * « ce compte n'en a pas ». Les personnes du corpus en portent donc une, sauf
 * celles qui reçoivent explicitement `null` — le contre-témoin, indispensable :
 * sans lui, un `<img src="">` posé inconditionnellement passerait pour juste.
 */
const person = (id: string, username: string, displayName: string, avatar: string | null = portraitStandIn('#60a5fa', '#1e40af')): PersonSummary => ({
  id,
  username,
  displayName,
  avatar,
});

export const FIXTURE_PEOPLE = {
  amina: person('u-amina', 'amina.diallo', 'Amina Diallo'),
  kwame: person('u-kwame', 'kwame.mensah', 'Kwame Mensah'),
  fatou: person('u-fatou', 'fatou.ba', 'Fatou Bâ'),
  chloe: person('u-chloe', 'chloe.dubois', 'Chloé Dubois'),
  bruno: person('u-bruno', 'bruno.laurent', 'Bruno Laurent'),
  yann: person('u-yann', 'yann.legoff', 'Yann Le Goff'),
  lea: person('u-lea', 'lea.martin', 'Léa Martin'),
  /** LE CONTRE-TÉMOIN : un compte SANS photo — la surface doit y rendre ses initiales. */
  idris: person('u-idris', 'idris.sow', 'Idris Sow', null),
} as const;

const VIEWER_PARTY = person(VIEWER_ID, 'vous', 'Vous');

type Seed = {
  readonly id: string;
  readonly other: PersonSummary;
  readonly incoming: boolean;
  readonly status: string;
  readonly message: string | null;
  readonly minutes: number;
};

const record = ({ id, other, incoming, status, message, minutes }: Seed): FriendRequestRecord => ({
  id,
  senderId: incoming ? other.id : VIEWER_ID,
  receiverId: incoming ? VIEWER_ID : other.id,
  status,
  message,
  createdAt: minutesAgo(minutes).toISOString(),
  sender: incoming ? other : VIEWER_PARTY,
  receiver: incoming ? VIEWER_PARTY : other,
});

type State = {
  readonly received: readonly FriendRequestRecord[];
  readonly sent: readonly FriendRequestRecord[];
  readonly accepted: readonly FriendRequestRecord[];
  readonly blocked: readonly PersonSummary[];
};

const initialState = (): State => ({
  received: [
    record({
      id: 'fx-fr-amina',
      other: FIXTURE_PEOPLE.amina,
      incoming: true,
      status: 'pending',
      message: 'On s’est croisées au meetup de Dakar, ravie de te retrouver ici !',
      minutes: 12,
    }),
    record({ id: 'fx-fr-kwame', other: FIXTURE_PEOPLE.kwame, incoming: true, status: 'pending', message: null, minutes: 180 }),
    record({ id: 'fx-fr-fatou', other: FIXTURE_PEOPLE.fatou, incoming: true, status: 'pending', message: null, minutes: 60 * 26 }),
  ],
  sent: [record({ id: 'fx-fr-chloe', other: FIXTURE_PEOPLE.chloe, incoming: false, status: 'pending', message: null, minutes: 60 * 5 })],
  accepted: [
    record({ id: 'fx-fr-bruno', other: FIXTURE_PEOPLE.bruno, incoming: true, status: 'accepted', message: null, minutes: 60 * 24 * 20 }),
  ],
  blocked: [FIXTURE_PEOPLE.yann],
});

let state: State = initialState();

export function resetFixtureFriendsForTests(): void {
  state = initialState();
}

export function fixtureFriendRequests(bucket: FriendRequestBucket): readonly FriendRequestRecord[] {
  return state[bucket];
}

export function fixtureBlockedUsers(): readonly PersonSummary[] {
  return state.blocked;
}

const notFound = { ok: false, status: 404, error: 'Demande introuvable ou déjà traitée' } as const;

export function fixtureRespondFriendRequest(id: string, action: FriendRequestAction): ApiResult<FriendRequestRecord | null> {
  const from: 'received' | 'sent' = action === 'cancel' ? 'sent' : 'received';
  const request = state[from].find((row) => row.id === id);
  if (request === undefined) return notFound;
  const remaining = state[from].filter((row) => row.id !== id);
  if (action !== 'accept') {
    state = { ...state, [from]: remaining };
    return { ok: true, data: null };
  }
  const accepted = { ...request, status: 'accepted' };
  state = { ...state, [from]: remaining, accepted: [accepted, ...state.accepted] };
  return { ok: true, data: accepted };
}

export function fixtureSendFriendRequest(receiverId: string): ApiResult<FriendRequestRecord> {
  const other = Object.values(FIXTURE_PEOPLE).find((candidate) => candidate.id === receiverId);
  if (other === undefined) return { ok: false, status: 404, error: 'Utilisateur introuvable' };
  if (state.sent.some((row) => row.receiverId === receiverId)) return { ok: false, status: 409, error: 'Demande déjà envoyée' };
  const created = record({ id: `fx-fr-sent-${receiverId}`, other, incoming: false, status: 'pending', message: null, minutes: 0 });
  state = { ...state, sent: [created, ...state.sent] };
  return { ok: true, status: 201, data: created };
}

export function fixtureUnblockUser(userId: string): ApiResult<null> {
  state = { ...state, blocked: state.blocked.filter((candidate) => candidate.id !== userId) };
  return { ok: true, data: null };
}

export function fixtureSearchPeople(query: string): readonly PersonSummary[] {
  const needle = query.trim().toLocaleLowerCase('fr');
  if (needle.length < 2) return [];
  return Object.values(FIXTURE_PEOPLE).filter((candidate) =>
    [candidate.displayName ?? '', candidate.username].some((text) => text.toLocaleLowerCase('fr').includes(needle)),
  );
}

export function fixtureSendEmailInvitation(email: string): ApiResult<unknown> {
  return email.toLocaleLowerCase('fr').endsWith('@meeshy.me')
    ? { ok: false, status: 409, error: 'Cet utilisateur est deja sur Meeshy', code: 'USER_ALREADY_EXISTS' }
    : { ok: true, status: 201, data: { email, sentAt: new Date().toISOString() } };
}

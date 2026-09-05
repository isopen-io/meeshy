import type { IncomingMessage } from 'node:http';

import { MEMBRE, PAIR_HISPANOPHONE } from './bouchon-monde';
import type { Identite } from './bouchon-socket';

/**
 * `GET /api/v1/directory/people/:handle?expand=relation` — LE profil public,
 * copié sur `services/gateway/src/routes/directory/person.ts:175`
 * (`onRequest: [getOptionalAuth]`, donc servi AUSSI à un lecteur sans jeton).
 *
 * EXTRAIT de `bouchon-compte.ts` (#5030) : ce fichier avait franchi le budget
 * (1171 lignes, plafond dur 1200) et la règle du dépôt interdit d'ajouter à un
 * fichier hors budget — on extrait d'abord, on ajoute ensuite. La coupe suit
 * une RESPONSABILITÉ, pas une tranche : l'annuaire et ses fiches d'un côté, le
 * reste du compte de l'autre.
 *
 * Ce que le bouchon ne copiait PAS, et qui est la raison de l'extraction : la
 * RELATION. Il servait `{ relation:'none', isSelf:false }` à TOUT appelant,
 * là où `relationAvec` (`person.ts:72-94`) rend `{ relation:'self',
 * isSelf:true }` dès que le lecteur demande SON PROPRE handle. Un vert obtenu
 * contre ce bouchon ne prouvait rien de la branche « c'est vous ».
 */

/**
 * `publicProfileSchema` (`routes/users/public-profile.ts:88-110`) — AUCUNE
 * langue (retirée depuis #4161 : la ligne de langue du panneau vient du FIL)
 * et AUCUNE présence (sans `expand=presence`, jamais demandé par ce module).
 */
type FicheDuBouchon = {
  readonly id: string;
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName: string;
  readonly avatar: null;
  readonly banner: null;
  readonly bio: string;
  readonly role: string;
  readonly createdAt: string;
  readonly voicePublic: boolean;
  readonly voiceSampleUrl: null;
  readonly voiceSampleDurationMs: null;
  readonly voiceQuality: null;
  readonly isAnonymous: boolean;
  readonly isMeeshyer: boolean;
};

const fiche = (attributs: Pick<FicheDuBouchon, 'id' | 'username' | 'firstName' | 'lastName' | 'displayName' | 'bio' | 'createdAt'>): FicheDuBouchon => ({
  avatar: null,
  banner: null,
  role: 'USER',
  voicePublic: false,
  voiceSampleUrl: null,
  voiceSampleDurationMs: null,
  voiceQuality: null,
  isAnonymous: false,
  isMeeshyer: true,
  ...attributs,
});

export const PROFIL_DE_MARTA = fiche({
  id: PAIR_HISPANOPHONE.id,
  username: 'marta',
  firstName: 'Marta',
  lastName: 'Ruiz',
  displayName: PAIR_HISPANOPHONE.nom,
  bio: 'Traductrice · Madrid. Je relis les revues trimestrielles.',
  createdAt: '2024-03-01T00:00:00.000Z',
});

/**
 * LA FICHE DU LECTEUR LUI-MÊME (#5030) — celle que la route sert quand le
 * membre demande SON handle depuis le fil (`?profil=<mon id>`). Elle existe
 * pour que la branche « c'est vous » soit ATTEIGNABLE au navigateur : sans
 * elle, le bouchon rendait 404 sur le seul handle que le lecteur peut atteindre
 * en un geste.
 */
export const PROFIL_DU_MEMBRE = fiche({
  id: MEMBRE.id,
  username: 'amina',
  firstName: 'Amina',
  lastName: 'Diallo',
  displayName: MEMBRE.nom,
  bio: 'Cheffe de projet · Lagos.',
  createdAt: '2024-01-15T00:00:00.000Z',
});

const FICHES: readonly FicheDuBouchon[] = [PROFIL_DE_MARTA, PROFIL_DU_MEMBRE];

/**
 * `relationAvec` (`person.ts:72-94`), aux deux cas que ce monde connaît : le
 * bouchon n'a aucune `friendRequest`, donc tout tiers reste `none` — comme
 * là-bas. Un lecteur SANS jeton reçoit `none` lui aussi, et c'est voulu : « dire
 * je ne sais pas ici apprendrait au client un troisième cas qui n'existe pas ».
 */
const relationAvec = (viewerId: string | undefined, cibleId: string): { relation: string; isSelf: boolean } => {
  if (viewerId === undefined) return { relation: 'none', isSelf: false };
  if (viewerId === cibleId) return { relation: 'self', isSelf: true };
  return { relation: 'none', isSelf: false };
};

/** Seul un MEMBRE est un viewer au sens de `getOptionalAuth` — un invité de lien n'a pas de `User.id`. */
const viewerDe = (identite: Identite | null): string | undefined =>
  identite !== null && identite.genre === 'membre' ? MEMBRE.id : undefined;

/**
 * Rend `true` quand le chemin est celui de l'annuaire — et alors la réponse est
 * SERVIE (200 ou 404), AVANT la garde d'authentification de `routesDuCompte` :
 * `getOptionalAuth` laisse passer un lecteur sans jeton (§ 12.10.3 point 4).
 */
export const serviParLAnnuaire = ({
  chemin,
  requete,
  creanceDe,
  json,
}: {
  readonly chemin: string;
  readonly requete: IncomingMessage;
  readonly creanceDe: (requete: IncomingMessage) => Identite | null;
  readonly json: (charge: unknown, statut?: number) => void;
}): boolean => {
  const handle = /^\/api\/v1\/directory\/people\/([^/]+)$/.exec(chemin)?.[1];
  if (handle === undefined) return false;

  const cible = decodeURIComponent(handle);
  const trouvee = FICHES.find((item) => item.id === cible || item.username === cible);
  if (trouvee === undefined) {
    json({ success: false, error: 'NOT_FOUND', message: 'Profil introuvable' }, 404);
    return true;
  }
  json({ success: true, data: { ...trouvee, ...relationAvec(viewerDe(creanceDe(requete)), trouvee.id) } });
  return true;
};

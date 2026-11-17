/**
 * Le lien d'une FICHE Meeshy collé dans un message (#18865) : `https://meeshy.me/u/<pseudo>`
 * ou l'adresse courte `https://meeshy.me/@<pseudo>`, en production comme en staging.
 *
 * Un client qui reconnaît ce lien ne va pas chercher son Open Graph sur la page publique
 * (qui ne nomme personne, #10205) : il demande la carte du LECTEUR connecté à
 * `GET /api/v1/directory/people/:handle?via=link`, la porte de la fiche.
 *
 * Fail-closed : un autre hôte, un autre schéma, un second segment ou un pseudo hors du motif
 * de l'inscription ne lisent rien.
 */

import { usernamePatternSource } from '../types/api-schemas/auth.js';

export const PERSON_LINK_HOSTS: ReadonlySet<string> = new Set(['meeshy.me', 'www.meeshy.me', 'staging.meeshy.me']);

const USERNAME = new RegExp(usernamePatternSource);
const USERNAME_MAX = 64;
const PROFILE_PATH = /^\/(?:u\/|@)([^/]+)\/?$/;

export function personHandleFromLink(link: string): string | null {
  const url = ((): URL | null => {
    try {
      return new URL(link.trim());
    } catch {
      return null;
    }
  })();
  if (url === null || url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return null;
  if (!PERSON_LINK_HOSTS.has(url.hostname.toLowerCase())) return null;
  const handle = PROFILE_PATH.exec(url.pathname)?.[1];
  if (handle === undefined || handle.length > USERNAME_MAX || !USERNAME.test(handle)) return null;
  return handle;
}

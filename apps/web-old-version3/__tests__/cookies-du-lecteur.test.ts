/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { COOKIE_DE_JETON, COOKIE_DE_SESSION, valeurDuCookie } from '../lib/api/cookies';
import { CHEMIN_DU_COOKIE, cookieDEffacement, cookieDeSession, jetonDuCookie, nomDuCookie, type CleDeLien } from '../lib/api/guest-session';
import { aUneSession, jetonDuLecteur } from '../app/session';

/**
 * LES COOKIES — ce que le serveur SAIT d'un lecteur (`app/session.ts`), et ce
 * que le module de participation lit pour s'authentifier au socket : UN site
 * de lecture (`lib/api/cookies.ts`), une projection de la place invitée sur un
 * cookie PORTÉ AU LIEN (`lib/api/guest-session.ts`, conception § 12.3).
 */

const LIEN = 'mshy_lagos' as CleDeLien;

describe('la lecture d’un cookie', () => {
  it('trouve la valeur, décodée, quel que soit son rang', () => {
    expect(valeurDuCookie('a=1; meeshy_auth=J%20W; b=2', COOKIE_DE_JETON)).toBe('J W');
    expect(valeurDuCookie('meeshy_session=s', COOKIE_DE_SESSION)).toBe('s');
  });

  it('rend null sur une absence, une valeur vide, ou un préfixe qui ressemble', () => {
    expect(valeurDuCookie(null, COOKIE_DE_JETON)).toBeNull();
    expect(valeurDuCookie('meeshy_auth=', COOKIE_DE_JETON)).toBeNull();
    expect(valeurDuCookie('meeshy_auth_token=x', COOKIE_DE_JETON)).toBeNull();
  });

  it('sert la valeur brute quand elle ne se décode pas — c’est à la passerelle de refuser', () => {
    expect(valeurDuCookie('meeshy_auth=100%', COOKIE_DE_JETON)).toBe('100%');
  });

  it('est le site que app/session.ts consomme', () => {
    const requete = new Request('https://meeshy.me/', { headers: { cookie: 'meeshy_session=s; meeshy_auth=J' } });
    expect(aUneSession(requete)).toBe(true);
    expect(jetonDuLecteur(requete)).toBe('J');
  });
});

describe('le cookie de la place invitée', () => {
  it('porte le NOM du lien, un chemin qui ne couvre que la porte de l’invité, et aucune durée', () => {
    const valeur = cookieDeSession({ lien: LIEN, jeton: 'S 1', secure: true });
    expect(valeur).toBe('meeshy_guest_mshy_lagos=S%201; Path=/chat; SameSite=Lax; Secure');
    expect(valeur).not.toContain('Max-Age');
    expect(valeur).not.toContain('HttpOnly');
    expect(CHEMIN_DU_COOKIE).toBe('/chat');
  });

  it('ne réclame Secure qu’en HTTPS — le développement local est en clair', () => {
    expect(cookieDeSession({ lien: LIEN, jeton: 'S', secure: false })).not.toContain('Secure');
  });

  it('s’efface par un acte NOMMÉ, et par lui seul', () => {
    expect(cookieDEffacement({ lien: LIEN, secure: true })).toBe('meeshy_guest_mshy_lagos=; Max-Age=0; Path=/chat; SameSite=Lax; Secure');
  });

  /** Deux liens dont l'un est le PRÉFIXE de l'autre restent deux places (§ 6.3.E). */
  it('se lit par ÉGALITÉ de nom, jamais par préfixe', () => {
    const entete = `${nomDuCookie('mshy_support-link' as CleDeLien)}=B; ${nomDuCookie('mshy_support' as CleDeLien)}=A`;
    expect(jetonDuCookie(entete, 'mshy_support' as CleDeLien)).toBe('A');
    expect(jetonDuCookie(entete, 'mshy_support-link' as CleDeLien)).toBe('B');
    expect(jetonDuCookie(entete, 'mshy_autre' as CleDeLien)).toBeNull();
    expect(jetonDuCookie(entete, '' as CleDeLien)).toBeNull();
  });
});

/**
 * LE NOM DU COOKIE NE S'ÉCRIT QU'ICI. `meeshy_guest_` composé ailleurs serait
 * la jumelle qui dérive — et la remise du legacy (`clearAllSessions`) efface
 * tout nom qui commence par `meeshy`, ce qui suppose que le nôtre commence
 * ainsi.
 */
describe('le nom du cookie, source unique', () => {
  it('commence par meeshy — la déconnexion du legacy l’emporte', () => {
    expect(nomDuCookie(LIEN).startsWith('meeshy')).toBe(true);
  });

  it('n’est composé nulle part ailleurs dans la zone', () => {
    const racine = join(__dirname, '..');
    const fichiers = ['app/session.ts', 'app/(public)/chat/[lien]/route.ts', 'lib/realtime/participate.ts', 'app/authentification/remise.ts'];
    fichiers.forEach((fichier) => {
      expect(readFileSync(join(racine, fichier), 'utf8')).not.toContain('meeshy_guest_');
    });
  });
});

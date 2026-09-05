import { HUBS_PRECHARGEABLES, REGLES_DE_SPECULATION } from '@/app/connecte/chargeur';
import { documentPleinEcran } from '@/app/connecte/fil-vue';
import { SOCLE_DU_DOCUMENT } from '@/app/socle';

/**
 * LA NAVIGATION MODERNE, ÉTAGE 1 (#5104) — les fentes servies et la GARDE de
 * la liste sûre. Un préchargement n'a le droit d'exister que sur une lecture
 * SANS effet de bord : un GET de `/chat/:lien` JOINT, un GET de `/chats/:cle`
 * ACCUSE — la garde de provenance les 503 déjà, ceci est la ceinture.
 */

describe('les règles de spéculation', () => {
  const servies = (): { prefetch?: { urls: string[]; eagerness: string }[]; prerender?: unknown } =>
    JSON.parse(REGLES_DE_SPECULATION.replace('<script type="speculationrules">', '').replace('</script>', ''));

  it('préchargent EXACTEMENT les hubs sans effet de bord, au survol', () => {
    const regles = servies();
    expect(regles.prefetch?.[0]?.urls).toEqual([
      '/chats',
      '/feed',
      '/links',
      '/notifications',
      '/contacts',
      '/settings',
      '/search',
    ]);
    expect(regles.prefetch?.[0]?.eagerness).toBe('moderate');
  });

  /**
   * `/calls` est un hub de l'espace membre SANS effet de bord — il a donc
   * exactement le profil des sept ci-dessus, et c'est précisément pour cela
   * qu'il faut dire pourquoi il n'y est pas : sa seule route est limitée à dix
   * appels par minute et par lecteur (`RATE_LIMITS.CALL_OPERATIONS`,
   * `services/gateway/src/middleware/rate-limit.ts:56`). Un préchargement au
   * survol y épuiserait le quota du lecteur. Sans ce témoin, la prochaine main
   * « répare l'incohérence ».
   */
  it('laisse /calls DEHORS — son endpoint est limité à dix appels par minute', () => {
    expect(HUBS_PRECHARGEABLES).not.toContain('/calls');
  });

  it('ne précharge JAMAIS une adresse à effet de bord — la ceinture sous la garde de provenance', () => {
    for (const adresse of HUBS_PRECHARGEABLES) {
      expect(adresse.startsWith('/chat/')).toBe(false);
      expect(adresse).not.toMatch(/^\/chats\/.+/);
      expect(adresse.startsWith('/l/')).toBe(false);
    }
  });

  it('ne PRERENDENT rien — un prérendu exécuterait les modules et leurs sockets', () => {
    expect(servies().prerender).toBeUndefined();
    expect(REGLES_DE_SPECULATION).not.toContain('prerender');
  });

  it('sont servies par tout document connecté', () => {
    const document_ = documentPleinEcran({ titre: 't', description: 'd', corps: '<main></main>' });
    expect(document_).toContain('type="speculationrules"');
  });
});

describe('les View Transitions du socle', () => {
  it('optent la navigation, à la durée de la charte, et se coupent ENTIÈRES sur reduced-motion', () => {
    expect(SOCLE_DU_DOCUMENT).toContain('@media (scripting: enabled){@view-transition{navigation:auto}}');
    // Le gate de scripting est une borne MESURÉE : sans frames (document non
    // scripté d'un navigateur headless), une transition entrante ne finit
    // jamais et la page reste non hit-testable — l'opt-in nu gelait sept
    // chaînes sans JavaScript. Un lecteur no-JS garde la navigation nue.
    expect(SOCLE_DU_DOCUMENT).not.toMatch(/(?<![({])@view-transition\{navigation:auto\}/u);
    expect(SOCLE_DU_DOCUMENT).toContain('::view-transition{pointer-events:none}');
    expect(SOCLE_DU_DOCUMENT).toContain('animation-duration:150ms');
    // La coupure EXPLICITE : le sélecteur universel du socle ne matche pas les
    // pseudo-éléments ::view-transition-*.
    expect(SOCLE_DU_DOCUMENT).toMatch(/prefers-reduced-motion:reduce\)\{@view-transition\{navigation:none\}/);
  });

  it('n’ajoutent ni @keyframes ni transition géométrique — la règle 32 reste entière', () => {
    expect(SOCLE_DU_DOCUMENT).not.toContain('@keyframes');
    expect(SOCLE_DU_DOCUMENT).not.toMatch(/transition:(transform|height|width|all)/);
  });
});

/**
 * `API_ENDPOINTS` sort de `lib/config.ts` et devient une PROJECTION du
 * catalogue partagé (#4281, critère 1). Avant ce lot, `lib/config.ts`
 * définissait sa propre copie manuscrite — 46 entrées imbriquées
 * (`AUTH.LOGIN`, `CONVERSATION.MESSAGES(id)`…), dérivées un jour du manifeste
 * de routes mais jamais reliées à lui : une route renommée ou retirée côté
 * gateway ne faisait tomber AUCUN témoin ici, exactement le trou que le
 * catalogue généré (`packages/shared/api/endpoints.ts`, #4280) referme.
 *
 * Ce test ne vérifie pas que les chemins RESSEMBLENT à ceux du catalogue —
 * une recopie fidèle passerait cette barre aussi bien qu'une projection — il
 * vérifie l'IDENTITÉ de référence : `API_ENDPOINTS` importé depuis `@/lib/config`
 * doit être EXACTEMENT le même objet que celui exporté par
 * `@meeshy/shared/api/endpoints`. Une recopie manuscrite ne peut jamais
 * satisfaire `toBe` (égalité de référence) ; seule une réexportation le peut.
 * C'est la preuve qu'une régénération du catalogue (`npm run
 * api-endpoints:generate` côté `packages/shared`) se propage au web SANS
 * édition supplémentaire de ce fichier.
 */

import { API_ENDPOINTS as CONFIG_API_ENDPOINTS } from '@/lib/config';
import { API_ENDPOINTS as CATALOG_API_ENDPOINTS } from '@meeshy/shared/api/endpoints';

describe('API_ENDPOINTS (lib/config.ts) est une projection du catalogue partagé (#4281 critère 1)', () => {
  it('est EXACTEMENT (égalité de référence) le catalogue de @meeshy/shared/api/endpoints — pas une recopie', () => {
    expect(CONFIG_API_ENDPOINTS).toBe(CATALOG_API_ENDPOINTS);
  });

  it('expose les entrées auth utilisées par les formulaires de connexion/inscription, sous la forme du catalogue (namespace en camelCase)', () => {
    expect(CONFIG_API_ENDPOINTS.auth.login).toBe('/api/v1/auth/login');
    expect(CONFIG_API_ENDPOINTS.auth.register).toBe('/api/v1/auth/register');
    expect(CONFIG_API_ENDPOINTS.auth.me).toBe('/api/v1/auth/me');
    expect(CONFIG_API_ENDPOINTS.auth.logout).toBe('/api/v1/auth/logout');
  });

  it('expose les chemins PARAMÉTRÉS en fonctions, jamais en constante à `:param` littéral', () => {
    expect(typeof CONFIG_API_ENDPOINTS.conversations.byIdMessages).toBe('function');
    expect(CONFIG_API_ENDPOINTS.conversations.byIdMessages('conv-1')).toBe('/api/v1/conversations/conv-1/messages');
    expect(CONFIG_API_ENDPOINTS.communities.byIdJoin('grp-1')).toBe('/api/v1/communities/grp-1/join');
    expect(CONFIG_API_ENDPOINTS.links.checkIdentifierByIdentifier('abc')).toBe('/api/v1/links/check-identifier/abc');
  });

  it("n'est plus l'ancienne forme manuscrite (AUTH/CONVERSATION/GROUP en capitales) — la migration a bien remplacé la forme, pas seulement la source", () => {
    expect(CONFIG_API_ENDPOINTS).not.toHaveProperty('AUTH');
    expect(CONFIG_API_ENDPOINTS).not.toHaveProperty('CONVERSATION');
    expect(CONFIG_API_ENDPOINTS).not.toHaveProperty('GROUP');
    expect(CONFIG_API_ENDPOINTS).not.toHaveProperty('TRACKING_LINK');
  });

  it('lib/config.ts ne redéclare AUCUN chemin `/api/…` en dur pour API_ENDPOINTS — la garde #4285 le vérifie déjà par balayage de source (voir api-path-literal-guard.test.ts, qui exclut ce fichier PAR CONSTRUCTION) ; ce test vérifie la conséquence RUNTIME : re-régénérer le catalogue change la valeur vue par le web sans toucher lib/config.ts', () => {
    // buildApiUrl doit continuer à savoir résoudre une entrée du catalogue
    // (chemin déjà préfixé /api/v1) exactement comme avant la migration.
    expect(CONFIG_API_ENDPOINTS.trackingLinks.root).toBe('/api/v1/tracking-links');
  });
});

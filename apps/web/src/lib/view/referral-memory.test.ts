import { describe, expect, test } from 'bun:test';

import {
  REFERRAL_MEMORY_KEY,
  REFERRAL_MEMORY_TTL_MS,
  forgetReferralCode,
  recallReferralCode,
  rememberReferralCode,
  type StorageLike,
} from './referral-memory';

/**
 * LE CODE D'INVITATION SURVIT À LA NAVIGATION (#6584, REPRIS DU LEGACY).
 *
 * Relevé dans `apps/web` — la version qui sert meeshy.me — et qui manquait à la
 * première écriture de ce lot : `app/signup/affiliate/[token]/page.tsx` ÉCRIT
 * le jeton en `localStorage` ET en cookie 30 jours, et
 * `use-registration-submit.ts` le relit à l'inscription, même des jours plus
 * tard. Ne lire que l'adresse au chargement de `/signup` aurait perdu tout
 * parrainage de quelqu'un qui clique l'invitation, regarde l'accueil, et
 * s'inscrit le lendemain — c'est-à-dire le cas NOMINAL d'un lien partagé.
 *
 * La CLÉ est celle du legacy (`meeshy_affiliate_token`) : même vocabulaire, et
 * le jour où `apps/web-v2` devient `apps/web`, les jetons déjà posés dans les
 * navigateurs sont relus au lieu d'être jetés.
 *
 * Le magasin est INJECTÉ, comme `createReadingModeStore` (`lib/reading-mode/store.ts`) :
 * un témoin qui dépend de `window.localStorage` mesure l'environnement autant
 * que la règle.
 */

function fakeStorage(initial?: Readonly<Record<string, string>>): StorageLike {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe('se souvenir, relire, oublier', () => {
  test('sans rien de mémorisé : la chaîne vide', () => {
    expect(recallReferralCode(fakeStorage())).toBe('');
  });

  test('un code mémorisé se relit', () => {
    const store = fakeStorage();
    rememberReferralCode('aff_abc123', store);
    expect(recallReferralCode(store)).toBe('aff_abc123');
  });

  test('oublier l’efface — appelé une fois le parrainage noué', () => {
    const store = fakeStorage();
    rememberReferralCode('aff_abc123', store);
    forgetReferralCode(store);
    expect(recallReferralCode(store)).toBe('');
  });

  test('un code VIDE n’écrit rien — mémoriser « rien » effacerait un code déjà posé', () => {
    const store = fakeStorage();
    rememberReferralCode('aff_abc123', store);
    rememberReferralCode('   ', store);
    expect(recallReferralCode(store)).toBe('aff_abc123');
  });
});

describe('la péremption — ce que le legacy n’a PAS', () => {
  /**
   * Le legacy pose un cookie à 30 jours ET un `localStorage` SANS échéance :
   * le cookie expire, la copie locale jamais. Un jeton y survit indéfiniment et
   * s'attache à une inscription faite des mois après la visite. Ici l'échéance
   * est PORTÉE par la valeur, donc rien ne lui survit.
   */
  test('passé le délai, le code est oublié — et la ligne est nettoyée', () => {
    const store = fakeStorage({
      [REFERRAL_MEMORY_KEY]: JSON.stringify({ code: 'aff_vieux', savedAt: Date.now() - REFERRAL_MEMORY_TTL_MS - 1 }),
    });
    expect(recallReferralCode(store)).toBe('');
    expect(store.getItem(REFERRAL_MEMORY_KEY)).toBeNull();
  });

  test('juste avant le délai, il est encore là', () => {
    const store = fakeStorage({
      [REFERRAL_MEMORY_KEY]: JSON.stringify({ code: 'aff_recent', savedAt: Date.now() - REFERRAL_MEMORY_TTL_MS + 60_000 }),
    });
    expect(recallReferralCode(store)).toBe('aff_recent');
  });
});

describe('ce qui ne doit JAMAIS jeter', () => {
  /** Navigation privée, stockage bloqué, ligne écrite par une autre version :
   * la lecture rend `''` et l'écriture ne fait rien. Un parrainage perdu est un
   * désagrément ; une inscription qui plante est un compte perdu. */
  test('une ligne ILLISIBLE rend la chaîne vide au lieu de jeter', () => {
    expect(recallReferralCode(fakeStorage({ [REFERRAL_MEMORY_KEY]: 'ceci n’est pas du JSON' }))).toBe('');
  });

  test('un magasin qui JETTE (navigation privée) ne fait pas tomber l’écran', () => {
    const qui_jette: StorageLike = {
      getItem: () => {
        throw new Error('stockage bloqué');
      },
      setItem: () => {
        throw new Error('stockage bloqué');
      },
      removeItem: () => {
        throw new Error('stockage bloqué');
      },
    };
    expect(recallReferralCode(qui_jette)).toBe('');
    expect(() => rememberReferralCode('aff_abc', qui_jette)).not.toThrow();
    expect(() => forgetReferralCode(qui_jette)).not.toThrow();
  });

  /** `apps/web` écrit `localStorage.setItem('meeshy_affiliate_token', token)` :
   * une CHAÎNE nue, pas un objet. Un visiteur venu du legacy garde son
   * parrainage. */
  test('une ligne du LEGACY — le jeton nu, sans échéance — est relue telle quelle', () => {
    expect(recallReferralCode(fakeStorage({ [REFERRAL_MEMORY_KEY]: 'aff_dulegacy' }))).toBe('aff_dulegacy');
  });
});

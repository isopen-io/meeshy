/**
 * Garde de source — le vestige `refreshToken` (stockage client) ne revient pas (#4405, étape 3).
 *
 * ## Ce que #4405 a mesuré
 *
 * Aucune route d'authentification du gateway ne rend jamais de champ
 * `refreshToken` (mesuré sur les quatre chemins : login, magic-link, 2FA,
 * `/auth/refresh` — `services/gateway/src/routes/auth/`). Donc
 * `AuthManager.getRefreshToken()` retournait STRUCTURELLEMENT `null` en
 * usage réel, et `AUTH_STORAGE_KEYS.REFRESH_TOKEN` n'avait aucun producteur.
 * `980ea2b534` (#4404) a d'abord vidé la case : les trois chemins qui
 * rangeaient encore leur VRAI `sessionToken` sous cette clé par erreur de
 * position ont été corrigés — ce qui a rendu le retrait de la clé SÛR.
 * Ce lot retire la clé, son accesseur et le champ d'état réactif qui la
 * reflétait dans le store Zustand.
 *
 * ## Ce que ce garde interdit — et ce qu'il laisse volontairement passer
 *
 * `refreshToken` (bare, camelCase) est un identifiant SURCHARGÉ dans ce
 * dépôt : `AuthService.refreshToken(sessionToken?)` (méthode LÉGITIME,
 * appelle réellement `POST /auth/refresh` — la fenêtre glissante de session,
 * étape 2 de #4405, hors territoire de ce lot) et
 * `hooks/use-fcm-notifications.ts` (jeton FCM, domaine disjoint) doivent
 * SURVIVRE. `AuthManager.setCredentials` / `updateTokens` et le store
 * (`setTokens`) continuent eux aussi d'ACCEPTER un champ `refreshToken?:
 * string` — nommé, plus jamais positionnel depuis #4450 (`setCredentials`)
 * et #4491 (`updateTokens`, `setTokens`) : trois appelants réels le
 * transportent encore sous ce nom (`auth.service.ts`, `magic-link.service.ts`,
 * `two-factor.service.ts`, tous vers `setCredentials`), et
 * `auth.service.test.ts` (« threads a refreshToken through
 * to its own slot when the server does send one ») verrouille EXPLICITEMENT
 * que ce champ doit continuer d'exister si le serveur envoie un jour cette
 * valeur — le transport du champ n'est pas le vestige, seule sa
 * PERSISTANCE l'était. Un `\brefreshToken\b` bare attraperait donc trois
 * usages légitimes en plus du vestige réel : ce garde interdit à la place
 * deux identifiants NON AMBIGUS, chacun garanti sans second sens dans ce
 * dépôt — `REFRESH_TOKEN` (la clé de stockage, sous toutes ses formes :
 * définition dans `AUTH_STORAGE_KEYS`, accès `AUTH_STORAGE_KEYS.REFRESH_TOKEN`)
 * et `getRefreshToken` (son accesseur, défini ou appelé).
 *
 * Une garde NÉGATIVE meurt en silence : elle reste verte si son balayage
 * rend `[]` (répertoire déplacé, filtre d'extension trop étroit, motif qui
 * ne matche plus rien). Les témoins POSITIFS ci-dessous prouvent que le
 * balayage atteint bien les fichiers qu'il prétend garder — y compris le
 * fichier hors-sujet qui doit rester INDEMNE — et que le motif attrape bien
 * ce qu'il interdit sans attraper ce qui doit survivre.
 *
 * Pas d'override `@jest-environment` : lit du texte via `fs`/`path` (des
 * modules Node natifs, disponibles sous jsdom comme sous node) — même choix
 * que le précédent du dossier, `api-path-literal-guard.test.ts`.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const WEB_ROOT = join(__dirname, '../..');
const SCANNED_ROOTS: readonly string[] = [WEB_ROOT];
const FORBIDDEN = /\b(REFRESH_TOKEN|getRefreshToken)\b/;
const SCANNED_EXTENSIONS = ['.ts', '.tsx'];

/** Fixtures, sorties de build, outillage de test — jamais du code SOURCE du client. */
const SKIPPED_DIRS = new Set([
  'node_modules', '.next', '.turbo', '.swc', '.git',
  '__tests__', '__mocks__', 'coverage', 'e2e', 'playwright-report', 'test-results', 'dist',
]);

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIPPED_DIRS.has(entry)) return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext)) && !entry.endsWith('.d.ts')
      ? [full]
      : [];
  });
}

const scannedFiles = (): readonly string[] => SCANNED_ROOTS.flatMap(sourceFiles);

describe('garde — le vestige refreshToken (stockage client) ne revient pas', () => {
  it('balaie bien les sources qu\'il prétend garder — y compris le fichier hors-sujet qui doit rester indemne', () => {
    const files = scannedFiles();

    expect(files.length).toBeGreaterThan(500);
    expect(files.some((f) => f.endsWith('services/auth-manager.service.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('constants/auth.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('stores/auth-store.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('services/auth.service.ts'))).toBe(true);
    // Concept homonyme (jeton FCM, domaine disjoint) : doit être balayé pour
    // que le témoin "n'attrape pas ce qui doit survivre" ci-dessous prouve
    // quelque chose — un fichier hors périmètre rendrait ce témoin vide de sens.
    expect(files.some((f) => f.endsWith('hooks/use-fcm-notifications.ts'))).toBe(true);
  });

  it('interdit bien la clé de stockage et son accesseur, sans attraper le concept homonyme légitime', () => {
    // Ce qui doit tomber : la clé, sous toutes ses formes, et son accesseur.
    expect(FORBIDDEN.test("REFRESH_TOKEN: 'meeshy_refresh_token',")).toBe(true);
    expect(FORBIDDEN.test('AUTH_STORAGE_KEYS.REFRESH_TOKEN')).toBe(true);
    expect(FORBIDDEN.test('localStorage.setItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN, refreshToken)')).toBe(true);
    expect(FORBIDDEN.test('localStorage.removeItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN)')).toBe(true);
    expect(FORBIDDEN.test('getRefreshToken(): string | null {')).toBe(true);
    expect(FORBIDDEN.test('authManager.getRefreshToken()')).toBe(true);

    // Ce qui ne doit PAS tomber : un identifiant différent, et les trois
    // usages légitimes du concept homonyme (méthode réelle, jeton FCM,
    // créneau positionnel encore accepté pour compatibilité d'appelants
    // hors territoire).
    expect(FORBIDDEN.test('SESSION_TOKEN')).toBe(false);
    expect(FORBIDDEN.test('authService.refreshToken()')).toBe(false);
    expect(FORBIDDEN.test('async refreshToken(sessionToken?: string | null): Promise<AuthResponse>')).toBe(false);
    expect(FORBIDDEN.test('refreshToken?: string,')).toBe(false);
    expect(FORBIDDEN.test('const refreshToken = useCallback(async (): Promise<string | null> => {')).toBe(false);
  });

  it('aucun `REFRESH_TOKEN` / `getRefreshToken` ne subsiste hors tests — ni défini, ni appelé, ni cité', () => {
    const offenders = scannedFiles()
      .filter((file) => FORBIDDEN.test(readFileSync(file, 'utf8')))
      .map((file) => relative(WEB_ROOT, file));

    expect(offenders).toEqual([]);
  });
});

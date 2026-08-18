/**
 * D-4 / R5-6 — le magasin web de mode de lecture a une identité.
 *
 * Témoins RED-GREEN du mandat (`tasks/lentille-cloture-phase1.md` D-4) :
 *
 *   (i)   deux identités, même conversation, même navigateur ⇒ préférences
 *         INDÉPENDANTES — LE témoin R5-6.
 *   (ii)  migration : ancienne clé non scopée présente ⇒ SUPPRIMÉE, jamais
 *         adoptée (le pendant purge de (i) — un autre angle du même risque).
 *   (iii) sans identité résolvable ⇒ rien de persistant écrit (repli
 *         mémoire).
 *   (iv)  écriture explicite ⇒ la route G-121 est appelée (mock), UNIQUEMENT
 *         pour une identité INSCRITE.
 *
 * PREUVE DU RED (i) SUR L'ANCIEN CODE — méthode, pas affirmation. Le témoin
 * (i) ci-dessous n'appelle QUE l'API publique préexistante
 * (`setReadingMode`/`getReadingMode`, inchangée par D-4) : il compile et
 * s'exécute identiquement contre le code d'AVANT ce commit. Rejoué sur
 * `cf507313` (la base de ce lot, clé `meeshy:reading-mode:<conversationId>`
 * SANS scope), il ROUGIT à la ligne `expect(getReadingMode(CONVERSATION_A)).
 * toBe(DEFAULT_PREFERENCE)` : le compte B y lit le choix `'focal'` que le
 * compte A vient d'écrire, parce que l'ancienne clé ne portait que
 * `conversationId` — exactement la fuite que ce document nomme. Reproductible
 * par `git stash` de ce lot (en gardant CE fichier de test) puis
 * `bun run test -- reading-mode-identity-scope`.
 */
import { AUTH_STORAGE_KEYS } from '@/constants/auth';
import {
  useReadingModePreferenceStore,
  resolveReadingModeIdentityScope,
  LEGACY_READING_MODE_STORAGE_KEY,
  runLegacyReadingModeMigration,
} from '@/stores/reading-mode-preference-store';

jest.mock('@/services/reading-mode-sync.service', () => ({
  writeReadingModePreferenceToServer: jest.fn().mockResolvedValue(undefined),
  fetchServerReadingModePreference: jest.fn().mockResolvedValue(null),
}));

import { writeReadingModePreferenceToServer } from '@/services/reading-mode-sync.service';

const CONVERSATION_A = '507f1f77bcf86cd799439021';
const STORAGE_KEY_PREFIX = 'meeshy:reading-mode:';
const DEFAULT_PREFERENCE = 'auto';

function setRegisteredIdentity(userId: string): void {
  window.localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, `fake-jwt-${userId}`);
  window.localStorage.setItem(AUTH_STORAGE_KEYS.USER_DATA, JSON.stringify({ id: userId }));
}

function setAnonymousIdentity(participantId: string): void {
  window.localStorage.setItem(
    AUTH_STORAGE_KEYS.ANONYMOUS_SESSION,
    JSON.stringify({ token: `anon-${participantId}`, participantId, expiresAt: Date.now() + 86_400_000 })
  );
}

function clearIdentity(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEYS.AUTH_TOKEN);
  window.localStorage.removeItem(AUTH_STORAGE_KEYS.USER_DATA);
  window.localStorage.removeItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION);
}

beforeEach(() => {
  window.localStorage.clear();
  useReadingModePreferenceStore.getState().reset();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// (i) LE TÉMOIN R5-6
// ---------------------------------------------------------------------------

describe('R5-6 — deux identités, même conversation, même navigateur ⇒ préférences indépendantes', () => {
  it("le choix du compte A n'est jamais lu par le compte B, et le choix de B n'écrase pas celui de A", async () => {
    setRegisteredIdentity('user-A');
    await useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_A, 'focal');
    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('focal');

    // Bascule d'identité — même navigateur, même onglet logique de test
    // (cf. docstring de fichier : sur ce dépôt, une vraie bascule passe par un
    // rechargement complet de page ; ce témoin vérifie la SCOPING au niveau
    // du magasin, qui est ce qui rend ce rechargement sûr).
    setRegisteredIdentity('user-B');
    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe(
      DEFAULT_PREFERENCE
    );

    await useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_A, 'script');
    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('script');

    // Retour à A : son choix d'origine est intact, B ne l'a pas écrasé.
    setRegisteredIdentity('user-A');
    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('focal');
  });

  it('la persistance elle-même est scopée : les deux comptes écrivent deux clés `localStorage` distinctes', async () => {
    setRegisteredIdentity('user-A');
    await useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_A, 'focal');

    setRegisteredIdentity('user-B');
    await useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_A, 'script');

    expect(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}u-user-A:${CONVERSATION_A}`)).toBe('focal');
    expect(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}u-user-B:${CONVERSATION_A}`)).toBe('script');
  });

  it('un compte inscrit et une session anonyme sur le même navigateur ne se transmettent rien non plus', async () => {
    setRegisteredIdentity('user-A');
    await useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_A, 'resume');

    clearIdentity();
    setAnonymousIdentity('participant-1');
    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe(
      DEFAULT_PREFERENCE
    );
  });
});

// ---------------------------------------------------------------------------
// (ii) MIGRATION — SUPPRESSION, JAMAIS ADOPTION
// ---------------------------------------------------------------------------

describe('R5-6 — une ancienne clé non scopée est purgée, jamais adoptée par l’identité courante', () => {
  it("une préférence d'un AUTRE compte, laissée dans l'ancienne clé non scopée, n'atterrit jamais chez l'identité qui ouvre l'app en premier", () => {
    // Un compte quelconque, avant D-4, avait écrit ce choix pour cette
    // conversation — la clé de l'époque ne portait aucune identité.
    window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${CONVERSATION_A}`, 'riviere');

    // Le compte qui ouvre l'app en premier après la mise à jour.
    setRegisteredIdentity('user-A');
    runLegacyReadingModeMigration();

    // Ni adopté pour user-A...
    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe(
      DEFAULT_PREFERENCE
    );
    // ...ni laissé lisible par personne : la clé est supprimée.
    expect(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${CONVERSATION_A}`)).toBeNull();
  });

  it("l'antique clé zustand/persist, elle non plus, n'est jamais adoptée", () => {
    window.localStorage.setItem(
      LEGACY_READING_MODE_STORAGE_KEY,
      JSON.stringify({ state: { modes: { [CONVERSATION_A]: 'script' } }, version: 1 })
    );

    setRegisteredIdentity('user-A');
    runLegacyReadingModeMigration();

    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe(
      DEFAULT_PREFERENCE
    );
    expect(window.localStorage.getItem(LEGACY_READING_MODE_STORAGE_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (iii) SANS IDENTITÉ ⇒ REPLI MÉMOIRE, JAMAIS DE CLÉ NON SCOPÉE RECRÉÉE
// ---------------------------------------------------------------------------

describe('R5-6 — sans identité résolvable, rien de persistant n’est écrit', () => {
  it('l’identité résolue est bien `none` quand ni compte inscrit ni session anonyme ne sont présents', () => {
    expect(resolveReadingModeIdentityScope()).toEqual({ kind: 'none' });
  });

  it("`setReadingMode` réussit EN MÉMOIRE mais n'écrit RIEN dans `localStorage`", async () => {
    await useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_A, 'focal');

    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('focal');
    expect(window.localStorage.length).toBe(0);
  });

  it("aucune clé non scopée `meeshy:reading-mode:<conversationId>` n'est jamais recréée", async () => {
    await useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_A, 'focal');

    expect(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${CONVERSATION_A}`)).toBeNull();
  });

  it("la route G-121 n'est pas appelée non plus, sans identité", async () => {
    await useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_A, 'focal');

    expect(writeReadingModePreferenceToServer).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (iv) ÉCRITURE EXPLICITE ⇒ LA ROUTE G-121 EST APPELÉE — INSCRIT SEULEMENT
// ---------------------------------------------------------------------------

describe('R5-6 / G-121 — un choix explicite écrit la route, pour un compte INSCRIT seulement', () => {
  it('un compte inscrit qui choisit un mode déclenche `PUT /user-preferences/conversations/:id`', async () => {
    setRegisteredIdentity('user-A');

    await useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_A, 'script');

    expect(writeReadingModePreferenceToServer).toHaveBeenCalledWith(CONVERSATION_A, 'script');
    expect(writeReadingModePreferenceToServer).toHaveBeenCalledTimes(1);
  });

  it("une session ANONYME ne déclenche AUCUN appel — la route n'existe pas pour elle (D-4 point 4)", async () => {
    setAnonymousIdentity('participant-1');

    await useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_A, 'script');

    expect(writeReadingModePreferenceToServer).not.toHaveBeenCalled();
    // Le choix reste néanmoins effectif EN LOCAL — la portée scopée locale
    // suffit pour un compte anonyme (D-4 point 4, aucune route serveur).
    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('script');
  });

  it("un échec réseau de la route reste SILENCIEUX — le choix local n'est jamais rétracté (fire-and-forget)", async () => {
    setRegisteredIdentity('user-A');
    (writeReadingModePreferenceToServer as jest.Mock).mockRejectedValueOnce(new Error('network down'));

    await expect(
      useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_A, 'script')
    ).resolves.toBeUndefined();

    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('script');
  });
});

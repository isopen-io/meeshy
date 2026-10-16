import { createHmac, randomBytes } from 'crypto';

/**
 * La CLÉ DE LECTEUR d'un anonyme (#10483) — ce que la passerelle garde d'un
 * lecteur sans compte pour dédoublonner ses vues et ses impressions.
 *
 * `readerKey = HMAC-SHA256(READER_KEY_HMAC_SECRET, préfixe + valeur)`, en hex :
 *  - `participant:<id>` quand X-Session-Token résout un invité de lien — le
 *    même invité garde la même clé sur tous ses appareils ;
 *  - `token:<valeur>` sinon (clé visiteur `visitor_<uuid>` générée par le
 *    client).
 *
 * La valeur brute de l'en-tête n'est jamais écrite : pour un invité, c'est un
 * CREDENTIAL (son jeton de session, que `Participant` ne garde qu'en hash).
 * Sans le secret, la clé ne se recalcule pas à partir d'un jeton, et elle ne
 * sert à rien comme credential.
 */
export type ReaderIdentity = {
  readonly sessionToken: string;
  readonly participantId?: string;
};

type Env = Readonly<Record<string, string | undefined>>;

const ENV_VAR = 'READER_KEY_HMAC_SECRET';
const MIN_LENGTH = 32;
const PROCESS_SECRET = randomBytes(32).toString('hex');
const READER_KEY = /^[0-9a-f]{64}$/;

const isProductionOrStaging = (env: Env): boolean => {
  const normalized = (env.NODE_ENV ?? 'development').trim().toLowerCase();
  return normalized === 'production' || normalized === 'staging';
};

/**
 * Le secret de la clé. En production (le staging tourne aussi en
 * `NODE_ENV=production`), absent ou trop court ⇒ erreur : la passerelle refuse
 * de démarrer plutôt que de signer avec un secret de processus, qui changerait
 * à chaque redémarrage et recompterait tous les lecteurs. Hors production, un
 * secret tiré au démarrage du processus suffit.
 */
export function readerKeySecret(env: Env = process.env): string {
  const value = env[ENV_VAR];
  if (!isProductionOrStaging(env)) return value && value.length > 0 ? value : PROCESS_SECRET;
  if (!value || value.length < MIN_LENGTH) {
    throw new Error(
      `[SECURITY] ${ENV_VAR} must be set (>= ${MIN_LENGTH} characters) in production/staging. ` +
      'Generate with: openssl rand -hex 32',
    );
  }
  return value;
}

export function readerKeyOf(identity: ReaderIdentity, secret: string = readerKeySecret()): string {
  const source = identity.participantId
    ? `participant:${identity.participantId}`
    : `token:${identity.sessionToken}`;
  return createHmac('sha256', secret).update(source).digest('hex');
}

/** Une valeur déjà hachée — ce que la migration ne retouche pas. */
export const isReaderKey = (value: string): boolean => READER_KEY.test(value);

/**
 * L'EMPREINTE d'un compte sur une ligne de lecture RÉDUITE, écrite entre
 * #10771 et #10785 : la même clé secrète, un domaine à part (`account:`).
 * Depuis #10785 (décision du porteur), plus aucune ligne n'est écrite sous
 * cette forme ; l'empreinte ne sert qu'à RELIRE ces lignes jusqu'à leur
 * expiration (8 jours) — déduplication, export, effacement. Rien d'autre ne
 * la recalcule.
 * C'est une PSEUDONYMISATION (RGPD art. 4(5)) : la ligne reste une donnée
 * personnelle, couverte par l'export et l'effacement.
 */
export const accountReaderKeyOf = (userId: string, secret: string = readerKeySecret()): string =>
  createHmac('sha256', secret).update(`account:${userId}`).digest('hex');

/** L'empreinte d'une clé de session d'une ligne réduite (#10771) — relue seulement depuis #10785. */
export const engagementSessionKeyOf = (sessionId: string, secret: string = readerKeySecret()): string =>
  createHmac('sha256', secret).update(`engagement-session:${sessionId}`).digest('hex');

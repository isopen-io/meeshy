/**
 * LE CONTRÔLE QUOTIDIEN DE LA SAUVEGARDE NOCTURNE (#9668, décision porteur du
 * 2026-10-08).
 *
 * Chaque jour à 5 h, heure de Paris (`jobs/backup-status-check.ts`), la
 * passerelle relit le verdict de la sauvegarde de minuit et applique la règle
 * d'alerte de `backup-status.ts` : un échec, une dernière réussite de plus de
 * 26 h, ou aucun verdict. L'alerte prend deux formes :
 *  - une notification à chaque compte ADMIN et BIGBOSS ;
 *  - un e-mail au compte BIGBOSS (Meeshy Sama), lu en base — jamais une
 *    adresse écrite en dur.
 *
 * UN INCIDENT, UN ENVOI. La clé d'incident se RÉSERVE par `SET NX` : sur deux
 * instances qui contrôlent à la même seconde, une seule gagne et prévient ; le
 * lendemain, le même incident trouve sa clé prise et ne repart pas.
 *
 * LE RETOUR AU VERT SE DIT. L'incident signalé est noté comme OUVERT ; le
 * premier contrôle sain qui le trouve réserve son rétablissement (`SET NX`
 * sur l'incident ET la réussite qui le clôt), prévient les mêmes personnes, puis
 * ferme l'incident et libère sa clé — un verdict de nouveau absent, un mois
 * plus tard, est un nouvel incident. Un incident qui en REMPLACE un autre
 * encore ouvert (un échec après un verdict absent) libère la clé du premier,
 * pour la même raison.
 *
 * L'INTERRUPTEUR. Rien n'est lu ni envoyé sans
 * `BACKUP_STATUS_ALERTS_ENABLED=true` : en dev et en local le fichier n'existe
 * pas, et son absence y déclencherait une alerte chaque matin.
 */
import { backupAlertOf, type BackupIncidentKind, type BackupVerdict } from './backup-status';

/** Assez long pour couvrir des semaines d'un même incident. */
const INCIDENT_TTL_SECONDS = 60 * 24 * 60 * 60;

const OPEN_INCIDENT_KEY = 'backup-status:open-incident';
const incidentClaimKey = (incidentKey: string): string => `backup-status:incident:${incidentKey}`;
const recoveryClaimKey = (incidentKey: string, lastSuccessAt: string | null): string =>
  `backup-status:recovered:${incidentKey}:${lastSuccessAt ?? 'never'}`;

export type BackupAlertStore = {
  setnx(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
};

export type BackupAlertRecipient = {
  readonly id: string;
  readonly role: string;
  readonly email: string | null;
  readonly name: string;
  readonly language: string;
};

export type BackupAlertMessage = {
  readonly kind: BackupIncidentKind | 'recovered';
  readonly reason: string | null;
  readonly lastSuccessAt: string | null;
};

export type BackupAlertDeps = {
  readonly enabled: boolean;
  readonly now: () => Date;
  readonly readVerdict: () => Promise<BackupVerdict | null>;
  readonly store: BackupAlertStore;
  /** Les comptes ADMIN et BIGBOSS actifs. */
  readonly recipients: () => Promise<readonly BackupAlertRecipient[]>;
  /** `true` quand la notification est partie. */
  readonly notify: (recipient: BackupAlertRecipient, message: BackupAlertMessage) => Promise<boolean>;
  /** `true` quand l'e-mail est parti. */
  readonly email: (recipient: BackupAlertRecipient, message: BackupAlertMessage) => Promise<boolean>;
};

export type BackupCheckReport =
  | { readonly outcome: 'disabled' }
  | { readonly outcome: 'healthy' }
  | { readonly outcome: 'duplicate'; readonly incidentKey: string }
  | {
      readonly outcome: 'alerted';
      readonly kind: BackupIncidentKind;
      readonly incidentKey: string;
      readonly notified: number;
      readonly emailed: number;
    }
  | { readonly outcome: 'recovered'; readonly incidentKey: string; readonly notified: number; readonly emailed: number };

export const isBackupStatusAlertsEnabled = (env: Readonly<Record<string, string | undefined>> = process.env): boolean =>
  env.BACKUP_STATUS_ALERTS_ENABLED === 'true';

const settled = async (attempts: readonly Promise<boolean>[]): Promise<number> =>
  (await Promise.allSettled(attempts)).filter((attempt) => attempt.status === 'fulfilled' && attempt.value === true).length;

/** Chaque destinataire est prévenu pour lui-même : un échec n'arrête pas les autres. */
async function announce(deps: BackupAlertDeps, message: BackupAlertMessage): Promise<{ notified: number; emailed: number }> {
  const recipients = await deps.recipients();
  const bigBosses = recipients.filter((recipient) => recipient.role === 'BIGBOSS' && recipient.email !== null);
  const [notified, emailed] = await Promise.all([
    settled(recipients.map((recipient) => deps.notify(recipient, message))),
    settled(bigBosses.map((recipient) => deps.email(recipient, message))),
  ]);
  return { notified, emailed };
}

async function recoverIfSignaled(deps: BackupAlertDeps, verdict: BackupVerdict | null): Promise<BackupCheckReport> {
  const open = await deps.store.get(OPEN_INCIDENT_KEY);
  if (open === null) return { outcome: 'healthy' };
  const lastSuccessAt = verdict?.lastSuccessAt ?? null;
  if (!(await deps.store.setnx(recoveryClaimKey(open, lastSuccessAt), '1', INCIDENT_TTL_SECONDS))) return { outcome: 'healthy' };

  const sent = await announce(deps, { kind: 'recovered', reason: null, lastSuccessAt });
  await deps.store.del(OPEN_INCIDENT_KEY);
  await deps.store.del(incidentClaimKey(open));
  return { outcome: 'recovered', incidentKey: open, ...sent };
}

export async function runBackupStatusCheck(deps: BackupAlertDeps): Promise<BackupCheckReport> {
  if (!deps.enabled) return { outcome: 'disabled' };

  const verdict = await deps.readVerdict();
  const alert = backupAlertOf(verdict, deps.now());
  if (alert.kind === 'healthy') return recoverIfSignaled(deps, verdict);

  if (!(await deps.store.setnx(incidentClaimKey(alert.incidentKey), deps.now().toISOString(), INCIDENT_TTL_SECONDS))) {
    return { outcome: 'duplicate', incidentKey: alert.incidentKey };
  }
  const superseded = await deps.store.get(OPEN_INCIDENT_KEY);
  if (superseded !== null && superseded !== alert.incidentKey) await deps.store.del(incidentClaimKey(superseded));
  await deps.store.set(OPEN_INCIDENT_KEY, alert.incidentKey, INCIDENT_TTL_SECONDS);
  const sent = await announce(deps, { kind: alert.kind, reason: alert.reason, lastSuccessAt: alert.lastSuccessAt });
  return { outcome: 'alerted', kind: alert.kind, incidentKey: alert.incidentKey, ...sent };
}

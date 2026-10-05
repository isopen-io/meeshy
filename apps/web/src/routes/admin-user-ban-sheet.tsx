import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { AdminBadge } from '@/components/admin/badges';
import { AdminButton } from '@/components/admin/button';
import { AdminFormActions, AdminFormSheet, AdminReasonField, AdminTextInput, motiveState } from '@/components/admin/form';
import { AdminEmptyState, AdminSkeleton } from '@/components/admin/states';
import { EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { personLabel } from '@/lib/admin/interpret/labels';
import { sentenceCase } from '@/lib/admin/interpret/language';
import { adminDate } from '@/lib/admin/interpret/time';
import {
  adminUserBansQueryKey,
  adminUserBansQueryOptions,
  banAdminUser,
  liftAdminUserBan,
  type AdminBan,
  type AdminBanActor,
} from '@/lib/api/admin-user-bans';
import type { AdminDeps } from '@/lib/api/admin';
import { adminUserDetailQueryKey } from '@/lib/api/admin-user-detail';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import { useAdminReach } from '@/lib/admin/use-admin-reach';

/**
 * **BANNIR, LEVER, CONSULTER** (#6819) — la feuille, ouverte depuis la fiche.
 *
 * ## Trois états, tenus distincts
 *
 * Le schéma sépare `expiresAt` de `liftedAt` : un ban **expiré** n'est pas un
 * ban **levé**. Le premier s'est éteint tout seul ; le second a été retiré par
 * quelqu'un, qui laisse son nom et son motif. Les afficher pareil effacerait
 * la trace d'une décision administrative.
 *
 * L'état « en vigueur » vient du champ `active` SERVI, jamais recalculé ici.
 *
 * ## « Lever » n'apparaît que sur ce qui est en vigueur
 *
 * Lever un ban déjà expiré n'a pas de sens, et la passerelle n'en veut pas
 * davantage. Un contrôle qui n'aurait aucun effet est le défaut que la loi 4
 * du dépôt interdit.
 *
 * ## L'échéance
 *
 * `<input type="date">` rend `AAAA-MM-JJ` ; la passerelle valide un
 * `datetime()` ISO complet et **refuse une échéance passée**. `new Date('AAAA-MM-JJ')`
 * lit cette chaîne en MINUIT UTC : choisir « aujourd'hui » donnait toujours une
 * échéance déjà passée, refusée sans qu'aucune raison ne s'affiche. La date se lit
 * donc en heure LOCALE — la fin de la journée choisie, « jusqu'au » étant inclusif —,
 * le champ n'offre que DEMAIN et après (`min`), et une date qui ne l'est pas est refusée
 * ICI, sous le champ, dans la langue du lecteur, sans aller-retour.
 *
 * Le motif et la date saisis ne sont effacés QUE si le bannissement a réussi : un refus
 * ne fait pas perdre ce qui vient d'être écrit.
 *
 * ## Les pièces du kit (#9463)
 *
 * Motif, échéance, état vide et gestes sont ceux de `components/admin` ; la règle du
 * motif est `motiveState` — trois caractères, facultatif pour le rang souverain —, la
 * même que celle de la conversation et du mot de passe.
 */

const pad = (value: number): string => String(value).padStart(2, '0');

/** `AAAA-MM-JJ` en heure LOCALE — jamais `toISOString()`, qui lit le jour en UTC. */
const localDateOf = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Le premier jour qu'une échéance peut désigner : demain, en heure locale. */
const tomorrowOf = (now: Date): string => localDateOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

/** La FIN du jour choisi, en heure locale, en ISO complet — `null` pour une date illisible. */
function endOfLocalDay(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Le plancher du motif que la passerelle tient pour un bannissement. */
const MOTIF_MINIMUM = 3;

function etatDe(ban: AdminBan): 'active' | 'lifted' | 'expired' {
  if (ban.active) return 'active';
  // Levé AVANT expiré : un ban retiré à la main reste un geste, même si son
  // échéance est passée depuis.
  return ban.liftedAt !== null ? 'lifted' : 'expired';
}

export function AdminUserBanSheet({
  userId,
  language,
  onClose,
  onAnnounce,
  deps = apiDeps,
  now = () => new Date(),
}: {
  readonly userId: string;
  readonly language: AdminLanguage;
  readonly onClose: () => void;
  readonly onAnnounce: (texte: string) => void;
  /** Le port, injectable : la feuille se mesure sans passerelle. */
  readonly deps?: AdminDeps;
  /** L'horloge, injectable : « demain » se fixe dans un témoin. */
  readonly now?: () => Date;
}) {
  const client = useQueryClient();
  const historique = useQuery(adminUserBansQueryOptions(deps, userId));

  const [motif, setMotif] = useState('');
  const [jusquAu, setJusquAu] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [dateRefusee, setDateRefusee] = useState(false);

  const premierJour = tomorrowOf(now());
  /* Le rang souverain bannit sans motif (spec 2026-10-04 § 4) : le champ reste, FACULTATIF —
     un motif commencé se valide encore (trois caractères), un champ vide part sans `reason`. */
  const souverain = useAdminReach().isSovereign;
  const motive = motiveState({ text: motif, minLength: MOTIF_MINIMUM, required: true, sovereign: souverain, whenSovereign: 'optional' });

  /**
   * Les deux clés sont EN DUR, et ce n'est pas une simplification : passées en
   * paramètres `string`, elles élargissent le type de clé, et `translate`
   * réclame alors le troisième argument des clés à paramètres — qu'aucune de
   * ces deux n'a. Une clé calculée ne compile que tant que l'union reste
   * FERMÉE sur des littéraux. Les deux appels employaient de toute façon les
   * mêmes clés : les paramétrer ne servait personne.
   */
  async function appliquer(action: () => Promise<{ ok: boolean }>): Promise<{ ok: boolean }> {
    if (envoi) return { ok: false };
    setEnvoi(true);
    const resultat = await action();
    setEnvoi(false);

    onAnnounce(translateAdmin(language, resultat.ok ? 'admin.ban.done' : 'admin.ban.failed'));
    /* Un ban change l'ÉTAT du compte : l'historique, la fiche (son badge « Banni ») et la
       liste des comptes se relisent — n'invalider que l'historique laissait les deux autres
       dire l'état d'avant (audit 2026-10-04). */
    if (resultat.ok) {
      void client.invalidateQueries({ queryKey: adminUserBansQueryKey(userId) });
      void client.invalidateQueries({ queryKey: adminUserDetailQueryKey(userId), exact: true });
      void client.invalidateQueries({ queryKey: ['admin', 'users'] });
    }
    return resultat;
  }

  async function bannir() {
    // Absent = permanent. Une date saisie devient la FIN du jour choisi, en heure locale, en
    // ISO complet : la passerelle valide un `datetime()` et refuse le passé.
    const expiresAt = jusquAu === '' ? null : endOfLocalDay(jusquAu);
    if (jusquAu !== '' && (jusquAu < premierJour || expiresAt === null)) {
      setDateRefusee(true);
      return;
    }

    const resultat = await appliquer(() =>
      banAdminUser({ ...deps, userId, reason: motive.sent, ...(expiresAt === null ? {} : { expiresAt }) }),
    );
    if (!resultat.ok) return;
    setMotif('');
    setJusquAu('');
  }

  return (
    <AdminFormSheet language={language} title={translateAdmin(language, 'admin.ban.title')} onClose={onClose}>
      <AdminReasonField
        id="admin-ban-reason"
        language={language}
        label={translateAdmin(language, 'admin.ban.reason')}
        value={motif}
        onValue={setMotif}
        minLength={MOTIF_MINIMUM}
        required
        sovereign={souverain}
        whenSovereign="optional"
        data={{ 'data-admin-ban-reason': '' }}
      />

      <AdminTextInput
        id="admin-ban-until"
        type="date"
        label={translateAdmin(language, jusquAu === '' ? 'admin.ban.permanent' : 'admin.ban.until')}
        value={jusquAu}
        min={premierJour}
        onValue={(valeur) => {
          setJusquAu(valeur);
          setDateRefusee(false);
        }}
        error={dateRefusee ? translateAdmin(language, 'admin.ban.untilPast') : undefined}
        errorData={{ 'data-admin-ban-until-error': '' }}
        data={{ 'data-admin-ban-until': '' }}
      />

      <AdminFormActions
        language={language}
        primary={{
          label: translateAdmin(language, 'admin.ban.apply'),
          tone: 'danger',
          busy: envoi,
          disabled: !motive.ready,
          onClick: () => void bannir(),
        }}
      />

      <section className="grid gap-2 pt-2" aria-label={translateAdmin(language, 'admin.ban.title')}>
        {historique.isPending ? (
          <AdminSkeleton rows={2} language={language} />
        ) : (historique.data ?? []).length === 0 ? (
          <AdminEmptyState title={translateAdmin(language, 'admin.ban.none')} />
        ) : (
          (historique.data ?? []).map((ban) => (
            <BanRow
              key={ban.id}
              ban={ban}
              language={language}
              envoi={envoi}
              onLift={() => void appliquer(() => liftAdminUserBan({ ...deps, userId, banId: ban.id }))}
            />
          ))
        )}
      </section>

      <AdminFormActions language={language} onCancel={onClose} />
    </AdminFormSheet>
  );
}

/** Le nom d'un acteur : son nom affiché, jamais un identifiant ; `null` quand son compte n'existe plus. */
const actorLabel = (actor: AdminBanActor | null, language: AdminLanguage): string | null =>
  actor === null ? null : personLabel({ displayName: actor.displayName, username: actor.username }, language);

function BanRow({
  ban,
  language,
  envoi,
  onLift,
}: {
  readonly ban: AdminBan;
  readonly language: AdminLanguage;
  readonly envoi: boolean;
  readonly onLift: () => void;
}) {
  /* Lever ÉCRIT, comme Bannir : hors ligne, il se désactive comme les gestes
     d'`AdminFormActions` — la règle que l'avis `admin.kit.offline` promet. */
  const online = useOnline();
  const etat = etatDe(ban);
  const banner = actorLabel(ban.bannedBy, language);
  const lifter = actorLabel(ban.liftedBy, language);
  const tone = etat === 'active' ? 'danger' : 'neutral';

  return (
    <div
      data-admin-ban={ban.id}
      data-admin-ban-state={etat}
      className="grid gap-1 rounded-card px-4 py-3"
      style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}
    >
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 break-words text-body" style={{ color: INK }}>
          {ban.reason}
        </span>
        <AdminBadge tone={tone}>
          {sentenceCase(translateAdmin(language, etat === 'active' ? 'admin.ban.active' : etat === 'lifted' ? 'admin.ban.lifted' : 'admin.ban.expired'), language)}
        </AdminBadge>
      </div>
      <p className="text-caption" style={{ color: INK2 }} data-admin-ban-by="">
        {ban.createdAt === null
          ? null
          : banner === null
            ? translateAdmin(language, 'admin.people.ban.byUnknown', { date: adminDate(ban.createdAt, language) })
            : translateAdmin(language, 'admin.people.ban.by', { name: banner, date: adminDate(ban.createdAt, language) })}
      </p>
      <p className="text-caption" style={{ color: INK2 }}>
        {ban.expiresAt === null
          ? translateAdmin(language, 'admin.ban.permanent')
          : translateAdmin(language, 'admin.people.ban.until', { date: adminDate(ban.expiresAt, language) })}
      </p>
      {ban.liftedAt === null ? null : (
        <p className="text-caption" style={{ color: INK2 }} data-admin-ban-lifted="">
          {ban.liftedBySystem
            ? translateAdmin(language, 'admin.people.ban.liftedBySystem', { date: adminDate(ban.liftedAt, language) })
            : lifter === null
              ? translateAdmin(language, 'admin.people.ban.liftedUnknown', { date: adminDate(ban.liftedAt, language) })
              : translateAdmin(language, 'admin.people.ban.liftedBy', { name: lifter, date: adminDate(ban.liftedAt, language) })}
          {ban.liftReason === null ? null : ` · ${translateAdmin(language, 'admin.people.ban.liftReason', { reason: ban.liftReason })}`}
        </p>
      )}
      {etat === 'active' ? (
        <div className="flex justify-end pt-1">
          <AdminButton disabled={envoi || !online} onClick={onLift}>
            {translateAdmin(language, 'admin.ban.lift')}
          </AdminButton>
        </div>
      ) : null}
    </div>
  );
}

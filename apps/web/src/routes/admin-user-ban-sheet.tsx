import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { AdminBadge } from '@/components/admin/badges';
import { Field } from '@/components/field';
import { Sheet } from '@/components/sheet';
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
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
import { ActionButton } from '@/routes/link-page-parts';

import { AdminSkeleton } from './admin-parts';

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
 * `datetime()` ISO complet et **refuse une échéance passée**. On convertit
 * donc, et le port refuse déjà le passé avant tout aller-retour.
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const BRAND = 'var(--color-ios-brand)';

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
}: {
  readonly userId: string;
  readonly language: AdminLanguage;
  readonly onClose: () => void;
  readonly onAnnounce: (texte: string) => void;
  /** Le port, injectable : la feuille se mesure sans passerelle. */
  readonly deps?: AdminDeps;
}) {
  const client = useQueryClient();
  const historique = useQuery(adminUserBansQueryOptions(deps, userId));

  const [motif, setMotif] = useState('');
  const [focus, setFocus] = useState(false);
  const [jusquAu, setJusquAu] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const motifPret = motif.trim().length >= 3;

  /**
   * Les deux clés sont EN DUR, et ce n'est pas une simplification : passées en
   * paramètres `string`, elles élargissent le type de clé, et `translate`
   * réclame alors le troisième argument des clés à paramètres — qu'aucune de
   * ces deux n'a. Une clé calculée ne compile que tant que l'union reste
   * FERMÉE sur des littéraux. Les deux appels employaient de toute façon les
   * mêmes clés : les paramétrer ne servait personne.
   */
  async function appliquer(action: () => Promise<{ ok: boolean }>) {
    if (envoi) return;
    setEnvoi(true);
    const resultat = await action();
    setEnvoi(false);

    onAnnounce(translateAdmin(language, resultat.ok ? 'admin.ban.done' : 'admin.ban.failed'));
    if (resultat.ok) void client.invalidateQueries({ queryKey: adminUserBansQueryKey(userId) });
  }

  const bannir = () =>
    appliquer(() =>
      banAdminUser({
        ...deps,
        userId,
        reason: motif,
        // Absent = permanent. Une date saisie devient un ISO complet, la
        // passerelle validant un `datetime()`.
        ...(jusquAu === '' ? {} : { expiresAt: new Date(jusquAu).toISOString() }),
      }),
    ).then(() => {
      setMotif('');
      setJusquAu('');
    });

  return (
    <Sheet title={translateAdmin(language, 'admin.ban.title')} presentation="centered" onClose={onClose}>
      <div className="grid gap-4 px-4 pb-6">
        <Field id="admin-ban-reason" label={translateAdmin(language, 'admin.ban.reason')} tint={BRAND} focused={focus}>
          {({ id, describedBy }) => (
            <input
              id={id}
              type="text"
              value={motif}
              data-admin-ban-reason
              aria-describedby={describedBy}
              onInput={(event) => setMotif(event.currentTarget.value)}
              onFocus={() => setFocus(true)}
              onBlur={() => setFocus(false)}
              className="w-full bg-transparent text-body outline-none"
              style={{ minHeight: 44, color: INK }}
            />
          )}
        </Field>

        <label className="grid gap-1">
          <span className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, jusquAu === '' ? 'admin.ban.permanent' : 'admin.ban.until')}
          </span>
          <input
            type="date"
            value={jusquAu}
            data-admin-ban-until
            onChange={(event) => setJusquAu(event.currentTarget.value)}
            className="rounded-chip px-4 text-body"
            style={{ minHeight: 44, backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)', color: INK }}
          />
        </label>

        <ActionButton tone="danger" disabled={!motifPret || envoi} onClick={() => void bannir()}>
          {translateAdmin(language, 'admin.ban.apply')}
        </ActionButton>

        <section className="grid gap-2 pt-2" aria-label={translateAdmin(language, 'admin.ban.title')}>
          {historique.isPending ? (
            <AdminSkeleton rows={2} />
          ) : (historique.data ?? []).length === 0 ? (
            <p className="text-caption" style={{ color: INK2 }}>
              {translateAdmin(language, 'admin.ban.none')}
            </p>
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

        <ActionButton tone="secondary" onClick={onClose}>
          {translate(language, 'common.cancel')}
        </ActionButton>
      </div>
    </Sheet>
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
  const etat = etatDe(ban);
  const banner = actorLabel(ban.bannedBy, language);
  const lifter = actorLabel(ban.liftedBy, language);
  const tone = etat === 'active' ? 'danger' : 'neutral';

  return (
    <div
      data-admin-ban={ban.id}
      data-admin-ban-state={etat}
      className="grid gap-1 rounded-card px-4 py-3"
      style={{ backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)' }}
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
        <ActionButton tone="secondary" disabled={envoi} onClick={onLift}>
          {translateAdmin(language, 'admin.ban.lift')}
        </ActionButton>
      ) : null}
    </div>
  );
}

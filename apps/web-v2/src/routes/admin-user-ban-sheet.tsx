import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Field } from '@/components/field';
import { Sheet } from '@/components/sheet';
import {
  adminUserBansQueryKey,
  banAdminUser,
  liftAdminUserBan,
  loadAdminUserBans,
  type AdminBan,
} from '@/lib/api/admin-user-bans';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
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
}: {
  readonly userId: string;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly onAnnounce: (texte: string) => void;
}) {
  const client = useQueryClient();
  const historique = useQuery({
    queryKey: adminUserBansQueryKey(userId),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUserBans({ ...apiDeps, userId, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
  });

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
        ...apiDeps,
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
    <Sheet title={translateAdmin(language, 'admin.ban.title')} onClose={onClose}>
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
                onLift={() => void appliquer(() => liftAdminUserBan({ ...apiDeps, userId, banId: ban.id }))}
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

function BanRow({
  ban,
  language,
  envoi,
  onLift,
}: {
  readonly ban: AdminBan;
  readonly language: InterfaceLanguage;
  readonly envoi: boolean;
  readonly onLift: () => void;
}) {
  const etat = etatDe(ban);

  return (
    <div
      data-admin-ban={ban.id}
      data-admin-ban-state={etat}
      className="grid gap-1 rounded-card px-4 py-3"
      style={{ backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)' }}
    >
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-body" style={{ color: INK }}>
          {ban.reason}
        </span>
        <span
          className="shrink-0 text-caption"
          style={{ color: etat === 'active' ? 'var(--color-danger)' : INK2 }}
        >
          {translateAdmin(language, etat === 'active' ? 'admin.ban.active' : etat === 'lifted' ? 'admin.ban.lifted' : 'admin.ban.expired')}
        </span>
      </div>
      {etat === 'active' ? (
        <ActionButton tone="secondary" disabled={envoi} onClick={onLift}>
          {translateAdmin(language, 'admin.ban.lift')}
        </ActionButton>
      ) : null}
    </div>
  );
}

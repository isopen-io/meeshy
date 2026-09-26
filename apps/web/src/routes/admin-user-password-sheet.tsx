import { useEffect, useState } from 'react';
import { PASSWORD_PROPOSAL_LEVELS, type PasswordProposalLevel } from '@meeshy/shared/types/admin-password-proposal';

import { Field } from '@/components/field';
import { Sheet } from '@/components/sheet';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  fetchAdminPasswordProposals,
  resetAdminUserPassword,
  type PasswordProposals,
} from '@/lib/api/admin-user-password';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { portailDuNavigateur, type PortailPartage } from '@/lib/view/invitation';
import { ActionButton } from '@/routes/link-page-parts';

/**
 * **RÉINITIALISER LE MOT DE PASSE D'UN MEMBRE** (#6819, #8051) — la feuille,
 * ouverte depuis sa fiche.
 *
 * ## Le secret s'affiche AVANT d'être appliqué
 *
 * L'administrateur doit le TRANSMETTRE. S'il n'apparaissait qu'après
 * l'application, un geste raté — fenêtre fermée, réseau coupé au mauvais
 * moment — laisserait un compte dont personne ne connaît le mot de passe, et
 * la seule issue serait une seconde réinitialisation. On propose donc
 * d'abord, on laisse copier ou retoucher, on applique ensuite.
 *
 * ## Quatre niveaux, et un champ qu'on peut écrire (#8051)
 *
 * Simple, facile, moyen, difficile — les trois premiers dérivés du pseudo ou
 * du nom affiché du membre, le dernier aléatoire — sont composés par la
 * passerelle (`POST …/password-proposals`), qui les a DÉJÀ jugés recevables :
 * choisir un niveau remplit le champ d'un secret que `reset-password` ne
 * refusera pas. Toucher au champ sort des niveaux (aucune puce n'est plus
 * enfoncée) : c'est alors la saisie de l'administrateur qui part, telle
 * quelle, et un refus de la passerelle revient s'afficher sous le champ.
 * **Ce qui est affiché est ce qui est appliqué**, sans exception.
 *
 * ## Il ne vit que dans l'état de cette feuille
 *
 * Jamais dans le cache des requêtes — qui est persisté dans `localStorage`
 * (`query-client.ts`) : les propositions sont demandées en direct au
 * transport, et la route de réinitialisation ne rend qu'un message. Le
 * secret disparaît avec la feuille.
 *
 * ## Le portail est INJECTÉ
 *
 * `portailDuNavigateur()` par défaut, mais remplaçable : c'est ce qui rend la
 * copie mesurable sans navigateur, et ce qui empêche un témoin de se contenter
 * d'affirmer que `navigator.clipboard` existe. Le contrat vient de
 * `@/lib/view/invitation` — l'espace NEUTRE, pas celui des liens : on réutilise
 * l'abstraction partagée, jamais l'emballage dont le nom démentirait l'usage.
 */

const BRAND = 'var(--color-ios-brand)';
const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

type Copie = 'none' | 'copied' | 'failed';
type Chargement = 'loading' | 'ready' | 'failed';
type Niveau = PasswordProposalLevel | 'custom';

const LIBELLES_NIVEAUX: Readonly<Record<PasswordProposalLevel, AdminPlainCatalogKey>> = {
  simple: 'admin.password.level.simple',
  easy: 'admin.password.level.easy',
  medium: 'admin.password.level.medium',
  hard: 'admin.password.level.hard',
};

/** Le niveau proposé à l'ouverture — le plus sûr, comme avant #8051. */
const NIVEAU_INITIAL: PasswordProposalLevel = 'hard';

export function AdminUserPasswordSheet({
  userId,
  language,
  onClose,
  onAnnounce,
  portail = portailDuNavigateur(),
  deps = apiDeps,
}: {
  readonly userId: string;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly onAnnounce: (texte: string) => void;
  readonly portail?: PortailPartage;
  readonly deps?: AdminDeps;
}) {
  const [propositions, setPropositions] = useState<PasswordProposals | null>(null);
  const [chargement, setChargement] = useState<Chargement>('loading');
  const [niveau, setNiveau] = useState<Niveau>(NIVEAU_INITIAL);
  const [motDePasse, setMotDePasse] = useState('');
  const [focus, setFocus] = useState(false);
  const [copie, setCopie] = useState<Copie>('none');
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [tirage, setTirage] = useState(0);

  // Un tirage par ouverture, et un de plus à chaque « Autre proposition » :
  // le champ ne change QUE si l'administrateur n'y a pas encore écrit —
  // remplacer sous ses yeux un secret qu'il vient de copier en ferait deux.
  useEffect(() => {
    const controleur = new AbortController();
    setChargement('loading');
    void fetchAdminPasswordProposals({ ...deps, userId, signal: controleur.signal }).then((resultat) => {
      if (controleur.signal.aborted) return;
      if (!resultat.ok) {
        setChargement('failed');
        return;
      }
      setPropositions(resultat.data);
      setChargement('ready');
      setNiveau((courant) => {
        if (courant === 'custom') return courant;
        setMotDePasse(resultat.data[courant]);
        setCopie('none');
        setRefus(null);
        return courant;
      });
    });
    return () => controleur.abort();
  }, [deps, userId, tirage]);

  function choisir(niveauChoisi: PasswordProposalLevel) {
    if (propositions === null) return;
    setNiveau(niveauChoisi);
    setMotDePasse(propositions[niveauChoisi]);
    setCopie('none');
    setRefus(null);
  }

  function saisir(valeur: string) {
    setNiveau('custom');
    setMotDePasse(valeur);
    setCopie('none');
    setRefus(null);
  }

  async function copier() {
    if (portail.copier === undefined) {
      setCopie('failed');
      return;
    }
    try {
      await portail.copier(motDePasse);
      setCopie('copied');
      onAnnounce(translateAdmin(language, 'admin.password.copied'));
    } catch {
      setCopie('failed');
    }
  }

  async function appliquer() {
    if (envoi || motDePasse.length < ADMIN_PASSWORD_MIN_LENGTH) return;
    setEnvoi(true);
    const resultat = await resetAdminUserPassword({ ...deps, userId, newPassword: motDePasse });
    setEnvoi(false);

    if (!resultat.ok) {
      setRefus(resultat.error);
      onAnnounce(translateAdmin(language, 'admin.password.failed'));
      return;
    }
    onAnnounce(translateAdmin(language, 'admin.password.done'));
    onClose();
  }

  const pretAAppliquer = !envoi && motDePasse.length >= ADMIN_PASSWORD_MIN_LENGTH;

  return (
    <Sheet title={translateAdmin(language, 'admin.password.title')} onClose={onClose}>
      <div className="grid gap-4 px-4 pb-6">
        <p
          className="rounded-card px-4 py-3 text-caption"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)', color: 'var(--color-danger)' }}
        >
          {translateAdmin(language, 'admin.password.warn')}
        </p>

        <div
          role="group"
          aria-label={translateAdmin(language, 'admin.password.level')}
          className="flex gap-2 overflow-x-auto"
        >
          {PASSWORD_PROPOSAL_LEVELS.map((candidat) => {
            const enfonce = candidat === niveau;
            return (
              <button
                key={candidat}
                type="button"
                aria-pressed={enfonce}
                disabled={propositions === null}
                data-admin-password-level={candidat}
                onClick={() => choisir(candidat)}
                className="shrink-0 rounded-chip px-4 text-body font-semibold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  minHeight: 44,
                  color: enfonce ? 'white' : INK,
                  backgroundColor: enfonce ? BRAND : 'var(--color-ios-surface)',
                  border: `1px solid ${enfonce ? BRAND : 'var(--color-edge)'}`,
                  outlineColor: BRAND,
                }}
              >
                {translateAdmin(language, LIBELLES_NIVEAUX[candidat])}
              </button>
            );
          })}
        </div>

        <div className="grid gap-2">
          <Field
            id="admin-password-value"
            label={translateAdmin(language, 'admin.password.field')}
            tint={BRAND}
            focused={focus}
            error={refus === null ? undefined : translateAdmin(language, 'admin.password.refused', { reason: refus })}
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                type="text"
                data-admin-password
                value={motDePasse}
                placeholder={chargement === 'loading' ? translateAdmin(language, 'admin.password.loading') : undefined}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                aria-describedby={describedBy}
                onInput={(event) => saisir(event.currentTarget.value)}
                onFocus={() => setFocus(true)}
                onBlur={() => setFocus(false)}
                className="w-full bg-transparent font-mono text-body font-semibold outline-none"
                style={{ minHeight: 44, color: INK }}
              />
            )}
          </Field>
          <p className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, chargement === 'failed' ? 'admin.password.proposals.failed' : 'admin.password.editable')}
          </p>
          <p className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.password.generated')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <ActionButton tone="secondary" disabled={chargement === 'loading'} onClick={() => setTirage((n) => n + 1)} data={{ 'data-admin-password-regenerate': '' }}>
            {translateAdmin(language, 'admin.password.regenerate')}
          </ActionButton>
          <ActionButton tone="secondary" disabled={motDePasse === ''} onClick={() => void copier()}>
            {translateAdmin(language, copie === 'copied' ? 'admin.password.copied' : 'admin.password.copy')}
          </ActionButton>
        </div>

        <div className="grid gap-2 pt-2">
          <ActionButton tone="danger" disabled={!pretAAppliquer} onClick={() => void appliquer()} data={{ 'data-admin-password-apply': '' }}>
            {translateAdmin(language, 'admin.password.apply')}
          </ActionButton>
          <ActionButton tone="secondary" onClick={onClose}>
            {translate(language, 'common.cancel')}
          </ActionButton>
        </div>
      </div>
    </Sheet>
  );
}

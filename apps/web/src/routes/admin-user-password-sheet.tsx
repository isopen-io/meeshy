import { useEffect, useState } from 'react';
import { PASSWORD_PROPOSAL_LEVELS, type PasswordProposalLevel } from '@meeshy/shared/types/admin-password-proposal';

import { AdminButton } from '@/components/admin/button';
import { AdminCheckbox, AdminFormActions, AdminFormSheet, AdminReasonField, AdminTextInput, motiveState } from '@/components/admin/form';
import { AdminFilterChips } from '@/components/admin/list-toolbar';
import { AdminInlineNotice } from '@/components/admin/states';
import { INK2 } from '@/components/admin/tone';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  ADMIN_PASSWORD_MOTIVE_MIN_LENGTH,
  fetchAdminPasswordProposals,
  resetAdminUserPassword,
  type PasswordProposals,
} from '@/lib/api/admin-user-password';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { portailDuNavigateur, type PortailPartage } from '@/lib/view/invitation';

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
 * ## Un motif, et prévenir le membre (audit 2026-10-04)
 *
 * Le motif est FACULTATIF et consigné au journal quand il est écrit (dix
 * caractères au minimum, le plancher de la passerelle) ; le rang souverain n'en
 * voit pas le champ (spec 2026-10-04 § 4). « Prévenir le membre » coche
 * `sendEmail` : la passerelle lui envoie une alerte de sécurité, sans le secret.
 * Décochée par défaut — alerter le détenteur d'un compte compromis n'est pas
 * toujours souhaitable.
 *
 * ## Le portail est INJECTÉ
 *
 * `portailDuNavigateur()` par défaut, mais remplaçable : c'est ce qui rend la
 * copie mesurable sans navigateur, et ce qui empêche un témoin de se contenter
 * d'affirmer que `navigator.clipboard` existe. Le contrat vient de
 * `@/lib/view/invitation` — l'espace NEUTRE, pas celui des liens : on réutilise
 * l'abstraction partagée, jamais l'emballage dont le nom démentirait l'usage.
 *
 * ## Les pièces du kit (#9463)
 *
 * Puces, champ, motif, case et gestes sont ceux de `components/admin` ; la règle du
 * motif est `motiveState`, la même que celle du bannissement et de la conversation.
 * L'avertissement est un avis `warning` (un `role="status"`) et non `danger` : une
 * alerte criée à chaque ouverture apprendrait à ne plus l'écouter.
 */

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
  sovereign = false,
}: {
  readonly userId: string;
  readonly language: AdminLanguage;
  readonly onClose: () => void;
  readonly onAnnounce: (texte: string) => void;
  readonly portail?: PortailPartage;
  readonly deps?: AdminDeps;
  /** Le rang souverain n'écrit pas de motif : le champ n'est pas rendu (`useAdminReach().isSovereign`, lu par la fiche). */
  readonly sovereign?: boolean;
}) {
  const [motif, setMotif] = useState('');
  const [prevenir, setPrevenir] = useState(false);
  const [propositions, setPropositions] = useState<PasswordProposals | null>(null);
  const [chargement, setChargement] = useState<Chargement>('loading');
  const [niveau, setNiveau] = useState<Niveau>(NIVEAU_INITIAL);
  const [motDePasse, setMotDePasse] = useState('');
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

  const motive = motiveState({ text: motif, minLength: ADMIN_PASSWORD_MOTIVE_MIN_LENGTH, required: false, sovereign, whenSovereign: 'hide' });

  async function appliquer() {
    if (envoi || motDePasse.length < ADMIN_PASSWORD_MIN_LENGTH || !motive.ready) return;
    setEnvoi(true);
    const resultat = await resetAdminUserPassword({
      ...deps,
      userId,
      newPassword: motDePasse,
      ...(motive.sent === null ? {} : { reason: motive.sent }),
      ...(prevenir ? { sendEmail: true } : {}),
    });
    setEnvoi(false);

    if (!resultat.ok) {
      setRefus(resultat.error);
      onAnnounce(translateAdmin(language, 'admin.password.failed'));
      return;
    }
    onAnnounce(translateAdmin(language, 'admin.password.done'));
    onClose();
  }

  const pretAAppliquer = motDePasse.length >= ADMIN_PASSWORD_MIN_LENGTH && motive.ready;

  return (
    <AdminFormSheet language={language} title={translateAdmin(language, 'admin.password.title')} onClose={onClose}>
      <AdminInlineNotice tone="warning" text={translateAdmin(language, 'admin.password.warn')} />

      <AdminFilterChips
        label={translateAdmin(language, 'admin.password.level')}
        options={PASSWORD_PROPOSAL_LEVELS.map((candidat) => ({ value: candidat, label: translateAdmin(language, LIBELLES_NIVEAUX[candidat]) }))}
        value={niveau}
        anchor="data-admin-password-level"
        disabled={propositions === null}
        onChange={(candidat) => {
          const choisi = PASSWORD_PROPOSAL_LEVELS.find((connu) => connu === candidat);
          if (choisi !== undefined) choisir(choisi);
        }}
      />

      <div className="grid gap-2">
        <AdminTextInput
          id="admin-password-value"
          label={translateAdmin(language, 'admin.password.field')}
          value={motDePasse}
          onValue={saisir}
          mono
          {...(chargement === 'loading' ? { placeholder: translateAdmin(language, 'admin.password.loading') } : {})}
          note={translateAdmin(language, chargement === 'failed' ? 'admin.password.proposals.failed' : 'admin.password.editable')}
          error={refus === null ? undefined : translateAdmin(language, 'admin.password.refused', { reason: refus })}
          data={{ 'data-admin-password': '' }}
        />
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.password.generated')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <AdminButton disabled={chargement === 'loading'} onClick={() => setTirage((n) => n + 1)} data={{ 'data-admin-password-regenerate': '' }}>
          {translateAdmin(language, 'admin.password.regenerate')}
        </AdminButton>
        <AdminButton disabled={motDePasse === ''} onClick={() => void copier()}>
          {translateAdmin(language, copie === 'copied' ? 'admin.password.copied' : 'admin.password.copy')}
        </AdminButton>
      </div>

      <AdminReasonField
        id="admin-password-motive"
        language={language}
        label={translateAdmin(language, 'admin.people.password.motive')}
        value={motif}
        onValue={setMotif}
        minLength={ADMIN_PASSWORD_MOTIVE_MIN_LENGTH}
        required={false}
        sovereign={sovereign}
        whenSovereign="hide"
        {...(motive.tooShort ? { error: translateAdmin(language, 'admin.people.password.motiveShort') } : {})}
        data={{ 'data-admin-password-motive': '' }}
      />

      <AdminCheckbox
        id="admin-password-notify"
        label={translateAdmin(language, 'admin.people.password.notify')}
        hint={translateAdmin(language, 'admin.people.password.notifyHint')}
        checked={prevenir}
        onToggle={setPrevenir}
        data={{ 'data-admin-password-notify': '' }}
      />

      <AdminFormActions
        language={language}
        primary={{
          label: translateAdmin(language, 'admin.password.apply'),
          tone: 'danger',
          busy: envoi,
          disabled: !pretAAppliquer,
          onClick: () => void appliquer(),
          data: { 'data-admin-password-apply': '' },
        }}
        onCancel={onClose}
      />
    </AdminFormSheet>
  );
}

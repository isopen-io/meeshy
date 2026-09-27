import { useState, type ReactNode } from 'react';

import { contactDraftOf, contactEditOf, sectionIsDirty, type ContactDraft } from '@/lib/admin/member-sections';
import type { AdminDeps } from '@/lib/api/admin';
import { updateAdminUser } from '@/lib/api/admin-user-actions';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { requestAdminUserVerification, setAdminUserVerification, type AdminContactChannel } from '@/lib/api/admin-user-verifications';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { BadgeVerifie, INK2, MemberSection, SectionButton, Texte, useFieldFocus, useMemberWrite } from './admin-member-parts';

/**
 * **LE CONTACT D'UN MEMBRE** (#8289) — e-mail et téléphone, chacun avec son
 * état VÉRIFIÉ lu, pas deviné (`emailVerifiedAt` / `phoneVerifiedAt`).
 *
 * Deux sortes de gestes vivent ici, et ne se confondent pas :
 * - la VALEUR (changer l'adresse, le numéro) s'enregistre avec la section ;
 * - la PREUVE (renvoyer la vérification, marquer vérifié ou non) est un geste
 *   IMMÉDIAT sur la valeur servie — renvoyer une vérification vers une adresse
 *   encore en brouillon l'enverrait à l'ancienne. Tant que la section a des
 *   modifications non enregistrées, ces gestes attendent.
 */
export function AdminMemberContactSection({
  membre,
  language,
  onAnnounce,
  deps = apiDeps,
}: {
  readonly membre: AdminUserDetail;
  readonly language: InterfaceLanguage;
  readonly onAnnounce: (texte: string) => void;
  readonly deps?: AdminDeps;
}) {
  /* Seuls les champs TOUCHÉS vivent dans l'état : le reste se relit du membre
     servi, si bien qu'un geste d'une AUTRE section (activer, valider) ne laisse
     jamais ici une valeur périmée qui ferait croire à une modification. */
  const [touches, setTouches] = useState<Partial<ContactDraft>>({});
  const draft: ContactDraft = { ...contactDraftOf(membre), ...touches };
  const focus = useFieldFocus();
  const ecriture = useMemberWrite({ userId: membre.id, language, onAnnounce });
  const edit = contactEditOf(membre, draft);
  const dirty = sectionIsDirty(edit);

  const poser = (partie: Partial<ContactDraft>) => {
    setTouches((precedent) => ({ ...precedent, ...partie }));
    ecriture.reset();
  };

  async function enregistrer() {
    const aJour = await ecriture.run(() => updateAdminUser({ ...deps, userId: membre.id, edit }));
    if (aJour !== null) setTouches({});
  }

  return (
    <MemberSection
      name="contact"
      titre={translateAdmin(language, 'admin.contact.title')}
      language={language}
      dirty={dirty}
      state={ecriture.state}
      onSave={() => void enregistrer()}
    >
      <ContactRow
        channel="email"
        membre={membre}
        language={language}
        onAnnounce={onAnnounce}
        deps={deps}
        gesturesWaiting={dirty}
        champ={
          <Texte
            id="admin-member-email"
            type="email"
            label={translateAdmin(language, 'admin.edit.email')}
            valeur={draft.email}
            error={ecriture.failure?.code === 'EMAIL_TAKEN' ? translateAdmin(language, 'admin.create.emailTaken') : undefined}
            {...focus('email')}
            onValeur={(email) => poser({ email })}
          />
        }
      />
      <ContactRow
        channel="phone"
        membre={membre}
        language={language}
        onAnnounce={onAnnounce}
        deps={deps}
        gesturesWaiting={dirty}
        champ={
          <Texte
            id="admin-member-phone"
            type="tel"
            label={translateAdmin(language, 'admin.contact.phone')}
            valeur={draft.phoneNumber}
            {...focus('phone')}
            onValeur={(phoneNumber) => poser({ phoneNumber })}
          />
        }
      />
    </MemberSection>
  );
}

/** Le membre tel qu'il sera une fois la preuve posée (ou retirée) — l'aperçu optimiste du badge. */
export function withContactProof(m: AdminUserDetail, channel: AdminContactChannel, verified: boolean): AdminUserDetail {
  const quand = verified ? new Date().toISOString() : null;
  return channel === 'email' ? { ...m, emailVerifiedAt: quand } : { ...m, phoneVerifiedAt: quand };
}

function ContactRow({
  channel,
  membre,
  language,
  onAnnounce,
  deps,
  gesturesWaiting,
  champ,
}: {
  readonly channel: AdminContactChannel;
  readonly membre: AdminUserDetail;
  readonly language: InterfaceLanguage;
  readonly onAnnounce: (texte: string) => void;
  readonly deps: AdminDeps;
  readonly gesturesWaiting: boolean;
  readonly champ: ReactNode;
}) {
  const preuve = useMemberWrite({ userId: membre.id, language, onAnnounce });
  const [renvoi, setRenvoi] = useState<{ readonly phase: 'idle' | 'sending' | 'sent' | 'failed' }>({ phase: 'idle' });

  const valeur = channel === 'email' ? membre.email : membre.phoneNumber;
  const verifie = (channel === 'email' ? membre.emailVerifiedAt : membre.phoneVerifiedAt) !== null;
  const occupe = gesturesWaiting || preuve.state.phase === 'saving' || renvoi.phase === 'sending';

  async function renvoyer() {
    setRenvoi({ phase: 'sending' });
    const resultat = await requestAdminUserVerification({ ...deps, userId: membre.id, channel });
    const phase = resultat.ok ? 'sent' : 'failed';
    setRenvoi({ phase });
    onAnnounce(translateAdmin(language, resultat.ok ? 'admin.contact.resent' : 'admin.contact.resendFailed'));
  }

  const statut =
    renvoi.phase === 'sent'
      ? translateAdmin(language, 'admin.contact.resent')
      : renvoi.phase === 'failed'
        ? translateAdmin(language, 'admin.contact.resendFailed')
        : preuve.state.phase === 'saved' || preuve.state.phase === 'error'
          ? preuve.state.message
          : '';

  return (
    <div className="grid gap-2" data-admin-contact={channel}>
      {champ}
      {valeur === '' ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <BadgeVerifie verifie={verifie} language={language} />
          {verifie ? null : (
            <SectionButton data={{ 'data-admin-contact-resend': channel }} disabled={occupe} onClick={() => void renvoyer()}>
              {translateAdmin(language, 'admin.contact.resend')}
            </SectionButton>
          )}
          <SectionButton
            data={{ 'data-admin-contact-verify': channel }}
            disabled={occupe}
            onClick={() =>
              void preuve.run(
                () => setAdminUserVerification({ ...deps, userId: membre.id, channel, verified: !verifie }),
                'admin.edit.saved',
                (avant) => withContactProof(avant, channel, !verifie),
              )
            }
          >
            {translateAdmin(language, verifie ? 'admin.contact.markUnverified' : 'admin.contact.markVerified')}
          </SectionButton>
          <p
            role="status"
            aria-live="polite"
            className="min-w-0 basis-full text-caption"
            data-admin-contact-state={channel}
            style={{ color: renvoi.phase === 'failed' || preuve.state.phase === 'error' ? 'var(--color-danger)' : INK2 }}
          >
            {statut}
          </p>
        </div>
      )}
    </div>
  );
}

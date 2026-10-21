import type { ReactNode } from 'react';

import { AuthColumn } from '@/components/auth-column';
import { Glyph } from '@/components/glyph';
import { translateAccountDeletionGuide as guide, type AccountDeletionGuideKey } from '@/lib/i18n-account-deletion-guide';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { href } from '@/routes/route-table';

import { ActionLink } from './link-page-parts';

/**
 * **`/account/deletion` VU DÉCONNECTÉ** (#9921) — l'adresse de suppression que
 * la fiche Google Play déclare (`apps/web/android/play/app-content.md` § 1 et
 * § 5 point 4). Google exige que cette page, lue sans compte, nomme l'appli,
 * décrive les étapes, dise ce qui est supprimé et ce qui est conservé, et
 * donne le délai.
 *
 * Chaque phrase décrit ce que la passerelle FAIT, pas ce qu'on voudrait
 * qu'elle fasse : `processAccountDeletionRequests` (`MaintenanceService.ts`)
 * au bout des 30 jours de `GRACE_PERIOD_DAYS` (`routes/account-deletion.ts`),
 * `purgeAccountIsolatedData` et `anonymizeUserIdentity`
 * (`AccountPurgeService.ts`), `anonymizeMessagesOfDeletedAccount` et
 * `purgeMediaOfDeletedAccount`. Le texte des publications et des commentaires
 * n'est purgé par aucune d'elles : la page le dit conservé.
 *
 * La demande elle-même reste sous session ET mot de passe (#4183) : se
 * connecter ramène ici (`?next=`), où la page connectée la reçoit. Qui a perdu
 * l'accès écrit à l'adresse que la politique de confidentialité nomme déjà.
 */

export const DELETION_CONTACT_EMAIL = 'privacy@meeshy.me';

const STEPS = [
  'accountDeletion.guide.step.signIn',
  'accountDeletion.guide.step.confirm',
  'accountDeletion.guide.step.email',
  'accountDeletion.guide.step.wait',
] as const satisfies readonly AccountDeletionGuideKey[];

const DELETED = [
  'accountDeletion.guide.deleted.profile',
  'accountDeletion.guide.deleted.access',
  'accountDeletion.guide.deleted.messages',
  'accountDeletion.guide.deleted.other',
] as const satisfies readonly AccountDeletionGuideKey[];

const KEPT = [
  'accountDeletion.guide.kept.messages',
  'accountDeletion.guide.kept.posts',
  'accountDeletion.guide.kept.packs',
  'accountDeletion.guide.kept.stats',
] as const satisfies readonly AccountDeletionGuideKey[];

const INK = { color: 'var(--color-ios-ink)' } as const;
const INK_2 = { color: 'var(--color-ios-ink-2)' } as const;

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-thread font-bold" style={INK}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Items({ language, keys, ordered }: { readonly language: InterfaceLanguage; readonly keys: readonly AccountDeletionGuideKey[]; readonly ordered: boolean }) {
  const List = ordered ? 'ol' : 'ul';
  return (
    <List className={`grid gap-2 ps-5 ${ordered ? 'list-decimal' : 'list-disc'}`} style={INK_2}>
      {keys.map((key) => (
        <li key={key}>{guide(language, key)}</li>
      ))}
    </List>
  );
}

function ContactLink() {
  return (
    <a href={`mailto:${DELETION_CONTACT_EMAIL}`} className="font-semibold underline" style={{ color: 'var(--color-ios-brand)' }}>
      {DELETION_CONTACT_EMAIL}
    </a>
  );
}

export function DeletionGuidePage({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <AuthColumn className="gap-6 px-8 py-8 text-start">
      <header className="grid gap-3 text-center">
        <span aria-hidden="true" className="mx-auto" style={{ color: 'var(--color-ios-brand)' }}>
          <Glyph name="warningCircle" size={48} />
        </span>
        <h1 className="text-screen font-bold" style={INK}>
          {guide(language, 'accountDeletion.guide.title')}
        </h1>
        <p style={INK_2}>{guide(language, 'accountDeletion.guide.intro')}</p>
      </header>
      <Section title={guide(language, 'accountDeletion.guide.steps.title')}>
        <Items language={language} keys={STEPS} ordered />
      </Section>
      <div className="grid gap-3">
        <ActionLink to="login" search={{ next: href('accountDeletion') }} tone="primary">
          {guide(language, 'accountDeletion.guide.signIn')}
        </ActionLink>
      </div>
      <Section title={guide(language, 'accountDeletion.guide.deleted.title')}>
        <Items language={language} keys={DELETED} ordered={false} />
      </Section>
      <Section title={guide(language, 'accountDeletion.guide.kept.title')}>
        <Items language={language} keys={KEPT} ordered={false} />
      </Section>
      <Section title={guide(language, 'accountDeletion.guide.delay.title')}>
        <p style={INK_2}>{guide(language, 'accountDeletion.guide.delay.body')}</p>
      </Section>
      <Section title={guide(language, 'accountDeletion.guide.noAccess.title')}>
        <p style={INK_2}>{guide(language, 'accountDeletion.guide.noAccess.body')}</p>
        <ContactLink />
      </Section>
      <ActionLink to="home" tone="secondary">
        {translate(language, 'linkPage.home')}
      </ActionLink>
    </AuthColumn>
  );
}

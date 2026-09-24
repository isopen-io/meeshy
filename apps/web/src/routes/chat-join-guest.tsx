import { getLanguageInfo } from '@meeshy/shared/utils/languages';

import { Field } from '@/components/field';
import type { GuestDraft, GuestField, GuestTerms } from '@/lib/api/link-join';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

/**
 * **LE FORMULAIRE D'INVITÉ** (#5561) — ce qu'on demande à quelqu'un qui n'a pas
 * de compte, et rien de plus.
 *
 * Extrait de `chat-join.tsx` pour la raison habituelle (budget de taille) et
 * pour une seconde, propre à cet écran : l'invitation se lit sans lui. Un lien
 * qui exige un compte (`guest.allowed === false`) ne monte jamais ce module, et
 * un visiteur DÉJÀ connecté non plus — c'est un composant, pas un `import()`,
 * mais la séparation garde la question « que voit-on avant de choisir ? »
 * lisible d'un seul fichier.
 *
 * **PSEUDO ET LANGUE CÔTE À CÔTE**, l'un et l'autre sur une rangée qui se
 * REPLIE sous 360 px (`flex-wrap`) : c'est ce qui garde l'action primaire dans
 * le premier écran, la mesure que #5561 pose comme critère de fin. E-mail et
 * date de naissance ne paraissent QUE si le lien les exige — les afficher
 * « au cas où » coûterait deux champs à tout le monde pour une minorité de
 * liens.
 *
 * **Un refus se pose SOUS son champ** (`Field § error`, `aria-describedby` +
 * `role="alert"`), jamais dans un bandeau : c'est la moitié de la promesse de
 * l'issue, l'autre étant qu'un refus du LIEN retire ce formulaire entier.
 *
 * **`onInput` sur les champs TEXTE, `onChange` sur le `<select>`** — c'est la
 * convention du dépôt (`components/composer.tsx:569`), et elle n'est pas
 * cosmétique : mesuré par `test-support/react-events-probe.test.tsx`, un
 * événement `input` dispatché sous happy-dom déclenche bien `onInput` mais PAS
 * `onChange` sur un `<input>`. Un champ câblé en `onChange` se rend, se remplit
 * à l'œil… et ne rapporte jamais rien à son hôte, sans qu'aucun témoin d'écran
 * ne sache dire pourquoi. Le `<select>`, lui, parle bien `change`.
 */

/** Ce que l'écran peut proposer comme langue. Le lien restreint
 * (`allowedLanguages`) ; sinon les sept langues du produit — jamais une liste
 * inventée, jamais une langue que la passerelle refuserait ensuite. */
export function guestLanguageOptions(terms: GuestTerms): readonly string[] {
  return terms.languages.length > 0 ? terms.languages : SUPPORTED_INTERFACE_LANGUAGES;
}

/**
 * La langue PRÉ-CHOISIE — celle de l'interface si le lien l'accepte, sinon la
 * première qu'il accepte. Un `<select>` qui s'ouvre sur une valeur refusée
 * ferait échouer le premier envoi sans que rien ne l'ait annoncé.
 */
export function defaultGuestLanguage(terms: GuestTerms, preferred: string): string {
  const options = guestLanguageOptions(terms);
  return options.includes(preferred) ? preferred : (options[0] ?? preferred);
}

const endonym = (code: string): string => {
  const info = getLanguageInfo(code);
  return info.nativeName ?? info.name ?? code;
};

const FIELD_TINT = 'var(--ios-indigo-500)';
const INPUT_CLASS = 'min-w-0 flex-1 bg-transparent text-body outline-none';
const INPUT_STYLE = { minHeight: 44, color: 'var(--color-ios-ink)' } as const;

export type GuestFormProps = {
  readonly terms: GuestTerms;
  readonly draft: GuestDraft;
  readonly busy: boolean;
  readonly online: boolean;
  /** Le champ refusé, et ce qu'on en dit — `null` quand rien n'est refusé. */
  readonly refusedField: GuestField | null;
  readonly refusalMessage: string | null;
  readonly focused: GuestField | null;
  readonly onEdit: (field: GuestField, value: string) => void;
  readonly onFocus: (field: GuestField | null) => void;
  readonly onSubmit: () => void;
};

export function GuestForm({
  terms,
  draft,
  busy,
  online,
  refusedField,
  refusalMessage,
  focused,
  onEdit,
  onFocus,
  onSubmit,
}: GuestFormProps) {
  const errorFor = (field: GuestField): string | undefined =>
    refusedField === field && refusalMessage !== null ? refusalMessage : undefined;

  const languages = guestLanguageOptions(terms);
  const disabled = busy || !online;

  return (
    <form
      noValidate
      data-guest-form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="grid w-full gap-3"
    >
      {/* Le message qu'aucun champ ne porte : un refus de saisie que la
          passerelle n'a rattaché à rien. Au-dessus du formulaire, jamais sous
          un champ deviné. */}
      {refusedField === null && refusalMessage !== null ? (
        <p role="alert" className="text-caption" style={{ color: 'var(--ios-error)' }}>
          {refusalMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <div className="min-w-[10rem] flex-1">
          <Field
            id="chat-join-nickname"
            label={terms.nicknameRequired ? 'Votre pseudo' : 'Votre pseudo (facultatif)'}
            icon="user"
            tint={FIELD_TINT}
            focused={focused === 'nickname'}
            error={errorFor('nickname')}
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                name="nickname"
                data-guest-nickname
                aria-describedby={describedBy}
                aria-required={terms.nicknameRequired}
                aria-invalid={refusedField === 'nickname'}
                autoComplete="nickname"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={50}
                value={draft.nickname}
                placeholder={terms.nicknameRequired ? 'Comment vous appeler ?' : 'Laissez vide pour un pseudo généré'}
                onInput={(event) => onEdit('nickname', event.currentTarget.value)}
                onFocus={() => onFocus('nickname')}
                onBlur={() => onFocus(null)}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            )}
          </Field>
        </div>

        <div className="min-w-[8rem] flex-1">
          <Field
            id="chat-join-language"
            label="Votre langue"
            icon="translate"
            tint={FIELD_TINT}
            focused={focused === 'language'}
            error={errorFor('language')}
          >
            {({ id, describedBy }) => (
              <select
                id={id}
                name="language"
                data-guest-language
                aria-describedby={describedBy}
                aria-invalid={refusedField === 'language'}
                value={draft.language}
                onChange={(event) => onEdit('language', event.currentTarget.value)}
                onFocus={() => onFocus('language')}
                onBlur={() => onFocus(null)}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              >
                {languages.map((code) => (
                  <option key={code} value={code}>
                    {endonym(code)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </div>

      {terms.emailRequired ? (
        <Field
          id="chat-join-email"
          label="Votre e-mail"
          icon="envelopeOpen"
          tint={FIELD_TINT}
          focused={focused === 'email'}
          error={errorFor('email')}
        >
          {({ id, describedBy }) => (
            <input
              id={id}
              name="email"
              type="email"
              data-guest-email
              aria-describedby={describedBy}
              aria-required="true"
              aria-invalid={refusedField === 'email'}
              autoComplete="email"
              value={draft.email}
              placeholder="vous@exemple.com"
              onInput={(event) => onEdit('email', event.currentTarget.value)}
              onFocus={() => onFocus('email')}
              onBlur={() => onFocus(null)}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          )}
        </Field>
      ) : null}

      {terms.birthdayRequired ? (
        <Field
          id="chat-join-birthday"
          label="Votre date de naissance"
          /* Aucun glyphe : le jeu du socle n'a pas de calendrier, et en
             emprunter un d'un autre sens (horloge, minuterie) dirait autre
             chose que « date de naissance ». Un champ sans icône se lit ; un
             champ à la mauvaise icône trompe. */
          tint={FIELD_TINT}
          focused={focused === 'birthday'}
          error={errorFor('birthday')}
        >
          {({ id, describedBy }) => (
            <input
              id={id}
              name="birthday"
              type="date"
              data-guest-birthday
              aria-describedby={describedBy}
              aria-required="true"
              aria-invalid={refusedField === 'birthday'}
              value={draft.birthday}
              onInput={(event) => onEdit('birthday', event.currentTarget.value)}
              onFocus={() => onFocus('birthday')}
              onBlur={() => onFocus(null)}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          )}
        </Field>
      ) : null}

      <button
        type="submit"
        data-guest-submit
        disabled={disabled}
        aria-busy={busy}
        className="grid w-full place-items-center rounded-[14px] font-bold text-white transition-opacity"
        style={{
          minHeight: 52,
          background: 'linear-gradient(90deg, var(--ios-indigo-600), var(--ios-indigo-400))',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {busy ? 'Entrée dans la conversation…' : 'Continuer en anonyme'}
      </button>

      {online ? null : (
        <p className="text-center text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          Hors ligne — rejoindre attendra le retour du réseau.
        </p>
      )}
    </form>
  );
}

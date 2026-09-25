/**
 * CE QUE L'INSCRIPTION VA CRÉER, EN SAISIE DIRECTE (#6479, refait par #7897).
 *
 * Directive porteur 2026-09-25 : « ne plus avoir un éditer mais directement
 * avoir un prénom nom rempli automatiquement et le displayname rempli à partir
 * de là, le pseudo rempli à partir de l'email et les autres champs sont
 * modifiables directement par simple touché […] Tout se met à jour en direct. »
 *
 * Les quatre valeurs viennent de `lib/signup-form.ts` (`effective*`), qui lit
 * `@meeshy/shared/utils/registration-identity` — LA loi que la passerelle
 * applique. Ce composant ne décide rien : il rend des saisies déjà remplies.
 * Un toucher suffit pour modifier ; le chemin nominal reste ZÉRO geste
 * (dimension 12 : la complexité se paie dans le code).
 */
export type IdentityField = 'firstName' | 'lastName' | 'displayName' | 'username';

type IdentityValues = Readonly<Record<IdentityField, string>>;

const FIELDS: Readonly<Record<IdentityField, { id: string; label: string; autoComplete: string; prefix?: string }>> = {
  firstName: { id: 'signup-first-name', label: 'Prénom', autoComplete: 'given-name' },
  lastName: { id: 'signup-last-name', label: 'Nom', autoComplete: 'family-name' },
  displayName: { id: 'signup-display-name', label: 'Nom affiché', autoComplete: 'nickname' },
  username: { id: 'signup-username', label: 'Pseudo', autoComplete: 'username', prefix: '@' },
};

export function DerivedIdentity({
  values,
  placeholders,
  onChange,
  tint,
  focusedField,
  onFocus,
  onBlur,
  errors,
  suggestions,
}: {
  /** Ce que chaque saisie AFFICHE — la frappe, ou la dérivation tant qu'on n'a pas touché. */
  values: IdentityValues;
  /** La dérivation, montrée en filigrane quand un champ est vidé. */
  placeholders: IdentityValues;
  onChange: (field: IdentityField, value: string) => void;
  tint: string;
  focusedField: IdentityField | null;
  onFocus: (field: IdentityField) => void;
  onBlur: () => void;
  errors: Readonly<Partial<Record<IdentityField, string | undefined>>>;
  /** Les pseudos libres servis avec un refus `USERNAME_TAKEN`. */
  suggestions: readonly string[];
}) {
  const input = (field: IdentityField) => (
    <IdentityInput
      field={field}
      value={values[field]}
      placeholder={placeholders[field]}
      onChange={(value) => onChange(field, value)}
      onFocus={() => onFocus(field)}
      onBlur={onBlur}
      focused={focusedField === field}
      tint={tint}
      error={errors[field]}
    />
  );

  return (
    <div className="grid gap-3 rounded-[14px] px-4 py-3" style={{ backgroundColor: 'var(--color-ios-card)' }} data-derived-identity>
      <p className="text-caption font-medium" style={{ color: 'var(--color-ios-ink-3)' }}>
        Votre identité
      </p>

      <div className="grid grid-cols-2 gap-2">
        {input('firstName')}
        {input('lastName')}
      </div>
      {input('displayName')}
      {input('username')}

      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2" data-username-suggestions>
          {suggestions.map((candidat) => (
            <button
              key={candidat}
              type="button"
              onClick={() => onChange('username', candidat)}
              className="rounded-chip px-3 text-caption font-semibold"
              style={{ minHeight: 44, color: tint, backgroundColor: `color-mix(in srgb, ${tint} 12%, transparent)` }}
            >
              @{candidat}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function IdentityInput({
  field,
  value,
  placeholder,
  onChange,
  onFocus,
  onBlur,
  focused,
  tint,
  error,
}: {
  field: IdentityField;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  focused: boolean;
  tint: string;
  error?: string | undefined;
}) {
  const { id, label, autoComplete, prefix } = FIELDS[field];
  const errorId = `${id}-error`;
  const isName = field !== 'username';
  return (
    <div className="grid min-w-0 gap-1">
      <label htmlFor={id} className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
        {label}
      </label>
      <div
        className="flex min-w-0 items-center gap-1 rounded-[12px] px-3"
        style={{
          minHeight: 44,
          border: `${focused ? '2px' : '1px'} solid ${
            focused ? `color-mix(in srgb, ${tint} 60%, transparent)` : 'color-mix(in srgb, var(--color-ios-ink-3) 30%, transparent)'
          }`,
        }}
      >
        {prefix !== undefined ? (
          <span aria-hidden="true" className="text-input" style={{ color: 'var(--color-ios-ink-3)' }}>
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          type="text"
          autoComplete={autoComplete}
          autoCapitalize={isName ? 'words' : 'none'}
          autoCorrect="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          onInput={(event) => onChange(event.currentTarget.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          className="w-full min-w-0 bg-transparent py-2 text-input outline-none"
          style={{ color: 'var(--color-ios-ink)' }}
          aria-describedby={error !== undefined ? errorId : undefined}
          aria-invalid={error !== undefined}
        />
      </div>
      {error !== undefined ? (
        <p id={errorId} role="alert" className="text-caption" style={{ color: 'var(--ios-error)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

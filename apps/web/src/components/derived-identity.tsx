/**
 * CE QUE L'INSCRIPTION VA CRÉER, MONTRÉ ET ENVOYÉ (#6479).
 *
 * Directive porteur, en deux temps. D'abord : « montre comment le display name
 * sera dérivé et comment le pseudo sera dérivé et laisse le soin à
 * l'utilisateur de modifier ou non ». Puis, sur relecture : « dès qu'un champ
 * username est rempli la passerelle n'a plus rien à créer — ici on a des
 * données et la passerelle doit utiliser ces données ».
 *
 * Les deux valeurs viennent de `@meeshy/shared/utils/registration-identity`,
 * LA loi que la passerelle applique. L'hôte les calcule et les ENVOIE ; ce
 * composant ne fait que les rendre et ouvrir la saisie.
 *
 * ## Deux saisies déjà remplies, aucun bouton « Modifier » (#7897)
 *
 * Directive porteur 2026-09-25 : « si on peut modifier le display name [et]
 * le pseudo directement sans action supplémentaire c'est ok ». Les deux
 * champs arrivent REMPLIS depuis l'adresse et se modifient d'un toucher ; tant
 * qu'on ne les touche pas, ils suivent l'adresse en direct. Prénom et nom
 * restent dérivés du nom affiché par la passerelle, et se changent depuis
 * l'espace de compte. Le chemin nominal reste ZÉRO geste (dimension 12).
 */
export function DerivedIdentity({
  username,
  displayName,
  onUsernameChange,
  onDisplayNameChange,
  tint,
  focusedField,
  onFocus,
  onBlur,
  usernameError,
  displayNameError,
  suggestions,
  usernamePlaceholder,
  displayNamePlaceholder,
}: {
  /** Ce que la saisie du pseudo AFFICHE — la frappe, ou l'adresse tant qu'on n'a pas touché. */
  username: string;
  /** Ce que la saisie du nom affiché AFFICHE — même règle. */
  displayName: string;
  /** La dérivation, en filigrane quand un champ est vidé. */
  usernamePlaceholder: string;
  displayNamePlaceholder: string;
  onUsernameChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  tint: string;
  focusedField: 'username' | 'displayName' | null;
  onFocus: (field: 'username' | 'displayName') => void;
  onBlur: () => void;
  usernameError?: string | undefined;
  displayNameError?: string | undefined;
  /** Les pseudos libres servis avec un refus `USERNAME_TAKEN`. */
  suggestions: readonly string[];
}) {
  return (
    <div className="grid gap-3 rounded-[14px] px-4 py-3" style={{ backgroundColor: 'var(--color-ios-card)' }} data-derived-identity>
      <p className="text-caption font-medium" style={{ color: 'var(--color-ios-ink-3)' }}>
        Votre identité
      </p>

      <IdentityInput
        id="signup-display-name"
        label="Nom affiché"
        value={displayName}
        placeholder={displayNamePlaceholder}
        onChange={onDisplayNameChange}
        onFocus={() => onFocus('displayName')}
        onBlur={onBlur}
        focused={focusedField === 'displayName'}
        tint={tint}
        error={displayNameError}
      />

      <IdentityInput
        id="signup-username"
        label="Pseudo"
        prefix="@"
        value={username}
        placeholder={usernamePlaceholder}
        onChange={onUsernameChange}
        onFocus={() => onFocus('username')}
        onBlur={onBlur}
        focused={focusedField === 'username'}
        tint={tint}
        error={usernameError}
      />

      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2" data-username-suggestions>
          {suggestions.map((candidat) => (
            <button
              key={candidat}
              type="button"
              onClick={() => onUsernameChange(candidat)}
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

/** Une saisie du bloc, toujours ouverte : un toucher suffit pour modifier. */
function IdentityInput({
  id,
  label,
  prefix,
  value,
  placeholder,
  onChange,
  onFocus,
  onBlur,
  focused,
  tint,
  error,
}: {
  id: string;
  label: string;
  prefix?: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  focused: boolean;
  tint: string;
  error?: string | undefined;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
        {label}
      </label>
      <div
        className="flex items-center gap-1 rounded-[14px] px-4"
        style={{
          minHeight: 48,
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
          autoComplete={prefix === undefined ? 'name' : 'username'}
          autoCapitalize={prefix === undefined ? 'words' : 'none'}
          autoCorrect="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          onInput={(event) => onChange(event.currentTarget.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          className="w-full bg-transparent py-3 text-input outline-none"
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

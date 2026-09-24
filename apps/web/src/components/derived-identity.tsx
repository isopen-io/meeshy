import { useState } from 'react';

import { Glyph, GlyphSvg } from './glyph';
import { AUTH_GLYPHS } from './glyphs-auth';

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
 * ## Pourquoi un bloc plutôt que deux champs
 *
 * Deux champs vides ne disent rien de ce qui arrivera. Ce bloc REND le
 * résultat et n'ouvre la saisie que si on la demande : le chemin nominal est
 * ZÉRO geste — on tape son adresse, on voit son identité, on continue. La
 * complexité se paie dans le code, jamais chez l'utilisateur (dimension 12).
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
}: {
  /** Le pseudo qui PARTIRA — tapé ou dérivé, l'hôte a déjà tranché. */
  username: string;
  /** Le nom affiché qui PARTIRA — même règle. */
  displayName: string;
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
  const [isEditing, setEditing] = useState(false);
  // Un refus qui vise le pseudo OUVRE la saisie : laisser le bloc replié
  // montrerait un message d'erreur sous un champ que rien ne permet d'atteindre.
  const isOpen = isEditing || usernameError !== undefined || displayNameError !== undefined;

  return (
    <div className="grid gap-2 rounded-[14px] px-4 py-3" style={{ backgroundColor: 'var(--color-ios-card)' }} data-derived-identity>
      <p className="text-caption font-medium" style={{ color: 'var(--color-ios-ink-3)' }}>
        Votre identité
      </p>

      <div className="flex items-center gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span data-derived-display-name className="truncate text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
            {/* Le repli est le PSEUDO, jamais du blanc : une adresse dont rien
                n'est slugifiable ne donne aucun nom affiché, et laisser vide
                ferait croire que rien ne sera créé. */}
            {displayName !== '' ? displayName : username}
          </span>
          <span data-derived-username className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            @{username !== '' ? username : '…'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setEditing((open) => !open)}
          aria-expanded={isOpen}
          aria-controls="signup-identity-fields"
          className="flex shrink-0 items-center gap-1 rounded-chip px-2 text-caption font-semibold"
          style={{ minHeight: 44, color: tint }}
        >
          {/* La croix vient du SOCLE (elle sert partout), le crayon du jeu
              d'écran — un glyphe d'une seule route ne se paie pas au démarrage
              à froid de toutes les autres (§ extract-glyphs.mjs). */}
          {isOpen ? <Glyph name="x" size={16} /> : <GlyphSvg glyph={AUTH_GLYPHS.pencilSimple} size={16} />}
          {isOpen ? 'Fermer' : 'Modifier'}
        </button>
      </div>

      {/* LE RESSORT DU COMPOSER (`spring(response: 0.32, damping: 0.8)`,
          `UniversalComposerBar+Attachments.swift:228`), rendu en grille
          `0fr → 1fr` : la hauteur s'anime sans qu'aucune valeur fixe ne soit
          devinée, et le contenu reste mesuré par lui-même. `prefers-reduced-motion`
          la coupe (§ app.css) — une animation qui EXPLIQUE ne doit pas être une
          animation qu'on subit. */}
      <div id="signup-identity-fields" className="signup-spring grid" style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}>
        <div className="overflow-hidden">
          <div className="grid gap-2 pt-1">
            <IdentityInput
              id="signup-username"
              label="Pseudo"
              prefix="@"
              value={username}
              onChange={onUsernameChange}
              onFocus={() => onFocus('username')}
              onBlur={onBlur}
              focused={focusedField === 'username'}
              tint={tint}
              error={usernameError}
              reachable={isOpen}
            />

            {suggestions.length > 0 ? (
              <div className="flex flex-wrap gap-2" data-username-suggestions>
                {suggestions.map((candidat) => (
                  <button
                    key={candidat}
                    type="button"
                    onClick={() => onUsernameChange(candidat)}
                    className="rounded-chip px-3 text-caption font-semibold"
                    style={{ minHeight: 44, color: tint, backgroundColor: 'var(--color-ios-card)' }}
                  >
                    @{candidat}
                  </button>
                ))}
              </div>
            ) : null}

            <IdentityInput
              id="signup-display-name"
              label="Nom affiché"
              value={displayName}
              onChange={onDisplayNameChange}
              onFocus={() => onFocus('displayName')}
              onBlur={onBlur}
              focused={focusedField === 'displayName'}
              tint={tint}
              error={displayNameError}
              reachable={isOpen}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Une saisie du bloc — même surface que `Field`, sans son libellé extérieur. */
function IdentityInput({
  id,
  label,
  prefix,
  value,
  onChange,
  onFocus,
  onBlur,
  focused,
  tint,
  error,
  reachable,
}: {
  id: string;
  label: string;
  prefix?: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  focused: boolean;
  tint: string;
  error?: string | undefined;
  /** Replié, la saisie sort du parcours clavier — un champ invisible qu'on
   * atteint à la tabulation est un piège, pas une commodité. */
  reachable: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-1">
      <div
        className="flex items-center gap-1 rounded-[14px] px-4"
        style={{
          minHeight: 48,
          backgroundColor: 'var(--color-ios-card)',
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
          value={value}
          onInput={(event) => onChange(event.currentTarget.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          className="w-full bg-transparent py-3 text-input outline-none"
          style={{ color: 'var(--color-ios-ink)' }}
          aria-label={label}
          aria-describedby={error !== undefined ? errorId : undefined}
          aria-invalid={error !== undefined}
          tabIndex={reachable ? undefined : -1}
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

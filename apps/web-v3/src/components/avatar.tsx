import type { Author } from '@/lib/api/model';

/**
 * L'AVATAR, avec sa geometrie derivee — les memes formules que
 * `MeeshyAvatar.swift:165-186` :
 *
 *   anneau      = taille + 6        police initiales = taille x 0.38
 *   pastille    = taille x 0.26     epaisseur anneau = taille <= 32 ? 1.5 : 2.5
 *
 * La PASTILLE DE PRESENCE se pose a 45 degres SUR LE BORD du cercle, pas dans
 * le coin de sa boite : `centre + rayon x cos(pi/4)`, soit 85,36 % du diametre.
 * Posee en `bottom-0 right-0`, elle mordrait le vide du coin — l'ecart se voit
 * a l'oeil des la taille 52.
 *
 * Et `hors-ligne` ne rend AUCUNE pastille : c'est une regle produit du depot
 * (« offline = pas de pastille sur les avatars »), pas un oubli.
 */
const TINTS: Record<1 | 2 | 3 | 4, string> = {
  1: 'var(--color-av-1)',
  2: 'var(--color-av-2)',
  3: 'var(--color-av-3)',
  4: 'var(--color-av-4)',
};

const PRESENCE: Record<Exclude<Author['presence'], 'offline'>, string> = {
  online: 'var(--color-online)',
  away: 'var(--color-away)',
  idle: 'var(--color-idle)',
};

export function Avatar({
  initials,
  tint,
  size,
  presence,
  name,
}: {
  initials: string;
  tint: 1 | 2 | 3 | 4;
  size: number;
  presence?: Author['presence'];
  name?: string;
}) {
  const color = TINTS[tint];
  const dot = size * 0.26;
  // 0.8536 = (1 + cos(pi/4)) / 2 — le point a 45 deg sur le cercle, en fraction
  // du diametre. On retranche la moitie de la pastille pour la CENTRER dessus.
  const offset = size * 0.8536 - dot / 2;
  const showsDot = presence !== undefined && presence !== 'offline';

  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span
        className="grid size-full place-items-center rounded-chip font-semibold text-ios-surface"
        style={{
          background: `linear-gradient(135deg, ${color}, color-mix(in oklch, ${color} 68%, white))`,
          fontSize: size * 0.38,
        }}
        aria-hidden={name === undefined}
        aria-label={name}
        role={name === undefined ? undefined : 'img'}
      >
        {initials}
      </span>
      {showsDot ? (
        <span
          className="absolute rounded-chip"
          style={{
            width: dot,
            height: dot,
            left: offset,
            top: offset,
            backgroundColor: PRESENCE[presence],
            boxShadow: '0 0 0 2px var(--ios-surface)',
          }}
          aria-hidden
        />
      ) : null}
    </span>
  );
}

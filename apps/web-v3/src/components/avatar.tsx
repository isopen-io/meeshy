import type { Auteur } from '@/lib/api/modele';

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
const TEINTES: Record<1 | 2 | 3 | 4, string> = {
  1: 'var(--color-av-1)',
  2: 'var(--color-av-2)',
  3: 'var(--color-av-3)',
  4: 'var(--color-av-4)',
};

const PRESENCE: Record<Exclude<Auteur['presence'], 'hors-ligne'>, string> = {
  'en-ligne': 'var(--color-presence-en-ligne)',
  absent: 'var(--color-presence-absent)',
  inactif: 'var(--color-presence-inactif)',
};

export function Avatar({
  initiales,
  teinte,
  taille,
  presence,
  nom,
}: {
  initiales: string;
  teinte: 1 | 2 | 3 | 4;
  taille: number;
  presence?: Auteur['presence'];
  nom?: string;
}) {
  const couleur = TEINTES[teinte];
  const pastille = taille * 0.26;
  // 0.8536 = (1 + cos(pi/4)) / 2 — le point a 45 deg sur le cercle, en fraction
  // du diametre. On retranche la moitie de la pastille pour la CENTRER dessus.
  const decalage = taille * 0.8536 - pastille / 2;
  const montrePastille = presence !== undefined && presence !== 'hors-ligne';

  return (
    <span className="relative shrink-0" style={{ width: taille, height: taille }}>
      <span
        className="grid size-full place-items-center rounded-pastille font-semibold text-ios-fond"
        style={{
          background: `linear-gradient(135deg, ${couleur}, color-mix(in oklch, ${couleur} 68%, white))`,
          fontSize: taille * 0.38,
        }}
        aria-hidden={nom === undefined}
        aria-label={nom}
        role={nom === undefined ? undefined : 'img'}
      >
        {initiales}
      </span>
      {montrePastille ? (
        <span
          className="absolute rounded-pastille"
          style={{
            width: pastille,
            height: pastille,
            left: decalage,
            top: decalage,
            backgroundColor: PRESENCE[presence],
            boxShadow: '0 0 0 2px var(--ios-plan-fond)',
          }}
          aria-hidden
        />
      ) : null}
    </span>
  );
}

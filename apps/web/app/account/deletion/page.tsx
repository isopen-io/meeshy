/**
 * `/account/deletion` — la page qui DIT la conséquence avant de l'appliquer.
 *
 * Les liens de suppression envoyés par courriel visaient auparavant des `GET`
 * du gateway qui MUTAIENT : un antivirus de messagerie, un Safe Links ou un
 * pré-chargeur de navigateur confirmait la suppression d'un compte sans qu'un
 * humain ne clique jamais. La personne qui s'était ravisée n'apprenait rien —
 * aucun courriel n'est émis entre la confirmation et l'expiration — et son
 * compte tombait quatre-vingt-dix jours plus tard (#4183).
 *
 * Cette page est ce qui rétablit le consentement : elle énonce l'effet, et
 * c'est le CLIC qui déclenche le `POST`. Une machine qui suit le lien voit du
 * texte, rien de plus.
 */
'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ShieldCheck, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildApiUrl } from '@/lib/config';

type Action = 'confirm' | 'cancel' | 'purge';

type Resultat = {
  readonly status: string;
  readonly gracePeriodEndsAt: string | null;
  readonly canCancelUntil: string | null;
  readonly dataPurged: boolean;
};

const ACTIONS: Record<Action, {
  titre: string;
  consequence: string;
  bouton: string;
  ton: 'danger' | 'safe';
}> = {
  confirm: {
    titre: 'Confirmer la suppression de votre compte',
    consequence:
      "Votre compte sera désactivé à l'issue d'une période de grâce de 90 jours. Pendant toute cette période, vous pouvez revenir en arrière — depuis l'application ou depuis le lien « Annuler » de vos courriels.",
    bouton: 'Confirmer la suppression',
    ton: 'danger',
  },
  cancel: {
    titre: 'Annuler la suppression de votre compte',
    consequence:
      'Votre compte reste actif et la demande de suppression est abandonnée. Rien n’est perdu.',
    bouton: 'Annuler la suppression',
    ton: 'safe',
  },
  purge: {
    titre: 'Supprimer votre compte immédiatement',
    consequence:
      "Votre compte sera désactivé sur-le-champ et toutes vos sessions fermées. Vos données restent conservées le temps de la durée de rétention légale, puis sont effacées — la désactivation est immédiate, l'effacement ne l'est pas.",
    bouton: 'Supprimer maintenant',
    ton: 'danger',
  },
};

function estAction(valeur: string | null): valeur is Action {
  return valeur === 'confirm' || valeur === 'cancel' || valeur === 'purge';
}

function Carte({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-slate-50 dark:bg-gray-950">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 shadow-sm">
        {children}
      </div>
    </div>
  );
}

function ContenuSuppression() {
  const params = useSearchParams();
  const token = params.get('token');
  const actionBrute = params.get('action');
  const action = estAction(actionBrute) ? actionBrute : null;

  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const config = useMemo(() => (action ? ACTIONS[action] : null), [action]);

  const resoudre = useCallback(async () => {
    if (!token || !action) return;
    setEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch(buildApiUrl('/account/deletion/resolve'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
      });
      const charge = await reponse.json();
      if (!reponse.ok) {
        // L'enveloppe du gateway est PLATE : `message` et `code` à la racine.
        setErreur(charge?.message || 'Ce lien n’est plus valide.');
        return;
      }
      setResultat(charge.data as Resultat);
    } catch {
      setErreur('Le service est momentanément indisponible. Réessayez dans quelques minutes.');
    } finally {
      setEnCours(false);
    }
  }, [token, action]);

  if (!token || !config) {
    return (
      <Carte>
        <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" aria-hidden />
        <h1 className="text-xl font-semibold mb-2">Lien incomplet</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Ce lien ne porte pas les informations nécessaires. Relancez la demande depuis l’application.
        </p>
        <Button asChild variant="outline"><Link href="/">Retour à Meeshy</Link></Button>
      </Carte>
    );
  }

  if (resultat) {
    return (
      <Carte>
        <ShieldCheck className="h-10 w-10 text-emerald-500 mb-4" aria-hidden />
        <h1 className="text-xl font-semibold mb-2">C’est fait</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2">
          {resultat.status === 'CANCELLED' && 'Votre compte reste actif : la demande de suppression est abandonnée.'}
          {resultat.status === 'CONFIRMED' && resultat.gracePeriodEndsAt &&
            `Votre demande est confirmée. Votre compte sera désactivé après le ${new Date(resultat.gracePeriodEndsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.`}
          {resultat.status === 'COMPLETED' && 'Votre compte est désactivé et toutes vos sessions ont été fermées.'}
        </p>
        {resultat.status === 'CONFIRMED' && (
          <p className="text-sm text-slate-500 dark:text-slate-500 mb-6">
            Vous pouvez revenir en arrière à tout moment jusqu’à cette date.
          </p>
        )}
        {resultat.status === 'COMPLETED' && !resultat.dataPurged && (
          // Dire la vérité : la page annonçait « supprimé définitivement »
          // quand le code ne fait qu'un `isActive: false` + `deletedAt`.
          <p className="text-sm text-slate-500 dark:text-slate-500 mb-6">
            Vos données sont conservées le temps de la durée de rétention légale, puis effacées.
          </p>
        )}
        <Button asChild variant="outline"><Link href="/">Retour à Meeshy</Link></Button>
      </Carte>
    );
  }

  const danger = config.ton === 'danger';

  return (
    <Carte>
      {danger
        ? <Trash2 className="h-10 w-10 text-red-500 mb-4" aria-hidden />
        : <Undo2 className="h-10 w-10 text-emerald-500 mb-4" aria-hidden />}

      <h1 className="text-xl font-semibold mb-3">{config.titre}</h1>
      <p className="text-slate-600 dark:text-slate-400 mb-6">{config.consequence}</p>

      {erreur && (
        <p role="alert" className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {erreur}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={resoudre}
          disabled={enCours}
          variant={danger ? 'destructive' : 'default'}
          className="flex-1"
        >
          {enCours ? 'Un instant…' : config.bouton}
        </Button>
        <Button asChild variant="outline" className="flex-1">
          <Link href="/">Ne rien faire</Link>
        </Button>
      </div>
    </Carte>
  );
}

export default function PageSuppressionCompte() {
  return (
    <Suspense fallback={<Carte><p className="text-slate-500">Chargement…</p></Carte>}>
      <ContenuSuppression />
    </Suspense>
  );
}

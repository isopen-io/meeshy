## Leçon 251 — un gate dont on silence la sortie ne mesure plus ce qu'on croit

Même cycle. Une preuve de ROUGE a d'abord été annoncée « la garde ne tombe pas »
sur la foi d'un `total = 0`. Faux : la mutation avait rendu le paquet partagé non
compilable, et le `bun run build` intermédiaire — redirigé vers `/dev/null` —
avait échoué. La passerelle compilait contre un `dist` PÉRIMÉ.

> **Un build intermédiaire raté ne ressemble pas à une panne : il ressemble à un
> test qui passe.** Dans une chaîne de mesure (build → compile → assert), vérifier
> le CODE DE SORTIE de chaque étape, surtout quand on mute volontairement le code
> pour prouver un rouge — c'est exactement le moment où l'on s'attend à des
> erreurs, donc celui où l'on cesse de les lire.

Même famille que « un témoin qui ne peut pas tomber n'est pas un témoin », un
étage plus bas : ici ce n'est pas le témoin qui était muet, c'est l'OUTILLAGE de
la mesure.

### Et c'est arrivé DEUX FOIS dans le même cycle, par deux mécanismes différents

Le second : `bash check-type-debt.sh 2>&1 | tail -20` a rendu `exit code 0` sur
un gate qui ÉCHOUAIT. **Le code de retour d'un pipeline shell est celui de sa
DERNIÈRE commande** — ici `tail`, qui réussit toujours. Le verdict réel
(`✗ AMÉLIORATION NON ENREGISTRÉE : 1239 erreurs, baseline 1241`) était dans le
texte, à l'écran, pendant que le code de sortie disait « vert ».

Les deux fois, le défaut n'est pas d'avoir mal lu : c'est d'avoir lu **UN SEUL**
des deux canaux, et pas le même selon la fois — la sortie sans le code, puis le
code sans la sortie.

> **Un gate rend DEUX verdicts, le texte et le code de retour, et ils peuvent se
> contredire.** Les lire tous les deux, systématiquement. Et ne jamais passer un
> gate par un pipe quand c'est son code de sortie qu'on interroge :
> `set -o pipefail`, ou rediriger vers un fichier et lire `$?` avant tout autre
> commande.

C'est d'autant plus piégeux qu'un gate qui échoue en disant « améliore-toi »
(dette regagnée, cliquet à resserrer) n'a pas la forme d'un échec : le texte est
une bonne nouvelle, et seul le code de retour dit que la CI sera rouge.

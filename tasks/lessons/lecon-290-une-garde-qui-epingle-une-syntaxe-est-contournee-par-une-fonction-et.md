## Leçon 290 — une garde qui épingle une SYNTAXE est contournée par une FONCTION, et le contournement précède la garde (2026-08-26, itération 247i)

**Contexte.** 241i a fermé la famille « nombre servi à VoiceOver » **par la
forme**, avec cette promesse écrite dans son propre doc-comment : « peu importe
quel compteur naît demain, s'il interpole son nombre dans une valeur
d'accessibilité, il tombe ici ». L'extracteur reconnaît un **littéral
interpolé** :

```swift
#"\.accessibilityValue\(\s*"[^"\n]*\\\([^\n]*"#
```

**Le défaut.** Onze sites de l'app servaient à VoiceOver un nombre gravé en
chiffres latins **sans jamais écrire de littéral**. Le motif fautif —
`String(format: "%d:%02d", …)` — vivait un cran plus bas, dans le corps d'un
`private func`, et ressortait au site d'appel sous la forme la plus innocente
qui soit :

```swift
.accessibilityValue(formattedDuration)   // un identifiant. rien à signaler.
```

La garde était **verte sur ces onze sites depuis le jour de sa pose**, et sa
promesse — vraie sur la forme qu'elle nomme — se lisait comme si la famille
entière était close.

**Ce qui rend la leçon générale, et non un oubli.** Le contournement est
**antérieur** à la garde : les onze formateurs privés datent de 2025, la garde
de 2026. Elle n'a rien laissé passer — elle a été posée sur une surface qui ne
contenait déjà plus le motif qu'elle cherche. **Relire son propre diff ne
pouvait pas l'attraper ; relire les sites qu'elle prétend couvrir non plus,
puisqu'ils sont propres.**

> **La question à poser à toute garde de forme : *ce que j'interdis peut-il
> traverser une fonction avant d'atteindre le site que j'inspecte ?*** Si oui,
> aller chercher le motif à sa **SOURCE**, là où il redevient un littéral — pas
> à son point d'usage, où il est devenu un identifiant.

**Corollaire, forme du cycle 122 rejouée.** 206i, 210i et 211i avaient traité la
MOITIÉ du même défaut : elles ont donné son LIBELLÉ à une valeur d'accessibilité
nue (« Durée de l'appel ») et l'ont documenté dans les vues — puis se sont
arrêtées là, laissant la valeur qu'elles introduisent dans son orthographe
d'horloge. Résultat mesurable : `MagicLinkView` annonçait **« Le lien expire
dans 4 heures 32 »** pour un compte à rebours de quatre minutes et demie, «~4:32~»
étant l'orthographe d'une heure pour le synthétiseur. **Un libellé nomme la
mesure ; il ne corrige pas l'orthographe de ce qu'il introduit.** Trois
itérations ont relu ces lignes exactes en s'arrêtant au contexte manquant.

**Et le versant inverse — ne pas confondre la famille avec sa forme.** Un
douzième site rendait le même `String(format: "%02d:%02d", …)` :
`NotificationSettingsView.formattedDndTime`, qui grave « HH:mm » pour la
**PERSISTANCE** (relu par `UserNotificationPreferences.isInDoNotDisturbWindow`).
Le localiser corromprait la donnée. Il est le seul site du dépôt où les chiffres
latins sont la bonne réponse — et il est **allowlisté NOMMÉMENT dans la garde,
avec sa raison**, jamais toléré en silence. Une garde de forme doit dire
pourquoi elle épargne, sinon la prochaine itération « corrigera » la donnée.

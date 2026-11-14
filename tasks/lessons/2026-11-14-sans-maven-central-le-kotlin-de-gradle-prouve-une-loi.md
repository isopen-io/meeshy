## 2026-11-14 — Sans Maven Central, le compilateur Kotlin livré avec Gradle prouve encore une loi pure (#17768)

### Ce qui s'est passé

La boucle du Jeu a voulu prouver la loi `GameActsRing` (`:core:model`) par `./apps/android/meeshy.sh jvm-check`. Le
build s'arrête à la résolution du plugin `org.jetbrains.kotlin.jvm` : dans cette session, le proxy refuse
`repo1.maven.org` et `plugins.gradle.org` (`connect_rejected`). Le `jvm-check` n'est donc pas toujours joignable, et
pendant le gel `CI_DEV_SEUL` (#18048) la CI Android ne tourne pas non plus sur une branche de lot.

### La règle

- Avant de déclarer « non prouvable », chercher le compilateur déjà présent : Gradle embarque
  `/opt/gradle-*/lib/kotlin-compiler-embeddable-*.jar` et `kotlin-stdlib-*.jar`.
- Une loi pure se prouve alors en compilant SON fichier avec des doublures minimales des types qu'elle lit, et un
  `main` qui rejoue les cas du témoin JUnit :
  `java -cp <compiler-embeddable>:<stdlib>:<reflect>:<script-runtime>:<trove4j>:<annotations>:<daemon>:<coroutines>
  org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -cp <stdlib> -d out Loi.kt Doublures.kt Main.kt`.
- C'est une preuve de syntaxe et de comportement de la loi, pas de son intégration (sérialisation, Compose, Hilt).
  La PR le dit en ces termes, et la preuve `android.yml` reste due à la levée du gel.

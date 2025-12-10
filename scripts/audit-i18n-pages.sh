#!/bin/bash

# Script d'audit des pages i18n - Meeshy
# Teste toutes les pages et vérifie qu'elles se chargent sans erreur

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_FILE="$PROJECT_ROOT/RAPPORT_AUDIT_I18N_PAGES.md"

echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}🔍 AUDIT DES PAGES I18N - MEESHY${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo ""

cd "$PROJECT_ROOT/frontend"

# Vérifier que le serveur est démarré
if ! lsof -ti:3100 >/dev/null 2>&1; then
    echo -e "${RED}❌ Le serveur frontend n'est pas démarré sur le port 3100${NC}"
    echo -e "${YELLOW}Démarrez-le avec: ./scripts/meeshy.sh dev start${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Serveur frontend détecté sur le port 3100${NC}"
echo ""

# Liste des pages à tester (priorité haute à basse)
declare -a CRITICAL_PAGES=(
    "http://localhost:3100|Page d'accueil"
    "http://localhost:3100/dashboard|Dashboard"
    "http://localhost:3100/signin|Connexion"
)

declare -a HIGH_PRIORITY_PAGES=(
    "http://localhost:3100/conversations|Conversations"
    "http://localhost:3100/contacts|Contacts"
    "http://localhost:3100/links|Liens de partage"
    "http://localhost:3100/settings|Paramètres"
    "http://localhost:3100/notifications|Notifications"
)

declare -a MEDIUM_PRIORITY_PAGES=(
    "http://localhost:3100/about|À propos"
    "http://localhost:3100/contact|Contact"
    "http://localhost:3100/partners|Partenaires"
    "http://localhost:3100/privacy|Confidentialité"
    "http://localhost:3100/terms|Conditions"
)

# Fonction pour tester une page
test_page() {
    local url=$1
    local name=$2
    
    echo -ne "${BLUE}Testing ${name}...${NC}"
    
    # Tester la page avec curl
    local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    
    if [ "$http_code" = "200" ]; then
        echo -e " ${GREEN}✅ OK${NC}"
        return 0
    else
        echo -e " ${RED}❌ FAILED (HTTP $http_code)${NC}"
        return 1
    fi
}

# Créer le rapport
cat > "$REPORT_FILE" << 'HEADER'
# Rapport d'Audit I18n - Pages Meeshy

**Date**: $(date)
**Objectif**: Vérifier que toutes les pages se chargent sans erreur après implémentation du hook i18n

---

## 📊 Résultats des Tests

HEADER

# Compteurs
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}🔴 PAGES CRITIQUES${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo ""

echo "### 🔴 Pages Critiques" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

for page in "${CRITICAL_PAGES[@]}"; do
    IFS='|' read -r url name <<< "$page"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if test_page "$url" "$name"; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo "- ✅ **$name** - OK" >> "$REPORT_FILE"
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo "- ❌ **$name** - ÉCHEC" >> "$REPORT_FILE"
    fi
done

echo ""
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}🟡 PAGES HAUTE PRIORITÉ${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo ""

echo "" >> "$REPORT_FILE"
echo "### 🟡 Pages Haute Priorité" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

for page in "${HIGH_PRIORITY_PAGES[@]}"; do
    IFS='|' read -r url name <<< "$page"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if test_page "$url" "$name"; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo "- ✅ **$name** - OK" >> "$REPORT_FILE"
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo "- ❌ **$name** - ÉCHEC" >> "$REPORT_FILE"
    fi
done

echo ""
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}🟢 PAGES MOYENNE PRIORITÉ${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo ""

echo "" >> "$REPORT_FILE"
echo "### 🟢 Pages Moyenne Priorité" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

for page in "${MEDIUM_PRIORITY_PAGES[@]}"; do
    IFS='|' read -r url name <<< "$page"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if test_page "$url" "$name"; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo "- ✅ **$name** - OK" >> "$REPORT_FILE"
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo "- ❌ **$name** - ÉCHEC" >> "$REPORT_FILE"
    fi
done

# Résumé
SUCCESS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))

echo ""
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}📊 RÉSUMÉ${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Total de tests:${NC} $TOTAL_TESTS"
echo -e "${GREEN}Tests réussis:${NC} $PASSED_TESTS"
echo -e "${RED}Tests échoués:${NC} $FAILED_TESTS"
echo -e "${CYAN}Taux de réussite:${NC} $SUCCESS_RATE%"
echo ""

# Ajouter au rapport
cat >> "$REPORT_FILE" << EOF

---

## 📈 Statistiques

- **Total de tests**: $TOTAL_TESTS
- **Tests réussis**: $PASSED_TESTS
- **Tests échoués**: $FAILED_TESTS
- **Taux de réussite**: $SUCCESS_RATE%

---

## 🎯 Recommandations

EOF

if [ $FAILED_TESTS -eq 0 ]; then
    cat >> "$REPORT_FILE" << 'SUCCESS'
✅ **Tous les tests sont passés !**

Toutes les pages se chargent correctement avec le nouveau hook i18n.

### Prochaines étapes:
1. Tester manuellement les traductions sur chaque page
2. Vérifier le changement de langue fonctionne
3. Tester avec différentes langues (fr, es, pt, zh)
4. Valider les paramètres dynamiques dans les traductions

SUCCESS
    echo -e "${GREEN}✅ TOUS LES TESTS SONT PASSÉS !${NC}"
else
    cat >> "$REPORT_FILE" << 'FAILURE'
⚠️ **Certains tests ont échoué**

### Actions à entreprendre:
1. Vérifier les logs de la console navigateur pour les pages en échec
2. Vérifier que les fichiers JSON de traduction existent
3. Vérifier que les clés utilisées dans les composants existent dans les JSON
4. Corriger les erreurs et relancer l'audit

### Commandes utiles:
```bash
# Voir les logs du frontend
tail -f frontend/frontend.log

# Relancer l'audit
./scripts/audit-i18n-pages.sh
```

FAILURE
    echo -e "${RED}⚠️  CERTAINS TESTS ONT ÉCHOUÉ${NC}"
fi

cat >> "$REPORT_FILE" << 'FOOTER'

---

## 🔍 Pour Tester Manuellement

Ouvrez votre navigateur et visitez:
- http://localhost:3100 (page d'accueil)
- Ouvrez la console développeur (F12)
- Vérifiez qu'il n'y a pas d'erreur `t is not a function`
- Vérifiez que tous les textes s'affichent correctement

## 📝 Vérification des Clés I18n

Pour lister toutes les clés i18n utilisées:
```bash
grep -rn "t\(['\"]" frontend/app frontend/components \
  --include="*.tsx" --include="*.ts" \
  | grep -oP "t\(['\"][^'\"]+['\"]" \
  | sort | uniq
```

---

**Rapport généré par**: `scripts/audit-i18n-pages.sh`
FOOTER

echo -e "${BLUE}📄 Rapport généré: ${REPORT_FILE}${NC}"
echo ""

# Code de sortie basé sur les résultats
if [ $FAILED_TESTS -eq 0 ]; then
    exit 0
else
    exit 1
fi


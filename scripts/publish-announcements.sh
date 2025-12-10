#!/usr/bin/env bash

#########################################
# Publish Meeshy Announcements
# Posts 7 announcements with 2s delay
#########################################

set -euo pipefail

# Colors
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly MMP_SCRIPT="${SCRIPT_DIR}/scripts/mmp.sh"
readonly DELAY=2

# Check if mmp.sh exists
if [[ ! -x "$MMP_SCRIPT" ]]; then
    echo -e "${YELLOW}Making mmp.sh executable...${NC}"
    chmod +x "$MMP_SCRIPT"
fi
export MEESHY_PASSWORD=${MEESHY_PASSWORD:-FSDQ73yQ5TG4n36BnGId}
# Check for password
if [[ -z "${MEESHY_PASSWORD:-FSDQ73yQ5TG4n36BnGId}" ]]; then
    echo -e "${YELLOW}MEESHY_PASSWORD not set. Checking environment files...${NC}"
    
    # Try to load from env.production
    if [[ -f "${SCRIPT_DIR}/env.production" ]]; then
        echo -e "${BLUE}Loading from env.production...${NC}"
        set -a
        source "${SCRIPT_DIR}/env.production"
        set +a
        
        # Check if we got MEESHY_BIGBOSS_PASSWORD instead
        if [[ -n "${MEESHY_BIGBOSS_PASSWORD:-FSDQ73yQ5TG4n36BnGId}" ]] && [[ "$MEESHY_BIGBOSS_PASSWORD" != "CHANGE_ME_MEESHY_PASSWORD" ]]; then
            export MEESHY_PASSWORD="$MEESHY_BIGBOSS_PASSWORD"
        fi
    elif [[ -f "${SCRIPT_DIR}/.env" ]]; then
        echo -e "${BLUE}Loading from .env...${NC}"
        set -a
        source "${SCRIPT_DIR}/.env"
        set +a
    fi
    
    # If still not set or is placeholder, ask user
    if [[ -z "${MEESHY_PASSWORD:-FSDQ73yQ5TG4n36BnGId}" ]] || [[ "$MEESHY_PASSWORD" == "CHANGE_ME_MEESHY_PASSWORD" ]]; then
        echo ""
        echo -e "${YELLOW}Please enter the Meeshy password:${NC}"
        read -s MEESHY_PASSWORD
        export MEESHY_PASSWORD
        echo ""
    fi
fi

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║        Publishing Meeshy Announcements (7 posts)              ║${NC}"
echo -e "${CYAN}║        Delay: ${DELAY} seconds between posts                           ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Post 1 - Emoji Reactions
echo -e "${BLUE}[1/7]${NC} Publishing: Emoji Reactions System..."
cat > /tmp/post1.txt << 'EOF'
React with ANY emoji! 🎉❤️🔥 
Our new real-time reaction system just dropped. Express yourself freely on every message - no limits, just pure emotion. 
Try it now: meeshy.me/chat/meeshy
#RealTimeMessaging #EmojiReactions #MeeshyUpdates
EOF

export $MEESHY_PASSWORD
"$MMP_SCRIPT" -f /tmp/post1.txt -y --no-backup --no-cleanup
echo -e "${GREEN}✓ Post 1/7 published${NC}"
sleep $DELAY

# Post 2 - Dark Mode
echo ""
echo -e "${BLUE}[2/7]${NC} Publishing: Dark Mode Excellence..."
cat > /tmp/post2.txt << 'EOF'
Welcome to the dark side! 🌙✨
Complete dark mode is now live across the entire platform. From dashboard to messages, enjoy a stunning gradient experience that's easy on your eyes 24/7.
Check it out: meeshy.me/dashboard
#DarkMode #UXDesign #Meeshy
EOF

"$MMP_SCRIPT" -f /tmp/post2.txt -y --no-backup --no-cleanup
echo -e "${GREEN}✓ Post 2/7 published${NC}"
sleep $DELAY

# Post 3 - Smart Navigation
echo ""
echo -e "${BLUE}[3/7]${NC} Publishing: Smart Navigation..."
cat > /tmp/post3.txt << 'EOF'
Lost? Never again! 🧭
We've revolutionized navigation with intelligent redirects and floating scroll buttons. Jump to any conversation, find your place instantly, and move around like a pro.
Start chatting: meeshy.me/chat/meeshy
#UserExperience #Navigation #WebApp
EOF

"$MMP_SCRIPT" -f /tmp/post3.txt -y --no-backup --no-cleanup
echo -e "${GREEN}✓ Post 3/7 published${NC}"
sleep $DELAY

# Post 4 - Share Everything
echo ""
echo -e "${BLUE}[4/7]${NC} Publishing: Share Everything..."
cat > /tmp/post4.txt << 'EOF'
Sharing is caring! 🔗💙
New "Copy Link" button on EVERY message - text, images, files, you name it. Share conversations with precision. One click, endless possibilities.
Try it: meeshy.me/chat/meeshy (hover any message!)
#ShareContent #Collaboration #Meeshy
EOF

"$MMP_SCRIPT" -f /tmp/post4.txt -y --no-backup --no-cleanup
echo -e "${GREEN}✓ Post 4/7 published${NC}"
sleep $DELAY

# Post 5 - Attachments
echo ""
echo -e "${BLUE}[5/7]${NC} Publishing: Attachment Revolution..."
cat > /tmp/post5.txt << 'EOF'
Attachments, reimagined! 📎✨
Stunning new layout: photos and files displayed beautifully outside bubbles. Full-screen gallery with keyboard nav & swipe gestures. Professional messaging redefined.
See it live: meeshy.me/chat/meeshy
#FileSharing #ModernUI #Meeshy
EOF

"$MMP_SCRIPT" -f /tmp/post5.txt -y --no-backup --no-cleanup
echo -e "${GREEN}✓ Post 5/7 published${NC}"
sleep $DELAY

# Post 6 - Translations
echo ""
echo -e "${BLUE}[6/7]${NC} Publishing: Translation Power..."
cat > /tmp/post6.txt << 'EOF'
Break language barriers! 🌍💬
We've 4x'ed translation capacity - now handling full paragraphs effortlessly. Chat globally, understand locally. 
100+ languages, unlimited conversations.
Experience it: meeshy.me/chat/meeshy
#Translation #GlobalCommunication #Multilingual
EOF

"$MMP_SCRIPT" -f /tmp/post6.txt -y --no-backup --no-cleanup
echo -e "${GREEN}✓ Post 6/7 published${NC}"
sleep $DELAY

# Post 7 - Complete Package
echo ""
echo -e "${BLUE}[7/7]${NC} Publishing: The Complete Package..."
cat > /tmp/post7.txt << 'EOF'
48 hours. 7 game-changers! 🎁🚀
✅ Emoji reactions
✅ Full dark mode
✅ Smart scroll
✅ Quick share links
✅ Pro attachments
✅ Powerful translations
✅ Seamless navigation

Experience the future: meeshy.me/chat/meeshy
#Innovation #WebPlatform #Meeshy
EOF

"$MMP_SCRIPT" -f /tmp/post7.txt -y --no-backup --no-cleanup
echo -e "${GREEN}✓ Post 7/7 published${NC}"

# Cleanup temp files
rm -f /tmp/post{1..7}.txt

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        All 7 announcements published successfully! 🎉         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}View them at: meeshy.me/chat/meeshy${NC}"
echo ""

#!/usr/bin/env python3
import json,sys,os
RUN=os.path.dirname(os.path.abspath(__file__))
t,k,issue=sys.argv[1],sys.argv[2],sys.argv[3]
summary=sys.argv[4] if len(sys.argv)>4 else ''
l=next(x for x in json.load(open(f'{RUN}/plan/{t}.json')) if x['key']==k)
b=['## 📝 Pull Request Description','',summary or l.get('goal',''),'','## 🎯 Type of Change','','- [x] **✨ New Feature** : parité Android ↔ iOS (directive #11570)','',
'## 🔗 Related Issues','',f'- **Closes** : #{issue}',f"- **Relates to** : #11570 (lot `{k}`, piste {t}, domaine `{l['domain']}`)",'',
'## 🎨 Changes Made','',f"Références iOS reproduites : "+', '.join(f'`{x}`' for x in l.get('ios_reference_files',[])[:8]),'',
'## 🧪 Testing','','TDD : tests unitaires du lot (`:core:model` prouvé en local par `./apps/android/meeshy.sh jvm-check`), plus `android.yml` (assembleDebug + testDebugUnitTest) sur cette PR.','',
'🤖 Generated with [Claude Code](https://claude.com/claude-code)','','https://claude.ai/code/session_01EP6Bfac7sFfP8RkuHTATHN']
print(json.dumps({'title':l['title'],'body':'\n'.join(b)},ensure_ascii=False))

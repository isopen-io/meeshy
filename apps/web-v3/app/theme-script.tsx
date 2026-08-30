export const THEME_STORAGE_KEY = 'meeshy-theme';

export const themeScriptSource =
  `!function(){var s=null;try{s=localStorage.getItem('${THEME_STORAGE_KEY}')}catch(_){}` +
  `try{var d=s==='dark'||s!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches,` +
  `e=document.documentElement;e.classList.add(d?'dark':'light');` +
  `e.classList.remove(d?'light':'dark');e.style.colorScheme=d?'dark':'light'}catch(_){}}()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScriptSource }} />;
}

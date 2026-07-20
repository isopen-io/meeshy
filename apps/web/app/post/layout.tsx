// `/post/[postId]` re-exports the `/feeds/post` screen, which relies on the
// Global Pulse providers (V2ThemeProvider + ToastProvider + SplitViewProvider).
// Reuse the canonical feeds layout so `useToast()` / `useSplitView()` resolve —
// without it, the page throws "useToast must be used within a ToastProvider".
export { default } from '@/app/feeds/layout';

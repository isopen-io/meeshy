// Real v1 page for `/post/[postId]` — renders the same post-detail screen as the
// canonical `/feeds/post/[postId]` (reads `postId` from the route segment). NOT a
// rewrite to /v2: this is a true v1 page.
export { default } from '@/app/feeds/post/[postId]/page';

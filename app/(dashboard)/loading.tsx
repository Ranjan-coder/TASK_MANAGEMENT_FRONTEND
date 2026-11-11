/**
 * Shown inside the app frame while the next screen loads. The sidebar / top bar
 * (layout) stay as they are, so moving between sections never looks like a page
 * reload — only the content area waits. Next.js streams this instantly on click.
 */
export default function Loading() {
  return (
    <div className="flex h-full min-h-[40vh] w-full items-center justify-center" aria-busy="true">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-700 border-t-violet-500" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

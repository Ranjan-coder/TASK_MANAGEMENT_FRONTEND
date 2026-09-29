import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 px-4 py-10">
      <article className="max-w-2xl mx-auto space-y-5 text-sm leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-white [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white [&_h2]:pt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        <div
          role="note"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 p-3 text-xs"
        >
          Draft for development. Replace with the final text approved by Bonito&apos;s legal advisor before launch.
        </div>
        {children}
        <p className="pt-6">
          <Link href="/signup" className="text-violet-400 hover:text-violet-300">Back to sign up</Link>
        </p>
      </article>
    </div>
  );
}

/**
 * 404. A server component on purpose — nothing here is interactive, so this
 * page should not ship any JavaScript.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-[17px] font-semibold tracking-tight text-ink-hi">
        There is nothing at this address.
      </h1>
      <p className="text-[13px] leading-relaxed text-ink-mid">
        The link may be out of date.
      </p>
      <a href="/live" className="text-[13px] text-ink-hi underline underline-offset-4">
        Go to today
      </a>
    </main>
  );
}

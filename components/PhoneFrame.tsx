/**
 * Mobile: fills the viewport. From md up it becomes a real 390px phone beside
 * the Engine panel. Height is fluid so short laptop viewports don't clip the
 * reply chips — the fixed 844px is only ever an upper bound.
 */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-base-900 md:h-[min(844px,calc(100dvh-6.5rem))] md:w-[390px] md:flex-none md:rounded-[2.25rem] md:border md:border-base-600 md:shadow-card">
      {children}
    </div>
  );
}

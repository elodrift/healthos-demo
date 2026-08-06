export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-base-900 lg:h-[844px] lg:max-h-[86vh] lg:w-[390px] lg:flex-none lg:rounded-[2.25rem] lg:border lg:border-base-600 lg:shadow-card">
      {children}
    </div>
  );
}

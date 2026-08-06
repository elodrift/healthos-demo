export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex h-[720px] max-h-[80vh] w-full max-w-[420px] flex-col overflow-hidden rounded-[2rem] border border-base-600 bg-base-900 shadow-card lg:h-[760px]">
      <div className="flex justify-center py-2">
        <div className="h-1 w-10 rounded-full bg-base-600" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

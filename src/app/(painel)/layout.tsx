import { AppPasswordGate } from "@/components/AppPasswordGate";
import { DashboardNav } from "@/components/DashboardNav";

export default function PainelLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AppPasswordGate>
      <div className="flex min-h-screen flex-col bg-slate-50">
        <DashboardNav />
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</div>
      </div>
    </AppPasswordGate>
  );
}

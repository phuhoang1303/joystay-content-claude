import { Clock } from "lucide-react";
import { NAV_ITEMS } from "./nav";
import { PageHeader } from "./page-header";

export function ComingSoon({ href }: { href: string }) {
  const item = NAV_ITEMS.find((n) => n.href === href);
  if (!item) return null;
  return (
    <>
      <PageHeader title={item.label} />
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-background px-6 py-20 text-center">
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-muted">
          <Clock className="size-5 text-muted-foreground" aria-hidden />
        </div>
        <p className="text-base font-medium">Sắp có ở Phase {item.phase}</p>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{item.description}</p>
      </div>
    </>
  );
}

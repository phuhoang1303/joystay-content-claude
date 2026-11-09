import { SidebarNav } from "@/components/layout/sidebar";
import { getCurrentWorkspace, listWorkspaces } from "@/features/workspace/server";
import { WorkspaceSwitcher } from "@/features/workspace/workspace-switcher";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentWorkspace();
  const workspaces = listWorkspaces().map((w) => ({ id: w.id, name: w.name }));

  return (
    <div className="min-h-screen bg-muted/30">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="px-4 pb-3 pt-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
              C
            </div>
            <span className="text-sm font-semibold">Content Platform</span>
          </div>
          <WorkspaceSwitcher workspaces={workspaces} currentId={current.id} />
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <SidebarNav />
        </div>
        <div className="border-t border-sidebar-border px-4 py-3 text-xs text-muted-foreground">
          Chạy trên máy này · localhost
        </div>
      </aside>
      <main className="pl-60">
        <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

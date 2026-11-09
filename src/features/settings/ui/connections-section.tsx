import { Badge } from "@/components/ui/badge";
import type { EnvStatus } from "../env-status";

/** Server component. Receives presence booleans only, never values. */
export function ConnectionsSection({ env, tavilyCredits }: { env: EnvStatus[]; tavilyCredits: number }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Khoá API đặt trong file <code className="rounded bg-muted px-1">.env.local</code> trên máy. Trang này chỉ cho
        biết khoá có hay chưa, không bao giờ hiển thị giá trị.
      </p>
      <ul className="divide-y rounded-lg border">
        {env.map((e) => (
          <li key={e.key} className="flex items-center gap-3 px-3 py-2 text-sm">
            <code className="w-56 shrink-0 text-xs">{e.key}</code>
            <span className="flex-1 text-muted-foreground">
              {e.label}
              {e.phase > 0 ? <span className="ml-1 text-xs">(Phase {e.phase})</span> : null}
              {e.key === "TAVILY_API_KEY" ? (
                <span className="ml-1 text-xs">· tháng này đã dùng {tavilyCredits} / 1.000 credit miễn phí</span>
              ) : null}
            </span>
            <Badge variant={e.present ? "default" : "outline"}>{e.present ? "Đã có" : "Chưa có"}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

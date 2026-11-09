import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { resolveWeek, WeekPicker } from "@/components/layout/week-picker";
import { weekStartOf } from "@/lib/calendar/week";
import { getResearchData } from "@/features/research/queries";
import { ResearchClient } from "@/features/research/ui/research-client";
import { getCurrentWorkspace } from "@/features/workspace/server";

export default async function ResearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ws = await getCurrentWorkspace();
  const weekStart = resolveWeek((await searchParams).week, weekStartOf);
  const data = getResearchData(ws.id, weekStart);

  return (
    <>
      <PageHeader
        title="Research"
        description="Mỗi chủ đề SEO của tuần có một gói research: nguồn, thẻ dữ kiện, câu hỏi người đọc. Chỉ lưu tóm tắt, không lưu toàn văn trang."
        action={<WeekPicker path="/research" weekStart={weekStart} />}
      />
      {!data.plan ? (
        <Empty text="Tuần này chưa có kế hoạch." weekStart={weekStart} />
      ) : data.packs.length === 0 ? (
        <Empty text={data.plan.status === "locked" ? "Tuần đã chốt nhưng không có bài SEO nào cần research." : "Gói research được tạo khi bạn chốt tuần."} weekStart={weekStart} />
      ) : (
        <ResearchClient weekPlanId={data.plan.id} packs={data.packs} />
      )}
    </>
  );
}

function Empty({ text, weekStart }: { text: string; weekStart: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-background px-6 py-16 text-center">
      <p className="text-base font-medium">{text}</p>
      <Link href={`/ke-hoach-tuan?week=${weekStart}`} className="mt-3 inline-block text-sm underline">
        Mở Kế hoạch tuần
      </Link>
    </div>
  );
}

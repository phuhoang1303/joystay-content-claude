import { PageHeader } from "@/components/layout/page-header";
import { resolveWeek, WeekPicker } from "@/components/layout/week-picker";
import { weekStartOf } from "@/lib/calendar/week";
import { getWeekPlanData } from "@/features/week-plan/queries";
import { CreatePlanButton } from "@/features/week-plan/ui/create-plan-button";
import { WeekPlanClient } from "@/features/week-plan/ui/week-plan-client";
import { getCurrentWorkspace } from "@/features/workspace/server";

export default async function WeekPlanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ws = await getCurrentWorkspace();
  const weekStart = resolveWeek((await searchParams).week, weekStartOf);
  const data = getWeekPlanData(ws.id, weekStart);

  return (
    <>
      <PageHeader
        title="Kế hoạch tuần"
        description="Chọn số bài theo chủ đề, để AI đề xuất đề tài, chỉnh sửa rồi chốt tuần."
        action={<WeekPicker path="/ke-hoach-tuan" weekStart={weekStart} />}
      />
      {data.events.length ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Sự kiện trong tuần: {data.events.map((e) => `${e.name} (${e.date.slice(8)}/${e.date.slice(5, 7)})`).join(" · ")}
        </p>
      ) : null}
      {data.plan && data.config ? (
        <WeekPlanClient
          key={data.plan.id}
          plan={data.plan}
          config={data.config}
          pillars={data.pillars}
          days={data.days}
          items={data.items}
          packs={data.packs}
          activeJobs={data.activeJobs}
        />
      ) : (
        <div className="flex flex-col items-center rounded-xl border border-dashed bg-background px-6 py-16 text-center">
          <p className="text-base font-medium">Tuần này chưa có kế hoạch</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Mặc định 2 bài SEO (2 chủ đề) và 4 bài Facebook (2 khoảnh khắc, 1 góc nhìn, 1 carousel). Bạn chỉnh được trước khi để AI đề xuất.
          </p>
          <div className="mt-5">
            <CreatePlanButton weekStart={weekStart} />
          </div>
        </div>
      )}
    </>
  );
}

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSettingsData } from "@/features/settings/queries";
import { AiSection } from "@/features/settings/ui/ai-section";
import { BrandProfileForm } from "@/features/settings/ui/brand-profile-form";
import { ConnectionsSection } from "@/features/settings/ui/connections-section";
import { ExamplesSection } from "@/features/settings/ui/examples-section";
import { PillarsSection } from "@/features/settings/ui/pillars-section";
import { getCurrentWorkspace } from "@/features/workspace/server";

const SECTIONS = [
  { id: "brand", label: "Brand Profile" },
  { id: "pillars", label: "Chủ đề" },
  { id: "examples", label: "Bài mẫu" },
  { id: "ai", label: "AI" },
  { id: "connections", label: "Kết nối" },
];

export default async function SettingsPage() {
  const ws = await getCurrentWorkspace();
  const data = getSettingsData(ws.id);
  const p = data.profile;

  return (
    <>
      <PageHeader title="Cài đặt" description={`Thiết lập cho workspace ${ws.name}.`} />
      <nav className="mb-6 flex flex-wrap gap-2 text-sm" aria-label="Các mục cài đặt">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border bg-background px-3 py-1 hover:bg-muted">
            {s.label}
          </a>
        ))}
      </nav>
      <div className="space-y-6">
        <Card id="brand" className="scroll-mt-6">
          <CardHeader>
            <CardTitle>Brand Profile</CardTitle>
            <CardDescription>
              Dữ kiện về thương hiệu mà AI được phép dùng. Mục có ghi (verify) cần xác nhận trước khi đăng.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BrandProfileForm
              initial={{
                name: p?.name ?? ws.name,
                tagline: p?.tagline ?? "",
                website: p?.website ?? "",
                location: p?.location ?? "",
                description: p?.description ?? "",
                targetGuests: p?.targetGuests ?? "",
                rooms: p?.rooms ?? "",
                contact: p?.contact ?? "",
                seoStyleRules: p?.seoStyleRules ?? "",
                socialStyleRules: p?.socialStyleRules ?? "",
                bannedPhrases: p?.bannedPhrases ?? "",
              }}
            />
          </CardContent>
        </Card>

        <Card id="pillars" className="scroll-mt-6">
          <CardHeader>
            <CardTitle>Chủ đề nội dung</CardTitle>
            <CardDescription>Các trụ cột nội dung dùng khi lên kế hoạch tuần.</CardDescription>
          </CardHeader>
          <CardContent>
            <PillarsSection pillars={data.pillars.map(({ id, name }) => ({ id, name }))} />
          </CardContent>
        </Card>

        <Card id="examples" className="scroll-mt-6">
          <CardHeader>
            <CardTitle>Bài mẫu</CardTitle>
            <CardDescription>
              Chỉ dùng làm mẫu giọng văn và bố cục cho AI, không bao giờ đăng lại.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExamplesSection
              examples={data.examples.map(({ id, type, title, format, body, url }) => ({
                id,
                type,
                title,
                format,
                body,
                url,
              }))}
            />
          </CardContent>
        </Card>

        <Card id="ai" className="scroll-mt-6">
          <CardHeader>
            <CardTitle>AI</CardTitle>
            <CardDescription>
              Hạn mức chỉ áp dụng cho API trả phí. Cảnh báo ở 80%, chặn khi chạm hạn mức.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AiSection provider={data.provider} monthlyPaidCapUsd={data.monthlyPaidCapUsd} />
          </CardContent>
        </Card>

        <Card id="connections" className="scroll-mt-6">
          <CardHeader>
            <CardTitle>Kết nối</CardTitle>
          </CardHeader>
          <CardContent>
            <ConnectionsSection env={data.env} tavilyCredits={data.tavilyCredits} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

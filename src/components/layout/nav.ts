export type NavItem = {
  href: string;
  label: string;
  icon:
    | "dashboard"
    | "calendar"
    | "research"
    | "seo"
    | "social"
    | "image"
    | "library"
    | "settings";
  /** Phase that builds this screen; undefined = available now. */
  phase?: number;
  description: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Tổng quan", icon: "dashboard", description: "Tình hình tuần này và chi phí tháng này" },
  { href: "/ke-hoach-tuan", label: "Kế hoạch tuần", icon: "calendar", phase: 1, description: "Chọn tuần, đặt số bài theo chủ đề, AI đề xuất đề tài, kéo thả lịch đăng." },
  { href: "/research", label: "Research", icon: "research", phase: 1, description: "Gói research cho từng chủ đề trong tuần: nguồn, thẻ dữ kiện, dán URL." },
  { href: "/bai-seo", label: "Bài SEO", icon: "seo", phase: 2, description: "Viết bài SEO, trình soạn thảo và bảng điểm SEO, xuất bản lên joystay.vn." },
  { href: "/bai-social", label: "Bài Social", icon: "social", phase: 3, description: "Caption Facebook, xem trước như bài đăng thật, đánh dấu đã lên lịch." },
  { href: "/anh", label: "Ảnh", icon: "image", phase: 4, description: "Ảnh cho từng bài: prompt AI, ảnh thật từ Drive kèm tiêu đề, ảnh stock." },
  { href: "/thu-vien-anh", label: "Thư viện ảnh", icon: "library", phase: 4, description: "Ảnh đồng bộ từ Google Drive và ảnh đã tạo, lọc theo thư mục và tag." },
  { href: "/cai-dat", label: "Cài đặt", icon: "settings", description: "Brand Profile, chủ đề, bài mẫu, AI và kết nối" },
];

/**
 * Reference data required in every environment (idempotent).
 * Contains no credentials and no business content.
 */
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { SERVICE_SECTIONS } from './data/company-content.js';
import { ROLE_DEFINITIONS, PERMISSIONS } from '../src/modules/auth/permissions.js';

const permissionNames: Record<string, string> = {
  'content:read': 'Xem nội dung quản trị',
  'projects:write': 'Quản lý dự án',
  'properties:write': 'Quản lý căn hộ',
  'banners:write': 'Quản lý banner',
  'blog:write': 'Quản lý bài viết',
  'pages:write': 'Quản lý trang',
  'content:publish': 'Xuất bản / gỡ xuất bản',
  'media:write': 'Quản lý thư viện ảnh',
  'leads:read': 'Xem khách hàng',
  'leads:write': 'Xử lý khách hàng',
  'leads:export': 'Xuất dữ liệu khách hàng',
  'settings:write': 'Quản lý cài đặt',
  'users:manage': 'Quản lý người dùng',
  'audit:read': 'Xem nhật ký',
};

export async function seedReference(prisma: PrismaClient) {
  for (const code of Object.values(PERMISSIONS))
    await prisma.permission.upsert({ where: { code }, create: { code, name: permissionNames[code] }, update: { name: permissionNames[code] } });
  const permissions = await prisma.permission.findMany();
  for (const role of ROLE_DEFINITIONS) {
    const row = await prisma.role.upsert({
      where: { code: role.code },
      create: { code: role.code, name: role.name, description: role.description },
      update: { name: role.name, description: role.description },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: row.id } });
    await prisma.rolePermission.createMany({
      data: permissions.filter((p) => role.permissions.includes(p.code as never)).map((p) => ({ roleId: row.id, permissionId: p.id })),
    });
  }
  const categories = [
    ['development', 'Dự án đang triển khai'],
    ['operation', 'Dự án đang vận hành'],
    ['sale', 'Mua bán'],
    ['rent', 'Cho thuê'],
  ];
  for (const [i, [code, name]] of categories.entries())
    await prisma.projectCategory.upsert({ where: { code }, create: { code, name, sortOrder: i }, update: { name, sortOrder: i } });
  const types = [
    ['studio', 'Studio'],
    ['1pn', '1 phòng ngủ'],
    ['2pn', '2 phòng ngủ'],
    ['3pn', '3 phòng ngủ'],
    ['serviced', 'Căn hộ dịch vụ'],
    ['penthouse', 'Penthouse'],
  ];
  for (const [i, [code, name]] of types.entries())
    await prisma.propertyType.upsert({ where: { code }, create: { code, name, sortOrder: i }, update: { name, sortOrder: i } });
  const blogCategories = [
    ['tin-doanh-nghiep', 'Tin doanh nghiệp'],
    ['thi-truong-bat-dong-san', 'Thị trường bất động sản'],
    ['cam-nang-thue-nha', 'Cẩm nang thuê nhà'],
    ['phong-cach-song', 'Phong cách sống'],
    ['goc-nhin-chu-so-huu', 'Góc nhìn chủ sở hữu'],
  ];
  for (const [i, [slug, name]] of blogCategories.entries())
    await prisma.blogCategory.upsert({ where: { slug }, create: { slug, name, sortOrder: i }, update: {} });
  // "Lĩnh vực hoạt động": created once, then edited in Admin (never overwritten).
  await prisma.staticPage.createMany({ data: SERVICES.map((s, i) => serviceRow(s, i)), skipDuplicates: true });
}

const SERVICES: [slug: string, title: string, intro: string, summary: string, inMenu: boolean, linkHref?: string][] = [
  ['quan-ly-bat-dong-san', 'Quản lý vận hành bất động sản', 'Đồng hành từ tiếp nhận căn hộ, theo dõi vận hành đến báo cáo định kỳ, với quy trình rõ ràng và dễ theo dõi.', 'Tiếp nhận, vận hành và báo cáo định kỳ', true],
  ['khai-thac-cho-thue', 'Khai thác căn hộ cho thuê', 'Kết nối căn hộ với nhu cầu phù hợp, hỗ trợ giới thiệu không gian, đón tiếp và chăm sóc người thuê.', 'Tìm khách thuê phù hợp, chăm sóc người thuê', true],
  ['hop-tac-chu-so-huu', 'Hợp tác cùng chủ sở hữu', 'Lắng nghe mục tiêu của chủ sở hữu để xây dựng phương án hợp tác phù hợp với từng tài sản.', 'Ký gửi căn hộ để Đất Vàng khai thác', true, '/hop-tac-chu-so-huu'],
  ['tu-van-dau-tu', 'Tư vấn đầu tư', 'Cùng xem xét mục tiêu, ngân sách và các yếu tố thị trường trước mỗi quyết định dài hạn.', 'Mục tiêu, ngân sách và thị trường', true],
  ['toi-uu-khong-gian', 'Tối ưu không gian sống', 'Gợi ý bố trí nội thất, ánh sáng và công năng để mỗi mét vuông mang lại giá trị sử dụng.', 'Bố trí nội thất, ánh sáng và công năng', false],
  ['cham-soc-bao-tri', 'Chăm sóc và bảo trì căn hộ', 'Lên lịch kiểm tra, ghi nhận hiện trạng và phối hợp bảo trì để duy trì trải nghiệm sống.', 'Kiểm tra định kỳ và phối hợp bảo trì', false],
];
function serviceRow([slug, title, intro, summary, inMenu, linkHref]: (typeof SERVICES)[number], i: number) {
  return {
    path: `dich-vu/${slug}`,
    kind: 'SERVICE' as const,
    title,
    eyebrow: 'LĨNH VỰC HOẠT ĐỘNG',
    intro,
    summary,
    sections: SERVICE_SECTIONS[slug] ?? [],
    sortOrder: (i + 1) * 10,
    inMenu,
    linkHref: linkHref ?? null,
    status: 'PUBLISHED' as const,
    publishedAt: new Date(),
  };
}

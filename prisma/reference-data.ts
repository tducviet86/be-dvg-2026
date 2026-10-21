/**
 * Reference data required in every environment (idempotent).
 * Contains no credentials and no business content.
 */
import type { PrismaClient } from '../src/generated/prisma/client.js';
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
}

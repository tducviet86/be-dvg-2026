/** Permission catalogue. Roles are data (seeded), permissions are code. */
export const PERMISSIONS = {
  contentRead: 'content:read',
  projectsWrite: 'projects:write',
  propertiesWrite: 'properties:write',
  bannersWrite: 'banners:write',
  blogWrite: 'blog:write',
  pagesWrite: 'pages:write',
  publish: 'content:publish',
  mediaWrite: 'media:write',
  leadsRead: 'leads:read',
  leadsWrite: 'leads:write',
  leadsExport: 'leads:export',
  settingsWrite: 'settings:write',
  usersManage: 'users:manage',
  auditRead: 'audit:read',
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
const all = Object.values(PERMISSIONS);

export const ROLE_DEFINITIONS: {
  code: string;
  name: string;
  description: string;
  permissions: Permission[];
}[] = [
  {
    code: 'admin',
    name: 'Quản trị hệ thống',
    description: 'Toàn quyền, bao gồm người dùng và nhật ký.',
    permissions: all,
  },
  {
    code: 'editor',
    name: 'Biên tập nội dung',
    description: 'Quản lý dự án, căn hộ, banner, bài viết, trang và media.',
    permissions: [
      PERMISSIONS.contentRead,
      PERMISSIONS.projectsWrite,
      PERMISSIONS.propertiesWrite,
      PERMISSIONS.bannersWrite,
      PERMISSIONS.blogWrite,
      PERMISSIONS.pagesWrite,
      PERMISSIONS.publish,
      PERMISSIONS.mediaWrite,
    ],
  },
  {
    code: 'sales',
    name: 'Tư vấn viên',
    description: 'Xem và xử lý yêu cầu khách hàng được phân công.',
    permissions: [
      PERMISSIONS.contentRead,
      PERMISSIONS.leadsRead,
      PERMISSIONS.leadsWrite,
    ],
  },
];

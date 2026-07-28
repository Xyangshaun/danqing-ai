// ============================================================
// 丹青有AI - RBAC 权限矩阵定义
// 对应文档:
//   - .trae/documents/auth-design.md §2.4(多租户 JWT 处理)
//   - .trae/documents/data-model-v1.md(User/Tenant/TenantMember 表结构)
//   - .trae/documents/api-contract-v1.md(接口规范 + 错误码)
//
// 设计原则:
//   1. 角色(UserRole):admin / teacher / student / owner
//      - admin:租户管理员(学校/学院级),拥有全部权限
//      - owner:个人租户所有者,等同 admin(见 schema.prisma UserRole 注释)
//      - teacher:教师(学院/班级级),可管理租户内分析 + 邀请成员
//      - student:学生(班级/个人),仅可操作自己的资源
//   2. 权限(Permission):细粒度操作标识,格式 `资源:动作:范围`
//      - :own  表示仅操作自己创建的资源
//      - :tenant 表示可操作租户内所有资源
//   3. 数据范围过滤:在 service 层根据角色动态构建查询条件
//      - student 强制 WHERE user_id = ?(只能看自己的)
//      - teacher/admin 不加 user_id 过滤(可见租户全量)
// ============================================================

import type { UserRole } from '../types/api-contract.js';

// ============================================================
// 权限定义(细粒度操作标识)
// ============================================================

/**
 * 系统所有权限的联合类型
 * 命名规范:`资源:动作[:范围]`
 *  - 范围 `own` = 仅自己的资源
 *  - 范围 `tenant` = 租户内任意资源
 */
export type Permission =
  | 'analysis:create' // 提交分析任务
  | 'analysis:read:own' // 查看自己的分析
  | 'analysis:read:tenant' // 查看租户内所有分析
  | 'analysis:delete:own' // 删除自己的分析
  | 'analysis:delete:tenant' // 删除租户内任何分析
  | 'user:read' // 查看租户内用户信息(成员列表)
  | 'user:update:own' // 更新自己的资料
  | 'user:update:tenant' // 更新租户内用户资料(改角色等)
  | 'user:invite' // 邀请用户加入租户
  | 'user:remove' // 移除租户成员
  | 'tenant:read' // 查看租户信息
  | 'tenant:update' // 更新租户设置(名称/配额等)
  | 'tenant:switch' // 切换当前激活租户
  | 'artwork:read' // 查看艺术品知识库
  | 'stats:read' // 查看个人统计数据
  | 'stats:read:tenant'; // 查看租户统计数据

/**
 * 权限全集(用于 ADMIN/OWNER 全权角色)
 * 维护时新增权限需同步追加到此数组
 */
export const ALL_PERMISSIONS: readonly Permission[] = [
  'analysis:create',
  'analysis:read:own',
  'analysis:read:tenant',
  'analysis:delete:own',
  'analysis:delete:tenant',
  'user:read',
  'user:update:own',
  'user:update:tenant',
  'user:invite',
  'user:remove',
  'tenant:read',
  'tenant:update',
  'tenant:switch',
  'artwork:read',
  'stats:read',
  'stats:read:tenant',
];

// ============================================================
// 角色 → 权限映射矩阵
// ============================================================

/**
 * RBAC 权限矩阵(角色 → 权限列表)
 *
 * 权限矩阵表:
 * | 权限                    | ADMIN | OWNER | TEACHER | STUDENT |
 * |-------------------------|:-----:|:-----:|:-------:|:-------:|
 * | analysis:create         |  Y    |  Y    |   Y     |   Y     |
 * | analysis:read:own       |  Y    |  Y    |   Y     |   Y     |
 * | analysis:read:tenant    |  Y    |  Y    |   Y     |   N     |
 * | analysis:delete:own     |  Y    |  Y    |   Y     |   Y     |
 * | analysis:delete:tenant  |  Y    |  Y    |   N     |   N     |
 * | user:read               |  Y    |  Y    |   Y     |   N     |
 * | user:update:own         |  Y    |  Y    |   Y     |   Y     |
 * | user:update:tenant      |  Y    |  Y    |   N     |   N     |
 * | user:invite             |  Y    |  Y    |   Y     |   N     |
 * | user:remove             |  Y    |  Y    |   N     |   N     |
 * | tenant:read             |  Y    |  Y    |   Y     |   Y     |
 * | tenant:update           |  Y    |  Y    |   N     |   N     |
 * | tenant:switch           |  Y    |  Y    |   Y     |   Y     |
 * | artwork:read            |  Y    |  Y    |   Y     |   Y     |
 * | stats:read              |  Y    |  Y    |   Y     |   Y     |
 * | stats:read:tenant       |  Y    |  Y    |   Y     |   N     |
 *
 * 说明:
 *  - ADMIN/OWNER:全权限(OWNER 等同 ADMIN,见 schema.prisma UserRole.owner 注释)
 *  - TEACHER:可管理租户内分析(读全量/删自己)、邀请成员、查看租户统计,
 *            但不可移除成员、不可改租户设置、不可删他人分析
 *  - STUDENT:仅可操作自己的资源 + 查看艺术品库 + 个人统计
 */
export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = Object.freeze({
  // 管理员:全部权限
  admin: ALL_PERMISSIONS,
  // 所有者:等同 admin(个人租户场景)
  owner: ALL_PERMISSIONS,
  // 教师:租户内分析只读 + 自删 + 邀请 + 租户统计
  teacher: Object.freeze<Permission[]>([
    'analysis:create',
    'analysis:read:own',
    'analysis:read:tenant',
    'analysis:delete:own',
    'user:read',
    'user:update:own',
    'user:invite',
    'tenant:read',
    'tenant:switch',
    'artwork:read',
    'stats:read',
    'stats:read:tenant',
  ]),
  // 学生:仅自己的资源 + 个人统计
  student: Object.freeze<Permission[]>([
    'analysis:create',
    'analysis:read:own',
    'analysis:delete:own',
    'user:update:own',
    'tenant:read',
    'tenant:switch',
    'artwork:read',
    'stats:read',
  ]),
});

// ============================================================
// 权限查询工具函数
// ============================================================

/**
 * 判断某角色是否拥有指定权限
 * @param role 用户角色
 * @param permission 权限标识
 * @returns true 拥有;false 不拥有
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * 判断某角色是否拥有给定权限中的任意一个(OR 语义)
 * @param role 用户角色
 * @param permissions 权限列表
 * @returns true 拥有任意一个;false 全不拥有
 */
export function hasAnyPermission(role: UserRole, permissions: readonly Permission[]): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms || permissions.length === 0) return false;
  return permissions.some((p) => perms.includes(p));
}

/**
 * 判断某角色是否拥有给定权限中的全部(AND 语义)
 * @param role 用户角色
 * @param permissions 权限列表
 * @returns true 全部拥有;false 至少缺一个
 */
export function hasAllPermissions(role: UserRole, permissions: readonly Permission[]): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms || permissions.length === 0) return false;
  return permissions.every((p) => perms.includes(p));
}

/**
 * 获取某角色的全部权限列表(只读副本)
 */
export function getPermissionsByRole(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * 判断角色是否为"租户全量可见"(teacher / admin / owner)
 * 用于 analysis.service 数据范围过滤
 * @param role 用户角色
 * @returns true 表示可看租户全量;false 表示仅可看自己
 */
export function canReadTenantWide(role: UserRole): boolean {
  return role === 'admin' || role === 'owner' || role === 'teacher';
}

/**
 * 判断角色是否可删除租户内任意分析(仅 admin / owner)
 */
export function canDeleteTenantWide(role: UserRole): boolean {
  return role === 'admin' || role === 'owner';
}

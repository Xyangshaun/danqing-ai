# 丹青有AI - 生产环境账号文档

> 生产环境地址: https://www.danqing.site
> 业务应用入口: https://www.danqing.site/app
> 最后更新: 2026-08-08

---

## 一、标准账号(10个,密码登录)

| 用途 | 姓名 | 邮箱 | 密码 | 系统角色 | 所属租户 |
|------|------|------|------|----------|----------|
| 管理员 | 系统管理员 | admin@dq.edu | Yzy26285 | admin | 丹青示范学院 |
| 二级管理员 | 二级管理员(只读) | subadmin@dq.edu | Dq@SubAdmin2026 | admin | 丹青示范学院 |
| 开发者 | 开发者 | developer@dq.edu | Dq@Dev2026 | admin | 丹青示范学院 |
| 教师(评审) | 示范教师 | teacher@dq.edu | Dq@Teacher2026 | teacher | 丹青示范学院 |
| 企业学校 | 企业管理员 | enterprise@dq.edu | Dq@Enterprise2026 | owner | 丹青创意科技 |
| 学生1 | 测试学生1 | test1@dq.edu | Dq@Test2026 | student | 丹青示范学院 |
| 学生2 | 测试学生2 | test2@dq.edu | Dq@Test2026 | student | 丹青示范学院 |
| 学生3 | 测试学生3 | test3@dq.edu | Dq@Test2026 | student | 丹青示范学院 |
| 学生4 | 测试学生4 | test4@dq.edu | Dq@Test2026 | student | 丹青示范学院 |
| 学生5 | 测试学生5 | test5@dq.edu | Dq@Test2026 | student | 丹青示范学院 |

## 二、飞书/历史账号(4个)

| 姓名 | 邮箱 | 登录方式 | 角色 | 所属租户 | 说明 |
|------|------|----------|------|----------|------|
| 杨振远 | (无) | 飞书OAuth | student | 杨振远的个人空间 | 飞书注册真实用户 |
| 图片调试 | imgdebug2026@gmail.com | 密码(原密码) | owner | 图片调试的个人空间 | 调试用账号 |
| LoadingTest | loading-test-1786131130036@dq.edu | 密码(原密码) | owner | LoadingTest的个人空间 | 加载测试账号 |
| LoadingTest | loading-test-1786131220760@dq.edu | 密码(原密码) | owner | LoadingTest的个人空间 | 加载测试账号 |

> 注: 图片调试和2个LoadingTest账号的密码为注册时设置的原密码(未重置),如需登录请通过"忘记密码"重置。

---

## 三、租户信息

| 租户ID | 租户名称 | 类型 | 套餐 | 状态 |
|--------|----------|------|------|------|
| seed-tenant-school | 丹青示范学院 | school | enterprise | active |
| seed-tenant-enterprise | 丹青创意科技 | school | enterprise | active |
| 550667f7-... | 杨振远的个人空间 | individual | free | active |
| 6eda22f2-... | 图片调试的个人空间 | individual | free | active |
| db74edfb-... | LoadingTest的个人空间 | individual | free | active |
| ef8cb0c8-... | LoadingTest的个人空间 | individual | free | active |

---

## 四、角色权限说明
- **admin**: 系统最高权限,可管理所有租户/用户/数据/配置
- **teacher**: 可查看所属租户学生作品、评分、处理复核争议
- **owner**: 企业/个人租户所有者,可管理本租户内的用户和班级
- **student**: 可上传作品、查看评审结果、申请复核

---

## 五、登录入口

| 入口 | 地址 | 说明 |
|------|------|------|
| 官网首页 | https://www.danqing.site | 品牌官网 |
| 业务应用 | https://www.danqing.site/app | 学生/教师/管理员登录后进入 |
| 飞书登录 | https://www.danqing.site/app | 点击"飞书登录"按钮 |

---

## 六、注意事项
- 登录限流: 5次/分钟/IP(密码登录),10次/分钟/IP(飞书授权)
- API 限流: 60次/分钟/用户
- admin@dq.edu 密码已由用户修改为 Yzy26285
- 5个学生账号密码统一为 Dq@Test2026
- 杨振远为飞书OAuth登录,无密码
- 请妥善保管账号密码,切勿泄露

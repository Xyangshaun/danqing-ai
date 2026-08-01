// ============================================================
// 系统管理 - 租户管理 CRUD
// - 搜索(名称)+ 筛选(类型/套餐/状态)+ 分页
// - 创建租户 / 编辑租户 / 启用-禁用
// - 多租户层级(parentId)
// ============================================================

import { useRef, useState } from 'react';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { ProTable, PageContainer } from '@ant-design/pro-components';
import { Tag, Button, App, Modal, Form, Input, InputNumber, Select } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import type {
  AdminTenantListItem,
  TenantType,
  TenantPlan,
  TenantStatus,
} from '@/types/api';
import { listTenants, createTenant, updateTenant } from '@/services/system';
import Access from '@/components/Access';
import { useConfirmAction } from '@/components/ConfirmAction';
import {
  PERM,
  TENANT_TYPE_LABEL,
  TENANT_TYPE_OPTIONS,
  PLAN_LABEL,
  PLAN_COLOR,
  PLAN_OPTIONS,
  TENANT_STATUS_LABEL,
  TENANT_STATUS_COLOR,
  TENANT_STATUS_OPTIONS,
} from '@/constants';
import { formatDateTime } from '@/utils/format';

export default function TenantsPage() {
  const tableRef = useRef<ActionType>();
  const { message } = App.useApp();
  const { confirm } = useConfirmAction();
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const openCreate = () => {
    setEditId(null);
    form.resetFields();
    form.setFieldsValue({
      type: 'school',
      plan: 'free',
      maxSeats: 50,
      status: 'active',
    });
    setEditOpen(true);
  };

  const openEdit = (record: AdminTenantListItem) => {
    setEditId(record.id);
    form.setFieldsValue({
      name: record.name,
      type: record.type,
      plan: record.plan,
      status: record.status,
      maxSeats: record.maxSeats,
      parentId: record.parentId,
      feishuTenantKey: record.feishuTenantKey,
    });
    setEditOpen(true);
  };

  const onSubmit = async () => {
    const values = await form.validateFields();
    if (editId) {
      const payload = {
        name: values.name as string,
        plan: values.plan as TenantPlan,
        status: values.status as TenantStatus,
        maxSeats: values.maxSeats as number,
      };
      await updateTenant(editId, payload);
      message.success('租户已更新');
    } else {
      const payload = {
        name: values.name as string,
        type: values.type as TenantType,
        plan: (values.plan as TenantPlan) ?? 'free',
        maxSeats: (values.maxSeats as number) ?? 50,
        parentId: values.parentId || undefined,
        feishuTenantKey: values.feishuTenantKey || undefined,
      };
      await createTenant(payload);
      message.success('租户已创建');
    }
    setEditOpen(false);
    tableRef.current?.reload();
  };

  const onToggleStatus = (record: AdminTenantListItem) => {
    const next: TenantStatus = record.status === 'active' ? 'disabled' : 'active';
    confirm(
      {
        title: next === 'disabled' ? '禁用租户' : '启用租户',
        content: `确认${next === 'disabled' ? '禁用' : '启用'}租户「${record.name}」?${
          next === 'disabled' ? '禁用后该租户下所有用户将无法登录。' : ''
        }`,
        okText: next === 'disabled' ? '禁用' : '启用',
        danger: next === 'disabled',
      },
      () => updateTenant(record.id, { status: next }),
    ).then(() => tableRef.current?.reload());
  };

  const columns: ProColumns<AdminTenantListItem>[] = [
    {
      title: '租户名称',
      dataIndex: 'name',
      width: 180,
      fixed: 'left',
      fieldProps: { placeholder: '搜索租户名称' },
      render: (_, r) => <b>{r.name}</b>,
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 90,
      valueType: 'select',
      fieldProps: { options: TENANT_TYPE_OPTIONS, allowClear: true },
      render: (_, r) => <Tag>{TENANT_TYPE_LABEL[r.type]}</Tag>,
    },
    {
      title: '套餐',
      dataIndex: 'plan',
      width: 90,
      valueType: 'select',
      fieldProps: { options: PLAN_OPTIONS, allowClear: true },
      render: (_, r) => <Tag color={PLAN_COLOR[r.plan]}>{PLAN_LABEL[r.plan]}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      valueType: 'select',
      fieldProps: { options: TENANT_STATUS_OPTIONS, allowClear: true },
      render: (_, r) => (
        <span>
          <span
            className="dq-status-dot"
            style={{ background: r.status === 'active' ? '#3e7d5a' : '#c8392e' }}
          />
          <Tag color={TENANT_STATUS_COLOR[r.status]} style={{ margin: 0 }}>
            {TENANT_STATUS_LABEL[r.status]}
          </Tag>
        </span>
      ),
    },
    {
      title: '席位数',
      dataIndex: 'maxSeats',
      width: 80,
      hideInSearch: true,
    },
    {
      title: '成员数',
      dataIndex: 'memberCount',
      width: 80,
      hideInSearch: true,
      render: (_, r) => <span style={{ color: '#2e5c6e' }}>{r.memberCount}</span>,
    },
    {
      title: '飞书租户',
      dataIndex: 'feishuTenantKey',
      width: 140,
      hideInSearch: true,
      ellipsis: true,
      render: (_, r) => r.feishuTenantKey ?? <span style={{ color: '#bfb8a8' }}>-</span>,
    },
    {
      title: '父租户',
      dataIndex: 'parentId',
      width: 120,
      hideInSearch: true,
      ellipsis: true,
      render: (_, r) => r.parentId ?? <span style={{ color: '#bfb8a8' }}>-</span>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 160,
      hideInSearch: true,
      render: (_, r) => formatDateTime(r.createdAt),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 160,
      fixed: 'right',
      render: (_, r) => [
        <Access key="edit" permission={PERM.tenantWrite}>
          <a onClick={() => openEdit(r)}>
            <EditOutlined /> 编辑
          </a>
        </Access>,
        <Access key="toggle" permission={PERM.tenantWrite}>
          <a
            onClick={() => onToggleStatus(r)}
            style={{ color: r.status === 'active' ? '#c8392e' : '#3e7d5a' }}
          >
            {r.status === 'active' ? '禁用' : '启用'}
          </a>
        </Access>,
      ],
    },
  ];

  return (
    <PageContainer header={{ title: '租户管理', ghost: true }}>
      <ProTable<AdminTenantListItem>
        actionRef={tableRef}
        rowKey="id"
        columns={columns}
        scroll={{ x: 1300 }}
        size="small"
        search={{ labelWidth: 70, defaultCollapsed: false }}
        options={{ density: true, fullScreen: true, reload: true, setting: true }}
        pagination={{ pageSize: 20, pageSizeOptions: [10, 20, 50, 100], showSizeChanger: true }}
        request={async (params) => {
          const { current, pageSize, ...rest } = params;
          const res = await listTenants({
            page: current,
            pageSize,
            search: rest.name as string | undefined,
            type: rest.type as TenantType | undefined,
            plan: rest.plan as TenantPlan | undefined,
            status: rest.status as TenantStatus | undefined,
          });
          return { data: res.items, total: res.total, success: true };
        }}
        toolBarRender={() => [
          <Access key="create" permission={PERM.tenantWrite}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建租户
            </Button>
          </Access>,
        ]}
      />

      <Modal
        title={editId ? '编辑租户' : '新建租户'}
        open={editOpen}
        onOk={onSubmit}
        onCancel={() => setEditOpen(false)}
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label="租户名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item label="租户类型" name="type" rules={[{ required: true }]}>
            <Select options={TENANT_TYPE_OPTIONS} disabled={!!editId} />
          </Form.Item>
          <Form.Item label="套餐" name="plan" rules={[{ required: true }]}>
            <Select options={PLAN_OPTIONS} />
          </Form.Item>
          <Form.Item label="最大席位数" name="maxSeats" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          {editId && (
            <Form.Item label="状态" name="status" rules={[{ required: true }]}>
              <Select options={TENANT_STATUS_OPTIONS} />
            </Form.Item>
          )}
          {!editId && (
            <>
              <Form.Item label="父租户 ID(可选)" name="parentId">
                <Input placeholder="上级租户 ID,用于层级管理" />
              </Form.Item>
              <Form.Item label="飞书租户 Key(可选)" name="feishuTenantKey">
                <Input placeholder="飞书企业租户标识" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </PageContainer>
  );
}

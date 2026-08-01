// ============================================================
// 二次确认操作 Hook
// 关键操作(删除/退款/取消订阅)需二次确认
// 超管操作可扩展飞书验证码二次验证(此处预留接口)
// ============================================================

import { useCallback, useState } from 'react';
import { Modal, Input, App } from 'antd';

interface ConfirmOptions {
  title: string;
  content: React.ReactNode;
  okText?: string;
  cancelText?: string;
  okButtonProps?: { danger?: boolean };
  /** 是否需要输入确认文本(如输入"删除"以确认) */
  requireText?: string;
  /** 危险操作红色按钮 */
  danger?: boolean;
  /** 是否需要飞书验证码二次验证(超管操作) */
  requireFeishuCode?: boolean;
}

export function useConfirmAction() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const confirm = useCallback(
    <T,>(opts: ConfirmOptions, action: () => Promise<T>): Promise<T | undefined> => {
      return new Promise<T | undefined>((resolve) => {
        let feishuCode = '';
        let confirmText = '';

        const doAction = async () => {
          setLoading(true);
          try {
            const result = await action();
            message.success('操作成功');
            resolve(result as T);
          } catch (err) {
            const msg = err instanceof Error ? err.message : '操作失败';
            message.error(msg);
            resolve(undefined);
          } finally {
            setLoading(false);
          }
        };

        const modal = Modal.confirm({
          title: opts.title,
          icon: null,
          width: 440,
          content: (
            <div>
              <div style={{ marginBottom: 12, color: '#6b6b6b', fontSize: 13 }}>{opts.content}</div>
              {opts.requireText && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>
                    请输入 <b style={{ color: '#c8392e' }}>{opts.requireText}</b> 以确认:
                  </div>
                  <Input
                    value={confirmText}
                    onChange={(e) => {
                      confirmText = e.target.value;
                    }}
                    placeholder={opts.requireText}
                  />
                </div>
              )}
              {opts.requireFeishuCode && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>请输入飞书动态验证码:</div>
                  <Input
                    value={feishuCode}
                    onChange={(e) => {
                      feishuCode = e.target.value;
                    }}
                    placeholder="6 位验证码"
                    maxLength={6}
                  />
                </div>
              )}
            </div>
          ),
          okText: opts.okText ?? '确认',
          cancelText: opts.cancelText ?? '取消',
          okButtonProps: {
            danger: opts.danger ?? opts.okButtonProps?.danger,
            loading,
          },
          onOk: async () => {
            if (opts.requireText && confirmText !== opts.requireText) {
              message.warning(`请输入正确的确认文本:${opts.requireText}`);
              return Promise.reject();
            }
            if (opts.requireFeishuCode && feishuCode.length !== 6) {
              message.warning('请输入 6 位飞书验证码');
              return Promise.reject();
            }
            await doAction();
          },
          onCancel: () => resolve(undefined),
        });

        // 暴露 modal 实例以便外部关闭
        return modal;
      });
    },
    [loading, message],
  );

  return { confirm, loading };
}

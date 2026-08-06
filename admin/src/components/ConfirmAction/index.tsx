// ============================================================
// 二次确认操作 Hook
// 关键操作(删除/退款/取消订阅)需二次确认
// 超管操作可扩展飞书验证码二次验证(requireFeishuCode)
//
// 完善点:
//   1. loading 状态响应式更新(modal.update 同步 OK 按钮加载态)
//   2. 飞书验证码:6 位纯数字校验 + 发送验证码按钮(60s 倒计时)
//   3. 确认文本:trim 后严格匹配
//   4. 输入框样式优化(等宽 + 居中,便于输入验证码)
// ============================================================

import { useCallback, useState } from 'react';
import { Modal, Input, App, Button } from 'antd';

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

/** 6 位纯数字验证码校验 */
function isValidFeishuCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

export function useConfirmAction() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const confirm = useCallback(
    <T,>(opts: ConfirmOptions, action: () => Promise<T>): Promise<T | undefined> => {
      return new Promise<T | undefined>((resolve) => {
        // 使用 ref 持有可变输入值(避免 Modal.confirm 闭包捕获旧值)
        const stateRef = { feishuCode: '', confirmText: '', countdown: 0 };
        let countdownTimer: ReturnType<typeof setInterval> | null = null;
        let modalInstance: ReturnType<typeof Modal.confirm> | null = null;

        /** 构建 Modal 内容(随 stateRef 变化重建) */
        const buildContent = () => (
          <div>
            <div style={{ marginBottom: 12, color: '#6b6b6b', fontSize: 13 }}>
              {opts.content}
            </div>
            {opts.requireText && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>
                  请输入 <b style={{ color: '#c8392e' }}>{opts.requireText}</b> 以确认:
                </div>
                <Input
                  value={stateRef.confirmText}
                  onChange={(e) => {
                    stateRef.confirmText = e.target.value;
                  }}
                  placeholder={opts.requireText}
                />
              </div>
            )}
            {opts.requireFeishuCode && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>请输入飞书动态验证码:</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Input
                    value={stateRef.feishuCode}
                    onChange={(e) => {
                      // 仅允许输入数字,最多 6 位
                      stateRef.feishuCode = e.target.value.replace(/\D/g, '').slice(0, 6);
                    }}
                    placeholder="6 位数字验证码"
                    maxLength={6}
                    style={{ flex: 1, fontFamily: 'monospace', letterSpacing: 2 }}
                    inputMode="numeric"
                  />
                  <Button
                    size="small"
                    disabled={stateRef.countdown > 0}
                    onClick={() => {
                      // 发送验证码 + 启动 60s 倒计时
                      // TODO: 后端补充 POST /auth/feishu/verify-code 发送接口后接入
                      stateRef.countdown = 60;
                      modalInstance?.update({
                        content: buildContent(),
                        okButtonProps: {
                          danger: opts.danger ?? opts.okButtonProps?.danger,
                          loading,
                        },
                      });
                      countdownTimer = setInterval(() => {
                        stateRef.countdown -= 1;
                        if (stateRef.countdown <= 0) {
                          if (countdownTimer) {
                            clearInterval(countdownTimer);
                            countdownTimer = null;
                          }
                        }
                        modalInstance?.update({
                          content: buildContent(),
                          okButtonProps: {
                            danger: opts.danger ?? opts.okButtonProps?.danger,
                            loading,
                          },
                        });
                      }, 1000);
                    }}
                  >
                    {stateRef.countdown > 0 ? `${stateRef.countdown}s 后重发` : '发送验证码'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );

        /** 同步 OK 按钮 loading 态(modal.update 解决闭包不响应问题) */
        const syncLoading = (isLoading: boolean) => {
          modalInstance?.update({
            okButtonProps: {
              danger: opts.danger ?? opts.okButtonProps?.danger,
              loading: isLoading,
            },
          });
        };

        const doAction = async () => {
          setLoading(true);
          syncLoading(true);
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
            syncLoading(false);
          }
        };

        modalInstance = Modal.confirm({
          title: opts.title,
          icon: null,
          width: 440,
          content: buildContent(),
          okText: opts.okText ?? '确认',
          cancelText: opts.cancelText ?? '取消',
          okButtonProps: {
            danger: opts.danger ?? opts.okButtonProps?.danger,
            loading: false,
          },
          onOk: async () => {
            if (
              opts.requireText &&
              stateRef.confirmText.trim() !== opts.requireText
            ) {
              message.warning(`请输入正确的确认文本:${opts.requireText}`);
              return Promise.reject();
            }
            if (opts.requireFeishuCode) {
              if (!isValidFeishuCode(stateRef.feishuCode)) {
                message.warning('请输入 6 位数字飞书验证码');
                return Promise.reject();
              }
              // TODO: 后端补充 POST /auth/feishu/verify-code 校验接口后,
              //       此处应先 await verifyFeishuCode(stateRef.feishuCode) 再执行 doAction
            }
            await doAction();
          },
          onCancel: () => {
            if (countdownTimer) {
              clearInterval(countdownTimer);
              countdownTimer = null;
            }
            resolve(undefined);
          },
        });
      });
    },
    [loading, message],
  );

  return { confirm, loading };
}

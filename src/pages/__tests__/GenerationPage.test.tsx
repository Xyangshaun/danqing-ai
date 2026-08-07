// ============================================================
// GenerationPage 页面单元测试 (M2-T7 前端生成入口)
// 对应源码: src/pages/GenerationPage.tsx
//
// 测试范围:
//   1. 表单渲染(标题/输入来源切换/提交按钮)
//   2. 文字模式提交 → createGeneration 收到正确请求体
//   3. 文字模式缺提示词时不提交(toast 校验提示)
//   4. 轮询状态机 pending→success 展示结果
//   5. 轮询状态机 pending→failed 展示失败原因
//   6. 一键诊断(占位)toast 提示
//   7. 配额超限(6101)/限流(6106)错误差异化提示
//
// Mock 策略:
//   - generationService.createGeneration / getGeneration: 可控 resolve
//   - 页面其余组件(GenerationForm/Loading/Result/Failed)为真实组件
//   - ApiError: 使用真实 api.ts 导出类构造错误码
//   - 轮询用 fake timers + advanceTimersByTimeAsync 推进
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GenerationPage from '../GenerationPage';
import { ToastProvider } from '../../components/ToastProvider';
import { ApiError } from '../../services/api';

/* ---------- mock generationService ---------- */
const createGenerationMock = vi.fn();
const getGenerationMock = vi.fn();

vi.mock('../../services/generationService', async () => {
  const actual = await vi.importActual<typeof import('../../services/generationService')>(
    '../../services/generationService'
  );
  return {
    ...actual,
    createGeneration: (...args: unknown[]) => createGenerationMock(...args),
    getGeneration: (...args: unknown[]) => getGenerationMock(...args),
  };
});

/* ---------- 渲染辅助 ---------- */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/generate']}>
      <ToastProvider>
        <GenerationPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

/** 在文字模式下输入提示词并点击"开始生成" */
async function fillPromptAndSubmit(prompt = '水墨山水') {
  const textarea = screen.getByPlaceholderText(/例如：水墨山水/);
  fireEvent.change(textarea, { target: { value: prompt } });
  fireEvent.click(screen.getByText('开始生成'));
  // 冲刷 createGeneration 的异步 resolve
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  createGenerationMock.mockReset();
  getGenerationMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

/* ============================================================
 * 1. 表单渲染
 * ============================================================ */
describe('GenerationPage 表单渲染', () => {
  it('渲染页面标题"AI 生成"', () => {
    renderPage();
    // 页面标题 + 表单卡片标题均含"AI 生成",用 getAllByText 断言至少一处
    expect(screen.getAllByText('AI 生成').length).toBeGreaterThan(0);
  });

  it('渲染输入来源切换(文字/草稿图)与开始生成按钮', () => {
    renderPage();
    expect(screen.getByText('文字提示词')).toBeInTheDocument();
    expect(screen.getByText('上传草稿图')).toBeInTheDocument();
    expect(screen.getByText('开始生成')).toBeInTheDocument();
  });
});

/* ============================================================
 * 2. 文字模式提交
 * ============================================================ */
describe('GenerationPage 文字模式提交', () => {
  it('输入提示词并提交,createGeneration 收到正确请求体', async () => {
    createGenerationMock.mockResolvedValue({ taskId: 'task-1', status: 'pending', images: null });
    renderPage();
    await fillPromptAndSubmit('水墨山水');

    await waitFor(() => {
      expect(createGenerationMock).toHaveBeenCalledTimes(1);
    });
    const payload = createGenerationMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      inputType: 'text',
      prompt: '水墨山水',
      artType: 'painting', // 默认绘画
      aspect: 'square',
      count: 1,
    });
    // sketch 相关字段不携带
    expect(payload.sketchImageUrl).toBeUndefined();
  });

  it('提示词为空时不提交(toast 校验提示)', async () => {
    renderPage();
    await fillPromptAndSubmit('   ');
    expect(createGenerationMock).not.toHaveBeenCalled();
  });
});

/* ============================================================
 * 3. 轮询状态机
 * ============================================================ */
describe('GenerationPage 轮询状态机', () => {
  it('pending→success 轮询后展示生成结果', async () => {
    createGenerationMock.mockResolvedValue({ taskId: 'task-1', status: 'pending', images: null });
    // 首次查询 + 后续轮询:先 pending,后 success
    getGenerationMock
      .mockResolvedValueOnce({
        taskId: 'task-1', tenantId: 't1', status: 'pending',
        images: null, failureReason: null, usedFallback: false,
        createdAt: '', completedAt: null,
      })
      .mockResolvedValueOnce({
        taskId: 'task-1', tenantId: 't1', status: 'success',
        images: [{ imageUrl: 'https://img.example.com/a.png', reviewStatus: 'approved' }],
        failureReason: null, usedFallback: false,
        createdAt: '', completedAt: null,
      });

    renderPage();
    await fillPromptAndSubmit('水墨山水');

    // 进入 generating 态(loading 组件含"取消生成"按钮,稳定标识)
    await waitFor(() => {
      expect(screen.getByText('取消生成')).toBeInTheDocument();
    });

    // 推进一个轮询间隔(2s),触发 success 分支
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    await waitFor(() => {
      expect(screen.getByText('生成结果')).toBeInTheDocument();
    });
    // 图片展示
    expect(screen.getByAltText('生成作品 1')).toBeInTheDocument();
    // 一键诊断占位按钮存在
    expect(screen.getByText('一键诊断')).toBeInTheDocument();
  });

  it('pending→failed 轮询后展示失败原因', async () => {
    createGenerationMock.mockResolvedValue({ taskId: 'task-1', status: 'pending', images: null });
    getGenerationMock
      .mockResolvedValueOnce({
        taskId: 'task-1', tenantId: 't1', status: 'processing',
        images: null, failureReason: null, usedFallback: false,
        createdAt: '', completedAt: null,
      })
      .mockResolvedValueOnce({
        taskId: 'task-1', tenantId: 't1', status: 'failed',
        images: null, failureReason: 'AI 提供商均不可用', usedFallback: true,
        createdAt: '', completedAt: null,
      });

    renderPage();
    await fillPromptAndSubmit('水墨山水');
    await waitFor(() => {
      expect(screen.getByText('取消生成')).toBeInTheDocument();
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    await waitFor(() => {
      expect(screen.getByText('生成失败')).toBeInTheDocument();
    });
    expect(screen.getByText('AI 提供商均不可用')).toBeInTheDocument();
    expect(screen.getByText('重新生成')).toBeInTheDocument();
  });

  it('展示 loading 态(排队中/生成中)', async () => {
    createGenerationMock.mockResolvedValue({ taskId: 'task-1', status: 'pending', images: null });
    getGenerationMock.mockResolvedValue({
      taskId: 'task-1', tenantId: 't1', status: 'pending',
      images: null, failureReason: null, usedFallback: false,
      createdAt: '', completedAt: null,
    });

    renderPage();
    await fillPromptAndSubmit('水墨山水');
    // pending → "排队中" 标签
    await waitFor(() => {
      expect(screen.getByText('排队中')).toBeInTheDocument();
    });
    // loading 提示文案
    expect(screen.getByText('任务已排队')).toBeInTheDocument();
  });
});

/* ============================================================
 * 4. 一键诊断(占位)
 * ============================================================ */
describe('GenerationPage 一键诊断(占位)', () => {
  it('点击一键诊断展示"功能即将上线"提示', async () => {
    createGenerationMock.mockResolvedValue({ taskId: 'task-1', status: 'pending', images: null });
    getGenerationMock.mockResolvedValue({
      taskId: 'task-1', tenantId: 't1', status: 'success',
      images: [{ imageUrl: 'https://img.example.com/a.png', reviewStatus: 'approved' }],
      failureReason: null, usedFallback: false,
      createdAt: '', completedAt: null,
    });

    renderPage();
    await fillPromptAndSubmit('水墨山水');
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await waitFor(() => {
      expect(screen.getByText('一键诊断')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('一键诊断'));
    expect(screen.getByText('功能即将上线')).toBeInTheDocument();
  });
});

/* ============================================================
 * 5. 配额/限流错误提示
 * ============================================================ */
describe('GenerationPage 配额/限流错误', () => {
  it('配额超限(6101)展示友好提示', async () => {
    createGenerationMock.mockRejectedValue(new ApiError(6101, '生成配额已用完', 'trace', 402));
    renderPage();
    await fillPromptAndSubmit('水墨山水');
    await waitFor(() => {
      expect(screen.getByText('生成配额已用完')).toBeInTheDocument();
    });
  });

  it('限流(6106)展示友好提示', async () => {
    createGenerationMock.mockRejectedValue(new ApiError(6106, '操作过于频繁', 'trace', 429));
    renderPage();
    await fillPromptAndSubmit('水墨山水');
    await waitFor(() => {
      expect(screen.getByText('操作过于频繁')).toBeInTheDocument();
    });
  });
});

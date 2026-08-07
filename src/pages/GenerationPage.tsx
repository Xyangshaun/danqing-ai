// ============================================================
// AI 图像生成页面(M2-T7)
// ------------------------------------------------------------
// 页面编排(状态机):
//   form → generating → result(成功) / failed(失败)
//
// 交互流程:
//   1. form:展示生成入口表单(GenerationForm),采集参数并校验
//   2. submitting:调 createGeneration,进入 generating
//   3. generating:每 2s 轮询 getGeneration(taskId),直到
//      status=success → result / status=failed → failed
//   4. result:展示生成图(GenerationResult),一键诊断(占位)
//   5. failed:展示 failureReason + 重试(GenerationFailed)
//
// 配额/限流:捕获 ApiError,按错误码 6101(配额超限)/6106(限流)
// 给用户差异化友好提示。
//
// 轮询安全:setInterval 存 ref,组件卸载/状态变更时清理,避免泄漏。
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { Wand2 } from 'lucide-react';
import { ApiError } from '../services/api';
import {
  createGeneration,
  getGeneration,
  GENERATION_QUOTA_EXCEEDED,
  GENERATION_RATE_LIMITED,
  type GeneratedImage,
  type GenerationStatus,
} from '../services/generationService';
import { useToast } from '../components/ToastProvider';
import GenerationForm, { type GenerationFormValues } from './generation/GenerationForm';
import GenerationLoading from './generation/GenerationLoading';
import GenerationResult from './generation/GenerationResult';
import GenerationFailed from './generation/GenerationFailed';

/* 页面步骤状态机 */
type Step = 'form' | 'generating' | 'result' | 'failed';

/** 轮询间隔(毫秒),按计划 §8 建议 1-2s,取 2s */
const POLL_INTERVAL_MS = 2000;

/**
 * AI 图像生成页面
 */
export default function GenerationPage() {
  const toast = useToast();

  /* 步骤状态机 */
  const [step, setStep] = useState<Step>('form');
  /* 生成中当前状态(驱动 loading 文案) */
  const [genStatus, setGenStatus] = useState<GenerationStatus>('pending');
  /* 轮询计数(loading 进度感知) */
  const [pollCount, setPollCount] = useState(0);
  /* 生成成功结果 */
  const [images, setImages] = useState<GeneratedImage[]>([]);
  /* 是否降级 */
  const [usedFallback, setUsedFallback] = useState(false);
  /* 失败原因 */
  const [failureReason, setFailureReason] = useState<string | null>(null);
  /* 当前任务 ID(轮询目标) */
  const taskIdRef = useRef<string | null>(null);
  /* 轮询定时器 */
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* 清理轮询定时器 */
  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  /* 卸载时清理定时器,避免内存泄漏 */
  useEffect(() => clearPolling, [clearPolling]);

  /* 回到表单态(重试/重新生成/取消) */
  const handleBackToForm = useCallback(() => {
    clearPolling();
    setStep('form');
    setPollCount(0);
    setImages([]);
    setFailureReason(null);
    setUsedFallback(false);
    setGenStatus('pending');
  }, [clearPolling]);

  /**
   * 轮询生成任务,直到 success/failed
   * @param taskId 生成任务 ID
   */
  const startPolling = useCallback(
    (taskId: string) => {
      taskIdRef.current = taskId;
      setGenStatus('pending');
      setPollCount(0);

      const poll = async () => {
        if (!taskIdRef.current) return;
        try {
          const res = await getGeneration(taskIdRef.current);
          setUsedFallback(res.usedFallback);
          if (res.status === 'pending' || res.status === 'processing') {
            setGenStatus(res.status);
            return; // 继续下一轮
          }
          // 终态:停止轮询
          clearPolling();
          if (res.status === 'success') {
            setImages(res.images ?? []);
            setStep('result');
          } else {
            setFailureReason(res.failureReason);
            setStep('failed');
          }
        } catch (err) {
          // 轮询失败:停止轮询并回到表单,提示用户重试(避免无限轮询)
          clearPolling();
          handleApiError(err);
          setStep('form');
        }
      };

      pollTimerRef.current = setInterval(() => {
        setPollCount((c) => c + 1);
        void poll();
      }, POLL_INTERVAL_MS);
    },
    [clearPolling, handleApiError]
  );

  /* 首次立即查一次(缩短等待),再启动定时轮询 */
  const startPollingWithImmediate = useCallback(
    (taskId: string) => {
      startPolling(taskId);
      // 立即执行一次查询,不必等首个 2s 间隔
      void (async () => {
        if (!taskId) return;
        try {
          const res = await getGeneration(taskId);
          setUsedFallback(res.usedFallback);
          if (res.status === 'success') {
            clearPolling();
            setImages(res.images ?? []);
            setStep('result');
          } else if (res.status === 'failed') {
            clearPolling();
            setFailureReason(res.failureReason);
            setStep('failed');
          } else {
            setGenStatus(res.status);
          }
        } catch {
          /* 首次查询失败,交由定时轮询兜底 */
        }
      })();
    },
    [startPolling, clearPolling]
  );

  /* 配额/限流差异化错误提示 */
  function handleApiError(err: unknown) {
    if (err instanceof ApiError) {
      if (err.code === GENERATION_QUOTA_EXCEEDED) {
        toast.error('生成配额已用完', '本月生成次数已达上限，请升级订阅后继续');
        return;
      }
      if (err.code === GENERATION_RATE_LIMITED) {
        toast.error('操作过于频繁', '生成接口限流中，请稍后再试');
        return;
      }
      toast.error('生成失败', err.message);
      return;
    }
    toast.error('生成失败', err instanceof Error ? err.message : '请稍后重试');
  }

  /* 表单提交 → 创建生成任务 */
  const handleSubmit = async (values: GenerationFormValues) => {
    try {
      const res = await createGeneration({
        inputType: values.inputType,
        prompt: values.inputType === 'text' ? values.prompt : undefined,
        sketchImageUrl: values.inputType === 'sketch' ? values.sketchImageUrl : undefined,
        artType: values.artType,
        aspect: values.aspect,
        count: values.count,
      });

      // 同步模式直接返回终态
      if (res.status === 'success') {
        setImages(res.images ?? []);
        setStep('result');
        return;
      }
      if (res.status === 'failed') {
        setFailureReason('生成任务创建失败');
        setStep('failed');
        return;
      }

      // 异步模式:进入生成中并轮询
      setStep('generating');
      startPollingWithImmediate(res.taskId);
    } catch (err) {
      handleApiError(err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* 页头 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-cinnabar/10">
          <Wand2 className="w-5 h-5 text-cinnabar" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">AI 生成</h1>
          <p className="text-sm text-ink-500">由文字或草稿生成专属参考作品，一键进入诊断闭环</p>
        </div>
      </div>

      {/* 步骤内容 */}
      {step === 'form' && <GenerationForm submitting={false} onSubmit={handleSubmit} />}
      {step === 'generating' && (
        <GenerationLoading status={genStatus} pollCount={pollCount} onCancel={handleBackToForm} />
      )}
      {step === 'result' && (
        <GenerationResult images={images} usedFallback={usedFallback} onRegenerate={handleBackToForm} />
      )}
      {step === 'failed' && <GenerationFailed failureReason={failureReason} onRetry={handleBackToForm} />}
    </div>
  );
}

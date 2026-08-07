// 图片生成服务
// 默认调用后端 /api/v1/generation 真实 AI 图像生成(sync 模式),
// 当后端不可用或用户显式关闭时回退到本地 SVG 占位图。
//
// 注:历史上 generateImage 返回 `trae-api-cn.mchost.guru` IDE 内部 URL,
// 该 URL 仅在 Trae IDE 沙箱内可用,部署到生产后无法访问。

import { placeholderImage } from './placeholderImage';
import { request } from './api';
import type { CreateGenerationResponse } from '../types/api-contract';

let useExternalApi = true;
let apiKey = '';

export function setUseExternalApi(value: boolean) {
  useExternalApi = value;
  localStorage.setItem('danqing-ai-use-api', JSON.stringify(value));
}

export function getUseExternalApi(): boolean {
  const stored = localStorage.getItem('danqing-ai-use-api');
  if (stored) {
    try {
      useExternalApi = JSON.parse(stored) === true;
    } catch {
      useExternalApi = false;
    }
  }
  return useExternalApi;
}

export function setApiKey(key: string) {
  apiKey = key;
  localStorage.setItem('danqing-ai-api-key', key);
}

export function getApiKey(): string {
  const stored = localStorage.getItem('danqing-ai-api-key');
  if (stored) {
    apiKey = stored;
  }
  return apiKey;
}

export interface StylePreset {
  id: string;
  name: string;
  color: string;
  demoPrompt: string;
  description: string;
  origin: string;
  features: string[];
}

async function getStyleDemoImage(styleId: string): Promise<string> {
  const prompts: Record<string, string> = {
    ink: 'chinese ink wash painting mountain landscape misty clouds traditional brushwork',
    qinglv: 'chinese qinglv shanshui painting blue green mountains golden river traditional mineral pigments',
    cinnabar: 'chinese cinnabar red painting traditional new year folk art paper cutting style vibrant red',
    gold: 'chinese jinbi shanshui painting golden mountains gilt outlines royal court style luxurious',
    jade: 'chinese jade green painting lotus pond zen minimal elegant jadeite color palette serene',
    purple: 'chinese forbidden city purple imperial painting palace architecture majestic royal purple gold',
  };
  return generateImage(prompts[styleId] || 'chinese traditional painting', 'portrait_4_3');
}

const stylePresets: StylePreset[] = [
  {
    id: 'ink',
    name: '水墨',
    color: '#1a1a1a',
    demoPrompt: 'chinese ink wash painting mountain landscape misty clouds traditional brushwork',
    description: '中国传统水墨画，以墨为色，浓淡干湿尽显东方神韵',
    origin: '始于唐代，盛于宋元',
    features: ['水墨晕染', '留白意境', '浓淡干湿'],
  },
  {
    id: 'qinglv',
    name: '青绿山水',
    color: '#2e5fa1',
    demoPrompt: 'chinese qinglv shanshui painting blue green mountains golden river traditional mineral pigments',
    description: '青绿山水，以石青石绿为主色，金碧辉煌',
    origin: '隋唐传承，敦煌壁画',
    features: ['青绿设色', '金碧辉煌', '装饰性强'],
  },
  {
    id: 'cinnabar',
    name: '朱砂',
    color: '#c41e3a',
    demoPrompt: 'chinese cinnabar red painting traditional new year folk art paper cutting style vibrant red',
    description: '朱砂红，吉祥喜庆，传统年画常用色',
    origin: '民间艺术代表',
    features: ['朱红主调', '吉祥寓意', '热烈奔放'],
  },
  {
    id: 'gold',
    name: '金碧',
    color: '#d4af37',
    demoPrompt: 'chinese jinbi shanshui painting golden mountains gilt outlines royal court style luxurious',
    description: '金碧山水，泥金勾勒，富丽堂皇',
    origin: '唐代李思训首创',
    features: ['泥金描线', '富丽堂皇', '皇家气象'],
  },
  {
    id: 'jade',
    name: '翡翠',
    color: '#3d8b7b',
    demoPrompt: 'chinese jade green painting lotus pond zen minimal elegant jadeite color palette serene',
    description: '翡翠色调，清雅脱俗，蕴含东方禅意',
    origin: '明清文人画',
    features: ['翠绿清雅', '禅意悠远', '生机盎然'],
  },
  {
    id: 'purple',
    name: '紫禁',
    color: '#6b3fa0',
    demoPrompt: 'chinese forbidden city purple imperial painting palace architecture majestic royal purple gold',
    description: '紫禁色调，神秘高贵，故宫建筑灵感',
    origin: '明清宫廷艺术',
    features: ['紫气东来', '高贵神秘', '宫廷气象'],
  },
];

const emotionPresets = [
  { id: 'lonely', name: '孤独', color: '#4a5568' },
  { id: 'hope', name: '希望', color: '#d4af37' },
  { id: 'calm', name: '宁静', color: '#2e5fa1' },
  { id: 'joy', name: '喜悦', color: '#c41e3a' },
  { id: 'melancholy', name: '忧伤', color: '#5a6b8a' },
  { id: 'passion', name: '激情', color: '#e74c3c' },
];

const scenePresets = [
  { id: 'mountain', name: '山水' },
  { id: 'flower', name: '花卉' },
  { id: 'bird', name: '花鸟' },
  { id: 'figure', name: '人物' },
  { id: 'architecture', name: '建筑' },
  { id: 'stilllife', name: '静物' },
];

function buildPrompt(keywords: string, style: string, scene: string): string {
  const styleMap: Record<string, string> = {
    realistic: 'realistic painting',
    illustration: 'digital illustration',
    watercolor: 'watercolor painting',
    ink: 'chinese ink painting',
    oil: 'oil painting',
  };
  return `${styleMap[style] || 'painting'} of ${scene} with ${keywords}, high quality, detailed`;
}

export async function generateClassMaterial(
  keywords: string,
  style: string,
  scene: string
): Promise<string[]> {
  const prompt = buildPrompt(keywords, style, scene);
  const results: string[] = [];

  // 生成4张参考素材
  for (let i = 0; i < 4; i++) {
    results.push(await generateImage(`${prompt} variant ${i + 1}`, 'landscape_4_3'));
  }

  return results;
}

/**
 * 将前端 size 标识映射为后端 aspect 枚举
 */
function mapSizeToAspect(size: string): 'portrait' | 'landscape' | 'square' {
  if (size === 'portrait' || size === 'portrait_4_3') return 'portrait';
  if (size === 'landscape' || size === 'landscape_4_3') return 'landscape';
  return 'square';
}

/**
 * 调用后端真实 AI 图像生成(sync 模式,立即返回结果)
 * 失败时回退到本地 SVG 占位图,保证页面不白屏
 */
export async function generateImage(prompt: string, size: string = 'square'): Promise<string> {
  // 用户显式关闭外部 API 时回退占位图
  if (!useExternalApi) {
    return placeholderImage(prompt, {
      size: size as Parameters<typeof placeholderImage>[1] extends { size?: infer S } ? S : never,
      title: prompt.slice(0, 12),
    });
  }

  try {
    const res = await request<CreateGenerationResponse>('/generation', {
      method: 'POST',
      body: {
        inputType: 'text',
        prompt,
        artType: 'painting',
        aspect: mapSizeToAspect(size),
        count: 1,
        sync: true,
      },
    });

    if (res.images && res.images.length > 0 && res.images[0].imageUrl) {
      return res.images[0].imageUrl;
    }

    throw new Error('后端未返回生成图片 URL');
  } catch (err) {
    console.warn('[imageService] 真实 AI 生成失败,回退到占位图:', err);
    return placeholderImage(prompt, {
      size: size as Parameters<typeof placeholderImage>[1] extends { size?: infer S } ? S : never,
      title: prompt.slice(0, 12),
    });
  }
}

export async function applyStyle(imageUrl: string, styleId: string): Promise<string> {
  const style = stylePresets.find(s => s.id === styleId);
  if (!style) return imageUrl;

  const prompt = `transform this artwork into ${style.name} chinese painting style, ${style.name} color palette`;
  return generateImage(prompt, 'square');
}

export async function fuseImages(): Promise<string> {
  const prompt = `combine these two artworks into a harmonious new composition, creative fusion`;
  return generateImage(prompt, 'landscape_4_3');
}

export async function generateEmotionCanvas(emotion: string): Promise<string[]> {
  const emotionData = emotionPresets.find(e => e.name === emotion) || emotionPresets[0];
  const prompt = `${emotionData.name} emotion in chinese ink painting, ${emotionData.name} mood, ${emotionData.color} color palette`;

  const results: string[] = [];
  for (let i = 0; i < 3; i++) {
    results.push(await generateImage(prompt + ` version ${i + 1}`, 'square'));
  }
  return results;
}

export { stylePresets, emotionPresets, scenePresets, getStyleDemoImage };

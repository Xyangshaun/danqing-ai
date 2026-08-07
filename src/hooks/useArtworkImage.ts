import { useMemo } from 'react';
import { resolveArtworkImageUrl, type ArtworkItem } from '../services/artworksDatabase';

/**
 * 将 ArtworkItem.imageUrl 中的 __ARTWORK_IMAGE__:seed 协议
 * 解析为 artworkImage() 生成的内联 SVG data URI。
 *
 * 设计意图:
 *   - 9999 条素材不在加载时一次性生成全部 SVG,避免主线程阻塞。
 *   - 每张卡片/行在渲染时按需解析,SVG 生成是纯字符串运算,成本极低。
 *   - useMemo 缓存同一作品的解析结果,避免重复计算。
 */
export function useArtworkImage(artwork: ArtworkItem | null | undefined): string | undefined {
  return useMemo(() => (artwork ? resolveArtworkImageUrl(artwork).imageUrl : undefined), [artwork]);
}

export default useArtworkImage;

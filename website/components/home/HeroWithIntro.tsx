'use client';

import React, { useState } from 'react';
import { VideoIntro } from './VideoIntro';
import { Hero } from './Hero';

/**
 * 首页 Hero 包一层:每次页面加载自动播放一次开场视频,
 * 结束后淡入真正的 Hero 内容区。
 */
export function HeroWithIntro() {
  const [introDone, setIntroDone] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);

  const handleComplete = React.useCallback(() => {
    setIntroDone(true);
    setHeroVisible(true);
  }, []);

  return (
    <>
      {!introDone && <VideoIntro onComplete={handleComplete} />}
      <div className={heroVisible ? 'opacity-100 transition-opacity duration-700' : 'opacity-0'}>
        <Hero />
      </div>
    </>
  );
}
/**
 * 丹青有AI - 独立结构化纯网页原型脚本
 * 不绑定任何框架，纯原生 JavaScript
 */

(function() {
  'use strict';

  // 等待 DOM 加载
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    initLoader();
    initNavbar();
    initMobileMenu();
    initScrollReveal();
    initCounters();
    initInkCursor();
    initSmoothScroll();
    initPlaceholderLinks();
    initRipple();
    initTiltCards();
    initGlowButtons();
    initFxDemo();
  }

  // 是否减少动画（系统偏好）
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // 是否细指针设备（鼠标）
  function isFinePointer() {
    return window.matchMedia('(pointer: fine)').matches;
  }

  /**
   * 按钮涟漪效果（JS 驱动，兼容触控）
   */
  function initRipple() {
    const targets = document.querySelectorAll('.btn, .nav-cta, .fx-glow-btn');
    if (!targets.length) return;

    targets.forEach(el => {
      el.addEventListener('pointerdown', (e) => {
        const rect = el.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const ripple = document.createElement('span');
        ripple.className = 'ripple-ink';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
        el.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
      });
    });
  }

  /**
   * 3D 倾斜卡片（仅鼠标设备，尊重减少动画偏好）
   * 轻微视差倾斜，增强立体感
   */
  function initTiltCards() {
    if (!isFinePointer() || prefersReducedMotion()) return;

    const cards = document.querySelectorAll('.bento-cell, .portal-card, .scenario-card');
    if (!cards.length) return;

    const MAX_TILT = 3; // 最大倾斜角度（度），保持克制

    cards.forEach(card => {
      card.classList.add('tilt-card');
      let rafId = null;

      card.addEventListener('pointermove', (e) => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          const rect = card.getBoundingClientRect();
          const px = (e.clientX - rect.left) / rect.width - 0.5;
          const py = (e.clientY - rect.top) / rect.height - 0.5;
          card.style.transform = `perspective(900px) rotateX(${(-py * MAX_TILT).toFixed(2)}deg) rotateY(${(px * MAX_TILT).toFixed(2)}deg) translateY(-4px)`;
          rafId = null;
        });
      });

      card.addEventListener('pointerleave', () => {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        card.style.transform = '';
      });
    });
  }

  /**
   * 磁力光斑按钮：光斑跟随鼠标位置
   */
  function initGlowButtons() {
    if (!isFinePointer()) return;

    document.querySelectorAll('.fx-glow-btn').forEach(btn => {
      btn.addEventListener('pointermove', (e) => {
        const rect = btn.getBoundingClientRect();
        btn.style.setProperty('--glow-x', ((e.clientX - rect.left) / rect.width * 100) + '%');
        btn.style.setProperty('--glow-y', ((e.clientY - rect.top) / rect.height * 100) + '%');
      });
    });
  }

  /**
   * 特殊动效演示模块：进入视口自动播放 + 点击重播
   */
  function initFxDemo() {
    const stages = document.querySelectorAll('.fx-stage');
    if (!stages.length) return;

    const play = (stage) => {
      stage.classList.remove('play');
      // 强制重排以重置 CSS 动画
      void stage.offsetWidth;
      stage.classList.add('play');
    };

    // 进入视口自动播放一次
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          play(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });

    stages.forEach(stage => observer.observe(stage));

    // 重播按钮
    document.querySelectorAll('.fx-replay').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.fx-card');
        const stage = card ? card.querySelector('.fx-stage') : null;
        if (stage) play(stage);
      });
    });
  }

  /**
   * 页面加载器
   * 首页需等待水墨入场动画（约 3.6s）后再隐藏 loader
   */
  function initLoader() {
    const loader = document.querySelector('.loader');
    if (!loader) return;

    document.body.style.overflow = 'hidden';

    const startTime = Date.now();
    const isHome = document.body.classList.contains('page-home') || document.querySelector('.hero');
    const minDisplay = isHome ? 3500 : 800;

    window.addEventListener('load', () => {
      const elapsed = Date.now() - startTime;
      const delay = Math.max(0, minDisplay - elapsed);

      setTimeout(() => {
        loader.classList.add('hidden');
        document.body.style.overflow = '';
      }, delay);
    });
  }

  /**
   * 导航栏滚动效果
   */
  function initNavbar() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    let ticking = false;

    function updateNavbar() {
      const scrolled = window.scrollY > 12;
      navbar.classList.toggle('scrolled', scrolled);
      ticking = false;
    }

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(updateNavbar);
        ticking = true;
      }
    }, { passive: true });

    updateNavbar();
  }

  /**
   * 移动端菜单
   */
  function initMobileMenu() {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const mobileMenu = document.querySelector('.mobile-menu');
    if (!menuBtn || !mobileMenu) return;

    menuBtn.addEventListener('click', () => {
      const isOpen = menuBtn.classList.toggle('active');
      mobileMenu.classList.toggle('active', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    // 点击菜单项后关闭
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        menuBtn.classList.remove('active');
        mobileMenu.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  /**
   * 滚动显示动画（Intersection Observer）
   */
  function initScrollReveal() {
    const reveals = document.querySelectorAll('.reveal');
    if (!reveals.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -50px 0px'
    });

    reveals.forEach(el => observer.observe(el));
  }

  /**
   * 数字计数动画
   */
  function initCounters() {
    const counters = document.querySelectorAll('[data-counter]');
    if (!counters.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(counter => observer.observe(counter));
  }

  function animateCounter(el) {
    const target = parseInt(el.dataset.counter, 10);
    const suffix = el.dataset.counterSuffix || '';
    const duration = 1500;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutQuart
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = Math.round(target * eased);

      el.textContent = current + suffix;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  /**
   * 水墨光标跟随效果（仅在非触控设备）
   */
  function initInkCursor() {
    // 检测触控设备
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const hero = document.querySelector('.hero');
    if (!hero) return;

    let cursorX = 0;
    let cursorY = 0;
    let currentX = 0;
    let currentY = 0;
    let rafId = null;
    let isActive = false;
    let inactivityTimeout = null;

    const inkCursor = document.createElement('div');
    inkCursor.className = 'ink-cursor';
    inkCursor.style.cssText = `
      position: fixed;
      width: 400px;
      height: 400px;
      border-radius: 50%;
      pointer-events: none;
      z-index: 1;
      opacity: 0;
      background: radial-gradient(circle, rgba(196, 30, 58, 0.04) 0%, transparent 70%);
      filter: blur(40px);
      transform: translate(-50%, -50%);
      transition: opacity 0.6s ease;
    `;
    document.body.appendChild(inkCursor);

    function onMouseMove(e) {
      cursorX = e.clientX;
      cursorY = e.clientY;

      if (!isActive) {
        isActive = true;
        inkCursor.style.opacity = '1';
        animate();
      }

      clearTimeout(inactivityTimeout);
      inactivityTimeout = setTimeout(() => {
        isActive = false;
        inkCursor.style.opacity = '0';
      }, 100);
    }

    function animate() {
      if (!isActive) {
        cancelAnimationFrame(rafId);
        return;
      }

      currentX += (cursorX - currentX) * 0.08;
      currentY += (cursorY - currentY) * 0.08;

      inkCursor.style.left = currentX + 'px';
      inkCursor.style.top = currentY + 'px';

      rafId = requestAnimationFrame(animate);
    }

    document.addEventListener('mousemove', onMouseMove, { passive: true });
  }

  /**
   * 平滑滚动
   */
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;

        const target = document.querySelector(targetId);
        if (target) {
          e.preventDefault();
          const offset = 80;
          const top = target.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      });
    });
  }

  /**
   * 占位链接统一提示
   * 避免 footer 中未实现链接点击后跳回顶部，统一给出上线提示
   */
  function initPlaceholderLinks() {
    document.querySelectorAll('.footer-links a[href="#"], .mobile-menu a[href="#"]').forEach(link => {
      if (link.hasAttribute('onclick')) return;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        alert('该功能将在正式版上线');
      });
    });
  }
})();

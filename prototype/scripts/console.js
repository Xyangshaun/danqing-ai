/**
 * 丹青有AI - 控制台交互脚本
 * 原生 JS，不依赖框架
 */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    initSidebar();
    initViewSwitch();
    initHashRouting();
    initFormTypeSelect();
    initUploadZone();
  }

  /**
   * Hash 路由：支持从其他页面通过 console.html#viewName 进入指定视图
   */
  function initHashRouting() {
    const hash = location.hash.replace('#', '');
    if (hash) {
      const viewEl = document.getElementById('view-' + hash);
      if (viewEl) {
        switchView(hash);
      }
    }
  }

  /**
   * 侧边栏移动端切换
   */
  function initSidebar() {
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!toggle || !sidebar) return;

    function open() {
      sidebar.classList.add('open');
      if (overlay) overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function close() {
      sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
    }

    toggle.addEventListener('click', () => {
      sidebar.classList.contains('open') ? close() : open();
    });

    if (overlay) {
      overlay.addEventListener('click', close);
    }

    // 窗口resize时自动关闭
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024) close();
    });
  }

  /**
   * 视图切换
   * - 当前页 console.html 或无有效 href 的链接：SPA 内部切换并同步 hash
   * - 指向其他独立页面的链接：允许默认跳转
   */
  function initViewSwitch() {
    const links = document.querySelectorAll('.sidebar-link[data-view]');
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        const href = (link.getAttribute('href') || '').trim();
        const view = link.dataset.view;
        const isCurrentPage = !href ||
          href === '#' ||
          href.startsWith('#') ||
          href === 'console.html' ||
          href === 'console.html#';

        if (!isCurrentPage) {
          // 独立页面链接，允许默认跳转
          return;
        }

        e.preventDefault();
        switchView(view);
        if (history.replaceState) {
          history.replaceState(null, '', '#' + view);
        }
      });
    });
  }

  window.switchView = function(viewName) {
    // 更新侧边栏高亮
    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.classList.toggle('active', link.dataset.view === viewName);
    });

    // 切换视图
    document.querySelectorAll('.console-view').forEach(view => {
      view.classList.toggle('active', view.id === 'view-' + viewName);
    });

    // 更新标题
    const activeView = document.getElementById('view-' + viewName);
    const titleEl = document.getElementById('pageTitle');
    if (activeView && titleEl) {
      titleEl.textContent = activeView.dataset.title || '工作台';
    }

    // 移动端自动收起侧边栏
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth < 1024) {
      sidebar.classList.remove('open');
      const overlay = document.getElementById('sidebarOverlay');
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /**
   * 创作形式选择
   * P1e:div 可点击节点补键盘可达
   */
  function initFormTypeSelect() {
    const options = document.querySelectorAll('.form-type-option');
    options.forEach(option => {
      option.setAttribute('role', 'button');
      option.setAttribute('tabindex', '0');
      option.addEventListener('click', () => {
        options.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
      });
      option.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          option.click();
        }
      });
    });
  }

  /**
   * 上传区交互
   * P1c:增加文件校验 + input file
   */
  let selectedFile = null;
  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  function showUploadTip(text) {
    const title = document.querySelector('#uploadZone .upload-title');
    if (title) title.textContent = text;
  }

  function validateFile(file) {
    if (!file) return false;
    if (!ALLOWED_TYPES.includes(file.type)) {
      showUploadTip('仅支持 JPG、PNG、WEBP 格式');
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      showUploadTip('文件超过 20MB 限制');
      return false;
    }
    return true;
  }

  function handleFile(file) {
    if (!validateFile(file)) {
      selectedFile = null;
      return;
    }
    selectedFile = file;
    showUploadTip('已选择: ' + file.name);
  }

  function initUploadZone() {
    const zone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    if (!zone) return;

    zone.addEventListener('click', () => fileInput && fileInput.click());
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput && fileInput.click();
      }
    });

    if (fileInput) {
      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
      });
    }

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      zone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      zone.addEventListener(eventName, () => zone.classList.add('dragover'));
    });

    ['dragleave', 'drop'].forEach(eventName => {
      zone.addEventListener(eventName, () => zone.classList.remove('dragover'));
    });

    zone.addEventListener('drop', (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) handleFile(files[0]);
    });
  }

  /**
   * 开始分析（全局函数供 HTML 调用）
   * P1b:防重复点击
   */
  let isAnalyzing = false;
  window.startAnalysis = function() {
    const btn = document.getElementById('startAnalysisBtn');
    const panel = document.getElementById('analysisProgressPanel');
    if (!panel) return;

    // P1c:未上传文件不允许进入诊断
    if (!selectedFile) {
      showUploadTip('请先上传作品图片');
      return;
    }

    // P1b:已在分析中则忽略重复点击
    if (isAnalyzing) return;
    isAnalyzing = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '分析中...';
    }

    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth' });

    const bar = document.getElementById('progressBar');
    const text = document.getElementById('progressText');
    const status = document.getElementById('progressStatus');
    const steps = [
      { id: 'step1', label: '正在上传作品...' },
      { id: 'step2', label: '正在识别创作形式...' },
      { id: 'step3', label: 'AI 正在分析视觉特征...' },
      { id: 'step4', label: '正在生成结构化报告...' }
    ];

    const circumference = 339.292;
    let progress = 0;
    const duration = 3000;
    const interval = 50;
    const step = 100 / (duration / interval);

    const timer = setInterval(() => {
      progress = Math.min(progress + step, 100);
      const offset = circumference - (progress / 100) * circumference;
      bar.style.strokeDashoffset = offset;
      text.textContent = Math.round(progress) + '%';

      const stepIndex = Math.min(Math.floor((progress / 100) * steps.length), steps.length - 1);
      status.textContent = steps[stepIndex].label;

      steps.forEach((s, i) => {
        const el = document.getElementById(s.id);
        if (!el) return;
        el.classList.remove('active', 'done');
        if (i < stepIndex) el.classList.add('done');
        if (i === stepIndex) el.classList.add('active');
      });

      if (progress >= 100) {
        clearInterval(timer);
        setTimeout(() => {
          switchView('report');
          panel.style.display = 'none';
          // 重置进度
          bar.style.strokeDashoffset = circumference;
          text.textContent = '0%';
        }, 400);
      }
    }, interval);
  };
})();

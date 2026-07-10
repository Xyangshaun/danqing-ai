export default function Footer() {
  return (
    <footer className="bg-ink-900 text-rice-200 py-12 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="font-serif text-2xl font-bold text-cinnabar mb-4">丹青有AI</div>
            <p className="text-rice-300 text-sm leading-relaxed">
              专为高校艺术教育场景设计的AI创作诊断系统，支持绘画、设计、产品设计、雕塑等多种创作形式，让每一份创作都得到专业的点评与指导。
            </p>
          </div>
          <div>
            <h3 className="font-serif text-lg font-semibold mb-4 text-rice-100">功能特色</h3>
            <ul className="space-y-2 text-sm text-rice-300">
              <li>AI构图分析</li>
              <li>色彩诊断</li>
              <li>原创性检测</li>
              <li>成长曲线追踪</li>
            </ul>
          </div>
          <div>
            <h3 className="font-serif text-lg font-semibold mb-4 text-rice-100">联系我们</h3>
            <p className="text-sm text-rice-300">
              邮箱：2692963779@qq.com
            </p>
            <p className="text-sm text-rice-300 mt-2">
              地址：吉林省通化市
            </p>
          </div>
        </div>
        <div className="border-t border-rice-200/10 mt-8 pt-8 text-center text-sm text-rice-400">
          <p>© 2026 丹青有AI - AI作业诊断系统</p>
        </div>
      </div>
    </footer>
  );
}

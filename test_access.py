from playwright.sync_api import sync_playwright
import time

urls = [
    ("Vercel 首页", "https://6a4f01878de2462eddd4b61e.vercel.app"),
    ("Vercel 素材库", "https://6a4f01878de2462eddd4b61e.vercel.app/materials"),
    ("本地首页", "http://localhost:5173"),
    ("本地素材库", "http://localhost:5173/materials"),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={'width': 1440, 'height': 900},
        locale='zh-CN'
    )

    for name, url in urls:
        print(f"\n{'='*50}")
        print(f"测试: {name} -> {url}")
        print('='*50)
        page = context.new_page()

        try:
            start = time.time()
            response = page.goto(url, wait_until='domcontentloaded', timeout=30000)
            elapsed = time.time() - start

            status = response.status if response else 0
            title = page.title()
            print(f"状态码: {status}")
            print(f"页面标题: {title}")
            print(f"加载时间: {elapsed:.2f}s")

            # 截图
            safe_name = name.replace(' ', '_').replace('/', '_')
            page.screenshot(path=f'C:/Users/26929/Desktop/test_{safe_name}.png', full_page=False)
            print(f"截图已保存: test_{safe_name}.png")

            # 检查是否有内容
            body_text = page.inner_text('body')
            has_content = len(body_text.strip()) > 50
            print(f"有内容: {has_content} ({len(body_text)} 字符)")

            # 控制台错误
            errors = []
            page.on('console', lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type in ('error', 'warning') else None)

            page.wait_for_timeout(3000)

            if errors:
                print("控制台错误/警告:")
                for e in errors[:5]:
                    print(f"  - {e}")

        except Exception as e:
            print(f"错误: {e}")

        page.close()

    browser.close()
    print("\n全部测试完成")

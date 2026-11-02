# File: tools/fetch_vendor.py
"""Chart.js を vendor/ フォルダに取得する（Python標準ライブラリのみ使用）

使い方:
    python tools/fetch_vendor.py           # 既定のバージョンを取得
    python tools/fetch_vendor.py 4.4.1     # バージョンを指定して取得
"""
import hashlib
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_VERSION = "4.4.1"
ROOT = Path(__file__).resolve().parent.parent
VENDOR_DIR = ROOT / "vendor"

# 保存するファイル名: パッケージ内のパス
FILES = {
    "chart.umd.js": "dist/chart.umd.js",
    "chart.js-LICENSE.md": "LICENSE.md",
}


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "habit-planner-fetch-vendor"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_VERSION
    VENDOR_DIR.mkdir(exist_ok=True)

    for name, path in FILES.items():
        url = f"https://cdn.jsdelivr.net/npm/chart.js@{version}/{path}"
        print(f"取得中: {url}")
        try:
            body = download(url)
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"取得に失敗しました: {e}", file=sys.stderr)
            return 1
        (VENDOR_DIR / name).write_bytes(body)
        digest = hashlib.sha256(body).hexdigest()
        print(f"  保存しました: vendor/{name}（{len(body):,} バイト、SHA-256 {digest}）")

    print(f"Chart.js {version} を vendor/ に保存しました。")
    print("sw.js の CACHE_VERSION を変更してから公開してください。")
    return 0


if __name__ == "__main__":
    sys.exit(main())

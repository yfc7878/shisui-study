# 可选：本机 AI 修补服务（IOPaint / LaMa）

应用里的「AI 修补」按钮会把当前图片和红色蒙版发送到本机 Python 进程，使用
[LaMa](https://github.com/advimman/lama) 做图像修补。没有安装时，应用的其他去笔迹功能仍然可用。

## 安装

建议把 Python 环境放在非系统盘：

```powershell
python -m venv D:\ai\lama-venv
D:\ai\lama-venv\Scripts\python.exe -m pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
D:\ai\lama-venv\Scripts\python.exe -m pip install --no-cache-dir simple-lama-inpainting
```

首次使用时会自动下载 `big-lama` 模型（约 200MB）到 PyTorch 缓存目录。

## 配置

把 `config.example.json` 复制到 `server/data/ai/config.json`，把 `python` 改成你的虚拟环境路径：

```json
{
  "python": "D:\\ai\\lama-venv\\Scripts\\python.exe",
  "maxSize": 2000,
  "timeoutMs": 300000
}
```

也可以在 `.env` 中设置 `AI_CLEAN_PYTHON` 覆盖配置里的 Python 路径。

## 使用

1. 打开任意错题原图的「去笔迹」。
2. 点「AI 蒙版」，用笔刷把要修掉的笔迹涂红。
3. 点「AI 修补」，等待本机 CPU 处理。
4. 处理结果可以撤销；不会自动保存，仍需「完成并应用」/「保存修改」。

CPU 上处理一张 2000px 左右的图片通常需要十几秒到一分钟，具体取决于 CPU。

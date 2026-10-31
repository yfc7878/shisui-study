import base64
import io
import json
import os
import sys
import time

# 这个脚本由 Node 以一次性子进程方式调用：
# stdin 收 { image: dataURL, mask: dataURL, maxSize: 2000 }
# stdout 只输出 { image: dataURL, ms } 或 { error: ... }

def decode_data_url(value):
    if not isinstance(value, str) or ',' not in value:
        raise ValueError('图片数据格式不正确')
    header, encoded = value.split(',', 1)
    if ';base64' not in header:
        raise ValueError('图片数据不是 base64')
    return base64.b64decode(encoded)


def main():
    from PIL import Image
    from simple_lama_inpainting import SimpleLama

    payload = json.load(sys.stdin)
    image_bytes = decode_data_url(payload.get('image'))
    mask_bytes = decode_data_url(payload.get('mask'))
    max_size = int(payload.get('maxSize') or 2000)

    image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    mask = Image.open(io.BytesIO(mask_bytes)).convert('L')
    if mask.size != image.size:
        mask = mask.resize(image.size, Image.Resampling.NEAREST)
    if mask.getbbox() is None:
        raise ValueError('蒙版是空的，请先涂抹要修掉的笔迹')

    original_width, original_height = image.size
    scale = min(1.0, max_size / max(original_width, original_height))
    if scale < 1.0:
        size = (max(1, round(original_width * scale)), max(1, round(original_height * scale)))
        image = image.resize(size, Image.Resampling.LANCZOS)
        mask = mask.resize(size, Image.Resampling.NEAREST)

    started = time.time()
    lama = SimpleLama()
    result = lama(image, mask)
    result = result.crop((0, 0, image.width, image.height)).convert('RGB')
    if result.size != (original_width, original_height):
        result = result.resize((original_width, original_height), Image.Resampling.LANCZOS)

    output = io.BytesIO()
    result.save(output, format='JPEG', quality=92, optimize=True)
    encoded = base64.b64encode(output.getvalue()).decode('ascii')
    print(json.dumps({
        'image': 'data:image/jpeg;base64,' + encoded,
        'ms': round((time.time() - started) * 1000),
    }), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:  # noqa: BLE001
        print(json.dumps({'error': str(error)}), flush=True)
        sys.exit(1)

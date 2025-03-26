from PIL import Image

def resize_icons(input_path, sizes):
    # 打开原始图片
    img = Image.open(input_path)
    
    # 为每个尺寸创建新图片
    for size in sizes:
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        output_path = f'icons/icon{size}.png'
        resized.save(output_path)
        print(f'已生成 {size}x{size} 图标: {output_path}')

if __name__ == '__main__':
    # 指定要生成的尺寸
    sizes = [16, 32, 48, 128]
    # 原始图片路径
    input_path = 'icons/icon.png'
    resize_icons(input_path, sizes)
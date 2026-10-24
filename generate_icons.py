import os
from PIL import Image, ImageDraw

out_dir = r"c:\Users\peteryang\Desktop\AI-ESP32\telegram_cache_guard\icons"
os.makedirs(out_dir, exist_ok=True)

def create_shield_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Gradient-like background circle or rounded rect
    margin = size * 0.08
    draw.ellipse([margin, margin, size - margin, size - margin], fill=(36, 161, 222, 255))
    
    # Shield shape inside
    s_top = size * 0.22
    s_bottom = size * 0.82
    s_left = size * 0.25
    s_right = size * 0.75
    s_mid_x = size * 0.5
    s_mid_y = size * 0.58
    
    points = [
        (s_mid_x, s_top),
        (s_right, s_top + size * 0.08),
        (s_right, s_mid_y),
        (s_mid_x, s_bottom),
        (s_left, s_mid_y),
        (s_left, s_top + size * 0.08)
    ]
    draw.polygon(points, fill=(255, 255, 255, 240))
    
    # Checkmark or lightning inside shield
    chk = [
        (s_mid_x - size*0.12, s_top + size*0.28),
        (s_mid_x - size*0.03, s_top + size*0.38),
        (s_mid_x + size*0.14, s_top + size*0.20)
    ]
    draw.line(chk, fill=(36, 161, 222, 255), width=max(2, int(size * 0.08)))
    
    return img

for s in [16, 48, 128]:
    icon = create_shield_icon(s)
    icon.save(os.path.join(out_dir, f"icon{s}.png"))
    print(f"Generated icon{s}.png")

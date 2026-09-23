import zlib
import struct
import math
import os

def create_png(width, height, get_pixel_func):
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type 0 (None)
        for x in range(width):
            r, g, b, a = get_pixel_func(x, y, width, height)
            raw_data.extend([int(r), int(g), int(b), int(a)])
    
    compressed = zlib.compress(bytes(raw_data), level=9)
    
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        crc = zlib.crc32(tag + data) & 0xffffffff
        return c + struct.pack('>I', crc)
    
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', compressed) + chunk(b'IEND', b'')
    return png

def dist_to_rounded_rect(px, py, rx, ry, rw, rh, rad):
    # Center of rect
    cx = rx + rw / 2.0
    cy = ry + rh / 2.0
    # Half dimensions
    hw = rw / 2.0 - rad
    hh = rh / 2.0 - rad
    # Position relative to inner core
    dx = max(0.0, abs(px - cx) - hw)
    dy = max(0.0, abs(py - cy) - hh)
    dist = math.sqrt(dx * dx + dy * dy)
    return dist - rad

def render_clinic_icon(x, y, width, height, is_maskable=False):
    # Normalized coordinates (-1 to 1)
    nx = (x / (width - 1)) * 2.0 - 1.0
    ny = (y / (height - 1)) * 2.0 - 1.0

    # Background gradient: Dark Navy (#0f3d45 = 15, 61, 69) to Teal (#0d9488 = 13, 148, 136)
    t = (nx + ny + 2.0) / 4.0  # 0 to 1 diagonally
    t = max(0.0, min(1.0, t))
    bg_r = 15 + t * (13 - 15)
    bg_g = 61 + t * (148 - 61)
    bg_b = 69 + t * (136 - 69)

    if is_maskable:
        # Full bleed background for adaptive icons (Android circle/squircle)
        # Scale emblem to 64% so it stays completely inside the 80% safe circle
        scale = 0.62
        base_alpha = 1.0
    else:
        # Rounded squircle for standard icons
        scale = 0.82
        # Smooth rounded rect border radius
        rad = width * 0.22
        d = dist_to_rounded_rect(x, y, width * 0.04, height * 0.04, width * 0.92, height * 0.92, rad)
        if d > 1.5:
            return (0, 0, 0, 0)
        elif d > -0.5:
            # anti-alias edge
            edge_alpha = max(0.0, min(1.0, (1.5 - d) / 2.0))
            base_alpha = edge_alpha
        else:
            base_alpha = 1.0

    # Coordinates scaled for the emblem
    ex = nx / scale
    ey = ny / scale

    # Check if point is inside medical cross
    # Vertical bar: |ex| < 0.24 and |ey| < 0.68
    # Horizontal bar: |ex| < 0.68 and |ey| < 0.24
    # With smooth rounded corners on cross arms
    cross_thick = 0.24
    cross_len = 0.68
    arm_rad = 0.08

    # Distance to cross shape
    # Distance to vertical bar with rounded ends
    d_v = max(abs(ex) - cross_thick, abs(ey) - (cross_len - arm_rad))
    if d_v > 0 and abs(ey) > (cross_len - arm_rad):
        d_v = math.sqrt((max(0, abs(ex) - cross_thick))**2 + (abs(ey) - (cross_len - arm_rad))**2)
    
    # Distance to horizontal bar with rounded ends
    d_h = max(abs(ey) - cross_thick, abs(ex) - (cross_len - arm_rad))
    if d_h > 0 and abs(ex) > (cross_len - arm_rad):
        d_h = math.sqrt((max(0, abs(ey) - cross_thick))**2 + (abs(ex) - (cross_len - arm_rad))**2)

    dist_cross = min(d_v, d_h) - arm_rad

    # Inner circular ring or heartbeat accent in center of cross
    center_dist = math.sqrt(ex * ex + ey * ey)

    if dist_cross <= 0.02:
        # Inside the medical cross
        # Anti-aliased edge
        edge = max(0.0, min(1.0, (0.02 - dist_cross) / 0.04))
        
        # Cross color: Pure clinical white (#ffffff)
        cr, cg, cb = 255, 255, 255

        # Subtle glowing turquoise center circle badge inside cross
        if center_dist < 0.18:
            # Glowing turquoise core (#2dd4bf = 45, 212, 191)
            core_t = max(0.0, min(1.0, (0.18 - center_dist) / 0.06))
            cr = 255 * (1 - core_t) + 45 * core_t
            cg = 255 * (1 - core_t) + 212 * core_t
            cb = 255 * (1 - core_t) + 191 * core_t

        # Composite with background
        out_r = bg_r * (1.0 - edge) + cr * edge
        out_g = bg_g * (1.0 - edge) + cg * edge
        out_b = bg_b * (1.0 - edge) + cb * edge
        return (out_r, out_g, out_b, int(255 * base_alpha))
    else:
        # Background area
        # Subtle decorative circular halo behind cross
        halo_d = abs(center_dist - 0.72)
        if halo_d < 0.08:
            halo_alpha = max(0.0, 1.0 - (halo_d / 0.08)) * 0.15
            bg_r = bg_r * (1.0 - halo_alpha) + 255 * halo_alpha
            bg_g = bg_g * (1.0 - halo_alpha) + 255 * halo_alpha
            bg_b = bg_b * (1.0 - halo_alpha) + 255 * halo_alpha

        return (bg_r, bg_g, bg_b, int(255 * base_alpha))

frontend_dir = os.path.join(os.path.dirname(__file__), 'frontend')
os.makedirs(frontend_dir, exist_ok=True)

# 1. 192x192 Standard Icon
print("Generating pwa-192x192.png...")
img_192 = create_png(192, 192, lambda x, y, w, h: render_clinic_icon(x, y, w, h, is_maskable=False))
with open(os.path.join(frontend_dir, 'pwa-192x192.png'), 'wb') as f:
    f.write(img_192)

# 2. 512x512 Standard Icon
print("Generating pwa-512x512.png...")
img_512 = create_png(512, 512, lambda x, y, w, h: render_clinic_icon(x, y, w, h, is_maskable=False))
with open(os.path.join(frontend_dir, 'pwa-512x512.png'), 'wb') as f:
    f.write(img_512)

# 3. 512x512 Maskable Icon (safe zone padded)
print("Generating pwa-maskable-512x512.png...")
img_maskable = create_png(512, 512, lambda x, y, w, h: render_clinic_icon(x, y, w, h, is_maskable=True))
with open(os.path.join(frontend_dir, 'pwa-maskable-512x512.png'), 'wb') as f:
    f.write(img_maskable)

# 4. 180x180 Apple Touch Icon
print("Generating apple-touch-icon.png...")
img_apple = create_png(180, 180, lambda x, y, w, h: render_clinic_icon(x, y, w, h, is_maskable=False))
with open(os.path.join(frontend_dir, 'apple-touch-icon.png'), 'wb') as f:
    f.write(img_apple)

# 5. Favicon 48x48
print("Generating favicon.ico...")
img_fav = create_png(48, 48, lambda x, y, w, h: render_clinic_icon(x, y, w, h, is_maskable=False))
with open(os.path.join(frontend_dir, 'favicon.ico'), 'wb') as f:
    f.write(img_fav)

print("All PNG icons generated successfully.")

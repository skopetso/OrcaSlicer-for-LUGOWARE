"""
Convert LUGOWARE PNG icons to various sizes and ICO format.
Uses only Python stdlib (no Pillow needed) - embeds PNG data directly into ICO.
For resizing PNGs, we use the PNG-in-ICO approach (no resize, just embed original).
For resized PNGs, we need an external approach.
"""
import struct
import os
import shutil

PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(PROJ_ROOT, "resources", "images")
SRC_DIR = r"C:\Users\Huhn\Pictures\lugoware orca"

def read_png_dimensions(png_path):
    """Read width and height from PNG header."""
    with open(png_path, "rb") as f:
        sig = f.read(8)
        # IHDR chunk
        length = struct.unpack(">I", f.read(4))[0]
        chunk_type = f.read(4)
        width = struct.unpack(">I", f.read(4))[0]
        height = struct.unpack(">I", f.read(4))[0]
    return width, height

def create_ico_from_pngs(png_paths, ico_path):
    """
    Create an ICO file containing multiple PNG images.
    ICO format supports PNG-compressed entries for sizes >= 256.
    For smaller sizes, PNG entries also work on modern Windows (Vista+).
    """
    entries = []
    for png_path in png_paths:
        w, h = read_png_dimensions(png_path)
        with open(png_path, "rb") as f:
            data = f.read()
        # In ICO, width/height 256 is stored as 0
        ico_w = 0 if w >= 256 else w
        ico_h = 0 if h >= 256 else h
        entries.append((ico_w, ico_h, data))

    num_images = len(entries)
    # ICO header: 6 bytes
    # Each directory entry: 16 bytes
    header_size = 6 + 16 * num_images
    offset = header_size

    ico_data = bytearray()
    # ICO header
    ico_data += struct.pack("<HHH", 0, 1, num_images)

    # Directory entries
    offsets = []
    for ico_w, ico_h, data in entries:
        offsets.append(offset)
        ico_data += struct.pack("<BBBBHHII",
            ico_w,      # width
            ico_h,      # height
            0,          # color palette
            0,          # reserved
            1,          # color planes
            32,         # bits per pixel
            len(data),  # size of image data
            offset      # offset to image data
        )
        offset += len(data)

    # Image data
    for _, _, data in entries:
        ico_data += data

    with open(ico_path, "wb") as f:
        f.write(ico_data)
    print(f"Created ICO: {ico_path} ({num_images} images)")

def main():
    light_png = os.path.join(SRC_DIR, "light-mode.png")
    dark_png = os.path.join(SRC_DIR, "dark-mode.png")

    w, h = read_png_dimensions(light_png)
    print(f"Light mode: {w}x{h}")
    w, h = read_png_dimensions(dark_png)
    print(f"Dark mode: {w}x{h}")

    # 1. Create ICO from light-mode PNG (main app icon)
    ico_path = os.path.join(IMAGES_DIR, "OrcaSlicer.ico")
    create_ico_from_pngs([light_png], ico_path)

    # 2. Create mac-256 ICO
    ico_mac_path = os.path.join(IMAGES_DIR, "OrcaSlicer-mac_256px.ico")
    create_ico_from_pngs([light_png], ico_mac_path)

    # 3. Copy PNG as main icon files (original size)
    copies = {
        "OrcaSlicer.png": light_png,
        "OrcaSlicer_192px.png": light_png,
        "OrcaSlicer_154.png": light_png,
        "OrcaSlicer_128px.png": light_png,
        "OrcaSlicer_64.png": light_png,
        "OrcaSlicer_32px.png": light_png,
        "OrcaSlicer-mac_128px.png": light_png,
        "OrcaSlicer_154_title.png": light_png,
        "OrcaSlicerTitle.png": light_png,
        "OrcaSlicer_192px_transparent.png": light_png,
        "OrcaSlicer_192px_grayscale.png": dark_png,
    }

    for dest_name, src in copies.items():
        dest = os.path.join(IMAGES_DIR, dest_name)
        shutil.copy2(src, dest)
        print(f"Copied: {dest_name}")

    print("\nDone! Note: PNG files are original size (not resized).")
    print("For production, resize PNGs to proper dimensions with an image editor.")

if __name__ == "__main__":
    main()

"""
COS30018 Intelligent Systems | Extension 1 — Night Vision Enhancement Demo
===========================================================================
Demonstrates and evaluates low-light image enhancement for fall detection.

Three demo stages:
  STEP 1 — Batch process dataset/raw/ -> dataset/enhanced/
             Outputs metrics table + CSV for report
  STEP 2 — 5-panel method comparison (Original / Gamma / CLAHE / Baseline / Enhanced)
  STEP 3 — Live webcam demo with dark simulation and side-by-side comparison

For the YOLO detection integration, see: low_light_detector.py
"""

import cv2
import numpy as np
import os
import csv
import sys
from datetime import datetime

try:
    from night_vision import (
        baseline_enhance, enhanced_baseline, enhance_frame,
        gamma_correction, clahe_enhancement, adaptive_gamma,
        compute_metrics, compute_ssim
    )
except ImportError:
    print("[ERROR] Cannot find night_vision.py")
    print("        Make sure night_vision.py is in the same folder as run_enhance.py")
    sys.exit(1)


# -----------------------------------------------------------------------
# HELPERS
# -----------------------------------------------------------------------
def add_label(image, text, color=(0, 255, 0)):
    """Add a colored text label with dark background to an image copy."""
    labeled = image.copy()
    bg_w = len(text) * 13 + 15
    cv2.rectangle(labeled, (5, 5), (bg_w, 46), (0, 0, 0), -1)
    cv2.putText(labeled, text, (10, 34),
                cv2.FONT_HERSHEY_SIMPLEX, 0.85, color, 2)
    return labeled


def resize_to_height(image, target_height=360):
    """Resize image to target_height, preserving aspect ratio."""
    h, w = image.shape[:2]
    new_w = int(w * (target_height / h))
    return cv2.resize(image, (new_w, target_height))


def parse_class_from_filename(filename):
    """
    Infer class label from filename prefix convention.
    Files named fall_*, sit_*, walk_* -> returns the class string.
    Returns "unknown" if pattern not recognised.
    """
    name = os.path.splitext(filename)[0].lower()
    for cls in ("fall", "sit", "walk"):
        if name.startswith(cls):
            return cls
    return "unknown"


def simulate_dark(frame, level):
    """Multiply pixel values by level to simulate dark conditions."""
    return (frame.astype(np.float32) * float(level)).clip(0, 255).astype(np.uint8)


# -----------------------------------------------------------------------
# STEP 1: PROCESS DATASET
# -----------------------------------------------------------------------
def process_dataset():
    """
    Enhance all images in dataset/raw/ and save to dataset/enhanced/.
    Computes and prints:
      - Brightness and contrast before/after for every image
      - SSIM between enhanced and a simulated-dark version (quality check)
      - Per-class (fall/sit/walk) average metrics
      - Summary CSV saved to dataset/metrics_TIMESTAMP.csv
    """
    raw_folder      = os.path.join("dataset", "raw")
    enhanced_folder = os.path.join("dataset", "enhanced")

    if not os.path.exists(raw_folder):
        print(f"    [!] Folder not found: '{raw_folder}'")
        print(f"        Create the folder and add your dark photos to it.")
        return False

    os.makedirs(enhanced_folder, exist_ok=True)

    supported_ext = (".jpg", ".jpeg", ".png")
    image_files = [
        f for f in os.listdir(raw_folder)
        if f.lower().endswith(supported_ext)
    ]

    if not image_files:
        print(f"    [!] No images found in '{raw_folder}'.")
        return False

    print(f"    Found {len(image_files)} images in '{raw_folder}'")
    print(f"    Saving enhanced versions to '{enhanced_folder}'")
    print(f"    Enhancement method: enhanced_baseline (Adaptive Gamma + CLAHE + NLM + Sharpen)")
    print(f"    (Using high-quality NLM denoise for offline photos — may take a moment...)")
    print()

    metrics_log  = []    # all images
    class_groups = {}    # per-class breakdown

    success = 0
    for i, filename in enumerate(image_files):
        raw_path  = os.path.join(raw_folder, filename)
        save_path = os.path.join(enhanced_folder, filename)

        image = cv2.imread(raw_path)
        if image is None:
            print(f"    [SKIP] Could not read: {filename}")
            continue

        raw_m    = compute_metrics(image)
        enhanced = enhanced_baseline(image, fast=False)   # high-quality NLM for photos
        enh_m    = compute_metrics(enhanced)

        # SSIM: simulate a 30% dark version of the image, then enhance it,
        # and compare the enhanced result to the original — shows quality of recovery
        dark_sim  = simulate_dark(image, 0.3)
        enh_sim   = enhanced_baseline(dark_sim, fast=False)
        ssim_val  = compute_ssim(image, enh_sim)

        # Save enhanced image
        cv2.imwrite(save_path, enhanced)
        success += 1

        cls = parse_class_from_filename(filename)
        row = {
            "file":         filename,
            "class":        cls,
            "raw_bright":   raw_m["brightness"],
            "raw_contrast": raw_m["contrast"],
            "enh_bright":   enh_m["brightness"],
            "enh_contrast": enh_m["contrast"],
            "ssim_30pct":   ssim_val,
        }
        metrics_log.append(row)
        class_groups.setdefault(cls, []).append(row)

        print(f"    [{i+1}/{len(image_files)}] {filename:<30}  "
              f"Bright: {raw_m['brightness']:>5.1f} -> {enh_m['brightness']:>5.1f}  "
              f"Contrast: {raw_m['contrast']:>5.1f} -> {enh_m['contrast']:>5.1f}  "
              f"SSIM: {ssim_val:.3f}")

    print()
    print(f"    Enhanced {success} images saved to '{enhanced_folder}'")

    # --- Metrics summary table ---
    print()
    print("  " + "=" * 80)
    print("  IMAGE QUALITY METRICS SUMMARY")
    print("  " + "=" * 80)
    print(f"  {'Filename':<28} {'Class':>6} {'RawB':>6} {'EnhB':>6} "
          f"{'RawC':>6} {'EnhC':>6} {'SSIM':>6}")
    print("  " + "-" * 80)
    for m in metrics_log:
        print(f"  {m['file']:<28} {m['class']:>6} "
              f"{m['raw_bright']:>6.1f} {m['enh_bright']:>6.1f} "
              f"{m['raw_contrast']:>6.1f} {m['enh_contrast']:>6.1f} "
              f"{m['ssim_30pct']:>6.3f}")

    if metrics_log:
        avg = lambda key: np.mean([m[key] for m in metrics_log])
        print("  " + "-" * 80)
        print(f"  {'AVERAGE':<28} {'ALL':>6} "
              f"{avg('raw_bright'):>6.1f} {avg('enh_bright'):>6.1f} "
              f"{avg('raw_contrast'):>6.1f} {avg('enh_contrast'):>6.1f} "
              f"{avg('ssim_30pct'):>6.3f}")
        b_gain = avg('enh_bright')   - avg('raw_bright')
        c_gain = avg('enh_contrast') - avg('raw_contrast')
        print()
        print(f"  Brightness improvement : +{b_gain:.1f}  "
              f"({b_gain / max(avg('raw_bright'), 1) * 100:.0f}% increase)")
        print(f"  Contrast improvement   : +{c_gain:.1f}  "
              f"({c_gain / max(avg('raw_contrast'), 1) * 100:.0f}% increase)")
        print(f"  Avg SSIM (30% dark)    : {avg('ssim_30pct'):.3f}  "
              f"(1.0 = perfect recovery)")

    # --- Per-class breakdown ---
    if len(class_groups) > 1:
        print()
        print("  PER-CLASS BREAKDOWN:")
        print(f"  {'Class':>8}  {'N':>4}  {'RawBright':>10}  "
              f"{'EnhBright':>10}  {'SSIM':>7}")
        print("  " + "-" * 50)
        for cls, rows in sorted(class_groups.items()):
            rb = np.mean([r["raw_bright"]  for r in rows])
            eb = np.mean([r["enh_bright"]  for r in rows])
            ss = np.mean([r["ssim_30pct"] for r in rows])
            print(f"  {cls:>8}  {len(rows):>4}  {rb:>10.1f}  {eb:>10.1f}  {ss:>7.3f}")

    print("  " + "=" * 80)

    # --- Save CSV ---
    if metrics_log:
        ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
        csv_path = os.path.join("dataset", f"metrics_{ts}.csv")
        with open(csv_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=metrics_log[0].keys())
            writer.writeheader()
            writer.writerows(metrics_log)
        print(f"\n    Metrics saved to: {csv_path}")
    print()
    return True


# -----------------------------------------------------------------------
# STEP 2: 5-PANEL METHOD COMPARISON
# -----------------------------------------------------------------------
def show_dataset_comparison():
    """
    Display a 5-panel comparison for every raw image:
      Panel 1: Original (dark)
      Panel 2: Gamma only
      Panel 3: CLAHE only
      Panel 4: Baseline (fixed Gamma + CLAHE + Denoise)
      Panel 5: Enhanced (Adaptive Gamma + CLAHE + Denoise + Sharpen)

    Controls: SPACE = next image | Q / ESC = skip to webcam demo
    """
    raw_folder = os.path.join("dataset", "raw")
    supported_ext = (".jpg", ".jpeg", ".png")
    image_files = [
        f for f in os.listdir(raw_folder)
        if f.lower().endswith(supported_ext)
    ]

    if not image_files:
        print("    [!] No images to show.")
        return

    print(f"    Showing {len(image_files)} images — 5-panel method comparison.")
    print("    SPACE = next image | Q / ESC = skip to webcam demo")
    print()

    for idx, filename in enumerate(image_files):
        raw_img = cv2.imread(os.path.join(raw_folder, filename))
        if raw_img is None:
            continue

        # Compute each method (use fast=True for display speed)
        img_gamma    = gamma_correction(raw_img)
        img_clahe    = clahe_enhancement(raw_img)
        img_baseline = baseline_enhance(raw_img, fast=True)
        img_enhanced = enhanced_baseline(raw_img, fast=True)

        # Resize all to same height for tidy display
        h = 320
        panels = [
            (raw_img,      "1. ORIGINAL",   (0, 0, 255)),
            (img_gamma,    "2. Gamma",      (0, 200, 255)),
            (img_clahe,    "3. CLAHE",      (255, 160, 0)),
            (img_baseline, "4. Baseline",   (0, 255, 0)),
            (img_enhanced, "5. Enhanced",   (0, 255, 180)),
        ]
        resized = []
        for img, label, color in panels:
            r = resize_to_height(img, h)
            r = add_label(r, label, color)
            # Add brightness value at the bottom of each panel
            m = compute_metrics(img)
            btext = f"Bright:{m['brightness']:.0f}  Contrast:{m['contrast']:.0f}"
            cv2.putText(r, btext, (8, r.shape[0] - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.52, color, 1)
            resized.append(r)

        # Two rows: [1, 2, 3] top, [4, 5, blank] bottom — pad blank to match
        top = np.hstack(resized[:3])
        # Pad the bottom row so widths match
        bot_imgs = resized[3:]
        total_w  = top.shape[1]
        bot_w    = sum(r.shape[1] for r in bot_imgs)
        pad_w    = max(0, total_w - bot_w)
        if pad_w > 0:
            pad = np.zeros((h, pad_w, 3), dtype=np.uint8)
            bot_imgs.append(pad)
        bot = np.hstack(bot_imgs)

        # Make sure rows are same width before stacking
        min_w  = min(top.shape[1], bot.shape[1])
        top    = top[:, :min_w]
        bot    = bot[:, :min_w]
        grid   = np.vstack([top, bot])

        # Instruction bar at the bottom
        bar = np.zeros((36, grid.shape[1], 3), dtype=np.uint8)
        cv2.putText(bar,
                    f"  {idx+1}/{len(image_files)}: {filename}"
                    f"   |   SPACE = next   Q = skip to webcam",
                    (5, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
        grid = np.vstack([grid, bar])

        cv2.imshow("Night Vision — Method Comparison (5-panel)", grid)
        key = cv2.waitKey(0) & 0xFF
        if key in (ord('q'), 27):
            print("    Skipping to webcam demo...")
            break

    cv2.destroyAllWindows()
    print()


# -----------------------------------------------------------------------
# STEP 3: LIVE WEBCAM DEMO
# -----------------------------------------------------------------------
def live_webcam_demo():
    """
    Real-time split-screen webcam demo showing enhancement in action.

    LEFT:  input frame (dark simulated or real camera feed)
    RIGHT: enhanced version using enhanced_baseline()

    Controls:
      Q / ESC   — quit
      S         — save snapshot PNG
      D         — toggle dark simulation
      +  / =    — increase darkness (harder test for enhancement)
      -         — decrease darkness
      M         — cycle through enhancement methods
    """
    print("    Opening webcam ...")
    print("    Q/ESC=quit  S=snapshot  D=toggle dark  +/-=darkness level  M=cycle method")
    print()

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("    [ERROR] Cannot open webcam.")
        return

    simulate_dark_flag = True
    dark_level    = 0.3
    snapshot_n    = 0
    methods       = ["baseline", "adaptive", "enhanced"]
    method_idx    = 2   # start on "enhanced"

    while True:
        ret, frame = cap.read()
        if not ret:
            print("    [ERROR] Failed to read from webcam.")
            break

        method = methods[method_idx]

        if simulate_dark_flag:
            input_frame = simulate_dark(frame, dark_level)
            left_label  = f"DARK ({int(dark_level*100)}%)  [no enhancement]"
            left_color  = (60, 60, 200)
        else:
            input_frame = frame.copy()
            left_label  = "ORIGINAL  [no enhancement]"
            left_color  = (180, 180, 0)

        # Apply selected enhancement
        enh_frame = enhance_frame(input_frame, method=method)

        # Live brightness/contrast metrics
        raw_m = compute_metrics(input_frame)
        enh_m = compute_metrics(enh_frame)

        # Build left panel
        left = input_frame.copy()
        h, w = left.shape[:2]
        cv2.rectangle(left, (0, 0), (w, 50), (0, 0, 0), -1)
        cv2.putText(left, left_label, (8, 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.62, left_color, 2)
        cv2.putText(left,
                    f"Bright:{raw_m['brightness']:.0f}  Contrast:{raw_m['contrast']:.0f}",
                    (8, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1)

        # Build right panel
        right = enh_frame.copy()
        cv2.rectangle(right, (0, 0), (right.shape[1], 50), (0, 0, 0), -1)
        cv2.putText(right, f"ENHANCED [{method}]", (8, 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.62, (0, 220, 0), 2)
        cv2.putText(right,
                    f"Bright:{enh_m['brightness']:.0f}  Contrast:{enh_m['contrast']:.0f}",
                    (8, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 220, 0), 1)

        combined = np.hstack([left, right])

        # Control bar
        bar = np.zeros((36, combined.shape[1], 3), dtype=np.uint8)
        dark_str = f"Dark:{int(dark_level*100)}%" if simulate_dark_flag else "Real"
        cv2.putText(bar,
                    f"  Q=quit  S=snap  D=toggle({dark_str})  +/-=darkness  M=method[{method}]",
                    (5, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (200, 200, 200), 1)
        combined = np.vstack([combined, bar])

        cv2.imshow("Night Vision — Live Webcam Demo (COS30018 Extension 1)", combined)

        key = cv2.waitKey(1) & 0xFF
        if key in (ord('q'), 27):
            print("    Quit.")
            break
        elif key == ord('s'):
            snapshot_n += 1
            fname = f"snapshot_{snapshot_n:03d}.png"
            cv2.imwrite(fname, combined)
            print(f"    [SAVED] {fname}")
        elif key == ord('d'):
            simulate_dark_flag = not simulate_dark_flag
            print(f"    Dark simulation: {'ON' if simulate_dark_flag else 'OFF'}")
        elif key in (ord('+'), ord('=')):
            dark_level = max(0.05, round(dark_level - 0.1, 2))
            print(f"    Darkness level: {int(dark_level*100)}%")
        elif key == ord('-'):
            dark_level = min(1.0, round(dark_level + 0.1, 2))
            print(f"    Darkness level: {int(dark_level*100)}%")
        elif key == ord('m'):
            method_idx = (method_idx + 1) % len(methods)
            print(f"    Enhancement method: {methods[method_idx]}")

    cap.release()
    cv2.destroyAllWindows()
    print("    Webcam demo ended.")


# -----------------------------------------------------------------------
# MAIN
# -----------------------------------------------------------------------
if __name__ == "__main__":

    print()
    print("=" * 65)
    print("  COS30018 Extension 1 — Night Vision Enhancement Demo")
    print("  Methods: Gamma | CLAHE | Baseline | Adaptive | Enhanced")
    print("=" * 65)

    # STEP 1 — Batch process and compute metrics
    print()
    print("[STEP 1] Processing dataset images...")
    ok = process_dataset()

    # STEP 2 — 5-panel visual comparison
    if ok:
        print("[STEP 2] Showing 5-panel method comparison...")
        show_dataset_comparison()
    else:
        print("[STEP 2] Skipping — no images processed.")

    # STEP 3 — Live webcam demo
    print("[STEP 3] Starting live webcam demo...")
    live_webcam_demo()

    print()
    print("=" * 65)
    print("  All done!")
    print("  Enhanced images saved in: dataset/enhanced/")
    print("  Metrics CSV saved in:     dataset/metrics_*.csv")
    print()
    print("  Next step for Extension 1 HD marks:")
    print("  Run:  python low_light_detector.py --model best.pt --benchmark")
    print("        python low_light_detector.py --model best.pt --webcam")
    print("=" * 65)
    print()

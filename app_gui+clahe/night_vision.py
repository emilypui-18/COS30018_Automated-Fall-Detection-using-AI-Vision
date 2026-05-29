"""
COS30018 Intelligent Systems | Extension 1: Low-Light Fall Detection

PIPELINE:
    [Dark Frame] --> enhance_frame() --> [Bright Frame] --> [YOLO Model]

ENHANCEMENT METHODS:
    1. gamma_correction()    - lift overall brightness using a LUT
    2. clahe_enhancement()   - fix local contrast (dark corners vs bright areas)
    3. denoise_fast()        - Gaussian Blur noise removal (for live webcam)
    4. denoise_slow()        - Non-Local Means noise removal (for photos)
    5. baseline_enhance()    - combine Gamma + CLAHE + Denoise (fixed params)
    6. adaptive_gamma()      - auto-compute optimal gamma from histogram
    7. unsharp_mask()        - recover edge sharpness lost during denoising
    8. enhanced_baseline()   - improved pipeline: adaptive gamma + CLAHE + denoise + sharpen
    9. enhance_frame()       - single entry point; picks method by name string
   10. compute_metrics()     - brightness + contrast score for report analysis
   11. compute_ssim()        - Structural Similarity Index (academic quality metric)
"""

import cv2
import numpy as np


# ------------------------------------------------------------------
# FUNCTION 1: GAMMA CORRECTION
# ------------------------------------------------------------------
def gamma_correction(image, gamma=2.0):
    """
    Brighten a dark image using a power-law (gamma) curve.
    gamma > 1 = brighter output; higher value = more aggressive lift.
    Uses a precomputed LUT for speed (faster than per-pixel formula).
    """
    inv_gamma = 1.0 / gamma

    # Build lookup table: index = original pixel (0-255), value = new pixel
    table = np.array([
        ((i / 255.0) ** inv_gamma) * 255
        for i in np.arange(0, 256)
    ]).astype("uint8")

    return cv2.LUT(image, table)


# ------------------------------------------------------------------
# FUNCTION 2: CLAHE ENHANCEMENT
# ------------------------------------------------------------------
def clahe_enhancement(image, clip_limit=3.0, tile_size=(8, 8)):
    """
    Contrast Limited Adaptive Histogram Equalization.
    Operates in LAB color space so only brightness (L) is changed;
    colors (A, B) stay exactly the same — no color distortion.
    """
    # Convert BGR -> LAB so we can touch only the L channel
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    # Apply CLAHE to the L (brightness) channel only
    # clipLimit=3.0: balances contrast gain vs noise amplification
    # tileGridSize: divides image into 8x8 local regions for local equalization
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_size)
    l_enhanced = clahe.apply(l_channel)

    # Merge enhanced L back with original A and B, convert back to BGR
    lab_enhanced = cv2.merge((l_enhanced, a_channel, b_channel))
    return cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)


# ------------------------------------------------------------------
# FUNCTION 3A: FAST DENOISE — use for LIVE WEBCAM only
# ------------------------------------------------------------------
def denoise_fast(image, kernel_size=5):
    """
    Gaussian Blur denoising — takes microseconds, safe for 30fps webcam.
    Averages each pixel with its 5x5 neighborhood to cancel random noise.
    Trades a small amount of sharpness for real-time capability.
    """
    return cv2.GaussianBlur(image, (kernel_size, kernel_size), sigmaX=0)


# ------------------------------------------------------------------
# FUNCTION 3B: SLOW DENOISE — use for PHOTOS only (not webcam)
# ------------------------------------------------------------------
def denoise_slow(image, strength=10):
    """
    Non-Local Means (NLM) denoising — high quality but ~1-2 sec per image.
    Finds similar patches across the whole image and averages them,
    preserving real edges while cancelling random noise much better than blur.
    DO NOT use inside a webcam loop — it will freeze the feed.
    """
    return cv2.fastNlMeansDenoisingColored(
        image, None,
        h=strength, hColor=strength,
        templateWindowSize=7, searchWindowSize=21
    )


# ------------------------------------------------------------------
# FUNCTION 4: BASELINE ENHANCE (fixed parameters)
# ------------------------------------------------------------------
def baseline_enhance(image, gamma=2.0, clip_limit=3.0, fast=True):
    """
    Three-stage pipeline with fixed parameters:
      Step 1: Gamma correction  — overall brightness lift
      Step 2: CLAHE             — local contrast equalization
      Step 3: Denoising         — remove noise amplified by brightening
    fast=True -> Gaussian Blur (webcam); fast=False -> NLM (photos)
    """
    step1 = gamma_correction(image, gamma=gamma)
    step2 = clahe_enhancement(step1, clip_limit=clip_limit)
    step3 = denoise_fast(step2) if fast else denoise_slow(step2)
    return step3


# ------------------------------------------------------------------
# FUNCTION 5: ADAPTIVE GAMMA
# ------------------------------------------------------------------
def adaptive_gamma(image):
    """
    Automatically compute the optimal gamma from the image histogram.
    Solves for the gamma that maps the mean brightness to 128 (midpoint).

    Formula: gamma = log(mean/255) / log(target/255)
      - If image is very dark (mean=30) -> gamma ≈ 3.1 (strong lift)
      - If image is already bright (mean=128) -> gamma = 1.0 (no change)

    Returns (brightened_image, gamma_value_used).
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    mean_val = max(float(np.mean(gray)), 5.0)  # clamp to avoid log(0)
    target = 128.0
    gamma = np.log(mean_val / 255.0) / np.log(target / 255.0)
    gamma = float(np.clip(gamma, 1.0, 6.0))
    return gamma_correction(image, gamma=gamma), round(gamma, 2)


# ------------------------------------------------------------------
# FUNCTION 6: UNSHARP MASK
# ------------------------------------------------------------------
def unsharp_mask(image, strength=0.5, kernel_size=5):
    """
    Recover edge sharpness that Gaussian blur softens during denoising.
    strength=0.5 is gentle — enough to restore detail without amplifying
    noise that is already present in dark/low-light images.
    Do NOT raise strength above ~0.8 on noisy dark images; it creates halos.
    """
    blurred = cv2.GaussianBlur(image, (kernel_size, kernel_size), 0)
    return cv2.addWeighted(image, 1.0 + strength, blurred, -strength, 0)


# ------------------------------------------------------------------
# FUNCTION 7: ENHANCED BASELINE (improved HD pipeline)
# ------------------------------------------------------------------
def enhanced_baseline(image, fast=True):
    """
    Upgraded four-stage pipeline (use this instead of baseline_enhance
    when you want the best quality for the extension demo):
      Step 1: Adaptive gamma    — auto-adjusts to actual darkness level
      Step 2: CLAHE             — local contrast equalization
      Step 3: Denoising         — remove amplified noise
      Step 4: Unsharp mask      — restore sharpness lost in step 3

    Advantage over baseline_enhance():
      baseline_enhance uses fixed gamma=2.0 — may under-brighten very
      dark frames or over-brighten slightly dark ones. Adaptive gamma
      targets 128 mean brightness regardless of input darkness level.
    """
    brightened, _ = adaptive_gamma(image)
    contrasted    = clahe_enhancement(brightened)
    denoised      = denoise_fast(contrasted) if fast else denoise_slow(contrasted)
    return unsharp_mask(denoised)


# ------------------------------------------------------------------
# FUNCTION 8: ENHANCE FRAME (single entry point)
# ------------------------------------------------------------------
def enhance_frame(frame, method="enhanced"):
    """
    Single entry point for all enhancement methods.
    method options:
      "none"      - return frame unchanged
      "gamma"     - gamma correction only
      "clahe"     - CLAHE only
      "baseline"  - fixed Gamma + CLAHE + Denoise (original method)
      "adaptive"  - adaptive gamma + CLAHE (no denoise, fast)
      "enhanced"  - adaptive Gamma + CLAHE + Denoise + Sharpen (best quality)
    """
    if method == "none":
        return frame
    elif method == "gamma":
        return gamma_correction(frame)
    elif method == "clahe":
        return clahe_enhancement(frame)
    elif method == "baseline":
        return baseline_enhance(frame, fast=True)
    elif method == "adaptive":
        brightened, _ = adaptive_gamma(frame)
        return clahe_enhancement(brightened)
    elif method == "enhanced":
        return enhanced_baseline(frame, fast=True)
    else:
        print(f"[night_vision] Unknown method: '{method}'. Returning original.")
        return frame


# ------------------------------------------------------------------
# FUNCTION 9: COMPUTE METRICS (brightness + contrast)
# ------------------------------------------------------------------
def compute_metrics(image):
    """
    Compute basic image quality metrics for report analysis tables.
    Returns:
      brightness — mean pixel value (0-255); higher = brighter image
      contrast   — std deviation of pixels; higher = more detail/texture
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return {
        "brightness": round(float(np.mean(gray)), 2),
        "contrast":   round(float(np.std(gray)),  2),
    }


# ------------------------------------------------------------------
# FUNCTION 10: COMPUTE SSIM (Structural Similarity Index)
# ------------------------------------------------------------------
def compute_ssim(img_ref, img_test):
    """
    Structural Similarity Index (SSIM) between two same-size images.
    Range: -1.0 to 1.0 | 1.0 = identical | >0.8 = visually similar.

    Use case in Extension 1:
      img_ref  = normal-light image (the "ground truth" before darkening)
      img_test = enhanced version of the artificially darkened image
    SSIM measures how well enhancement recovers the original scene.

    Reference: Wang et al., 2004, IEEE TIP.
    """
    g_ref  = cv2.cvtColor(img_ref,  cv2.COLOR_BGR2GRAY).astype(np.float64)
    g_test = cv2.cvtColor(img_test, cv2.COLOR_BGR2GRAY).astype(np.float64)

    # Resize test to match ref if shapes differ
    if g_ref.shape != g_test.shape:
        g_test = cv2.resize(g_test, (g_ref.shape[1], g_ref.shape[0]))

    C1 = (0.01 * 255) ** 2   # stability constant for luminance
    C2 = (0.03 * 255) ** 2   # stability constant for contrast
    ksize, sigma = (11, 11), 1.5

    mu1    = cv2.GaussianBlur(g_ref,  ksize, sigma)
    mu2    = cv2.GaussianBlur(g_test, ksize, sigma)
    mu1_sq = mu1 ** 2
    mu2_sq = mu2 ** 2
    mu1mu2 = mu1 * mu2

    s1_sq = cv2.GaussianBlur(g_ref  * g_ref,  ksize, sigma) - mu1_sq
    s2_sq = cv2.GaussianBlur(g_test * g_test, ksize, sigma) - mu2_sq
    s12   = cv2.GaussianBlur(g_ref  * g_test, ksize, sigma) - mu1mu2

    numer = (2 * mu1mu2 + C1) * (2 * s12   + C2)
    denom = (mu1_sq + mu2_sq  + C1) * (s1_sq + s2_sq + C2)
    return round(float(np.mean(numer / denom)), 4)

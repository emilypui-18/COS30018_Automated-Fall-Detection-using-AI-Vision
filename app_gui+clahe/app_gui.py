# -*- coding: utf-8 -*-
"""
COS30018 Intelligent Systems | Simple YOLOv8 Fall Detection GUI
===============================================================
Highly Stable Single-Screen Version featuring:
  1. Always-on, background-processed adaptive Night Vision.
  2. Non-blocking sound alarm triggered on verified falls (no camera lag).
  3. Custom Vertical-Overlap Suppression (VOS) to permanently prevent double-boxing.
  4. Bounding Box Vertical Offset Hotfix to correct the dataset's upward shift.
"""

import os
import sys
import cv2
import threading
import tkinter as tk
from tkinter import messagebox
from PIL import Image, ImageTk
from collections import deque
from ultralytics import YOLO

from night_vision import enhance_frame

# ==========================================
# 1. SETUP & MODEL LOADING
# ==========================================
if os.path.exists("yolo_person.pt"):
    YOLO_MODEL_PATH = "yolo_person.pt"
elif os.path.exists("best.pt"):
    YOLO_MODEL_PATH = "best.pt"
else:
    YOLO_MODEL_PATH = "yolov8s.pt" # Fallback

try:
    yolo_model = YOLO(YOLO_MODEL_PATH)
    print(f"[System] YOLO Model loaded: {YOLO_MODEL_PATH}")
except Exception as e:
    print(f"Error loading model: {e}")

# YOLOv8 Class Map: 0 = Fall Detected, 1 = Walking, 2 = Sitting
class_map = {0: 'Fall Detected', 1: 'Walking', 2: 'Sitting'}

# ==========================================
# 2. GUI APPLICATION CLASS
# ==========================================
class FallDetectorApp:
    def __init__(self, window, window_title):
        self.window = window
        self.window.title(window_title)
        self.window.configure(bg="#f0f0f0")
        
        self.cap = cv2.VideoCapture(0) # 0 = Default Webcam
        if not self.cap.isOpened():
            messagebox.showerror("Error", "Webcam not detected!")
            self.window.destroy()

        # Smoothing Buffer (Remembers the last 5 frames to stop flickering)
        self.action_buffer = deque(maxlen=5)
        
        # Audio Lock State (Prevents overlapping sound threads from lagging the CPU)
        self.sound_playing = False

        # --- UI ELEMENTS ---
        self.title_label = tk.Label(
            window, 
            text="AI Fall Detection System", 
            font=("Arial", 22, "bold"), 
            bg="#f0f0f0", 
            fg="#2c3e50"
        )
        self.title_label.pack(pady=15)

        self.video_label = tk.Label(window, borderwidth=2, relief="groove")
        self.video_label.pack()

        # --- DELETED: Night vision checkbox deleted for a clean interface ---

        self.status_label = tk.Label(
            window, 
            text="SYSTEM INITIALIZING", 
            font=("Arial", 18, "bold"), 
            bg="gray", 
            fg="white", 
            width=38, 
            height=2
        )
        self.status_label.pack(pady=(15, 25))

        # Start Processing Loop
        self.update()
        self.window.protocol("WM_DELETE_WINDOW", self.on_closing)
        self.window.mainloop()

    # ==========================================
    # NON-BLOCKING ALARM AUDIO THREAD
    # ==========================================
    def trigger_sound_alarm(self):
        """Spawns a non-blocking background thread to play the warning beep."""
        if not self.sound_playing:
            self.sound_playing = True
            # Daemon thread automatically terminates when you close the Tkinter window
            threading.Thread(target=self._play_beep_thread, daemon=True).start()

    def _play_beep_thread(self):
        """Runs in the background so it doesn't freeze the camera stream [3]."""
        try:
            if sys.platform == "win32":
                import winsound
                # Play a double rapid high-pitched beep
                winsound.Beep(1200, 250)
                winsound.Beep(1200, 250)
            else:
                # Standard system bell fallback for macOS/Linux
                sys.stdout.write('\a')
                sys.stdout.flush()
        except Exception:
            pass
        finally:
            self.sound_playing = False

    # ==========================================
    # INFRENECE & PROCESSING LOOP
    # ==========================================
    def update(self):
        ret, frame = self.cap.read()
        if ret:
            # Always process frames through the adaptive low-light filter in the background
            processed_frame = enhance_frame(frame, method="enhanced")

            # Run YOLO One-Step Inference
            results = yolo_model.predict(
                processed_frame, 
                conf=0.35,           # Clean, valid confidence threshold
                iou=0.25,            # Stricter IoU for primary NMS
                agnostic_nms=True, 
                verbose=False
            )
            
            any_fall = False
            annotated_frame = processed_frame.copy()
            h, w = processed_frame.shape[:2]
            
            # --- CUSTOM VERTICAL-OVERLAP SUPPRESSION (VOS) ---
            # Automatically filters out vertically stacked overlapping boxes 
            # (e.g. keeps the body box and discards the duplicate head/ceiling box)
            for r in results:
                keep_boxes = []
                
                # Sort boxes by confidence in descending order
                sorted_boxes = sorted(r.boxes, key=lambda b: b.conf[0].item(), reverse=True)
                
                for box in sorted_boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    cls_id = int(box.cls[0].item())
                    conf = box.conf[0].item()
                    
                    # Ensure coordinates are within boundaries
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = min(w, x2), min(h, y2)
                    
                    center_x = (x1 + x2) / 2.0
                    span_x = x2 - x1
                    
                    overlap_found = False
                    for keep_box in keep_boxes:
                        kx1, ky1, kx2, ky2 = keep_box['raw_coords']
                        k_center_x = (kx1 + kx2) / 2.0
                        k_span_x = kx2 - kx1
                        
                        # Calculate horizontal center alignment
                        distance_x = abs(center_x - k_center_x)
                        max_allowed_distance = min(span_x, k_span_x) * 0.6  # 60% of the box width
                        
                        if distance_x < max_allowed_distance:
                            # Vertically aligned overlapping box found, suppress this weaker box
                            overlap_found = True
                            break
                    
                    if not overlap_found:
                        keep_boxes.append({
                            'raw_coords': (x1, y1, x2, y2),
                            'cls_id': cls_id,
                            'conf': conf
                        })

                # Draw only the remaining cleanly filtered boxes
                for kb in keep_boxes:
                    x1, y1, x2, y2 = kb['raw_coords']
                    cls_id = kb['cls_id']
                    conf = kb['conf']
                    
                    # --- Vertical Bounding Box Shift Correction ---
                    box_height = y2 - y1
                    vertical_shift_offset = int(box_height * 0.25)
                    
                    y1_display = min(h, y1 + vertical_shift_offset)
                    y2_display = min(h, y2 + vertical_shift_offset)

                    action = class_map.get(cls_id, 'Unknown')

                    if cls_id == 0:
                        any_fall = True

                    # Color Configuration: Green=Walk, Blue=Sit, Red=Fall
                    if cls_id == 0:
                        color = (0, 0, 255)   # Red
                    elif cls_id == 1:
                        color = (0, 255, 0)   # Green
                    else:
                        color = (255, 0, 0)   # Blue
                    
                    label_str = f"{action} {conf:.2f}"
                    
                    cv2.rectangle(annotated_frame, (x1, y1_display), (x2, y2_display), color, 3)
                    cv2.putText(
                        annotated_frame, 
                        label_str, 
                        (x1, y1_display - 10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 
                        0.7, 
                        color, 
                        2
                    )

            # Add to smoothing buffer
            self.action_buffer.append(1 if any_fall else 0)
            smoothed_fall = self.action_buffer.count(1) >= 3

            # Update status bar and trigger warning sound if verified
            if smoothed_fall:
                self.status_label.config(text="[!] ALARM: FALL DETECTED [!]", bg="red")
                self.trigger_sound_alarm() # Triggers background thread audio [3]
            else:
                self.status_label.config(text="MONITORING: Normal", bg="green")

            # Convert and render frame inside Tkinter
            img = cv2.cvtColor(annotated_frame, cv2.COLOR_BGR2RGB)
            img = Image.fromarray(img)
            imgtk = ImageTk.PhotoImage(image=img)
            self.video_label.imgtk = imgtk
            self.video_label.configure(image=imgtk)

        self.window.after(30, self.update)

    def on_closing(self):
        if self.cap.isOpened():
            self.cap.release()
        self.window.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = FallDetectorApp(root, "One-Step Fall Detection System")
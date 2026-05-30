"""
COS30018 Intelligent Systems | Automated Fall Detection System using AI Vision GUI
===============================================================
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

import torch
import torch.nn as nn
from torchvision import models, transforms

from night_vision import enhance_frame

# ==========================================
# 1. Setup and model loading
# ==========================================
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# --- Load ONE-STEP Model ---
try:
    yolo_one_step = YOLO("best.pt")
    print("[System] One-Step YOLO (best.pt) loaded successfully.")
except Exception as e:
    print(f"[Error] Could not load best.pt: {e}")

# --- Load TWO-STEP Models ---
try:
    yolo_two_step = YOLO("yolo_person.pt")
    print("[System] Two-Step YOLO (yolo_person.pt) loaded successfully.")
except Exception as e:
    print(f"[Error] Could not load yolo_person.pt: {e}")

# Load ResNet classifier 
resnet_model = None
try:
    resnet_model = models.resnet18()
    resnet_model.fc = nn.Linear(resnet_model.fc.in_features, 3)
    resnet_model.load_state_dict(torch.load('resnet_fall_classifier.pth', map_location=device))
    resnet_model.to(device).eval()
    print("[System] Two-Step ResNet18 (resnet_fall_classifier.pth) loaded successfully.")
except Exception as e:
    print(f"[Error] Could not load ResNet18 model: {e}")

# Image transformation for classifier pipeline
resnet_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406],[0.229, 0.224, 0.225])
])

# Standard GUI Class Map: 0 = Fall, 1 = Walking, 2 = Sitting
class_map = {0: 'Fall Detected', 1: 'Walking', 2: 'Sitting'}

# ==========================================
# 2.  Main application setup and window loop
# ==========================================
class FallDetectorApp:
    def __init__(self, window, window_title):
        self.window = window
        self.window.title(window_title)
        
        # --- BLACK BACKGROUND ---
        self.window.configure(bg="black")
        
        self.cap = cv2.VideoCapture(0) # 0 = Default Webcam
        if not self.cap.isOpened():
            messagebox.showerror("Error", "Webcam not detected!")
            self.window.destroy()

        self.action_buffer = deque(maxlen=5)
        self.sound_playing = False

        # Main header
        self.title_label = tk.Label(window, text="AI Fall Detection System", font=("Arial", 28, "bold"), bg="black", fg="white")
        self.title_label.pack(pady=20)

        # Control panel configuration
        self.controls_frame = tk.Frame(window, bg="black")
        self.controls_frame.pack(pady=10)

        # Stage and filter toggles
        self.mode_var = tk.StringVar(value="onestep")
        tk.Radiobutton(
            self.controls_frame, text="One-Step (YOLOv8)", variable=self.mode_var, value="onestep", 
            font=("Arial", 18, "bold"), bg="black", fg="white", selectcolor="#333333", activebackground="black", activeforeground="white"
        ).grid(row=0, column=0, padx=20, pady=10)
        
        tk.Radiobutton(
            self.controls_frame, text="Two-Step (YOLOv8+ResNet-18)", variable=self.mode_var, value="twostep", 
            font=("Arial", 18, "bold"), bg="black", fg="white", selectcolor="#333333", activebackground="black", activeforeground="white"
        ).grid(row=0, column=1, padx=20, pady=10)

        # Checkbutton 
        self.nv_enabled = tk.BooleanVar(value=True)
        tk.Checkbutton(
            self.controls_frame, text="Night Vision", variable=self.nv_enabled, 
            font=("Arial", 18, "bold"), bg="black", fg="white", selectcolor="#333333", activebackground="black", activeforeground="white"
        ).grid(row=0, column=2, padx=20, pady=10)

        # Video label background set to black
        self.video_label = tk.Label(window, borderwidth=2, relief="groove", bg="black")
        self.video_label.pack()

        # Status banner display
        self.status_label = tk.Label(window, text="SYSTEM INITIALIZING", font=("Arial", 24, "bold"), bg="gray", fg="white", width=30, height=2)
        self.status_label.pack(pady=(20, 30))

        self.update()
        self.window.protocol("WM_DELETE_WINDOW", self.on_closing)
        self.window.mainloop()

    def trigger_sound_alarm(self):
        if not self.sound_playing:
            self.sound_playing = True
            threading.Thread(target=self._play_beep_thread, daemon=True).start()

    def _play_beep_thread(self):
        try:
            if sys.platform == "win32":
                import winsound
                winsound.Beep(1200, 250)
                winsound.Beep(1200, 250)
            else:
                sys.stdout.write('\a')
                sys.stdout.flush()
        except Exception:
            pass
        finally:
            self.sound_playing = False

    def update(self):
        ret, frame = self.cap.read()
        if ret:
            if self.nv_enabled.get():
                processed_frame = enhance_frame(frame, method="enhanced")
            else:
                processed_frame = frame

            # Choose Active YOLO Model
            active_yolo = yolo_two_step if self.mode_var.get() == "twostep" else yolo_one_step

            results = active_yolo.predict(
                processed_frame, 
                conf=0.45,
                iou=0.25,
                agnostic_nms=True, 
                verbose=False
            )
            
            any_fall = False
            annotated_frame = processed_frame.copy()
            h, w = processed_frame.shape[:2]
            frame_rgb = cv2.cvtColor(processed_frame, cv2.COLOR_BGR2RGB)
            
            # Vertical overlap suppression to prevent double detection boxes
            for r in results:
                keep_boxes = []
                sorted_boxes = sorted(r.boxes, key=lambda b: b.conf[0].item(), reverse=True)
                
                for box in sorted_boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    cls_id = int(box.cls[0].item())
                    conf = box.conf[0].item()
                    
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = min(w, x2), min(h, y2)
                    
                    center_x = (x1 + x2) / 2.0
                    span_x = x2 - x1
                    
                    overlap_found = False
                    for keep_box in keep_boxes:
                        kx1, ky1, kx2, ky2 = keep_box['raw_coords']
                        distance_x = abs(center_x - ((kx1 + kx2) / 2.0))
                        max_allowed_distance = min(span_x, kx2 - kx1) * 0.6
                        
                        if distance_x < max_allowed_distance:
                            overlap_found = True
                            break
                    
                    if not overlap_found:
                        keep_boxes.append({'raw_coords': (x1, y1, x2, y2), 'cls_id': cls_id, 'conf': conf})

                # Process filtered detection boxes
                for kb in keep_boxes:
                    x1, y1, x2, y2 = kb['raw_coords']
                    cls_id = kb['cls_id']
                    conf = kb['conf']
                    
                    # Push box down slightly to capture lower body/legs for classification
                    box_height = y2 - y1
                    vertical_shift_offset = int(box_height * 0.25)
                    y1_actual = min(h, max(0, y1 + vertical_shift_offset))
                    y2_actual = min(h, max(0, y2 + vertical_shift_offset))
                    
                    # Stage 2: ResNet classification
                    if self.mode_var.get() == "twostep" and resnet_model is not None:
                        # Crop shifted person box
                        person_crop = frame_rgb[y1_actual:y2_actual, x1:x2]
                        
                        if person_crop.size > 0 and y2_actual > y1_actual:
                            crop_pil = Image.fromarray(person_crop)
                            input_tensor = resnet_transform(crop_pil).unsqueeze(0).to(device)
                            
                            with torch.inference_mode():
                                outputs = resnet_model(input_tensor)
                                _, predicted = torch.max(outputs, 1)
                                resnet_pred = predicted.item() 
                                
                                # Map ResNet classifications to UI class schema
                                if resnet_pred == 0:
                                    cls_id = 0 # Fall
                                elif resnet_pred == 1:
                                    cls_id = 2 # Sitting
                                elif resnet_pred == 2:
                                    cls_id = 1 # Walking

                    action = class_map.get(cls_id, 'Unknown')

                    if cls_id == 0:
                        any_fall = True

                    if cls_id == 0:
                        color = (0, 0, 255)   # Red
                    elif cls_id == 1:
                        color = (0, 255, 0)   # Green
                    else:
                        color = (255, 0, 0)   # Blue
                    
                    label_str = f"{action} {conf:.2f}"
                    # Draw visual markers
                    cv2.rectangle(annotated_frame, (x1, y1_actual), (x2, y2_actual), color, 3)
                    # Frame annotations
                    cv2.putText(annotated_frame, label_str, (x1, y1_actual - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)

            # Alert pipeline (requires 3 positive signals out of 5 frames to trigger buzzer)
            self.action_buffer.append(1 if any_fall else 0)
            smoothed_fall = self.action_buffer.count(1) >= 3

            if smoothed_fall:
                self.status_label.config(text="[!] ALARM: FALL DETECTED [!]", bg="red")
                self.trigger_sound_alarm()
            else:
                self.status_label.config(text="MONITORING: Normal", bg="green")

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
    app = FallDetectorApp(root, "Automated Fall Detection System using AI Vision")
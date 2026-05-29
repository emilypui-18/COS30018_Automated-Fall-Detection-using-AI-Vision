# Automated Fall Detection Using AI Vision

COS30018 Intelligent Systems Project

## Team Members

| Name               | Student ID |
| ------------------ | ---------- |
| Tyra Su Ee Lee     | 104389910  |
| Amanda Yu Xuan Yeo | 102789330  |
| Emily Wan Ling Pui | 102788489  |
| Jia Han Nyew       | 104396321  |
| Jullia Min En Ting | 102789259  |

## Project Overview

This project implements an AI-based fall detection system using computer vision and deep learning techniques. The system detects and classifies human activities into three categories:

* fall detected
* walk
* sit

The project evaluates both YOLOv8 and Faster R-CNN architectures and includes a low-light enhancement pipeline based on CLAHE for improved performance in dim environments.

## Repository Structure

```text
AI_FallDetectionSystem/
├── app_gui.py
├── low_light_detector.py
├── night_vision.py
├── run_enhance.py
├── requirements.txt
├── models/
│   ├── yolo_best.pt
│   ├── faster_rcnn.pth
│   └── resnet18_classifier.pth
└── README.md
```

## Requirements

Install required packages:

```bash
pip install -r requirements.txt
```

## Running the Application

Launch the GUI:

```bash
python app_gui.py
```

## Models

* YOLOv8: `models/yolo_best.pt`
* Faster R-CNN: `models/faster_rcnn.pth`
* ResNet-18 Classifier: `models/resnet18_classifier.pth`

## Supervisor

Ts. Dr. Lee Sue Han

## Code Structure

emily@Emilys-MacBook-Pro IS_FallDetectionSystem % tree
.
├── README.md
├── app_gui+clahe
│   ├── __pycache__
│   │   ├── low_light_detector.cpython-313.pyc
│   │   └── night_vision.cpython-313.pyc
│   ├── app_gui.py
│   ├── best.pt
│   ├── low_light_detector.py
│   ├── night_vision.py
│   ├── requirements.txt
│   └── run_enhance.py
├── models
│   ├── TwoStepApproach.ipynb
│   ├── best.pt copy
│   ├── best_frcnn_model.pth
│   ├── faster_rcnn.ipynb
│   ├── resnet_fall_classifier.pth
│   └── yolov8.ipynb
└── screenshots
    ├── clahe.png
    ├── falling_gui_dark.jpeg
    ├── falling_gui_light.jpeg
    ├── lightenhancements.png
    ├── sitting_gui_dark.jpeg
    ├── sitting_gui_light.jpeg
    ├── snapshot_001.png
    ├── walking_gui_dark.jpeg
    └── walking_gui_light.jpeg

5 directories, 24 files
emily@Emilys-MacBook-Pro IS_FallDetectionSystem % 

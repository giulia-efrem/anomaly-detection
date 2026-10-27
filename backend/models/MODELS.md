# Models

Every model the dashboard runs, where it comes from, its license, and the input it expects.
Links, licenses and files were checked on 2026-10-27. Weights are **not** in the
repository; they are downloaded into `data/models/` (gitignored):

```bat
cd backend
.venv\python.exe scripts\download_models.py
```

The script reads `models.json`, downloads Hugging Face files pinned to a commit,
and refuses any file whose size or SHA-256 differs from the manifest.

Before use, every pickle checkpoint was inspected without loading it (list of
pickle globals): only tensors, numpy scalars and Ultralytics/PyTorch module
classes, no code. The X3D checkpoint is loaded with `torch.load(weights_only=True)`.
Hugging Face's "caution" flag on some of these files comes from those numpy and
Ultralytics classes.

## Overview

| Id | Model | Used for | License | Weights |
| --- | --- | --- | --- | --- |
| `yolo11s` | YOLO11s, COCO (Ultralytics) | Objects and tracking for scene normality; gates the other models | AGPL-3.0 | 19 MB |
| `yolo11n-pose` | YOLO11n pose, COCO keypoints | Body poses for the unusual posture branch | AGPL-3.0 | 6 MB |
| `fight-x3d` | X3D-M fine-tuned on RWF-2000 | fight | MIT | 12 MB |
| `crash-r3d18` | 3D ResNet-18 crash detector | car_accident | MIT | 133 MB |
| `fire-yolov8n` | YOLOv8n fire and smoke, D-Fire | fire_explosion | AGPL-3.0 | 6 MB |

**License note.** Ultralytics (the library and the YOLO11 weights) is AGPL-3.0, as
is the fire model. Using them in a public, open-source thesis project is fine; a
closed commercial product would need an Ultralytics enterprise license or other
detectors.

Memory measured on the RTX 4050 Laptop (6 GB): all five models together take about
200 MB of allocated VRAM, and the whole process about 1.1 GB on the GPU with
cuDNN workspaces. That leaves plenty of room for the thesis model.

## Plugin interface

Pretrained detectors are plugins (`backend/app/detectors/`). Each has:

- `id`, `name`, `classes` (the incident classes it can raise), `family` ("pretrained" or "thesis")
- `warmup()`: load weights, run one dummy batch
- `wants(window)`: a cheap gate (for example "two or more people close together")
- `score(window) -> {class: probability}`, plus `score_batch(windows)` for several cameras at once

A `Window` holds the last 16 analysis frames of one camera (about 3.2 s at
5 fps), the newest full-size frame, the tracked objects with speed, age and
keypoints, and a per-camera state dict the plugin may keep between calls. To add
the thesis model: subclass `Detector`, list its weights in `models.json`, add the
class to `PLUGINS` in `detectors/__init__.py`. The pipeline takes the highest
probability per class over all plugins.

## Pretrained detectors

### Fight: X3D-M (RWF-2000)

- Source: https://huggingface.co/visionlab-ai/school-violence-detection-models, file
  `final/final_x3d_realtime.pt` (commit `a744b6a`). The README recommends this
  checkpoint for real time: X3D-M retrained for 16 frames, F1 0.93 on the RWF-2000
  validation split.
- Architecture: PyTorchVideo `create_x3d(depth_factor=2.2)` (X3D-M), head replaced by
  Dropout(0.3) and Linear(2048, 2), weights stored under `backbone.*`.
- Input: 16 RGB frames, 224 x 224, normalised with mean 0.45 and std 0.225, shape
  (B, 3, 16, 224, 224). The head ends in a softmax; index 1 is "violent".
- Runs when two or more people are within 1.5 body heights of each other, on a
  sliding window every 2 s.
- **Our check** on the Surveillance Camera Fight Dataset (300 clips the model never
  saw, `scripts/evaluate_clip_models.py fight fight-surv`): AUC 0.963; at
  threshold 0.6, recall 0.77 with 2 % false positives. Default threshold 0.6.
- Known false positives: crowded rows of people standing close (a pistol range),
  riots. It also fires on the armed robbery clip, which is arguably right.

### Car accident: 3D ResNet-18 crash detector

- Source: https://huggingface.co/HaniaRuby/crash-detector-3dresnet, file
  `crash_detector_3dresnet_jit.pt` (commit `8b7b8b8`), TorchScript, no code needed.
- Input: 16 RGB frames, 112 x 112, values in [0, 1], shape (B, 3, 16, 112, 112).
  Output: crash probability (sigmoid already applied). Reported F1 0.83.
- Runs while vehicles (car, truck, bus, motorcycle) are in view or were in the last 3 s.
- **Our check**: it is poorly calibrated. It stays near 0.06 on normal static
  street CCTV, peaks at 0.93 on the Tonghua CCTV collision and 0.88 on the dashcam
  collision, but also reaches 0.9 to 1.0 on handheld or shaky footage and indoor
  scenes with no vehicle at all. The vehicle gate removes the indoor cases; the
  default threshold is 0.85. It missed the Staten Island collision (max 0.35).
- Fallback considered: the MIT-licensed r3d_18 from
  https://github.com/MohamedSebaie/Car_Crashes_Detection_From_Surveillance_Cameras-OrangeLabs-Project
  (weights on Google Drive, downloadable without sign-in). Tested on the same clips
  it gave 0.88 to 0.99 "accident" for every clip, normal parking and plaza footage
  included, so it does not discriminate. Not used.

### Fire and explosion: YOLOv8n (D-Fire)

- Source: https://huggingface.co/rabahdev/fire-smoke-yolov8n, file `best.pt`
  (commit `13017fe`). Classes 0 smoke, 1 fire. Test mAP50 0.754 on D-Fire.
- Input: any BGR frame, letterboxed to 640 by Ultralytics.
- Runs once per second per camera.
- Score: the most confident fire box; smoke counts at 0.85 of its confidence; boxes
  covering more than half the image are dropped (haze, glare, grey sky). A fire box
  must flicker (mean grey-level change of at least 8 between frames 0.2 s apart) and
  glow (at least 25 % of its pixels with brightness 220 or more), otherwise it counts
  at half confidence: real fire boxes measured 32 to 76 % bright pixels, a red bag 19 %.
- Explosion: a fire or smoke region that suddenly covers at least 6 % of the image
  and three times more than a few seconds earlier, together with a jump in
  brightness (+25 grey levels) or motion. It lifts the score to at least
  0.6 + 0.4 x fire score and the caption says "Explosion".
- **Our check**: 0.85 to 0.90 on the bus fire, the hydrogen balloon fireball, the gas
  cylinder blast and the riot car fire; false positives up to 0.67 on a sunny
  dashcam and 0.82 for a moment on the pistol range. Default threshold 0.6 with the
  2 s rule.

### Not used: VadCLIP

https://github.com/nwpu-zxr/VadCLIP (Apache-2.0) publishes its XD-Violence
weights only on OneDrive and Baidu. The OneDrive link answers 403 without a
Microsoft sign-in, and no mirror exists on Hugging Face, so it was skipped.

## Shared models

### YOLO11s (COCO) with ByteTrack

- Source: https://github.com/ultralytics/assets/releases/tag/v8.3.0 `yolo11s.pt`, AGPL-3.0.
- Batched across cameras, 640 px, confidence 0.25. ByteTrack (Ultralytics
  implementation, one tracker per camera) gives track ids; the pipeline adds speed
  (body heights per second), age and the majority class of each track.
- Chosen over YOLO11n for small, distant people in surveillance views; YOLO11m was
  not needed and costs three times as much.

### YOLO11n pose

- Source: same release, `yolo11n-pose.pt`, AGPL-3.0. 17 COCO keypoints.
- Runs on every second analysis frame, only for cameras with scene normality on and
  people at least 8 % of the frame tall (or long, for someone lying down).

## Scene normality (unsupervised, no weights)

`backend/app/normality.py`, learned per camera and saved to `data/normality/`.
The image is a 16 x 9 grid; statistics are per COCO class and cell, using the
point where an object touches the ground:

| Learned | Raises |
| --- | --- |
| In how many frames each class appears in each cell | `unusual_object`: a class never seen on the camera (0.95), or never or rarely seen in that part of the image |
| Speed histogram and direction histogram per class and cell | `unusual_motion`: much faster than usual, or a direction rarely seen there |
| Track durations per class | `loitering`: stays more than twice the 99th percentile (at least 30 s) |
| People in view per frame, also per hour of day once 6 or more hours are learned | `crowding`: at least the 99th percentile + 2 people |
| A bank of up to 4000 normalised poses | `unusual_posture`: mean distance to the 5 nearest learned poses, scaled by the bank's own 99th percentile |

Furniture and fittings (chairs, tables, benches, ...) never count as unusual
objects. Neighbouring cells count at half weight, so grid edges do not cause
alarms. Tracks must be at least 1 s old and 0.45 confident.

Frames on which a pretrained model is above its threshold are not learned, so a
fight during learning does not become "normal".

## Speed on this laptop

RTX 4050 Laptop on AC power, Balanced plan (the GPU stays at about 12 W, P3): YOLO11s
on 7 frames 125 ms at 640 px, pose 93 ms, X3D-M about 50 ms per camera, r3d18 about
60 ms per camera. To fit 8 cameras, detection and pose run at 512 px, pose on every
third frame and the clip models every 2 s in their own thread (so they never stall
tracking). With 7 to 8 demo cameras the pipeline then
analyses about 4 frames per second per camera; it drops to 1 to 1.5 while another
program uses the GPU. "Best performance" in Windows power mode should help.

## Alerts seen in the end-to-end run (demo cameras, 2026-10-27)

| Camera | Class | What happened |
| --- | --- | --- |
| Cafeteria, Street corner | fight | Raised on the fight part of each reel (fight model 1.00) |
| Road cameras | car_accident | Dashcam car cutting in (1.00) and the Tonghua CCTV collision (0.95) |
| Fire watch | fire_explosion | Bus fire, gas cylinder blast, balloon fireball, riot car fire |
| Pedestrian walkway | unusual_object | "Truck on a camera where trucks were never seen" (a utility cart), "Bicycle ..." |
| Campus avenue | unusual_object | "Handbag in a part of the image where handbags were never seen" (a bag left on the grass) |
| Office | unusual_posture | "Person lying or bent low, unlike the poses learned" during the falls |

False alarms in the same run: fight on people standing close together in a row and
on the fire scenes (firefighters), car_accident on the
handheld fire footage, a "suitcase" misdetection in the office, and fire on a red
bag in the avenue before the flicker and glow check was added.

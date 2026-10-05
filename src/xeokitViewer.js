import {
  Viewer,
  XKTLoaderPlugin,
  StoreyViewsPlugin,
  NavCubePlugin
} from "@xeokit/xeokit-sdk";

let active = null;

export function destroyActiveViewer() {
  if (!active) return;
  try {
    active.viewer?.destroy?.();
  } catch (error) {
    console.warn("Viewer cleanup warning:", error);
  }
  active = null;
}

export function initXeokitViewer({ stageId, onSelection = () => {} } = {}) {
  destroyActiveViewer();

  const stage = document.getElementById(stageId);
  if (!stage) return null;

  const canvas = stage.querySelector("[data-xeokit-canvas]");
  const navCanvas = stage.querySelector("[data-navcube-canvas]");
  const loading = stage.querySelector("[data-viewer-loading]");
  const floorLabel = stage.querySelector("[data-floor-label]");
  const floorSelect = stage.closest(".viewer-panel")?.querySelector("[data-floor-select]");
  const selectedLabel = stage.querySelector("[data-selected-element]");

  if (!canvas || !navCanvas) return null;

  // Xeokit requires element IDs. Generate route-local IDs to avoid stale bindings.
  canvas.id = `xeokitCanvas_${Date.now()}`;
  navCanvas.id = `navCube_${Date.now()}`;

  const viewer = new Viewer({
    canvasId: canvas.id,
    transparent: true
  });

  viewer.cameraControl.navMode = "orbit";
  viewer.cameraControl.doublePickFlyTo = true;
  viewer.cameraControl.followPointer = true;
  viewer.cameraControl.smartPivot = true;

  // Construction-oriented selection styling: safety orange is reserved for
  // the BIM element the operator is actively inspecting.
  if (viewer.scene.selectedMaterial) {
    viewer.scene.selectedMaterial.fill = true;
    viewer.scene.selectedMaterial.fillColor = [1.0, 0.48, 0.0];
    viewer.scene.selectedMaterial.fillAlpha = 0.22;
    viewer.scene.selectedMaterial.edges = true;
    viewer.scene.selectedMaterial.edgeColor = [1.0, 0.66, 0.20];
    viewer.scene.selectedMaterial.edgeAlpha = 1.0;
  }

  const xktLoader = new XKTLoaderPlugin(viewer);
  const storeyViews = new StoreyViewsPlugin(viewer);

  new NavCubePlugin(viewer, {
    canvasId: navCanvas.id,
    visible: true,
    cameraFly: true,
    cameraFlyDuration: 0.45,
    fitVisible: true
  });

  let model = null;
  let storeys = [];
  let currentStoreyIndex = -1;
  let selectedEntity = null;

  const getStoreyName = (storey, index) => {
    const metaObject = viewer.metaScene.metaObjects[storey.storeyId];
    return metaObject?.name || `Floor ${index + 1}`;
  };

  const populateFloors = () => {
    storeys = storeyViews.storeysList || [];

    if (floorSelect) {
      floorSelect.innerHTML = '<option value="-1">All Floors</option>';
      storeys.forEach((storey, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = getStoreyName(storey, index);
        floorSelect.appendChild(option);
      });
    }

    if (floorLabel) {
      floorLabel.textContent = storeys.length ? "All Floors" : "Model Loaded";
    }
  };

  const showWholeBuilding = () => {
    if (!model) return;
    currentStoreyIndex = -1;
    if (floorSelect) floorSelect.value = "-1";
    if (floorLabel) floorLabel.textContent = "All Floors";
    viewer.cameraControl.navMode = "orbit";
    viewer.scene.setObjectsVisible(viewer.scene.objectIds, true);
    viewer.cameraFlight.flyTo({
      aabb: model.aabb,
      projection: "perspective",
      duration: 0.9,
      fitFOV: 45
    });
  };

  const goToStorey = (index, plan = true) => {
    if (index < 0 || index >= storeys.length) return;
    currentStoreyIndex = index;
    const storey = storeys[index];
    const name = getStoreyName(storey, index);

    if (floorSelect) floorSelect.value = String(index);
    if (floorLabel) floorLabel.textContent = name;

    storeyViews.showStoreyObjects(storey.storeyId, { hideOthers: true });

    if (plan) {
      storeyViews.gotoStoreyCamera(storey.storeyId, {
        projection: "ortho",
        done: () => {
          viewer.cameraControl.navMode = "planView";
        }
      });
    } else {
      viewer.cameraControl.navMode = "orbit";
      viewer.cameraFlight.flyTo({
        aabb: storey.aabb,
        projection: "perspective",
        duration: 0.7,
        fitFOV: 45
      });
    }
  };

  const actionHandlers = {
    home: showWholeBuilding,
    fit: showWholeBuilding,
    all: showWholeBuilding,
    plan: () => {
      if (currentStoreyIndex === -1 && storeys.length) goToStorey(0, true);
      else if (currentStoreyIndex >= 0) goToStorey(currentStoreyIndex, true);
    },
    threeD: () => {
      if (currentStoreyIndex >= 0) goToStorey(currentStoreyIndex, false);
      else showWholeBuilding();
    },
    up: () => {
      if (!storeys.length) return;
      if (currentStoreyIndex === -1) goToStorey(0, true);
      else goToStorey(Math.min(storeys.length - 1, currentStoreyIndex + 1), true);
    },
    down: () => {
      if (!storeys.length) return;
      if (currentStoreyIndex === -1) goToStorey(storeys.length - 1, true);
      else goToStorey(Math.max(0, currentStoreyIndex - 1), true);
    },
    focus: () => {
      if (!selectedEntity) return;
      viewer.cameraControl.navMode = "orbit";
      viewer.cameraFlight.flyTo({
        aabb: selectedEntity.aabb,
        projection: "perspective",
        duration: 0.65,
        fitFOV: 35
      });
    }
  };

  stage.querySelectorAll("[data-viewer-action]").forEach((button) => {
    const action = button.dataset.viewerAction;
    button.addEventListener("click", () => actionHandlers[action]?.());
  });

  floorSelect?.addEventListener("change", () => {
    const index = Number(floorSelect.value);
    if (index === -1) showWholeBuilding();
    else goToStorey(index, true);
  });

  viewer.scene.input.on("mouseclicked", (canvasPos) => {
    const hit = viewer.scene.pick({ canvasPos, pickSurface: true });
    if (!hit?.entity?.isObject) return;

    if (selectedEntity) selectedEntity.selected = false;
    selectedEntity = hit.entity;
    selectedEntity.selected = true;

    const metaObject = viewer.metaScene.metaObjects[selectedEntity.id];
    const readableName = metaObject?.name || metaObject?.type || selectedEntity.id;
    if (selectedLabel) selectedLabel.textContent = String(readableName);

    onSelection({
      entityId: selectedEntity.id,
      name: readableName,
      type: metaObject?.type || "BIM Element",
      metaObject
    });
  });

  storeyViews.on("storeys", populateFloors);

  model = xktLoader.load({
    id: "SnowdonTowers",
    src: "/models/Snowdon Towers Sample Architectural.xkt",
    edges: true,
    saoEnabled: true,
    dtxEnabled: true
  });

  model.on("loaded", () => {
    loading?.remove();
    viewer.cameraControl.navMode = "orbit";
    viewer.cameraFlight.flyTo({
      aabb: model.aabb,
      projection: "perspective",
      duration: 1,
      fitFOV: 45
    });
    setTimeout(populateFloors, 350);
  });

  model.on("error", (error) => {
    console.error("XKT load failed:", error);
    if (loading) {
      loading.innerHTML = `
        <div class="viewer-loading-card viewer-error">
          <div class="viewer-loading-title">BIM model could not load</div>
          <div class="viewer-loading-sub">Check the XKT path and xeokit dependency.</div>
        </div>`;
    }
  });

  active = { viewer, model };
  return { viewer, showWholeBuilding, goToStorey };
}

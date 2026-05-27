// ========================================================
// Hachimii - FF14 Front Line Tactics
// Version: v0.3.5 (Tactics Code Base64 LZW Compression Edition)
// Engine: Konva.js (Multi-Layer Architecture)
// ========================================================

const stage = new Konva.Stage({
    container: 'canvas-container',
    width: window.innerWidth,
    height: window.innerHeight,
    draggable: true // stage panning allowed by default in move mode when map is unlocked
});

const mapLayer = new Konva.Layer();      
const objectLayer = new Konva.Layer();   
const drawLayer = new Konva.Layer();     
stage.add(mapLayer, objectLayer, drawLayer);

let activeTacticalColor = '#ff4d4d'; 
let currentLineTag = 'line-red'; 
let currentMode = 'move'; 
let selectedNode = null;

let mapImageObj = new Image();
let konvaMapImage = null;
let spawnMode = null; // 'team-a' | 'team-b' | 'team-c' or null
let objectSpawnMode = null; // 'object-0' | 'object-1' | 'object-2' or null
let markerSpawnMode = null; // 'marker-0' | 'marker-1' | ... or null
let objectImageCache = {}; // cache for loaded object images

function loadMap(url) {
    mapImageObj.crossOrigin = 'Anonymous';
    mapImageObj.onload = function() {
        if (konvaMapImage) konvaMapImage.destroy();
        const imageRatio = mapImageObj.width / mapImageObj.height;
        
        // Use a fixed base width for the map coordinate system to ensure cross-screen alignment!
        const baseWidth = 1200;
        const baseHeight = baseWidth / imageRatio;

        konvaMapImage = new Konva.Image({
            x: 0, y: 0, image: mapImageObj,
            width: baseWidth, height: baseHeight,
            listening: false 
        });
        mapLayer.add(konvaMapImage);
        
        // Auto-center only if the stage scale/position has not been customized/imported
        if (stage.scaleX() === 1 && stage.x() === 0 && stage.y() === 0) {
            const scale = Math.min(stage.width() / baseWidth, stage.height() / baseHeight);
            stage.scale({ x: scale, y: scale });
            const xPos = (stage.width() - baseWidth * scale) / 2;
            const yPos = (stage.height() - baseHeight * scale) / 2;
            stage.position({ x: xPos, y: yPos });
        }
        
        mapLayer.batchDraw();
        stage.batchDraw();
    };
    mapImageObj.src = url;
}
loadMap(document.getElementById('map-select').value);
document.getElementById('map-select').addEventListener('change', (e) => {
    // Clear all canvas contents on map switch
    transformer.nodes([]);
    selectedNode = null;
    
    // Destroy all elements in objectLayer except the transformer
    objectLayer.getChildren().filter(node => node !== transformer).forEach(node => node.destroy());
    
    // Destroy all drawings in drawLayer
    drawLayer.destroyChildren();
    
    // Redraw layers
    objectLayer.batchDraw();
    drawLayer.batchDraw();
    
    // Reset stage scale and position so the new map can auto-center correctly
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    
    // Load new map image
    loadMap(e.target.value);
});


// ==========================================
// 物件事件綁定與選取機制 (拖曳/右鍵)
// ==========================================

const transformer = new Konva.Transformer({
    nodes: [], rotateEnabled: true, keepRatio: true, enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'] 
});
objectLayer.add(transformer);

const contextMenu = document.getElementById('custom-context-menu');
const teamMarkerMenu = document.getElementById('team-marker-menu');
let rightClickedObject = null;

function handleSelectObject(node) {
    if (selectedNode && selectedNode !== node) {
        transformer.nodes([]);
    }
    selectedNode = node;
    if (node.attrs.name === 'terrain') {
        transformer.rotateEnabled(true);
        transformer.enabledAnchors(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
        transformer.nodes([node]);
    } else if (node.attrs.customType === 'team-node' || node.attrs.customType === 'annotation' || node.attrs.customType === 'object-sprite' || node.attrs.customType === 'marker-sprite') {
        transformer.rotateEnabled(false);
        transformer.enabledAnchors([]); // No resize/rotate anchors, just a premium bounding box!
        transformer.nodes([node]);
    } else {
        transformer.nodes([]); 
    }
    objectLayer.batchDraw();
}

function handleRightClickObject(e, node) {
    if (node.attrs.customType === 'terrain-shape' || (node.attrs.customType === 'object-sprite' && node.attrs.objectType >= 6)) {
        e.evt.preventDefault(); 
        rightClickedObject = node;
        contextMenu.style.left = e.evt.clientX + 'px';
        contextMenu.style.top = e.evt.clientY + 'px';
        contextMenu.style.display = 'block';
        teamMarkerMenu.style.display = 'none';
    } else if (node.attrs.customType === 'team-node') {
        e.evt.preventDefault();
        rightClickedObject = node;
        teamMarkerMenu.style.left = e.evt.clientX + 'px';
        teamMarkerMenu.style.top = e.evt.clientY + 'px';
        teamMarkerMenu.style.display = 'block';
        contextMenu.style.display = 'none';
    }
}

function bindObjectEvents(node) {
    node.on('mousedown touchstart click tap', (e) => {
        // Redirection to move mode if clicked while in a spawn mode!
        if (objectSpawnMode || spawnMode || markerSpawnMode) {
            switchToMoveMode();
        }
        
        if (currentMode !== 'move') return; 
        handleSelectObject(node);
        e.cancelBubble = true; 
        
        // Blur active element (like sidebar buttons) to transfer keyboard focus to window
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
        window.focus();
    });
    node.on('contextmenu', (e) => {
        if (currentMode !== 'move') return;
        handleRightClickObject(e, node);
        e.cancelBubble = true; 
    });
}


// ==========================================
// 隊伍與地形生產器
// ==========================================

function createTeamNode(color, teamName, x, y) {
    const textColor = (color === '#ffcc00') ? '#000000' : '#ffffff';
    const posX = (typeof x === 'number') ? x : (stage.width() / 2 - stage.x());
    const posY = (typeof y === 'number') ? y : (stage.height() / 2 - stage.y());
    const group = new Konva.Group({
        x: posX, y: posY,
        draggable: true, customType: 'team-node', team: teamName, teamColor: color
    });
    const circle = new Konva.Circle({ radius: 16, fill: color });
    const text = new Konva.Text({ text: teamName, fontSize: 14, fontStyle: 'bold', fill: textColor, x: -6, y: -6 });

    group.add(circle, text);
    objectLayer.add(group);
    bindObjectEvents(group);
    updateDraggableState();
    
    objectLayer.batchDraw();
    return group;
}

function clearTeamsByName(teamName) {
    objectLayer.find(node => node.attrs && node.attrs.customType === 'team-node' && node.attrs.team === teamName)
        .forEach(n => n.destroy());
    objectLayer.batchDraw();
}

function createAnnotation(text, x, y) {
    const textNode = new Konva.Text({
        text: text,
        fontSize: 16,
        fontStyle: 'bold',
        fill: '#ffffff',
        padding: 8,
        align: 'left'
    });
    const bg = new Konva.Rect({
        x: 0,
        y: 0,
        width: textNode.width() + 16,
        height: textNode.height() + 16,
        fill: 'rgba(255, 255, 0, 0.3)',
        cornerRadius: 6
    });
    textNode.x(8);
    textNode.y(8);

    const group = new Konva.Group({
        x: x,
        y: y,
        draggable: true,
        customType: 'annotation'
    });
    group.add(bg, textNode);
    objectLayer.add(group);
    bindObjectEvents(group);
    updateDraggableState();
    objectLayer.batchDraw();
}

function showFloatingTextInput(clientX, clientY, stagePos) {
    // create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '輸入註解並按 Enter 確認';
    input.style.position = 'absolute';
    input.style.left = clientX + 'px';
    input.style.top = clientY + 'px';
    input.style.zIndex = 2000;
    input.style.padding = '6px 8px';
    input.style.borderRadius = '4px';
    input.style.border = '1px solid rgba(0,0,0,0.4)';
    input.style.background = 'rgba(255,255,255,0.95)';
    input.style.minWidth = '120px';
    document.body.appendChild(input);
    input.focus();

    function cleanup(commit) {
        const val = input.value;
        input.remove();
        if (commit && val && val.trim()) {
            createAnnotation(val.trim(), stagePos.x, stagePos.y);
        }
        window.removeEventListener('mousedown', onOutsideClick);
    }

    function onKey(e) {
        if (e.key === 'Enter') { cleanup(true); }
        else if (e.key === 'Escape') { cleanup(false); }
    }

    function onOutsideClick(ev) {
        if (ev.target !== input) { cleanup(true); }
    }

    input.addEventListener('keydown', onKey);
    setTimeout(() => window.addEventListener('mousedown', onOutsideClick));
}

function createTerrainShape(shapeType) {
    let shape;
    const commonSettings = {
        x: stage.width() / 2 - stage.x(), y: stage.height() / 2 - stage.y(),
        fill: 'transparent', stroke: '#000000', strokeWidth: 4,
        draggable: true, customType: 'terrain-shape', name: 'terrain',
        shapeType: shapeType
    };

    if (shapeType === 'rect') {
        shape = new Konva.Rect({
            ...commonSettings,
            width: 50,
            height: 50,
            fill: '#666666',
            stroke: '#ffffff',
            strokeWidth: 6
        });
    } 
    else if (shapeType === 'triangle') {
        shape = new Konva.Line({ ...commonSettings, points: [25, 0, 50, 43, 0, 43], closed: true });
    } 
    else if (shapeType === 'polygon') {
        shape = new Konva.Line({ ...commonSettings, points: [25, 0, 50, 18, 40, 45, 10, 45, 0, 18], closed: true });
    }

    objectLayer.add(shape);
    bindObjectEvents(shape);
    updateDraggableState();

    objectLayer.batchDraw();
    switchToMoveMode();
}

function createObjectSprite(objectIndex, x, y, capturedTeam = '0') {
    let imagePath = '';
    let size = 60;
    if (objectIndex < 3) {
        imagePath = `object/ice-big-${objectIndex}.png`;
        size = 60;
    } else if (objectIndex >= 3 && objectIndex < 6) {
        imagePath = `object/ice-small-${objectIndex - 3}.png`;
        size = 40;
    } else if (objectIndex === 6) {
        imagePath = `object/score-B-${capturedTeam}.png`;
        size = 50; // 40 * 1.25 = 50
    } else if (objectIndex === 7) {
        imagePath = `object/score-A-${capturedTeam}.png`;
        size = 62; // 50 * 1.25 = 62.5 -> round to 62
    } else if (objectIndex === 8) {
        imagePath = `object/score-S-${capturedTeam}.png`;
        size = 75; // 60 * 1.25 = 75
    }
    
    // Load image with Promise
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function() {
        const konvaImage = new Konva.Image({
            image: img,
            x: x,
            y: y,
            width: size,
            height: size,
            draggable: true,
            customType: 'object-sprite',
            objectType: objectIndex,
            capturedTeam: capturedTeam
        });
        
        objectLayer.add(konvaImage);
        konvaImage.moveToBottom(); // Always stay at the bottom, just above the map layer, so player nodes are never covered
        bindObjectEvents(konvaImage);
        updateDraggableState();
        objectLayer.batchDraw();
    };
    img.onerror = function() {
        console.error("Failed to load object image: " + imagePath);
    };
    img.src = imagePath;
}

contextMenu.addEventListener('click', function(e) {
    const item = e.target;
    if (!item.classList.contains('context-menu-item') || !rightClickedObject) return;
    const fill = item.getAttribute('data-fill');
    const stroke = item.getAttribute('data-stroke');
    
    if (rightClickedObject.attrs.customType === 'object-sprite' && rightClickedObject.attrs.objectType >= 6) {
        // Swap tomelith image source based on team color selection
        let teamCode = '0';
        if (fill === '#ff4d4d') teamCode = 'A';
        else if (fill === '#3399ff') teamCode = 'B';
        else if (fill === '#ffcc00') teamCode = 'C';
        
        let rankCode = 'B';
        if (rightClickedObject.attrs.objectType === 7) rankCode = 'A';
        else if (rightClickedObject.attrs.objectType === 8) rankCode = 'S';
        
        const newImg = new Image();
        newImg.crossOrigin = 'Anonymous';
        newImg.onload = function() {
            rightClickedObject.image(newImg);
            rightClickedObject.setAttr('capturedTeam', teamCode); // Store the captured team state!
            objectLayer.batchDraw();
        };
        newImg.src = `object/score-${rankCode}-${teamCode}.png`;
    } else {
        // Handle normal terrain shape color change
        rightClickedObject.fill(fill);
        rightClickedObject.stroke(stroke);
        if (fill === 'transparent') {
            rightClickedObject.strokeWidth(4);
        } else {
            rightClickedObject.strokeWidth(6);
        }
    }
    
    objectLayer.batchDraw();
    contextMenu.style.display = 'none';
});

teamMarkerMenu.addEventListener('click', function(e) {
    e.stopPropagation(); // prevent closing instantly
    const target = e.target.closest('.marker-grid-item');
    const clearBtn = e.target.closest('#btn-clear-team-marker');
    
    if (!rightClickedObject || rightClickedObject.attrs.customType !== 'team-node') return;
    
    if (clearBtn) {
        const oldMarker = rightClickedObject.findOne('.team-marker');
        if (oldMarker) {
            oldMarker.destroy();
        }
        objectLayer.batchDraw();
        teamMarkerMenu.style.display = 'none';
        return;
    }
    
    if (target) {
        const markerIndex = parseInt(target.getAttribute('data-index'), 10);
        let imagePath = '';
        let size = 28; // Bounding box size above team node
        
        if (markerIndex < 5) {
            imagePath = `marker/power_${markerIndex + 1}.png`;
        } else if (markerIndex >= 5 && markerIndex < 12) {
            imagePath = `marker/p_icon_${markerIndex - 5}.png`;
        } else {
            imagePath = `marker/mark_${markerIndex - 11}.png`;
        }
        
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = function() {
            let finalWidth = size;
            let finalHeight = size;
            const imgRatio = img.width / img.height;
            
            if (imgRatio > 1) {
                finalWidth = size;
                finalHeight = size / imgRatio;
            } else {
                finalHeight = size;
                finalWidth = size * imgRatio;
            }
            
            // Destroy existing marker on head if any
            const oldMarker = rightClickedObject.findOne('.team-marker');
            if (oldMarker) {
                oldMarker.destroy();
            }
            
            const konvaImage = new Konva.Image({
                image: img,
                x: -finalWidth / 2,
                y: -16 - finalHeight + 8, // Overlaps about 25% of the team node (32px diameter, ~8px overlap)
                width: finalWidth,
                height: finalHeight,
                name: 'team-marker',
                customType: 'team-head-marker',
                markerIndex: markerIndex
            });
            
            rightClickedObject.add(konvaImage);
            objectLayer.batchDraw();
        };
        img.src = imagePath;
        teamMarkerMenu.style.display = 'none';
    }
});

document.addEventListener('click', () => {
    contextMenu.style.display = 'none';
    teamMarkerMenu.style.display = 'none';
});


// ==========================================
// 6. 戰術拉線與箭頭引擎 (【升級】：雷射筆 5 秒延遲消除機制)
// ==========================================

let isDrawing = false;
let tempShape = null;
let pointsLine = [];

stage.on('mousedown touchstart', function (e) {
    // Redirection if clicking on an existing object while in object spawn mode, team spawn mode, or marker spawn mode!
    if ((objectSpawnMode || spawnMode || markerSpawnMode) && e.target !== stage && e.target !== konvaMapImage) {
        // Switch to move mode immediately
        switchToMoveMode();
        
        // Find the correct selectable object node
        let targetNode = e.target;
        if (targetNode.parent && (targetNode.parent.attrs.customType === 'team-node' || targetNode.parent.attrs.customType === 'annotation')) {
            targetNode = targetNode.parent;
        }
        
        // Select it
        handleSelectObject(targetNode);
        
        // Blur active element to restore keyboard focus
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
        window.focus();
        return;
    }

    // don't start freehand drawing when in move or text mode
    if (currentMode === 'move' || currentMode === 'text') return;
    if (e.evt.button === 2) return; 

    isDrawing = true;
    const pos = stage.getRelativePointerPosition(); 
    pointsLine = [pos.x, pos.y];

    const commonSettings = {
        stroke: activeTacticalColor, strokeWidth: 4, lineCap: 'round', lineJoin: 'round',
        customType: currentLineTag, draggable: false, name: 'drawn-line'
    };

    if (currentMode === 'draw') {
        tempShape = new Konva.Line({ ...commonSettings, points: pointsLine, globalCompositeOperation: 'source-over' });
    } 
    else if (currentMode === 'laser') {
        tempShape = new Konva.Line({
            stroke: activeTacticalColor, 
            strokeWidth: 6, 
            opacity: 0.85, 
            points: pointsLine,
            lineCap: 'round', lineJoin: 'round',
            name: 'laser-trail',
            listening: false 
        });
    }
    else {
        tempShape = new Konva.Arrow({
            ...commonSettings, points: [pos.x, pos.y, pos.x, pos.y],
            pointerLength: 12, pointerWidth: 12, fill: activeTacticalColor,
            dash: (currentMode === 'arrow-dashed') ? [15, 10] : null
        });
    }
    drawLayer.add(tempShape);
    drawLayer.batchDraw();
});

stage.on('mousemove touchmove', function (e) {
    if (!isDrawing || !tempShape) return;
    const pos = stage.getRelativePointerPosition();

    if (currentMode === 'draw' || currentMode === 'laser') {
        pointsLine.push(pos.x, pos.y);
        tempShape.points(pointsLine);
    } else {
        tempShape.points([pointsLine[0], pointsLine[1], pos.x, pos.y]);
    }
    drawLayer.batchDraw(); 
});

stage.on('mouseup touchend', function () {
    if (!isDrawing) return;
    isDrawing = false;
    
    if (tempShape && tempShape.points().length <= 2) {
        tempShape.destroy();
    } 
    // 【修改核心】：放開滑鼠時，延遲 5 秒再觸發淡出與銷毀
    else if (tempShape && tempShape.attrs.name === 'laser-trail') {
        const targetLaser = tempShape; 
        
        // 5秒鐘後（5000 毫秒）才執行內部的淡出動畫
        setTimeout(() => {
            // 防呆確認：如果在 5 秒內整個圖層被重置了，避免對空節點操作
            if (!targetLaser || !targetLaser.getLayer()) return;

            const tween = new Konva.Tween({
                node: targetLaser,
                duration: 0.4, // 淡出動畫時間維持 0.4 秒，過程優雅流暢
                opacity: 0,
                onFinish: () => {
                    targetLaser.destroy(); 
                    drawLayer.batchDraw();
                }
            });
            tween.play();
        }, 3000); 
    }
    else if (tempShape) {
        bindObjectEvents(tempShape); 
        updateDraggableState();
    }
    tempShape = null;
    drawLayer.batchDraw();
});


// ==========================================
// 7. 系統控制、防呆與清除工具
// ==========================================

const colorStatus = document.getElementById('current-color-status');

function updateStageDraggableState() {
    const isMoveMode = currentMode === 'move';
    const isLocked = document.getElementById('lock-map') ? document.getElementById('lock-map').checked : false;
    stage.draggable(isMoveMode && !isLocked);
}

function updateDraggableState() {
    const btnMove = document.getElementById('btn-move');
    const isMoveMode = btnMove && btnMove.classList.contains('active');
    
    // Update objectLayer nodes (teams, annotations, terrain, sprites)
    objectLayer.getChildren().forEach(node => {
        if (node !== transformer) {
            node.draggable(isMoveMode);
        }
    });

    // Update drawLayer lines
    drawLayer.find('.drawn-line').forEach(line => {
        line.draggable(isMoveMode);
        line.listening(isMoveMode);
    });

    // Also update stage pan state
    updateStageDraggableState();
}

function switchToMoveMode() {
    currentMode = 'move';
    updateStageDraggableState();
    // cancel any spawn mode when switching tools
    spawnMode = null;
    objectSpawnMode = null;
    markerSpawnMode = null;
    document.getElementById('add-team-a').classList.remove('active');
    document.getElementById('add-team-b').classList.remove('active');
    document.getElementById('add-team-c').classList.remove('active');
    for (let i = 0; i <= 8; i++) {
        const btn = document.getElementById(`gen-object-${i}`);
        if (btn) btn.classList.remove('active');
    }
    for (let i = 0; i <= 15; i++) {
        const btn = document.getElementById(`gen-marker-${i}`);
        if (btn) btn.classList.remove('active');
    }
    updateButtonUI('btn-move');
    stage.container().style.cursor = 'default';
    updateDraggableState();
    stage.batchDraw();
}

function enableDrawMode(modeStr, btnId, cursor = 'precise') {
    currentMode = modeStr;
    stage.draggable(false); 
    transformer.nodes([]); 
    updateButtonUI(btnId);
    // cancel spawn mode when selecting a drawing/tool mode
    spawnMode = null;
    objectSpawnMode = null;
    markerSpawnMode = null;
    document.getElementById('add-team-a').classList.remove('active');
    document.getElementById('add-team-b').classList.remove('active');
    document.getElementById('add-team-c').classList.remove('active');
    for (let i = 0; i <= 8; i++) {
        const btn = document.getElementById(`gen-object-${i}`);
        if (btn) btn.classList.remove('active');
    }
    for (let i = 0; i <= 15; i++) {
        const btn = document.getElementById(`gen-marker-${i}`);
        if (btn) btn.classList.remove('active');
    }
    stage.container().style.cursor = cursor;
    updateDraggableState();
    objectLayer.batchDraw();
    stage.batchDraw();
}

function handleColorButtonClick(color, tag, text) {
    // cancel spawn mode when changing color/tool
    spawnMode = null;
    objectSpawnMode = null;
    markerSpawnMode = null;
    document.getElementById('add-team-a').classList.remove('active');
    document.getElementById('add-team-b').classList.remove('active');
    document.getElementById('add-team-c').classList.remove('active');
    for (let i = 0; i <= 8; i++) {
        const btn = document.getElementById(`gen-object-${i}`);
        if (btn) btn.classList.remove('active');
    }
    for (let i = 0; i <= 15; i++) {
        const btn = document.getElementById(`gen-marker-${i}`);
        if (btn) btn.classList.remove('active');
    }
    activeTacticalColor = color;
    currentLineTag = tag;
    colorStatus.innerText = text;
    colorStatus.style.color = color;
}

document.getElementById('btn-color-red').addEventListener('click', () => handleColorButtonClick('#ff4d4d', 'line-red', '紅色'));
document.getElementById('btn-color-blue').addEventListener('click', () => handleColorButtonClick('#3399ff', 'line-blue', '藍色'));
document.getElementById('btn-color-yellow').addEventListener('click', () => handleColorButtonClick('#ffcc00', 'line-yellow', '黃色'));

const toolButtons = document.querySelectorAll('.tool-btn');
function updateButtonUI(activeBtnId) {
    toolButtons.forEach(btn => btn.classList.remove('active'));
    if (activeBtnId) document.getElementById(activeBtnId).classList.add('active');
}

document.getElementById('btn-move').addEventListener('click', switchToMoveMode);
document.getElementById('btn-draw-curve').addEventListener('click', () => enableDrawMode('draw', 'btn-draw-curve', 'crosshair'));
document.getElementById('btn-arrow-solid').addEventListener('click', () => enableDrawMode('arrow-solid', 'btn-arrow-solid'));
document.getElementById('btn-arrow-dashed').addEventListener('click', () => enableDrawMode('arrow-dashed', 'btn-arrow-dashed'));
document.getElementById('btn-laser').addEventListener('click', () => enableDrawMode('laser', 'btn-laser', 'pointer'));

function clearLinesByType(typeTag) {
    drawLayer.find(node => node.attrs.customType === typeTag).forEach(line => line.destroy());
    drawLayer.batchDraw();
}

document.getElementById('clear-red').addEventListener('click', () => clearLinesByType('line-red'));
document.getElementById('clear-blue').addEventListener('click', () => clearLinesByType('line-blue'));
document.getElementById('clear-yellow').addEventListener('click', () => clearLinesByType('line-yellow'));

document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (confirm("確定要清除全場的手繪線條與戰術箭頭嗎？")) {
        drawLayer.find('.drawn-line').forEach(line => line.destroy());
        drawLayer.batchDraw();
    }
});

// Team spawn mode handling and clear buttons
function setSpawnMode(mode) {
    const targetMode = (spawnMode === mode) ? null : mode;
    spawnMode = targetMode;
    if (spawnMode) {
        currentMode = 'move';
        stage.draggable(false);
        drawLayer.find('.drawn-line').forEach(line => line.listening(true));
        updateButtonUI(null);
        objectSpawnMode = null;
        markerSpawnMode = null;
        for (let i = 0; i <= 8; i++) {
            const btn = document.getElementById(`gen-object-${i}`);
            if (btn) btn.classList.remove('active');
        }
        for (let i = 0; i <= 15; i++) {
            const btn = document.getElementById(`gen-marker-${i}`);
            if (btn) btn.classList.remove('active');
        }
    }
    // visual feedback for add-team buttons
    document.getElementById('add-team-a').classList.toggle('active', spawnMode === 'team-a');
    document.getElementById('add-team-b').classList.toggle('active', spawnMode === 'team-b');
    document.getElementById('add-team-c').classList.toggle('active', spawnMode === 'team-c');
    // change cursor
    stage.container().style.cursor = spawnMode ? 'crosshair' : 'default';
    updateDraggableState();
}

document.getElementById('add-team-a').addEventListener('click', () => setSpawnMode('team-a'));
document.getElementById('add-team-b').addEventListener('click', () => setSpawnMode('team-b'));
document.getElementById('add-team-c').addEventListener('click', () => setSpawnMode('team-c'));
document.getElementById('btn-insert-text').addEventListener('click', () => enableDrawMode('text', 'btn-insert-text', 'text'));

// Object spawn mode handling
function setObjectSpawnMode(mode) {
    const targetMode = (objectSpawnMode === mode) ? null : mode;
    objectSpawnMode = targetMode;
    if (objectSpawnMode) {
        currentMode = 'move';
        stage.draggable(false);
        drawLayer.find('.drawn-line').forEach(line => line.listening(true));
        updateButtonUI(null);
        spawnMode = null; // cancel team spawn mode when selecting object mode
        markerSpawnMode = null;
        for (let i = 0; i <= 15; i++) {
            const btn = document.getElementById(`gen-marker-${i}`);
            if (btn) btn.classList.remove('active');
        }
    }
    // visual feedback for object buttons
    for (let i = 0; i <= 8; i++) {
        const btn = document.getElementById(`gen-object-${i}`);
        if (btn) btn.classList.toggle('active', objectSpawnMode === `object-${i}`);
    }
    // change cursor
    stage.container().style.cursor = objectSpawnMode ? 'crosshair' : 'default';
    updateDraggableState();
}

for (let i = 0; i <= 8; i++) {
    const btn = document.getElementById(`gen-object-${i}`);
    if (btn) {
        btn.addEventListener('click', () => setObjectSpawnMode(`object-${i}`));
    }
}

document.getElementById('clear-team-a').addEventListener('click', () => clearTeamsByName('A'));
document.getElementById('clear-team-b').addEventListener('click', () => clearTeamsByName('B'));
document.getElementById('clear-team-c').addEventListener('click', () => clearTeamsByName('C'));


// ==========================================
// 8. 鍵盤熱鍵與全域縮放監聽
// ==========================================

window.addEventListener('keydown', function (e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNode) {
            selectedNode.destroy(); 
            if(transformer.nodes().length > 0) transformer.nodes([]);   
            selectedNode = null;
            objectLayer.batchDraw();
            drawLayer.batchDraw();
        }
    }
    if (e.key === 'Escape' || e.key === 'Esc') {
        if (isDrawing) { isDrawing = false; if(tempShape) tempShape.destroy(); drawLayer.batchDraw(); }
        switchToMoveMode();
    }
});

stage.on('wheel', (e) => {
    e.evt.preventDefault();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const scaleBy = 1.05;
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    if (newScale > 20 || newScale < 0.1) return;
    stage.scale({ x: newScale, y: newScale });
    const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
    };
    stage.position({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
    });
    stage.batchDraw();
});

stage.on('click tap', function (e) {
    const pos = stage.getRelativePointerPosition();
    // text mode: show floating input, do this before spawnMode
    if (currentMode === 'text' && (e.target === stage || e.target === konvaMapImage)) {
        const clientX = e.evt.clientX;
        const clientY = e.evt.clientY;
        showFloatingTextInput(clientX, clientY, pos);
        return;
    }
    // spawn mode: allow placing teams on click
    if (spawnMode && (e.target === stage || e.target === konvaMapImage)) {
        if (spawnMode === 'team-a') createTeamNode('#ff4d4d', 'A', pos.x, pos.y);
        else if (spawnMode === 'team-b') createTeamNode('#3399ff', 'B', pos.x, pos.y);
        else if (spawnMode === 'team-c') createTeamNode('#ffcc00', 'C', pos.x, pos.y);
        return;
    }
    // object spawn mode: allow placing objects on click
    if (objectSpawnMode && (e.target === stage || e.target === konvaMapImage)) {
        const objIndex = parseInt(objectSpawnMode.replace('object-', ''), 10);
        let size = 60;
        if (objIndex < 3) size = 60;
        else if (objIndex < 6) size = 40;
        else if (objIndex === 6) size = 50; // 40 * 1.25
        else if (objIndex === 7) size = 62; // 50 * 1.25
        else if (objIndex === 8) size = 75; // 60 * 1.25
        
        const offset = size / 2;
        createObjectSprite(objIndex, pos.x - offset, pos.y - offset); // center the image at click point
        return;
    }
    // marker spawn mode: allow placing markers on click
    if (markerSpawnMode && (e.target === stage || e.target === konvaMapImage)) {
        const markerIndex = parseInt(markerSpawnMode.replace('marker-', ''), 10);
        createMarkerSprite(markerIndex, pos.x, pos.y); // Pass raw coordinates for perfect internal centering
        return;
    }
    if (currentMode !== 'move') return;
    if (e.target === stage || e.target === konvaMapImage) {
        transformer.nodes([]);
        selectedNode = null;
        objectLayer.batchDraw();
        stage.batchDraw();
    }
});

stage.on('contentContextmenu', function (e) {
    if (currentMode !== 'move') {
        e.evt.preventDefault(); 
        if (isDrawing) { isDrawing = false; if(tempShape) tempShape.destroy(); drawLayer.batchDraw(); }
        // Do NOT automatically switch to move mode to prevent Wacom stylus or right-click from causing accidental mode switches.
    }
});

document.getElementById('add-shape-triangle').addEventListener('click', () => createTerrainShape('triangle'));
document.getElementById('add-shape-rect').addEventListener('click', () => createTerrainShape('rect'));
document.getElementById('add-shape-polygon').addEventListener('click', () => createTerrainShape('polygon'));

document.getElementById('clear-all-objects').addEventListener('click', () => {
    objectLayer.find(node => node.attrs && node.attrs.customType === 'object-sprite').forEach(n => n.destroy());
    if (selectedNode && selectedNode.attrs && selectedNode.attrs.customType === 'object-sprite') {
        transformer.nodes([]);
        selectedNode = null;
    }
    objectLayer.batchDraw();
});

// ==========================================
// 9. 情報標記生產器與事件綁定
// ==========================================

function createMarkerSprite(markerIndex, clickX, clickY) {
    let imagePath = '';
    let size = 32; // Target bounding box size
    
    if (markerIndex < 5) {
        imagePath = `marker/power_${markerIndex + 1}.png`;
    } else if (markerIndex >= 5 && markerIndex < 12) {
        imagePath = `marker/p_icon_${markerIndex - 5}.png`;
    } else {
        imagePath = `marker/mark_${markerIndex - 11}.png`;
    }
    
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function() {
        let finalWidth = size;
        let finalHeight = size;
        const imgRatio = img.width / img.height;
        
        if (imgRatio > 1) {
            // Landscape
            finalWidth = size;
            finalHeight = size / imgRatio;
        } else {
            // Portrait or Square
            finalHeight = size;
            finalWidth = size * imgRatio;
        }
        
        // Center the image perfectly over the clicked position
        const posX = clickX - finalWidth / 2;
        const posY = clickY - finalHeight / 2;
        
        const konvaImage = new Konva.Image({
            image: img,
            x: posX,
            y: posY,
            width: finalWidth,
            height: finalHeight,
            draggable: true,
            customType: 'marker-sprite',
            markerType: markerIndex
        });
        
        objectLayer.add(konvaImage);
        bindObjectEvents(konvaImage);
        updateDraggableState();
        objectLayer.batchDraw();
    };
    img.onerror = function() {
        console.error("Failed to load marker image: " + imagePath);
    };
    img.src = imagePath;
}

function setMarkerSpawnMode(mode) {
    const targetMode = (markerSpawnMode === mode) ? null : mode;
    markerSpawnMode = targetMode;
    if (markerSpawnMode) {
        currentMode = 'move';
        stage.draggable(false);
        drawLayer.find('.drawn-line').forEach(line => line.listening(true));
        updateButtonUI(null);
        spawnMode = null;
        objectSpawnMode = null;
        for (let i = 0; i <= 8; i++) {
            const btn = document.getElementById(`gen-object-${i}`);
            if (btn) btn.classList.remove('active');
        }
    }
    // visual feedback for marker buttons
    for (let i = 0; i <= 15; i++) {
        const btn = document.getElementById(`gen-marker-${i}`);
        if (btn) btn.classList.toggle('active', markerSpawnMode === `marker-${i}`);
    }
    // change cursor
    stage.container().style.cursor = markerSpawnMode ? 'crosshair' : 'default';
    updateDraggableState();
}

for (let i = 0; i <= 15; i++) {
    const btn = document.getElementById(`gen-marker-${i}`);
    if (btn) {
        btn.addEventListener('click', () => setMarkerSpawnMode(`marker-${i}`));
    }
}

document.getElementById('clear-all-markers').addEventListener('click', () => {
    objectLayer.find(node => node.attrs && node.attrs.customType === 'marker-sprite').forEach(n => n.destroy());
    if (selectedNode && selectedNode.attrs && selectedNode.attrs.customType === 'marker-sprite') {
        transformer.nodes([]);
        selectedNode = null;
    }
    objectLayer.batchDraw();
});

// Setup Lock Map checkbox change listener and initial run
const lockMapCheckbox = document.getElementById('lock-map');
if (lockMapCheckbox) {
    lockMapCheckbox.addEventListener('change', updateStageDraggableState);
}
updateStageDraggableState(); // run once on initialization

// ==========================================
// 10. 戰術代碼匯出與匯入功能 (JSON 序列化 & LZ-String 壓縮)
// ==========================================

// Helper mapping for map URLs to IDs and vice versa
const MAP_URL_MAPPING = {
    'map/M1.png': 1,
    'map/M2.jpg': 2,
    'map/M3.png': 3
};
const MAP_ID_MAPPING = {
    1: 'map/M1.png',
    2: 'map/M2.jpg',
    3: 'map/M3.png'
};

function exportTacticsJSON() {
    const mapUrl = document.getElementById('map-select').value;
    const mapId = MAP_URL_MAPPING[mapUrl] || mapUrl; 
    const isLocked = document.getElementById('lock-map') ? (document.getElementById('lock-map').checked ? 1 : 0) : 0;
    
    const data = {
        v: '0.3.6', 
        m: mapId,   
        l: isLocked, 
        s: [
            Math.round(stage.scaleX() * 1000) / 1000, 
            Math.round(stage.x() * 10) / 10,          
            Math.round(stage.y() * 10) / 10           
        ],
        o: [], 
        l_arr: [] 
    };

    // Serialize objects in objectLayer to array formats for maximum size reduction!
    objectLayer.getChildren().forEach(node => {
        if (node === transformer) return;

        const type = node.attrs.customType;
        const posX = Math.round(node.x() * 10) / 10;
        const posY = Math.round(node.y() * 10) / 10;

        if (type === 'team-node') {
            const headMarkerNode = node.findOne('.team-marker');
            const headMarker = headMarkerNode ? headMarkerNode.attrs.markerIndex : null;
            // Schema: [TypeID=0, x, y, team, teamColor, headMarker]
            data.o.push([0, posX, posY, node.attrs.team, node.attrs.teamColor, headMarker]);
        }
        else if (type === 'annotation') {
            const textNode = node.findOne('Text');
            const text = textNode ? textNode.text() : '';
            // Schema: [TypeID=1, x, y, text]
            data.o.push([1, posX, posY, text]);
        }
        else if (type === 'object-sprite') {
            // Schema: [TypeID=2, x, y, objectType, capturedTeam]
            data.o.push([2, posX, posY, node.attrs.objectType, node.attrs.capturedTeam || '0']);
        }
        else if (type === 'marker-sprite') {
            // Save center coordinates
            const centerX = Math.round((node.x() + node.width() / 2) * 10) / 10;
            const centerY = Math.round((node.y() + node.height() / 2) * 10) / 10;
            // Schema: [TypeID=3, x, y, markerType]
            data.o.push([3, centerX, centerY, node.attrs.markerType]);
        }
        else if (type === 'terrain-shape') {
            // Schema: [TypeID=4, x, y, shapeType, width, height, scaleX, scaleY, rotation, fill, stroke, strokeWidth]
            data.o.push([
                4,
                posX,
                posY,
                node.attrs.shapeType,
                Math.round((node.width ? node.width() : 50) * 10) / 10,
                Math.round((node.height ? node.height() : 50) * 10) / 10,
                Math.round((node.scaleX() || 1) * 100) / 100,
                Math.round((node.scaleY() || 1) * 100) / 100,
                Math.round((node.rotation() || 0) * 10) / 10,
                node.fill(),
                node.stroke(),
                node.strokeWidth()
            ]);
        }
    });

    // Serialize lines in drawLayer (integer points save tons of bytes!)
    drawLayer.find('.drawn-line').forEach(node => {
        const isArrow = (node instanceof Konva.Arrow) ? 1 : 0;
        const roundedPoints = node.points().map(p => Math.round(p));
        // Schema: [points, stroke, strokeWidth, customType, dash, isArrow]
        data.l_arr.push([
            roundedPoints,
            node.stroke(),
            node.strokeWidth(),
            node.attrs.customType,
            node.dash() || null,
            isArrow
        ]);
    });

    const verboseString = JSON.stringify(data);
    
    try {
        // High-ratio LZW compression to Base64
        const compressedCode = LZString.compressToBase64(verboseString);
        
        navigator.clipboard.writeText(compressedCode).then(() => {
            alert("戰術代碼（壓縮後的極短金鑰）已成功複製到您的剪貼簿！\n您可以直接分享給隊友。");
        }).catch(err => {
            console.error("Failed to copy clipboard: ", err);
            prompt("複製剪貼簿失敗，請手動複製下方壓縮代碼：", compressedCode);
        });
    } catch (e) {
        console.error("Compression failed: ", e);
        // Fallback: output plain string
        navigator.clipboard.writeText(verboseString);
        alert("壓縮失敗，已直接複製原始戰術代碼到您的剪貼簿。");
    }
}

function importTacticsJSON() {
    let code = prompt("請貼上分享的戰術代碼 (壓縮後的金鑰字串)：");
    if (!code || !code.trim()) return;
    code = code.trim();

    let data;
    try {
        if (code.startsWith('{')) {
            // Fallback for raw JSON string if user posted uncompressed code
            data = JSON.parse(code);
        } else {
            const decompressed = LZString.decompressFromBase64(code);
            if (!decompressed) {
                throw new Error("Decompression returned null/empty string");
            }
            data = JSON.parse(decompressed);
        }
    } catch (e) {
        console.error(e);
        alert("解析戰術代碼失敗！代碼可能損壞或不完整。");
        return;
    }

    try {
        const version = data.v || data.version;
        const rawMap = data.m || data.mapUrl;
        const mapUrl = MAP_ID_MAPPING[rawMap] || rawMap; 
        const isLocked = (data.l !== undefined) ? (data.l === 1 || data.l === true) : !!data.lockMap;
        const scaleVal = data.s ? (Array.isArray(data.s) ? data.s[0] : data.stage.scale) : (data.stage ? data.stage.scale : 1);
        const stageX = data.s ? (Array.isArray(data.s) ? data.s[1] : data.stage.x) : (data.stage ? data.stage.x : 0);
        const stageY = data.s ? (Array.isArray(data.s) ? data.s[2] : data.stage.y) : (data.stage ? data.stage.y : 0);
        const objects = data.o || data.objects || [];
        const lines = data.l_arr || data.lines || [];

        if (!mapUrl || !scaleVal) {
            alert("無效的戰術代碼格式！");
            return;
        }

        // 1. Restore map selection & lock checkbox
        if (document.getElementById('map-select').value !== mapUrl) {
            document.getElementById('map-select').value = mapUrl;
            loadMap(mapUrl);
        }
        
        const lockMapCheckbox = document.getElementById('lock-map');
        if (lockMapCheckbox) {
            lockMapCheckbox.checked = isLocked;
        }

        // 2. Clear current board
        transformer.nodes([]);
        selectedNode = null;
        objectLayer.getChildren().filter(node => node !== transformer).forEach(node => node.destroy());
        drawLayer.destroyChildren();

        // 3. Restore stage scale & position
        stage.scale({ x: scaleVal, y: scaleVal });
        stage.position({ x: stageX, y: stageY });
        updateStageDraggableState();

        // Helper to handle team node marker attachment asynchronously
        function attachMarkerToTeamNode(teamNode, markerIndex) {
            let imagePath = '';
            let size = 28;
            if (markerIndex < 5) imagePath = `marker/power_${markerIndex + 1}.png`;
            else if (markerIndex >= 5 && markerIndex < 12) imagePath = `marker/p_icon_${markerIndex - 5}.png`;
            else imagePath = `marker/mark_${markerIndex - 11}.png`;

            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = function() {
                let finalWidth = size;
                let finalHeight = size;
                const imgRatio = img.width / img.height;
                if (imgRatio > 1) {
                    finalWidth = size;
                    finalHeight = size / imgRatio;
                } else {
                    finalHeight = size;
                    finalWidth = size * imgRatio;
                }
                const oldMarker = teamNode.findOne('.team-marker');
                if (oldMarker) oldMarker.destroy();

                const konvaImage = new Konva.Image({
                    image: img,
                    x: -finalWidth / 2,
                    y: -16 - finalHeight + 8, // 25% overlap
                    width: finalWidth,
                    height: finalHeight,
                    name: 'team-marker',
                    customType: 'team-head-marker',
                    markerIndex: markerIndex
                });
                teamNode.add(konvaImage);
                objectLayer.batchDraw();
            };
            img.src = imagePath;
        }

        // 4. Restore objects
        objects.forEach(item => {
            if (Array.isArray(item)) {
                // Minimized schema
                const typeID = item[0];
                const x = item[1];
                const y = item[2];

                if (typeID === 0) {
                    const teamNode = createTeamNode(item[4], item[3], x, y);
                    if (item[5] !== null && item[5] !== undefined) {
                        attachMarkerToTeamNode(teamNode, item[5]);
                    }
                }
                else if (typeID === 1) {
                    createAnnotation(item[3], x, y);
                }
                else if (typeID === 2) {
                    createObjectSprite(item[3], x, y, item[4] || '0');
                }
                else if (typeID === 3) {
                    createMarkerSprite(item[3], x, y);
                }
                else if (typeID === 4) {
                    let shape;
                    const commonSettings = {
                        x: x, y: y,
                        shapeType: item[3],
                        draggable: true, customType: 'terrain-shape', name: 'terrain',
                        scaleX: item[6] || 1,
                        scaleY: item[7] || 1,
                        rotation: item[8] || 0,
                        fill: item[9],
                        stroke: item[10],
                        strokeWidth: item[11]
                    };
                    if (item[3] === 'rect') {
                        shape = new Konva.Rect({
                            ...commonSettings,
                            width: item[4] || 50,
                            height: item[5] || 50
                        });
                    } else if (item[3] === 'triangle') {
                        shape = new Konva.Line({ ...commonSettings, points: [25, 0, 50, 43, 0, 43], closed: true });
                    } else if (item[3] === 'polygon') {
                        shape = new Konva.Line({ ...commonSettings, points: [25, 0, 50, 18, 40, 45, 10, 45, 0, 18], closed: true });
                    }
                    
                    objectLayer.add(shape);
                    bindObjectEvents(shape);
                }
            } else {
                // Fallback for Verbose JSON object schema
                if (item.type === 'team-node') {
                    const teamNode = createTeamNode(item.teamColor, item.team, item.x, item.y);
                    if (item.headMarker !== null && item.headMarker !== undefined) {
                        attachMarkerToTeamNode(teamNode, item.headMarker);
                    }
                }
                else if (item.type === 'annotation') {
                    createAnnotation(item.text, item.x, item.y);
                }
                else if (item.type === 'object-sprite') {
                    createObjectSprite(item.objectType, item.x, item.y, item.capturedTeam || '0');
                }
                else if (item.type === 'marker-sprite') {
                    createMarkerSprite(item.markerType, item.x, item.y);
                }
                else if (item.type === 'terrain-shape') {
                    let shape;
                    const commonSettings = {
                        x: item.x, y: item.y,
                        fill: item.fill, stroke: item.stroke, strokeWidth: item.strokeWidth,
                        draggable: true, customType: 'terrain-shape', name: 'terrain',
                        shapeType: item.shapeType,
                        scaleX: item.scaleX || 1,
                        scaleY: item.scaleY || 1,
                        rotation: item.rotation || 0
                    };
                    if (item.shapeType === 'rect') {
                        shape = new Konva.Rect({
                            ...commonSettings,
                            width: item.width || 50,
                            height: item.height || 50
                        });
                    } else if (item.shapeType === 'triangle') {
                        shape = new Konva.Line({ ...commonSettings, points: [25, 0, 50, 43, 0, 43], closed: true });
                    } else if (item.shapeType === 'polygon') {
                        shape = new Konva.Line({ ...commonSettings, points: [25, 0, 50, 18, 40, 45, 10, 45, 0, 18], closed: true });
                    }
                    
                    objectLayer.add(shape);
                    bindObjectEvents(shape);
                }
            }
        });

        // 5. Restore lines
        lines.forEach(item => {
            let points, stroke, strokeWidth, customType, dash, isArrow;
            if (Array.isArray(item)) {
                // Minimized schema: [points, stroke, strokeWidth, customType, dash, isArrow]
                points = item[0];
                stroke = item[1];
                strokeWidth = item[2];
                customType = item[3];
                dash = item[4];
                isArrow = item[5];
            } else {
                // Fallback for Verbose JSON object schema
                points = item.points;
                stroke = item.stroke;
                strokeWidth = item.strokeWidth;
                customType = item.customType;
                dash = item.dash;
                isArrow = item.isArrow ? 1 : 0;
            }

            const commonSettings = {
                stroke: stroke,
                strokeWidth: strokeWidth,
                lineCap: 'round',
                lineJoin: 'round',
                customType: customType,
                draggable: false,
                name: 'drawn-line',
                points: points
            };
            let shape;
            if (isArrow) {
                shape = new Konva.Arrow({
                    ...commonSettings,
                    pointerLength: 12,
                    pointerWidth: 12,
                    fill: stroke,
                    dash: dash || null
                });
            } else {
                shape = new Konva.Line({
                    ...commonSettings,
                    globalCompositeOperation: 'source-over'
                });
            }
            drawLayer.add(shape);
        });

        // Redraw layers
        objectLayer.batchDraw();
        drawLayer.batchDraw();
        stage.batchDraw();

        alert("戰術代碼已成功載入！");
    } catch (e) {
        console.error(e);
        alert("還原戰術板狀態失敗，可能是不相容的舊版本代碼！");
    }
}

// Bind Section 6 buttons
document.getElementById('btn-export-json').addEventListener('click', exportTacticsJSON);
document.getElementById('btn-import-json').addEventListener('click', importTacticsJSON);
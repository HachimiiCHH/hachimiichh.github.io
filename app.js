// ========================================================
// Hachimii - FF14 Front Line Tactics
// Version: v0.2.2 (Extended Laser Timing Edition)
// Engine: Konva.js (Multi-Layer Architecture)
// ========================================================

const stage = new Konva.Stage({
    container: 'canvas-container',
    width: window.innerWidth,
    height: window.innerHeight,
    draggable: false // map should not be dragged; only zoom allowed
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
let objectImageCache = {}; // cache for loaded object images

function loadMap(url) {
    mapImageObj.crossOrigin = 'Anonymous';
    mapImageObj.onload = function() {
        if (konvaMapImage) konvaMapImage.destroy();
        const imageRatio = mapImageObj.width / mapImageObj.height;
        const stageRatio = stage.width() / stage.height();
        let imgWidth = mapImageObj.width;
        let imgHeight = mapImageObj.height;

        if (imageRatio > stageRatio) {
            imgWidth = stage.width();
            imgHeight = stage.width() / imageRatio;
        } else {
            imgHeight = stage.height();
            imgWidth = stage.height() * imageRatio;
        }

        const xPos = (stage.width() - imgWidth) / 2;
        const yPos = (stage.height() - imgHeight) / 2;
        konvaMapImage = new Konva.Image({
            x: xPos, y: yPos, image: mapImageObj,
            width: imgWidth, height: imgHeight,
            listening: false 
        });
        mapLayer.add(konvaMapImage);
        mapLayer.batchDraw();
    };
    mapImageObj.src = url;
}
loadMap(document.getElementById('map-select').value);
document.getElementById('map-select').addEventListener('change', (e) => loadMap(e.target.value));


// ==========================================
// 物件事件綁定與選取機制 (拖曳/右鍵)
// ==========================================

const transformer = new Konva.Transformer({
    nodes: [], rotateEnabled: true, keepRatio: true, enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'] 
});
objectLayer.add(transformer);

const contextMenu = document.getElementById('custom-context-menu');
let rightClickedObject = null;

function handleSelectObject(node) {
    if (selectedNode && selectedNode !== node) {
        if (selectedNode.attrs.name === 'terrain') transformer.nodes([]);
    }
    selectedNode = node;
    if (node.attrs.name === 'terrain') {
        transformer.nodes([node]);
    } else {
        transformer.nodes([]); 
    }
    objectLayer.batchDraw();
}

function handleRightClickObject(e, node) {
    if (node.attrs.customType === 'terrain-shape') {
        e.evt.preventDefault(); 
        rightClickedObject = node;
        contextMenu.style.left = e.evt.clientX + 'px';
        contextMenu.style.top = e.evt.clientY + 'px';
        contextMenu.style.display = 'block';
    }
}

function bindObjectEvents(node) {
    node.on('click tap', (e) => {
        if (currentMode !== 'move') return; 
        handleSelectObject(node);
        e.cancelBubble = true; 
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
    
    objectLayer.batchDraw();
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
        draggable: true, customType: 'terrain-shape', name: 'terrain'
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

    objectLayer.batchDraw();
    switchToMoveMode();
}

function createObjectSprite(objectIndex, x, y) {
    let imagePath = '';
    let size = 60;
    if (objectIndex < 3) {
        imagePath = `object/ice-big-${objectIndex}.png`;
        size = 60;
    } else {
        imagePath = `object/ice-small-${objectIndex - 3}.png`;
        size = 40;
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
            objectType: objectIndex
        });
        
        objectLayer.add(konvaImage);
        bindObjectEvents(konvaImage);
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
    rightClickedObject.fill(fill);
    rightClickedObject.stroke(stroke);
    if (fill === 'transparent') {
        rightClickedObject.strokeWidth(4);
    } else {
        rightClickedObject.strokeWidth(6);
    }
    objectLayer.batchDraw();
    contextMenu.style.display = 'none';
});
document.addEventListener('click', () => { contextMenu.style.display = 'none'; });


// ==========================================
// 6. 戰術拉線與箭頭引擎 (【升級】：雷射筆 5 秒延遲消除機制)
// ==========================================

let isDrawing = false;
let tempShape = null;
let pointsLine = [];

stage.on('mousedown touchstart', function (e) {
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
            dash: (currentMode === 'arrow-dashed') ? [10, 5] : null
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
        tempShape.draggable(true); 
        bindObjectEvents(tempShape); 
    }
    tempShape = null;
    drawLayer.batchDraw();
});


// ==========================================
// 7. 系統控制、防呆與清除工具
// ==========================================

const colorStatus = document.getElementById('current-color-status');

function switchToMoveMode() {
    currentMode = 'move';
    stage.draggable(false); 
    // cancel any spawn mode when switching tools
    spawnMode = null;
    objectSpawnMode = null;
    document.getElementById('add-team-a').classList.remove('active');
    document.getElementById('add-team-b').classList.remove('active');
    document.getElementById('add-team-c').classList.remove('active');
    for (let i = 0; i <= 5; i++) {
        const btn = document.getElementById(`gen-object-${i}`);
        if (btn) btn.classList.remove('active');
    }
    drawLayer.find('.drawn-line').forEach(line => line.listening(true));
    updateButtonUI('btn-move');
    stage.container().style.cursor = 'default';
    stage.batchDraw();
}

function enableDrawMode(modeStr, btnId, cursor = 'precise') {
    currentMode = modeStr;
    stage.draggable(false); 
    transformer.nodes([]); 
    drawLayer.find('.drawn-line').forEach(line => line.listening(false));
    updateButtonUI(btnId);
    // cancel spawn mode when selecting a drawing/tool mode
    spawnMode = null;
    objectSpawnMode = null;
    document.getElementById('add-team-a').classList.remove('active');
    document.getElementById('add-team-b').classList.remove('active');
    document.getElementById('add-team-c').classList.remove('active');
    for (let i = 0; i <= 5; i++) {
        const btn = document.getElementById(`gen-object-${i}`);
        if (btn) btn.classList.remove('active');
    }
    stage.container().style.cursor = cursor;
    objectLayer.batchDraw();
    stage.batchDraw();
}

function handleColorButtonClick(color, tag, text) {
    // cancel spawn mode when changing color/tool
    spawnMode = null;
    objectSpawnMode = null;
    document.getElementById('add-team-a').classList.remove('active');
    document.getElementById('add-team-b').classList.remove('active');
    document.getElementById('add-team-c').classList.remove('active');
    for (let i = 0; i <= 5; i++) {
        const btn = document.getElementById(`gen-object-${i}`);
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
    }
    // visual feedback for add-team buttons
    document.getElementById('add-team-a').classList.toggle('active', spawnMode === 'team-a');
    document.getElementById('add-team-b').classList.toggle('active', spawnMode === 'team-b');
    document.getElementById('add-team-c').classList.toggle('active', spawnMode === 'team-c');
    // change cursor
    stage.container().style.cursor = spawnMode ? 'crosshair' : 'default';
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
    }
    // visual feedback for object buttons
    for (let i = 0; i <= 5; i++) {
        const btn = document.getElementById(`gen-object-${i}`);
        if (btn) btn.classList.toggle('active', objectSpawnMode === `object-${i}`);
    }
    // change cursor
    stage.container().style.cursor = objectSpawnMode ? 'crosshair' : 'default';
}

for (let i = 0; i <= 5; i++) {
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
        const offset = objIndex < 3 ? 30 : 20; // 30px offset for 60px size, 20px offset for 40px size
        createObjectSprite(objIndex, pos.x - offset, pos.y - offset); // center the image at click point
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
        switchToMoveMode();
    }
});

document.getElementById('add-shape-triangle').addEventListener('click', () => createTerrainShape('triangle'));
document.getElementById('add-shape-rect').addEventListener('click', () => createTerrainShape('rect'));
document.getElementById('add-shape-polygon').addEventListener('click', () => createTerrainShape('polygon'));
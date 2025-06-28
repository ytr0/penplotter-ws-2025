// // ===== svgParser.js =====
// // p5.js Editor の別タブ「svgParser.js」に配置

export const testFunction = function(x, y, z){
  return x*y*z;
}
export class MyClass{
  constructor(a){
    this.a = a;
  }
  getA(){
    return this.a*this.a;
  }
  setA(b){
    this.a = b;
  }
}

export const createMyClass = function(a){
  return new MyClass(a);
}


let usbDevice;
let hpglMain = "";
let svgData;
let paths = [];
let svgLoaded = false;

let previewScaleFactor = 2;
let outputScaleFactor = 2;
let applyMask = true;

// XYオフセットを定義
let offsetX = 0;
let offsetY = 0;

let noiseG, maskG;

const noisePatterns = [
  { name: "横縞ノイズ", type: "horizontal" },
  { name: "縦縞ノイズ", type: "vertical" },
  { name: "斜め右上がり", type: "diag1" },
  { name: "斜め左上がり", type: "diag2" },
  { name: "グリッドノイズ", type: "grid" },
  { name: "ランダムドット", type: "dots" },
  { name: "同心円ノイズ", type: "concentric" },
  { name: "ノイズ入り丸タイル", type: "noisy_circles" }
];

let noisePatternType = "horizontal";
let patternSelect;

function preload() {
  loadSVG("AMC.svg");
}

function setup() {
  createCanvas(600, 600);
  noiseG = createGraphics(width, height);
  maskG = createGraphics(width, height);

  patternSelect = createSelect();
  patternSelect.position(10, height + 10);
  for (let p of noisePatterns) {
    patternSelect.option(p.name, p.type);
  }
  patternSelect.value(noisePatternType);
  patternSelect.changed(() => {
    noisePatternType = patternSelect.value();
    redraw();
  });

  createButton("Generate").position(170, height + 10).mousePressed(() => redraw());
  createButton("Send to Plotter").position(270, height + 10).mousePressed(writeData);
  createButton("Toggle Mask").position(410, height + 10).mousePressed(() => {
    applyMask = !applyMask;
    redraw();
  });

  createSlider(0.5, 5, 2, 0.1).position(530, height + 10).input(e => {
    outputScaleFactor = e.target.value;
  });

  noLoop();
}

function draw() {
  clear();
  background(255);
  noiseG.clear();
  
  if (!svgLoaded) return;
  drawNoisePattern();
  if (applyMask) applySVGMask();
  else image(noiseG, 0, 0);
}

//---------------------
// 共通ノイズパス生成
//---------------------
function generateNoisePaths(patternType, width, height, spacing) {
  let paths = [];
  if (patternType === "horizontal") {
    for (let y = 0; y < height; y += spacing) {
      let pts = [];
      for (let x = 0; x < width; x += spacing) {
        let ny = y + map(noise(x*0.01, y*0.01), 0, 1, -20, 20);
        pts.push({x: x, y: ny});
      }
      paths.push(pts);
    }
  } else if (patternType === "vertical") {
    for (let x = 0; x < width; x += spacing) {
      let pts = [];
      for (let y = 0; y < height; y += spacing) {
        let nx = x + map(noise(x*0.01, y*0.01), 0, 1, -20, 20);
        pts.push({x: nx, y: y});
      }
      paths.push(pts);
    }
  } else if (patternType === "diag1") {
    for (let d = -width; d < width + height; d += spacing) {
      let pts = [];
      for (let x = 0; x < width; x += spacing) {
        let y = d + x;
        if (y >= 0 && y < height) {
          let nx = x + map(noise(x*0.012, y*0.012), 0, 1, -20, 20);
          let ny = y + map(noise(y*0.012, x*0.012), 0, 1, -20, 20);
          pts.push({x: nx, y: ny});
        }
      }
      if (pts.length > 1) paths.push(pts);
    }
  } else if (patternType === "diag2") {
    for (let d = 0; d < width + height; d += spacing) {
      let pts = [];
      for (let x = 0; x < width; x += spacing) {
        let y = d - x;
        if (y >= 0 && y < height) {
          let nx = x + map(noise(x*0.012, y*0.012+512), 0, 1, -20, 20);
          let ny = y + map(noise(y*0.012+512, x*0.012), 0, 1, -20, 20);
          pts.push({x: nx, y: ny});
        }
      }
      if (pts.length > 1) paths.push(pts);
    }
  } else if (patternType === "grid") {
    // 横
    for (let y = 0; y < height; y += spacing) {
      let pts = [];
      for (let x = 0; x < width; x += spacing) {
        let ny = y + map(noise(x*0.01, y*0.01), 0, 1, -20, 20);
        pts.push({x: x, y: ny});
      }
      if (pts.length > 1) paths.push(pts);
    }
    // 縦
    for (let x = 0; x < width; x += spacing) {
      let pts = [];
      for (let y = 0; y < height; y += spacing) {
        let nx = x + map(noise(x*0.01, y*0.01), 0, 1, -20, 20);
        pts.push({x: nx, y: y});
      }
      if (pts.length > 1) paths.push(pts);
    }
  } else if (patternType === "dots") {
    let pts = [];
    for (let y = 0; y < height; y += spacing) {
      for (let x = 0; x < width; x += spacing) {
        let nx = x + map(noise(x*0.04, y*0.04), 0, 1, -10, 10);
        let ny = y + map(noise((x+1000)*0.04, (y+1000)*0.04), 0, 1, -10, 10);
        pts.push({x: nx, y: ny});
      }
    }
    paths.push(pts);
  }  else if (patternType === "noisy_circles") {
    // マスク領域内をノイズ入りランダムサイズの円（敷き詰め）
    let circles = [];
    let tries = 0;
    let maxTries = 2000;
    let rMin = 12;
    let rMax = 30;
    while (tries < maxTries && circles.length < 90) {
      let r = random(rMin, rMax);
      let x = random(r, width - r);
      let y = random(r, height - r);
      // 円の重なりチェック
      let overlap = false;
      for (let c of circles) {
        let d = dist(x, y, c.x, c.y);
        if (d < r + c.r) {
          overlap = true;
          break;
        }
      }
      // マスク外ならパス
      if (!maskG || maskG.get(int(x), int(y))[0] <= 128) {
        overlap = true;
      }
      if (!overlap) {
        circles.push({ x, y, r });
      }
      tries++;
    }
    // 各円にノイズを加えて輪郭を作る
    for (let c of circles) {
      let pts = [];
      let steps = 36;
      for (let t = 0; t <= steps; t++) {
        let theta = (TWO_PI * t) / steps;
        let nr = c.r + map(noise(c.x * 0.04 + cos(theta), c.y * 0.04 + sin(theta)), 0, 1, -c.r * 0.2, c.r * 0.2);
        let x = c.x + nr * cos(theta);
        let y = c.y + nr * sin(theta);
        if (!maskG || maskG.get(int(x), int(y))[0] > 128)
          pts.push({ x, y });
      }
      if (pts.length > 2) paths.push(pts);
    }
  } 
  return paths;
  // return applyOffsetToPaths(paths);
}

//----------------------------
// 共通データから描画
//----------------------------
function drawNoisePattern() {
  noiseG.clear();
  noiseG.stroke(0);
  noiseG.noFill();
  let spacing = 10;
  let paths = generateNoisePaths(noisePatternType, width, height, spacing);

  if (noisePatternType === "dots") {
    noiseG.strokeWeight(2);
    for (let pt of paths[0]) {
      noiseG.point(pt.x, pt.y);
    }
    noiseG.strokeWeight(1);
  } else {
    for (let pts of paths) {
      noiseG.beginShape();
      for (let pt of pts) {
        noiseG.vertex(pt.x, pt.y);
      }
      noiseG.endShape();
    }
  }
}

//------------------------------
// 共通データからHPGL変換
//------------------------------
function convertNoiseToHPGL() {
  let spacing = 10;
  let paths = generateNoisePaths(noisePatternType, width, height, spacing);

  if (noisePatternType === "dots") {
    for (let pt of paths[0]) {
      let x = Math.round(pt.x), y = Math.round(pt.y);
      let px = Math.round(pt.x * outputScaleFactor), py = Math.round(pt.y * outputScaleFactor);
      let maskCol = applyMask ? maskG.get(x, y) : [255];
      if (maskCol[0] > 128) {
        hpglMain += `PU${px},${py};PD${px},${py};`; // 点を打つ
      }
    }
  } else {
    for (let pts of paths) {
      let inside = false;
      for (let pt of pts) {
        let x = Math.round(pt.x), y = Math.round(pt.y);
        let px = Math.round(pt.x * outputScaleFactor), py = Math.round(pt.y * outputScaleFactor);
        let maskCol = applyMask ? maskG.get(x, y) : [255];
        if (maskCol[0] > 128) {
          if (!inside) {
            hpglMain += `PU${px},${py};`;
            inside = true;
          } else {
            hpglMain += `PD${px},${py};`;
          }
        } else {
          inside = false;
        }
      }
    }
  }
}

//-----------------
// ここから下（loadSVG以降）は省略して構いません
//-----------------

function applySVGMask() {
  maskG.pixelDensity(1);
  maskG.clear();
  maskG.noStroke();
  maskG.fill(255);

  let bbox = getBoundingBox(paths);
  let scaleFactor = min(width / (bbox.maxX - bbox.minX), height / (bbox.maxY - bbox.minY));
  let offsetX = (width - (bbox.maxX - bbox.minX) * scaleFactor) / 2;
  let offsetY = (height - (bbox.maxY - bbox.minY) * scaleFactor) / 2;

  maskG.beginShape();
  paths.forEach(path => {
    path.forEach(pt => {
      maskG.vertex(
        (pt.x - bbox.minX) * scaleFactor + offsetX,
        (pt.y - bbox.minY) * scaleFactor + offsetY
      );
    });
  });
  maskG.endShape(CLOSE);

  let img = createImage(width, height);
  img.copy(noiseG, 0, 0, width, height, 0, 0, width, height);
  img.mask(maskG.get());

  image(img, 0, 0);
}















async function writeData() {
  hpglMain = "";
  convertNoiseToHPGL();

  const header = "IN;PA;!ST1,0;";
  const footer = "PU0,0;";
  const data = header + hpglMain + footer;

  try {
    const arr = new TextEncoder().encode(data);
    await usbDevice.transferOut(1, arr);
    console.log("Sent HPGL:", data);
  } catch (e) {
    await connectUSB();
  }
}


function loadSVG(filename) {
  loadXML(filename, xml => {
    svgData = xml;
    paths = parseGroup(svgData);
    svgLoaded = paths.length > 0;
  });
}

// <g> を再帰的にパース
function parseGroup(element) {
  let result = [];
  element.getChildren("path").forEach(p => {
    let d = p.getString("d");
    if (d) result.push(parseSVGPath(d));
  });
  element.getChildren("polygon").forEach(poly => {
    let pts = poly.getString("points");
    if (pts) result.push(parsePolygonPoints(pts));
  });
  element.getChildren("polyline").forEach(line => {
    let pts = line.getString("points");
    if (pts) result.push(parsePolygonPoints(pts));
  });
  element.getChildren("g").forEach(group => {
    result = result.concat(parseGroup(group));
  });
  return result;
}

function parsePolygonPoints(str) {
  let pts = str.trim().split(/\s+/).map(s => {
    let [x, y] = s.split(",").map(Number);
    return { x, y };
  });
  if (pts.length > 0) pts.push({ ...pts[0] });
  return pts;
}

function parseSVGPath(d) {
  let cmds = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d+(\.\d+)?/g);
  if (!cmds) return [];
  let current = { x: 0, y: 0 };
  let startPos = { x: 0, y: 0 };
  let lastCtrl = { x: 0, y: 0 };
  let arr = [];
  for (let i = 0; i < cmds.length; i++) {
    let cmd = cmds[i];
    switch (cmd) {
      case "M": case "m": {
        let rel = (cmd === "m");
        let x = parseFloat(cmds[++i]);
        let y = parseFloat(cmds[++i]);
        current.x = rel ? current.x + x : x;
        current.y = rel ? current.y + y : y;
        startPos = { ...current };
        arr.push({ ...current });
        break;
      }
      case "L": case "l": {
        let rel = (cmd === "l");
        let x = parseFloat(cmds[++i]);
        let y = parseFloat(cmds[++i]);
        current.x = rel ? current.x + x : x;
        current.y = rel ? current.y + y : y;
        arr.push({ ...current });
        break;
      }
      case "H": case "h": {
        let rel = (cmd === "h");
        let x = parseFloat(cmds[++i]);
        current.x = rel ? current.x + x : x;
        arr.push({ ...current });
        break;
      }
      case "V": case "v": {
        let rel = (cmd === "v");
        let y = parseFloat(cmds[++i]);
        current.y = rel ? current.y + y : y;
        arr.push({ ...current });
        break;
      }
      case "C": case "c": {
        let rel = (cmd === "c");
        let x1 = parseFloat(cmds[++i]), y1 = parseFloat(cmds[++i]);
        let x2 = parseFloat(cmds[++i]), y2 = parseFloat(cmds[++i]);
        let x3 = parseFloat(cmds[++i]), y3 = parseFloat(cmds[++i]);
        let p0 = { ...current };
        let p1 = { x: rel ? current.x + x1 : x1, y: rel ? current.y + y1 : y1 };
        let p2 = { x: rel ? current.x + x2 : x2, y: rel ? current.y + y2 : y2 };
        let p3 = { x: rel ? current.x + x3 : x3, y: rel ? current.y + y3 : y3 };
        arr = arr.concat(approximateBezier(p0, p1, p2, p3));
        current = { ...p3 };
        lastCtrl = { ...p2 };
        break;
      }
      case "S": case "s": {
        let rel = (cmd === "s");
        let p1 = { x: 2 * current.x - lastCtrl.x, y: 2 * current.y - lastCtrl.y };
        let x2 = parseFloat(cmds[++i]), y2 = parseFloat(cmds[++i]);
        let x3 = parseFloat(cmds[++i]), y3 = parseFloat(cmds[++i]);
        let p2 = { x: rel ? current.x + x2 : x2, y: rel ? current.y + y2 : y2 };
        let p3 = { x: rel ? current.x + x3 : x3, y: rel ? current.y + y3 : y3 };
        arr = arr.concat(approximateBezier(current, p1, p2, p3));
        current = { ...p3 };
        lastCtrl = { ...p2 };
        break;
      }
      case "Z": case "z":
        arr.push({ ...startPos });
        current = { ...startPos };
        break;
    }
  }
  return arr.filter((pt, i, a) => i === 0 || pt.x !== a[i - 1].x || pt.y !== a[i - 1].y);
}

function approximateBezier(p0, p1, p2, p3, segments = 50) {
  let out = [];
  for (let t = 0; t <= 1; t += 1 / segments) {
    let x =
      pow(1 - t, 3) * p0.x +
      3 * pow(1 - t, 2) * t * p1.x +
      3 * (1 - t) * pow(t, 2) * p2.x +
      pow(t, 3) * p3.x;
    let y =
      pow(1 - t, 3) * p0.y +
      3 * pow(1 - t, 2) * t * p1.y +
      3 * (1 - t) * pow(t, 2) * p2.y +
      pow(t, 3) * p3.y;
    out.push({ x, y });
  }
  return out;
}

function getBoundingBox(ps) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ps.forEach(path => path.forEach(pt => {
    minX = min(minX, pt.x);
    minY = min(minY, pt.y);
    maxX = max(maxX, pt.x);
    maxY = max(maxY, pt.y);
  }));
  return { minX, minY, maxX, maxY };
}

async function connectUSB() {
  try {
    usbDevice = await navigator.usb.requestDevice({ filters: [] });
    await usbDevice.open();
    await usbDevice.selectConfiguration(1);
    await usbDevice.claimInterface(0);
    console.log("USB connected:", usbDevice.productName);
  } catch (e) {
    console.error("USB Error:", e);
  }
}

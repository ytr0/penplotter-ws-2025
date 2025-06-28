// ===== svgParser.js =====
// p5.js Editorの別タブに作成
// SVGパース関数をグローバル関数として定義
function approximateBezier(p0, p1, p2, p3, segments = 50) {
  const points = [];
  for (let t = 0; t <= 1; t += 1 / segments) {
    const x = Math.pow(1 - t, 3) * p0.x
            + 3 * Math.pow(1 - t, 2) * t * p1.x
            + 3 * (1 - t) * Math.pow(t, 2) * p2.x 
            + Math.pow(t, 3) * p3.x;
    const y = Math.pow(1 - t, 3) * p0.y
            + 3 * Math.pow(1 - t, 2) * t * p1.y
            + 3 * (1 - t) * Math.pow(t, 2) * p2.y 
            + Math.pow(t, 3) * p3.y;
    points.push({ x, y });
  }
  return points;
}

function removeDuplicatePoints(path) {
  return path.filter((pt, i, arr) => i === 0 || pt.x !== arr[i-1].x || pt.y !== arr[i-1].y);
}

function parseSVGPath(d) {
  const cmds = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d+(?:\.\d+)?/g);
  if (!cmds) return [];

  let i = 0;
  let current = { x: 0, y: 0 }, start = { x: 0, y: 0 }, lastCtrl = { x: 0, y: 0 };
  let out = [];

  while (i < cmds.length) {
    const cmd = cmds[i++];
    switch (cmd) {
      case 'M': current.x = parseFloat(cmds[i++]); current.y = parseFloat(cmds[i++]); start = {...current}; out.push({...current}); break;
      case 'm': current.x += parseFloat(cmds[i++]); current.y += parseFloat(cmds[i++]); start = {...current}; out.push({...current}); break;
      case 'L': current.x = parseFloat(cmds[i++]); current.y = parseFloat(cmds[i++]); out.push({...current}); break;
      case 'l': current.x += parseFloat(cmds[i++]); current.y += parseFloat(cmds[i++]); out.push({...current}); break;
      case 'H': current.x = parseFloat(cmds[i++]); out.push({...current}); break;
      case 'h': current.x += parseFloat(cmds[i++]); out.push({...current}); break;
      case 'V': current.y = parseFloat(cmds[i++]); out.push({...current}); break;
      case 'v': current.y += parseFloat(cmds[i++]); out.push({...current}); break;
      case 'C':
      case 'c': {
        const rel = cmd === 'c';
        const x1 = parseFloat(cmds[i++]) + (rel ? current.x : 0);
        const y1 = parseFloat(cmds[i++]) + (rel ? current.y : 0);
        const x2 = parseFloat(cmds[i++]) + (rel ? current.x : 0);
        const y2 = parseFloat(cmds[i++]) + (rel ? current.y : 0);
        const x3 = parseFloat(cmds[i++]) + (rel ? current.x : 0);
        const y3 = parseFloat(cmds[i++]) + (rel ? current.y : 0);
        const bez = approximateBezier(current, {x:x1,y:y1}, {x:x2,y:y2}, {x:x3,y:y3});
        out = out.concat(bez);
        lastCtrl = { x: x2, y: y2 };
        current = { x: x3, y: y3 };
        break;
      }
      case 'S':
      case 's': {
        const rel = cmd === 's';
        const x1 = 2*current.x - lastCtrl.x;
        const y1 = 2*current.y - lastCtrl.y;
        const x2 = parseFloat(cmds[i++]) + (rel ? current.x : 0);
        const y2 = parseFloat(cmds[i++]) + (rel ? current.y : 0);
        const x3 = parseFloat(cmds[i++]) + (rel ? current.x : 0);
        const y3 = parseFloat(cmds[i++]) + (rel ? current.y : 0);
        const bez = approximateBezier(current, {x:x1,y:y1}, {x:x2,y:y2}, {x:x3,y:y3});
        out = out.concat(bez);
        lastCtrl = { x: x2, y: y2 };
        current = { x: x3, y: y3 };
        break;
      }
      case 'Z':
      case 'z': out.push({...start}); current = {...start}; break;
    }
  }

  return removeDuplicatePoints(out);
}

function parseGroup(element) {
  let all = [];
  for (const child of element.children) {
    if (child.tagName === 'path') {
      const d = child.getAttribute('d');
      if (d) all.push(parseSVGPath(d));
    } else if (child.tagName === 'g') {
      all = all.concat(parseGroup(child));
    }
  }
  return all;
}

function parsePolygonPoints(str) {
  const pts = str.trim().split(/\s+/).map(s => {
    const [x,y] = s.split(',').map(Number);
    return { x, y };
  });
  if (pts.length) pts.push(pts[0]);
  return pts;
}

function loadSVGPaths(filename, callback) {
  loadXML(filename, xml => {
    const svg = xml;
    const paths = [];
    svg.getChildren('path').forEach(p => {
      const d = p.getString('d');
      if (d) paths.push(parseSVGPath(d));
    });
    svg.getChildren('polygon').forEach(poly => {
      const pts = poly.getString('points');
      if (pts) paths.push(parsePolygonPoints(pts));
    });
    callback(paths);
  });
}







//----------------------------------------------------
// ここから プロッタ用 (HPGL) コマンド出力のための関数
//----------------------------------------------------

function pbeginShape() {
  // HPGL出力用のフラグなどを初期化
  vactive = true;
  firstPoint = true;
}

function pendShape() {
  vactive = false;
}

function pvertex(x, y) {
  // pvertex ではHPGL用に変換して文字列を作る
  if (!vactive) return;

  // plotterScaleFactor を使って拡大
  let xPen = Math.trunc(y * plotterScaleFactor);
  let yPen = Math.trunc(x * plotterScaleFactor);

  samePoint = false;
  if (xPenNow === xPen && yPenNow === yPen) {
    samePoint = true;
  }

  if (firstPoint && !samePoint) {
    // ペンを上げた状態(PU)で移動
    hpglMain += "PU" + xPen + "," + yPen + ";";
  } else {
    // ペンを下ろした状態(PD)で移動
    hpglMain += "PD" + xPen + "," + yPen + ";";
  }
  firstPoint = false;

  xPenNow = xPen;
  yPenNow = yPen;
}

// 実際にHPGL出力用の描画関数
function drawSVGForPlotter() {
  // HPGL用の描画では、画面には描画しない（または簡易プレビューするだけ）
  for (let path of paths) {
    if (!path || path.length === 0) continue;

    pbeginShape();
    for (let point of path) {
      if (point) {
        // pvertexはHPGL文字列をhpglMainに追記
        pvertex(point.x, point.y);
      } else {
        pendShape();
        pbeginShape();
      }
    }
    pendShape();
  }
}

// 何かしらのボタンを押したときに「プロッタ用のHPGL文字列」を作る流れ
async function writeData() {
  // まず HPGL 用の文字列を作る
  hpglMain = "";  // 毎回クリアして作り直す
  drawSVGForPlotter();

  // HPGL全体組み立て
  const hpglHeader = "IN;PA;!ST1,0;";
  const hpglFooter = "PU0,0;";
  let hpglData = hpglHeader + hpglMain + hpglFooter;

  // USB書き込み
  try {
    console.log("transferOut Start");
    const dataArray = new TextEncoder().encode(hpglData);
    await usbDevice.transferOut(1, dataArray);
    console.log(hpglData);
    console.log("transferOut End");
  } catch (error) {
    // もし未接続なら接続を試みる
    await connectUSB();
    // await writeData();
  }
}

// そのほか補助関数
function pline(x1, y1, x2, y2) {
  pbeginShape();
  pvertex(x1, y1);
  pvertex(x2, y2);
  pendShape();
}

function prect(x, y, w, h) {
  pbeginShape();
  pvertex(x, y);
  pvertex(x + w, y);
  pvertex(x + w, y + h);
  pvertex(x, y + h);
  pvertex(x, y);
  pendShape();
}

function pellipse(x, y, w, h) {
  let xe, ye;
  pbeginShape();
  for (let i = 0; i <= 180; i++) {
    xe = (w / 2) * sin(radians(i * 2)) + x;
    ye = (h / 2) * cos(radians(i * 2 + 180)) + y;
    pvertex(xe, ye);
  }
  pendShape();
}

async function disconnectUSB() {
  if (usbDevice && usbDevice.opened) {
    try {
      await usbDevice.close();
      console.log("USB device closed.");
    } catch (error) {
      console.error("Error closing USB device:", error);
    }
  } else {
    console.log("No USB device to close or already closed.");
  }
}

// USB接続
async function connectUSB() {
  try {
    if (usbDevice && usbDevice.opened) {
      console.log("Disconnecting previous connection...");
      await disconnectUSB();
    }

    usbDevice = await navigator.usb.requestDevice({ filters: [] });
    console.log(usbDevice.productName);

    await usbDevice.open();
    console.log("open");
    await usbDevice.selectConfiguration(1);
    await usbDevice.claimInterface(0);
    console.log("USB device claimed.");
  } catch (error) {
    console.error("Error connecting to USB device:", error);
  }
}


// ボタン設定
function buttonSetting() {
  let sendButton = createButton("Send to Plotter");
  sendButton.mousePressed(writeData);
  sendButton.style('border-radius', '10px');
  sendButton.style('width', '600px');
  sendButton.style('height', '40px');
  sendButton.style('border', 'none');
  sendButton.style('background-color', '#555');
  sendButton.style('border', '2px solid #fff');
  sendButton.style('color', '#ffffff');
}

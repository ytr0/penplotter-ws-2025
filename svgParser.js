// ===== svgParser.js =====
// p5.js Editor の別タブ「svgParser.js」に配置

// --- SVG パース／ユーティリティ関数 ---
export function approximateBezier(p0, p1, p2, p3, segments = 50) {
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

export function removeDuplicatePoints(path) {
  return path.filter((pt, i, arr) => i === 0 || pt.x !== arr[i - 1].x || pt.y !== arr[i - 1].y);
}

export function parseSVGPath(d) {
  const cmds = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d+(?:\.\d+)?/g);
  if (!cmds) return [];

  let i = 0;
  let current = { x: 0, y: 0 }, start = { x: 0, y: 0 }, lastCtrl = { x: 0, y: 0 };
  const out = [];

  while (i < cmds.length) {
    const cmd = cmds[i++];
    switch (cmd) {
      case 'M': case 'm': {
        const rel = cmd === 'm';
        const x = parseFloat(cmds[i++]) + (rel ? current.x : 0);
        const y = parseFloat(cmds[i++]) + (rel ? current.y : 0);
        current = { x, y };
        start = { ...current };
        out.push({ ...current });
        break;
      }
      case 'L': case 'l': {
        const rel = cmd === 'l';
        const x = parseFloat(cmds[i++]) + (rel ? current.x : 0);
        const y = parseFloat(cmds[i++]) + (rel ? current.y : 0);
        current = { x, y };
        out.push({ ...current });
        break;
      }
      case 'H': case 'h': {
        const rel = cmd === 'h';
        const x = parseFloat(cmds[i++]);
        current.x = rel ? current.x + x : x;
        out.push({ ...current });
        break;
      }
      case 'V': case 'v': {
        const rel = cmd === 'v';
        const y = parseFloat(cmds[i++]);
        current.y = rel ? current.y + y : y;
        out.push({ ...current });
        break;
      }
      case 'C': case 'c': {
        const rel = cmd === 'c';
        const x1 = parseFloat(cmds[i++]) + (rel ? current.x : 0);
        const y1 = parseFloat(cmds[i++]) + (rel ? current.y : 0);
        const x2 = parseFloat(cmds[i++]) + (rel ? current.x : 0);
        const y2 = parseFloat(cmds[i++]) + (rel ? current.y : 0);
        const x3 = parseFloat(cmds[i++]) + (rel ? current.x : 0);
        const y3 = parseFloat(cmds[i++]) + (rel ? current.y : 0);
        out.push(...approximateBezier(current, { x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }));
        lastCtrl = { x: x2, y: y2 };
        current = { x: x3, y: y3 };
        break;
      }
      case 'S': case 's': {
        const rel = cmd === 's';
        const x1 = 2 * current.x - lastCtrl.x;
        const y1 = 2 * current.y - lastCtrl.y;
        const x2 = parseFloat(cmds[i++]) + (rel ? current.x : 0);
        const y2 = parseFloat(cmds[i++]) + (rel ? current.y : 0);
        const x3 = parseFloat(cmds[i++]) + (rel ? current.x : 0);
        const y3 = parseFloat(cmds[i++]) + (rel ? current.y : 0);
        out.push(...approximateBezier(current, { x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }));
        lastCtrl = { x: x2, y: y2 };
        current = { x: x3, y: y3 };
        break;
      }
      case 'Z': case 'z':
        out.push({ ...start });
        current = { ...start };
        break;
    }
  }
  return removeDuplicatePoints(out);
}

export function parseGroup(element) {
  let all = [];
  Array.from(element.children).forEach(child => {
    if (child.tagName === 'path') {
      const d = child.getAttribute('d');
      if (d) all.push(parseSVGPath(d));
    } else if (child.tagName === 'g') {
      all = all.concat(parseGroup(child));
    }
  });
  return all;
}

export function parsePolygonPoints(str) {
  const pts = str.trim().split(/\s+/).map(s => {
    const [x, y] = s.split(',').map(Number);
    return { x, y };
  });
  if (pts.length) pts.push(pts[0]);
  return pts;
}

export function loadSVGPaths(filename, callback) {
  loadXML(filename, xml => {
    const paths = [];
    Array.from(xml.getChildren('path')).forEach(p => {
      const d = p.getString('d');
      if (d) paths.push(parseSVGPath(d));
    });
    Array.from(xml.getChildren('polygon')).forEach(poly => {
      const pts = poly.getString('points');
      if (pts) paths.push(parsePolygonPoints(pts));
    });
    callback(paths);
  });
}

// --- HPGL／USB／ボタン関係関数 ---
export function pbeginShape() { vactive = true; firstPoint = true; }
export function pendShape() { vactive = false; }
export function pvertex(x, y, plotterScaleFactor) {
  if (!vactive) return;
  const xPen = Math.trunc(y * plotterScaleFactor);
  const yPen = Math.trunc(x * plotterScaleFactor);
  if (firstPoint) {
    hpglMain += `PU${xPen},${yPen};`;
    firstPoint = false;
  } else {
    hpglMain += `PD${xPen},${yPen};`;
  }
  xPenNow = xPen;
  yPenNow = yPen;
}
export function drawSVGForPlotter(paths, plotterScaleFactor) {
  paths.forEach(path => {
    pbeginShape();
    path.forEach(pt => pvertex(pt.x, pt.y, plotterScaleFactor));
    pendShape();
  });
}
export async function writeData(usbDevice, paths, plotterScaleFactor) {
  hpglMain = '';
  drawSVGForPlotter(paths, plotterScaleFactor);
  const header = 'IN;PA;!ST1,0;';
  const footer = 'PU0,0;';
  const data = header + hpglMain + footer;
  await usbDevice.transferOut(1, new TextEncoder().encode(data));
}
export function pline(x1, y1, x2, y2, plotterScaleFactor) {
  pbeginShape(); pvertex(x1, y1, plotterScaleFactor); pvertex(x2, y2, plotterScaleFactor);
  pendShape();
}
export function prect(x, y, w, h, plotterScaleFactor) {
  pline(x, y, x + w, y, plotterScaleFactor);
  pline(x + w, y, x + w, y + h, plotterScaleFactor);
  pline(x + w, y + h, x, y + h, plotterScaleFactor);
  pline(x, y + h, x, y, plotterScaleFactor);
}
export function pellipse(x, y, w, h, plotterScaleFactor) {
  pbeginShape();
  for (let i = 0; i <= 180; i++) {
    const xe = (w / 2) * Math.sin(p.radians(i * 2)) + x;
    const ye = (h / 2) * Math.cos(p.radians(i * 2 + 180)) + y;
    pvertex(xe, ye, plotterScaleFactor);
  }
  pendShape();
}
export async function disconnectUSB(usbDevice) {
  if (usbDevice && usbDevice.opened) await usbDevice.close();
}
export async function connectUSB(filter = []) {
  const device = await navigator.usb.requestDevice({ filters: filter });
  await device.open(); await device.selectConfiguration(1); await device.claimInterface(0);
  return device;
}
export function buttonSetting(p, writeCallback) {
  const btn = p.createButton('Send to Plotter');
  btn.mousePressed(writeCallback);
  btn.style('border-radius', '10px'); btn.style('width', '600px');
  btn.style('height', '40px'); btn.style('background-color', '#555');
  btn.style('border', '2px solid #fff'); btn.style('color', '#fff');
}

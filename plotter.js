// 省略: pline, prect, pellipse, USB 接続・転送関数……


//----------これより下は変更しない----------//

export function pbeginShape(){
  beginShape();
  vactive    = true;
  firstPoint = true;
}

export function pendShape(){
  endShape();
  vactive = false;
}

export function pvertex(x, y) {
  // ① 画面に描く
  vertex(x, y);
  if (!vactive) return;

  // ② プロッタ座標変換＋キャリブレーション
  const xPen = Math.round(x * scale + penOffsetX);
  const yPen = Math.round((height - y) * scale + penOffsetY);

  // ③ 最初の頂点なら PU→PD、
  //    ２点目以降は PD だけ
  if (firstPoint) {
    hpglMain += `PU${xPen},${yPen};PD;`;
    firstPoint = false;
  } else {
    hpglMain += `PD${xPen},${yPen};`;
  }

  // ④ 座標更新（samePoint はもう不要）
  xPenNow = xPen;
  yPenNow = yPen;
}


export function pline(x1, y1, x2, y2){
  pbeginShape();
    pvertex(x1, y1);
    pvertex(x2, y2);
  pendShape();
}

export function prect(x, y, w, h){
  pbeginShape();
    pvertex(x    , y    );
    pvertex(x + w, y    );
    pvertex(x + w, y + h);
    pvertex(x    , y + h);
    pvertex(x    , y    );
  pendShape();
}

export function pellipse(cx, cy, w, h, detail = 180){
  pbeginShape();
    for (let i = 0; i <= detail; i++){
      let a = map(i, 0, detail, 0, TWO_PI);
      let xx = cx + cos(a) * (w / 2);
      let yy = cy + sin(a) * (h / 2);
      pvertex(xx, yy);
    }
  pendShape();
}

export function buttonSetting(){
  let btn = createButton("Send to Plotter");
  btn.mousePressed(writeData);
  btn.style('border-radius','5px');
  btn.style('width','600px');
  btn.style('height','40px');
  btn.style('border','none');
  btn.style('background-color','#555');
  btn.style('border','2px solid #fff');
  btn.style('color','#fff');
}

export async function connectUSB(){
  try {
    usbDevice = await navigator.usb.requestDevice({ filters: [] });
    await usbDevice.open();
    await usbDevice.selectConfiguration(1);
    await usbDevice.claimInterface(0);
    await usbDevice.selectAlternateInterface(0,0);
    console.log("USB connected");
  } catch (e) {
    console.error(e);
  }
}

export async function writeData(){
  const hdr = "IN;PA;!ST1,0;";
  const ftr = "PU0,0;";
  const data = hdr + hpglMain + ftr;
  try {
    console.log("Transfer start");
    await usbDevice.transferOut(1, new TextEncoder().encode(data));
    console.log("HPGL:", data);
    console.log("Transfer done");
  } catch {
    console.warn("Retry connecting...");
    await connectUSB();
    await writeData();
  }
}

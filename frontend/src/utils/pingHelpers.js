const IP_REGEX = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/;

export function parseTracerouteLine(line) {
  const hopMatch = line.match(/^\s*(\d+)\s+(.+)$/);
  if (!hopMatch) return null;
  const hopNum = hopMatch[1];
  const rest = hopMatch[2];
  if (rest.trim() === "* * *") return { hop: hopNum, ip: null, hostname: null, timeout: true, raw: line };
  const ipMatch = rest.match(IP_REGEX);
  const hostMatch = rest.match(/^([^\s(]+)\s*\(/);
  return { hop: hopNum, ip: ipMatch ? ipMatch[1] : null, hostname: hostMatch ? hostMatch[1] : null, timeout: false, raw: line };
}

export function parsePingLine(line) {
  const m = line.match(/time=([\d.]+)\s*ms/);
  const seq = line.match(/icmp_seq=(\d+)/);
  return { time: m ? parseFloat(m[1]) : null, seq: seq ? seq[1] : null };
}

export function buildTraceSvg(hops, target, isDark) {
  const bg = isDark ? "#0d1117" : "#ffffff";
  const mu = isDark ? "#8b949e" : "#718096";
  const bo = isDark ? "#30363d" : "#e2e8f0";
  const od = isDark ? "#161b22" : "#f7fafc";
  const ac = isDark ? "#58a6ff" : "#3182ce";
  const ok = hops.filter(h => h.ip || h.timeout);
  const rowH = 26, headerH = 40, padX = 20;
  const colW = [44, 140, 210, 80];
  const totalW = colW.reduce((a, b) => a + b, 0) + padX * 2;
  const totalH = headerH + rowH * ok.length + padX;
  const hdrLabels = ["#", "IP Address", "Hostname", "RTT"];
  let hdrSvg = "", hx = padX;
  for (let j = 0; j < hdrLabels.length; j++) {
    hdrSvg += `<text x="${hx + 6}" y="26" font-family="monospace" font-size="10" font-weight="bold" fill="${mu}">${hdrLabels[j]}</text>`;
    hx += colW[j];
  }
  let rowsSvg = "";
  for (let i = 0; i < ok.length; i++) {
    const h = ok[i];
    const y = headerH + i * rowH;
    if (i % 2 === 1) rowsSvg += `<rect x="${padX}" y="${y}" width="${totalW - padX * 2}" height="${rowH}" fill="${od}" />`;
    let rx = padX;
    rowsSvg += `<text x="${rx + colW[0] / 2}" y="${y + 17}" text-anchor="middle" font-family="monospace" font-size="12" fill="${mu}">${h.hop}</text>`;
    rx += colW[0];
    rowsSvg += h.timeout
      ? `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="#ef4444">* * *</text>`
      : `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="${ac}">${h.ip}</text>`;
    rx += colW[1];
    rowsSvg += `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="${mu}">${h.hostname || "-"}</text>`;
    rx += colW[2];
    rowsSvg += `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="${mu}">-</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">`
    + `<rect width="${totalW}" height="${totalH}" fill="${bg}" />`
    + `<rect x="${padX}" y="8" width="${totalW - padX * 2}" height="${headerH - 8}" fill="${od}" rx="4" />`
    + hdrSvg
    + `<line x1="${padX}" y1="${headerH}" x2="${totalW - padX}" y2="${headerH}" stroke="${bo}" stroke-width="1" />`
    + rowsSvg + `</svg>`;
}

export function buildMtrSvg(mtrHops, target, isDark) {
  const bg = isDark ? "#0d1117" : "#ffffff";
  const mu = isDark ? "#8b949e" : "#718096";
  const bo = isDark ? "#30363d" : "#e2e8f0";
  const od = isDark ? "#161b22" : "#f7fafc";
  const ac = isDark ? "#58a6ff" : "#3182ce";
  const green = "#22c55e", yellow = "#f59e0b", red = "#ef4444";
  const rttC = v => v < 50 ? green : v < 150 ? yellow : red;
  const lossC = v => v === 0 ? green : v < 50 ? yellow : red;
  const rowH = 26, headerH = 40, padX = 20;
  const colW = [36, 180, 64, 44, 56, 56, 56, 56, 56];
  const hdrLabels = ["#", "Host", "Loss%", "Snt", "Last", "Avg", "Best", "Worst", "StDev"];
  const totalW = colW.reduce((a, b) => a + b, 0) + padX * 2;
  const totalH = headerH + rowH * mtrHops.length + padX;
  let hdrSvg = "", hx = padX;
  for (let j = 0; j < hdrLabels.length; j++) {
    hdrSvg += `<text x="${hx + 6}" y="26" font-family="monospace" font-size="10" font-weight="bold" fill="${mu}">${hdrLabels[j]}</text>`;
    hx += colW[j];
  }
  let rowsSvg = "";
  for (let i = 0; i < mtrHops.length; i++) {
    const h = mtrHops[i];
    const isTimeout = h.host === "???" || h["Loss%"] === 100;
    const y = headerH + i * rowH;
    if (i % 2 === 1) rowsSvg += `<rect x="${padX}" y="${y}" width="${totalW - padX * 2}" height="${rowH}" fill="${od}" />`;
    let rx = padX;
    rowsSvg += `<text x="${rx + colW[0] / 2}" y="${y + 17}" text-anchor="middle" font-family="monospace" font-size="12" fill="${mu}">${h.count}</text>`;
    rx += colW[0];
    rowsSvg += `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="${isTimeout ? red : ac}">${isTimeout ? "* * *" : h.host}</text>`;
    rx += colW[1];
    rowsSvg += `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="${lossC(h['Loss%'])}">${h['Loss%'].toFixed(1)}%</text>`;
    rx += colW[2];
    rowsSvg += `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="${mu}">${h.Snt}</text>`;
    rx += colW[3];
    const vals = [h.Last, h.Avg, h.Best, h.Wrst, h.StDev];
    const vCols = [colW[4], colW[5], colW[6], colW[7], colW[8]];
    for (let k = 0; k < vals.length; k++) {
      const color = isTimeout ? mu : (k < 4 ? rttC(vals[k]) : mu);
      rowsSvg += `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="${color}">${isTimeout ? "-" : vals[k].toFixed(1)}</text>`;
      rx += vCols[k];
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">`
    + `<rect width="${totalW}" height="${totalH}" fill="${bg}" />`
    + `<rect x="${padX}" y="8" width="${totalW - padX * 2}" height="${headerH - 8}" fill="${od}" rx="4" />`
    + hdrSvg
    + `<line x1="${padX}" y1="${headerH}" x2="${totalW - padX}" y2="${headerH}" stroke="${bo}" stroke-width="1" />`
    + rowsSvg + `</svg>`;
}

export function openSvgInTab(svgStr, title, bg, mu) {
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const html = `<!DOCTYPE html><html><head><title>${title}</title>`
    + `<style>*{margin:0;padding:0;box-sizing:border-box}body{background:${bg};display:flex;flex-direction:column;align-items:center;padding:20px;font-family:monospace;gap:12px}`
    + `img{max-width:100%;display:block;cursor:default}`
    + `.toolbar{display:flex;gap:10px;align-items:center}`
    + `.btn{padding:6px 16px;font-size:12px;font-family:monospace;border-radius:6px;border:1px solid ${mu};background:transparent;color:${mu};cursor:pointer}`
    + `.btn:hover{border-color:${mu};opacity:0.8}`
    + `.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;padding:8px 18px;border-radius:8px;font-size:12px;opacity:0;transition:opacity 0.3s;pointer-events:none}`
    + `.toast.show{opacity:1}`
    + `.hint{font-size:11px;color:${mu};opacity:0.6}</style></head><body>`
    + `<img id="img" src="${url}" />`
    + `<div class="toolbar">`
    + `<button class="btn" onclick="copyImg()">Copy Image</button>`
    + `<span class="hint">or right-click image → Copy Image</span>`
    + `</div>`
    + `<div class="toast" id="toast">Image copied!</div>`
    + `<script>
function copyImg(){
  var img=document.getElementById('img');
  var canvas=document.createElement('canvas');
  canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
  var ctx=canvas.getContext('2d');
  ctx.drawImage(img,0,0);
  canvas.toBlob(function(blob){
    try{
      navigator.clipboard.write([new ClipboardItem({'image/png':blob})]).then(function(){showToast();}).catch(function(){showToast('Copy failed — try right-click');});
    }catch(e){showToast('Copy failed — try right-click');}
  },'image/png');
}
function showToast(msg){
  var t=document.getElementById('toast');
  t.textContent=msg||'Image copied!';
  t.className='toast show';
  setTimeout(function(){t.className='toast';},2500);
}
</script></body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('C:/Users/wis/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = __dirname;
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(out, 'icon-original.png')).toString('base64');
const base = `*{box-sizing:border-box}body{margin:0;width:1920px;height:1080px;overflow:hidden;font-family:Arial,"Microsoft YaHei UI",sans-serif;color:#152943;background:#f3f7fc}.brand{position:absolute;left:112px;top:86px;display:flex;align-items:center;gap:20px;font-size:26px;font-weight:600;letter-spacing:-.5px}.brand img{width:60px;height:60px}.eyebrow{font-size:21px;letter-spacing:4px;text-transform:uppercase;color:#71849b}.footer{position:absolute;left:112px;bottom:78px;font-size:20px;color:#738399;letter-spacing:1px}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#0d99ff;margin:0 18px 3px}.paper{position:absolute;background:white;border:1px solid #e0e8f1;border-radius:12px;box-shadow:0 30px 65px #19375412}.rule{height:9px;border-radius:8px;background:#e7edf4}.arrow{color:#0d99ff;font-size:70px;font-weight:300}`;
const brand = `<div class="brand"><img src="${icon}"/><span>Editable PDF Exporter</span></div>`;
const cover = `<!DOCTYPE html><meta charset="utf-8"><style>${base}
.wash{position:absolute;width:990px;height:990px;right:-150px;top:40px;border-radius:50%;background:radial-gradient(circle,#dceeff 0%,#edf5fd 59%,#f3f7fc00 72%)}
.title{position:absolute;left:112px;top:327px;font-size:100px;font-weight:650;line-height:1.14;letter-spacing:-6px}.title span{color:#0d99ff}.subtitle{position:absolute;left:116px;top:582px;font-size:34px;color:#61758e;letter-spacing:-1px}
.back{width:416px;height:570px;left:1080px;top:204px;transform:rotate(-12deg);background:#eaf4ff;border-color:#c8e2fa}.back2{width:416px;height:570px;left:1197px;top:264px;transform:rotate(9deg)}
.front{width:458px;height:600px;left:1120px;top:268px;transform:rotate(-3deg);padding:44px}.paper-label{font-size:15px;letter-spacing:3px;color:#758aa3;display:flex;justify-content:space-between}.pill{color:#0d99ff;background:#eaf5ff;padding:7px 12px;border-radius:5px;font-weight:bold;letter-spacing:1px;margin-top:-7px}.selected{position:relative;margin-top:63px;font-size:138px;line-height:1.1;letter-spacing:-9px;width:282px;background:#e1f1ff;border:2px solid #0d99ff;color:#142d4a;padding:2px 17px 12px}.selected:after{content:'';position:absolute;top:18px;bottom:20px;right:36px;border-right:3px solid #0d99ff}.handle{position:absolute;width:9px;height:9px;background:white;border:2px solid #0d99ff}.tl{top:-5px;left:-5px}.tr{top:-5px;right:-5px}.bl{bottom:-5px;left:-5px}.br{bottom:-5px;right:-5px}.rules{margin-top:41px;display:grid;gap:14px}.mini{display:flex;gap:10px;margin-top:39px}.mini i{width:58px;height:40px;border-radius:5px;background:#ebf5ff}.mini i:nth-child(2){background:#d8ecff}.mini i:nth-child(3){background:#0d99ff}.cursor{position:absolute;left:1477px;top:568px;filter:drop-shadow(0 5px 4px #1a355b22)}
</style><div class="wash"></div>${brand}<div class="title">Figma <span>→</span> PDF<br>Editable text.</div><div class="subtitle">Your design. Ready for the next edit.</div><div class="paper back"></div><div class="paper back2"></div><div class="paper front"><div class="paper-label">DESIGN NOTES<span class="pill">PDF</span></div><div class="selected">Aa<span class="handle tl"></span><span class="handle tr"></span><span class="handle bl"></span><span class="handle br"></span></div><div class="rules"><div class="rule"></div><div class="rule" style="width:88%"></div><div class="rule" style="width:64%"></div></div><div class="mini"><i></i><i></i><i></i></div></div><svg class="cursor" width="64" height="78" viewBox="0 0 64 78"><path d="M6 4L53 43L32 46L24 68Z" fill="#16314f" stroke="white" stroke-width="5" stroke-linejoin="round"/></svg><div class="footer">MULTI-PAGE PDF<span class="dot"></span>LOCAL PROCESSING</div>`;

async function main(){
  const browser = await chromium.launch({headless:true,executablePath:'C:/Users/wis/.cache/hyperframes/chrome/chrome-headless-shell/win64-152.0.7928.2/chrome-headless-shell-win64/chrome-headless-shell.exe'});
  const page = await browser.newPage({viewport:{width:420,height:600},deviceScaleFactor:2});
  await page.goto(pathToFileURL(path.join(out,'../dist/ui.html')).href);
  await page.waitForSelector('h1');
  await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{data:{pluginMessage:{type:'scan-result',result:{pageId:'demo',pageName:'品牌提案',frames:[{id:'1'},{id:'2'},{id:'3'}],fonts:[{family:'Inter'},{family:'思源黑体'}],warnings:[]}}}})));
  await page.getByText('导出说明',{exact:true}).click();
  await page.locator('.app-shell').screenshot({path:path.join(out,'plugin-panel.png')});
  const panel='data:image/png;base64,'+fs.readFileSync(path.join(out,'plugin-panel.png')).toString('base64');
  const gallery=`<!DOCTYPE html><meta charset="utf-8"><style>${base}
  .title{position:absolute;left:112px;top:245px;font-size:78px;letter-spacing:-4px;font-weight:650}.sub{position:absolute;left:116px;top:358px;color:#61758e;font-size:28px}.window{position:absolute;left:160px;top:440px;width:630px;border-radius:18px;overflow:hidden;background:white;box-shadow:0 24px 70px #233e601b;border:1px solid #dbe4ed}.bar{height:57px;padding:0 23px;display:flex;align-items:center;gap:12px;background:#fff;border-bottom:1px solid #edf1f5;font-size:17px;font-weight:600}.bar img{height:24px;width:24px}.close{margin-left:auto;color:#a4b2c1;font-weight:400}.panel{display:block;width:630px}.arrow{position:absolute;left:879px;top:605px}.outputs{position:absolute;left:1060px;top:443px;width:660px;display:grid;gap:26px}.file{display:flex;align-items:center;gap:30px;padding:36px;background:white;border:1px solid #dfe7f0;border-radius:16px;box-shadow:0 14px 40px #19375407}.file-icon{width:82px;height:98px;border:2px solid #c7e4fb;border-radius:10px;background:#edf7ff;display:flex;align-items:center;justify-content:center;color:#0d99ff;font-size:22px;font-weight:bold;letter-spacing:1px;flex-shrink:0}.file h2{font-size:28px;font-weight:600;margin:0 0 13px;letter-spacing:-.5px}.file p{font-size:21px;color:#7b8b9f;margin:0}.file:nth-child(2) .file-icon{background:#f4f6f9;border-color:#e0e6ef;color:#70849b}
  </style>${brand}<div class="title">Export in one click.</div><div class="sub">A PDF for editing. A package for handoff.</div><div class="window"><div class="bar"><img src="${icon}"/>Editable PDF Exporter<span class="close">×</span></div><img class="panel" src="${panel}"></div><div class="arrow">→</div><div class="outputs"><div class="file"><div class="file-icon">PDF</div><div><h2>Editable PDF</h2><p>Multiple frames. One document.</p></div></div><div class="file"><div class="file-icon">ZIP</div><div><h2>Handoff package</h2><p>PDF · Font list · Instructions</p></div></div></div><div class="footer">DESIGNED IN FIGMA<span class="dot"></span>PROCESSED ON YOUR DEVICE</div>`;
  await page.setViewportSize({width:1920,height:1080});
  await page.close();
  const art=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  for(const [name,html] of [['thumbnail-1920x1080',cover],['gallery-01-1920x1080',gallery]]){
    fs.writeFileSync(path.join(out,name+'.html'),html);
    await art.setContent(html);
    await art.evaluate(()=>document.fonts.ready);
    await art.screenshot({path:path.join(out,name+'.png')});
  }
  await browser.close();
  console.log('Created 1920×1080 thumbnail and gallery image.');
}
main().catch(e=>{console.error(e);process.exit(1)});

// 投稿カード用の実画面を撮る（Chrome headless / CDP）。実行: node source/shoot.js <出力フォルダ>
// Card1: 見る画面（スタンダード＋追加データ×2＋ヘアメイク同行＋急ぎ）／ Card2: デスクトップの作る画面（サンプル入力・リンク作成後）
const fs = require('fs'), path = require('path'), http = require('http');
const { launch } = require('./cdp');
const OUT = path.resolve(process.argv[2]);
const DATE = process.env.SHOOT_DATE || '2026-10-22';
const W1 = +(process.env.W1 || 640), W2 = +(process.env.W2 || 1000), H2 = +(process.env.H2 || 800);
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8766, ORIGIN = 'http://127.0.0.1:' + PORT + '/';
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(HTML); }).listen(PORT);
(async () => {
  const b = await launch(9412);
  await b.open(ORIGIN, W1, 900, 2, true, 'light');
  const hash = await b.ev(`'#'+PG.encode(PG.toConfig(PG.sampleDraft()).cfg)`);
  await b.open(ORIGIN + hash, W1, 1400, 2, true, 'light');
  await b.ev(`(()=>{document.querySelectorAll('.vc input[type=radio]')[1].click();
    const plus=[...document.querySelectorAll('.stepper button')].find(x=>x.textContent==='＋');plus.click();plus.click();
    document.querySelectorAll('.opt input[type=checkbox]')[0].click();document.querySelector('.vc input[type=checkbox]').click()})()`);
  await b.sleep(300);
  const m = await b.ev(`(()=>{const rush=[...document.querySelectorAll('.vc')].pop().getBoundingClientRect();const bar=document.querySelector('.total').getBoundingClientRect();const nm=document.querySelector('.v-name').getBoundingClientRect();return {rushBottom:rush.bottom+scrollY,barH:bar.height,nameTop:nm.top+scrollY}})()`);
  const TOP = Math.max(0, Math.floor(m.nameTop - 12)), H1 = Math.ceil(m.rushBottom - TOP + 16 + m.barH);
  await b.open(ORIGIN, W1, H1, 2, true, 'light');
  await b.open(ORIGIN + hash, W1, H1, 2, true, 'light');
  await b.ev(`(()=>{document.querySelectorAll('.vc input[type=radio]')[1].click();
    const plus=[...document.querySelectorAll('.stepper button')].find(x=>x.textContent==='＋');plus.click();plus.click();
    document.querySelectorAll('.opt input[type=checkbox]')[0].click();document.querySelector('.vc input[type=checkbox]').click()})()`);
  await b.sleep(300);
  await b.ev(`window.scrollTo(0,${TOP})`); await b.sleep(200);
  console.log('card1', W1 + 'x' + H1, 'h/w', (H1 / W1).toFixed(2), await b.ev(`document.querySelector('.total').innerText.split(String.fromCharCode(10)).join(' / ')`));
  // 固定の合計バーが写るよう、ページ全体ではなく表示中の範囲をそのまま撮る
  const s1 = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, `01-x-primary-view-selected-${W1}px-${DATE}.png`), Buffer.from(s1.result.data, 'base64'));
  await b.open(ORIGIN, W2, H2, 1, false, 'light');
  await b.ev(`localStorage.clear()`); await b.open(ORIGIN, W2, H2, 2, false, 'light');
  await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='サンプルを入れる').click()`);
  await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='リンクを作る').click()`); await b.sleep(400);
  // 作った場所のアドレス（ローカル）が写らないよう、URL欄を1行ぶん送った状態にする（URL欄の中を読んでいる状態と同じ）
  await b.ev(`window.scrollTo(0,0);document.querySelector('.sticky').scrollTop=0;document.querySelector('textarea.urlbox').scrollTop=26`); await b.sleep(200);
  console.log('card2', W2 + 'x' + H2, await b.ev(`document.querySelector('.len').textContent`));
  await b.shot(path.join(OUT, `02-make-link-${W2}px-${DATE}.png`), { x: 0, y: 0, width: W2, height: H2 });
  b.close(); srv.close(); setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error(e); process.exit(2); });

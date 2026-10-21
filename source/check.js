// 実画面の確認（Chrome headless / CDP）。実行: node source/check.js <出力フォルダ>
// ローカルの簡易サーバーでページを配り、作る→URL→開く→選ぶの往復、375pxの矩形、XSS、壊れたリンク、計測ビーコンの送信内容を調べる
const fs = require('fs'), path = require('path'), http = require('http');
const { launch } = require('./cdp');
const OUT = path.resolve(process.argv[2] || 'check-out');
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8765, ORIGIN = 'http://127.0.0.1:' + PORT + '/';
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(HTML); }).listen(PORT);

const measure = `(()=>{const out={sw:document.documentElement.scrollWidth,iw:innerWidth,over:[],overlap:[],small:[]};
  document.querySelectorAll('main *').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&r.right>innerWidth+0.5)out.over.push(e.tagName+'.'+e.className)});
  document.querySelectorAll('.vc,.opt,.lines li,.total').forEach((c,i)=>{const parts=[...c.children].map(x=>x.getBoundingClientRect()).filter(r=>r.width&&r.height);
    for(let a=0;a<parts.length;a++)for(let b=a+1;b<parts.length;b++){const p=parts[a],q=parts[b];if(p.left<q.right-0.5&&q.left<p.right-0.5&&p.top<q.bottom-0.5&&q.top<p.bottom-0.5)out.overlap.push(c.className+i+':'+a+'x'+b)}});
  document.querySelectorAll('button,input[type=checkbox],input[type=radio]').forEach(e=>{const r=e.getBoundingClientRect();const t=e.closest('label')||e;const q=t.getBoundingClientRect();if(r.width&&(Math.max(r.height,q.height)<43.5||Math.max(r.width,q.width)<43.5))out.small.push((e.textContent||e.type).slice(0,12)+':'+Math.round(r.width)+'x'+Math.round(r.height))});
  const t=document.querySelector('.total');if(t){const r=t.getBoundingClientRect();out.total=[Math.round(r.top),Math.round(r.height),innerHeight]}
  out.over=out.over.slice(0,8);out.small=out.small.slice(0,8);return out})()`;
const clickText = (b, text, sel) => b.ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel || 'button')})].find(x=>x.textContent.trim()===${JSON.stringify(text)});if(!e)return 'NOTFOUND';e.click();return 'ok'})()`);
const hashOf = cfgJs => `'#'+PG.encode(${cfgJs})`;

(async () => {
  const b = await launch(9411);
  const reqs = [];
  b.on(m => { if (m.method === 'Network.requestWillBeSent') reqs.push({ url: m.params.request.url, post: m.params.request.postData || '' }); });
  await b.send('Network.enable');

  // 1) 作る画面 375px: サンプル→リンクを作る
  await b.open(ORIGIN, 375, 900, 2, true, 'light');
  await b.ev(`localStorage.clear()`); await b.open(ORIGIN, 375, 900, 2, true, 'light');
  console.log('make-empty', JSON.stringify(await b.ev(measure)));
  console.log('sample', await clickText(b, 'サンプルを入れる'), await clickText(b, 'リンクを作る'));
  await b.sleep(400);
  const gen = await b.ev(`({len:document.querySelector('.len').textContent,url:document.querySelector('textarea.urlbox').value,copyDisabled:[...document.querySelectorAll('button')].find(x=>x.textContent==='URLをコピー').disabled,errors:document.querySelector('.errors[role=alert]').hidden})`);
  console.log('generated', JSON.stringify({ len: gen.len, urlLen: [...gen.url].length, copyDisabled: gen.copyDisabled, errorsHidden: gen.errors }));
  console.log('make-sample', JSON.stringify(await b.ev(measure)));
  await b.shot(path.join(OUT, 'check-375-make.png'), { x: 0, y: 0, width: 375, height: Math.min(9000, await b.ev('document.documentElement.scrollHeight')) });

  // 2) 作ったURLを開く（Card1の選択を操作で再現）
  const url = gen.url.replace(/^https?:\/\/[^/]*\/[^#]*/, ORIGIN);
  await b.open(url, 375, 900, 2, true, 'light');
  console.log('view-initial', await b.ev(`document.querySelector('.total').innerText.replace(/\\n+/g,' / ')`));
  await b.ev(`(()=>{const r=document.querySelectorAll('.vc input[type=radio]');r[1].click();
    const plus=[...document.querySelectorAll('.stepper button')].find(x=>x.textContent==='＋');plus.click();plus.click();
    const cbs=[...document.querySelectorAll('.opt input[type=checkbox]')];cbs[0].click();
    document.querySelector('.vc input[type=checkbox]').click()})()`);
  await b.sleep(200);
  console.log('card1', await b.ev(`document.querySelector('.total').innerText.replace(/\\n+/g,' / ')`));
  console.log('card1-lines', await b.ev(`[...document.querySelectorAll('.lines li')].map(l=>l.innerText.replace(/\\n+/g,' ')).join(' | ')`));
  console.log('view-375', JSON.stringify(await b.ev(measure)));
  await b.shot(path.join(OUT, 'check-375-view.png'), { x: 0, y: 0, width: 375, height: await b.ev('document.documentElement.scrollHeight') });
  // 相談文（クリップボードが使えない環境でもテキスト欄に出る）
  await b.ev(`document.querySelector('.view input[type=text]').value='来月の第2週で';document.querySelector('.view input[type=text]').dispatchEvent(new Event('input'))`);
  await clickText(b, 'この内容で相談する（文をコピー）'); await b.sleep(300);
  console.log('message', JSON.stringify(await b.ev(`document.querySelector('.view textarea').value`)));
  console.log('status', await b.ev(`document.querySelector('.view p.okmsg').textContent`));

  // 3) ダーク
  await b.open(url, 375, 900, 2, true, 'dark');
  await b.shot(path.join(OUT, 'check-375-view-dark.png'), { x: 0, y: 0, width: 375, height: await b.ev('document.documentElement.scrollHeight') });
  console.log('view-dark', JSON.stringify(await b.ev(measure)));

  // 4) 最長の値（全角）で375px
  const LONG = `({name:'あ'.repeat(30),taxIncl:false,rush:{label:'い'.repeat(12),pct:100},note:'う'.repeat(80),contact:'え'.repeat(60),
    bases:Array(6).fill(0).map((_,i)=>({name:'お'.repeat(20),desc:'か'.repeat(30),price:9999999,from:true})),
    opts:Array(8).fill(0).map((_,i)=>({name:'き'.repeat(20),price:9999999,unit:'く'.repeat(6),qty:i%2==0}))})`;
  await b.open(ORIGIN, 375, 900, 2, true, 'light');
  const longHash = await b.ev(hashOf(LONG));
  await b.open(ORIGIN + longHash, 375, 900, 2, true, 'light');
  await b.ev(`(()=>{[...document.querySelectorAll('.stepper button')].filter(x=>x.textContent==='＋').forEach(p=>{for(let i=0;i<20;i++)p.click()});document.querySelector('.vc input[type=checkbox]').click()})()`);
  console.log('long-total', await b.ev(`document.querySelector('.total').innerText.replace(/\\n+/g,' / ')`));
  console.log('long-375', JSON.stringify(await b.ev(measure)));
  await b.shot(path.join(OUT, 'check-375-long.png'), { x: 0, y: 0, width: 375, height: Math.min(9000, await b.ev('document.documentElement.scrollHeight')) });

  // 5) デスクトップ 1000px: 作る画面
  await b.open(ORIGIN, 1000, 1100, 1, false, 'light');
  await b.ev(`localStorage.clear()`); await b.open(ORIGIN, 1000, 1100, 1, false, 'light');
  await clickText(b, 'サンプルを入れる'); await clickText(b, 'リンクを作る'); await b.sleep(400);
  console.log('desk-make', JSON.stringify(await b.ev(measure)));
  await b.shot(path.join(OUT, 'check-1000-make.png'), { x: 0, y: 0, width: 1000, height: Math.min(4000, await b.ev('document.documentElement.scrollHeight')) });

  // 6) XSS: 文字に HTML を入れたリンクを開く
  const XSS = `({name:'<img src=x onerror=__x=1>',taxIncl:false,rush:{label:'"><script>',pct:10},note:'<b>bold</b>',contact:"'><svg onload=window.__x=3>",bases:[{name:'<u>A</u>',desc:'<i>d</i>',price:100,from:false}],opts:[{name:'<s>o</s>',price:1,unit:'<p>',qty:true}]})`;
  await b.open(ORIGIN, 375, 900, 2, true, 'light');
  const xssHash = await b.ev(hashOf(XSS));
  await b.open(ORIGIN + xssHash, 375, 900, 2, true, 'light');
  console.log('xss', JSON.stringify(await b.ev(`({x:window.__x||0,imgs:document.querySelectorAll('#app img,#app svg,#app b,#app u,#app i,#app s,#app script').length,name:document.querySelector('.v-name').textContent})`)));
  // 作る側: 入力欄に入れた HTML 文字がプレビューでも文字として出る
  await b.open(ORIGIN, 375, 900, 2, true, 'light');
  await b.ev(`localStorage.setItem(PG.KEY, JSON.stringify(PG.fromConfig(${XSS})))`); await b.open(ORIGIN, 375, 900, 2, true, 'light');
  console.log('xss-make', JSON.stringify(await b.ev(`({x:window.__x||0,tags:document.querySelectorAll('#app img,#app svg,#app b,#app u,#app i,#app s,#app script').length})`)));

  // 7) 壊れたリンク
  for (const hsh of ['#v1=abc', '#v1=', '#x', '#v1=' + 'A'.repeat(4001)]) {
    await b.open(ORIGIN + hsh, 375, 900, 2, true, 'light');
    console.log('broken', hsh.slice(0, 14), JSON.stringify(await b.ev(`({h1:document.querySelector('h1').textContent,btn:[...document.querySelectorAll('button')].map(x=>x.textContent)})`)));
  }
  await clickText(b, '料金の目安リンクを作る画面へ'); await b.sleep(200);
  console.log('back-to-make', await b.ev(`document.querySelector('h1').textContent + ' | hash=' + location.hash`));

  // 8) S13 計測ビーコン: # 以降が送られるか
  reqs.length = 0;
  await b.open(url, 375, 900, 2, true, 'light');
  await b.open('http://127.0.0.1:' + PORT + '/' + url.slice(url.indexOf('#')), 375, 900, 2, true, 'light');
  await b.sleep(4000);
  const ext = reqs.filter(r => !r.url.startsWith(ORIGIN));
  console.log('S13 外部へのリクエスト:', ext.length);
  ext.forEach(r => console.log('  ', r.url.slice(0, 90), '| post:', r.post.slice(0, 400)));
  const frag = url.slice(url.indexOf('#') + 1, url.indexOf('#') + 40);
  console.log('S13 #以降の文字列が、外部リクエストのURLまたは本文に含まれるか:', ext.some(r => r.url.includes(frag) || r.post.includes(frag)));

  b.close(); srv.close(); setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error(e); process.exit(2); });

// index.html の core スクリプトを取り出して検算する（node source/core-test.js）
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.split('<script id="core">')[1].split('</script>')[0];
const m = { exports: {} }; new Function('module', src)(m); const PG = m.exports;
let pass = 0, fail = 0;
function eq(a, b, msg) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) pass++; else { fail++; console.log('NG', msg, '\n  got', A, '\n  exp', B); } }
const cfgOf = d => PG.toConfig(d).cfg;
const S = PG.sampleDraft();
const sc = cfgOf(S);
eq(!!sc, true, 'サンプルが検証を通る');

// S1 Card1: スタンダード＋追加データ×2＋ヘアメイク同行＋急ぎ
const sel1 = { base: 1, qty: [2, 1, 0], rush: true, hitoko: '' };
const r1 = PG.calc(sc, sel1);
eq([r1.sub, r1.extra, r1.total, r1.taxed, r1.from], [46000, 9200, 55200, 60720, true], 'S1 Card1の金額');
eq(PG.totalLine(sc, r1), '55,200円〜（税抜）／税込の目安 60,720円〜', 'S1 合計の表示');
eq(r1.lines.map(l => [l.label, l.amount]), [['スタンダード', 28000], ['追加データ（10枚） × 2', 6000], ['ヘアメイク同行', 12000], ['1週間以内の納品（+20%）', 9200]], 'S1 内訳');
eq(PG.buildMessage(sc, Object.assign({}, sel1, { hitoko: '来月の第2週で' })),
  '【料金の目安を見て連絡しました】\nサンプル出張撮影\nメニュー: スタンダード\nオプション: 追加データ（10枚） ×2、ヘアメイク同行\n急ぎ: 1週間以内の納品（+20%）\n目安: 55,200円〜（税抜）／税込の目安 60,720円〜\nひとこと: 来月の第2週で\n※目安の表示を見ての相談です。正式な金額はお見積もりでお願いします', 'S10 相談文');
eq(PG.buildMessage(sc, { base: 0, qty: [0, 0, 0], rush: false, hitoko: '' }).includes('ひとこと'), false, 'S10 ひとこと無し');
eq(PG.buildMessage(sc, { base: 0, qty: [0, 0, 0], rush: false, hitoko: '' }).includes('オプション'), false, 'S10 オプション無し');

// S2 端数
const D = (o) => Object.assign(PG.emptyDraft(), o);
const one = (price, extra) => cfgOf(D(Object.assign({ bases: [{ name: 'A', desc: '', price: String(price), from: false }] }, extra || {})));
eq(PG.calc(one(33333), { base: 0, qty: [], rush: false }).taxed, 36666, 'S2 33,333→36,666');
eq(PG.calc(one(10001, { rushOn: true, rushLabel: '急', rushPct: '15' }), { base: 0, qty: [], rush: true }).extra, 1500, 'S2 10,001×15%→1,500');
eq(PG.calc(one(9999999), { base: 0, qty: [], rush: false }).taxed, 10999998, '上限の税込');
// S3
eq(PG.totalLine(one(1000), { base: 0, qty: [], rush: false }.base === 0 ? PG.calc(one(1000), { base: 0, qty: [], rush: false }) : null), '1,000円（税抜）／税込の目安 1,100円', 'S3 〜なし');
eq(PG.calc(sc, { base: 0, qty: [0, 0, 0], rush: false }).lines.length, 1, 'S3 数量0は内訳に出ない');
eq(PG.calc(sc, { base: 0, qty: [0, 0, 0], rush: false }).extra, 0, 'S3 急ぎオフ');
eq(PG.calc(sc, { base: 0, qty: [0, 0, 0], rush: true }).extra, 3000, 'S3 急ぎオン 15,000×20%');
eq(PG.fixSel(sc, { base: 9, qty: [99, 5, -3], rush: true }).qty, [20, 1, 0], '選択の補正（数量上限20・チェックは0/1）');
eq(PG.fixSel(sc, { base: 9, qty: [], rush: true }).base, 0, '選択の補正（範囲外のメニュー）');
// S4 税込入力
const inc = cfgOf(D({ taxIncl: true, bases: [{ name: 'A', desc: '', price: '5,500', from: true }] }));
const ri = PG.calc(inc, { base: 0, qty: [], rush: false });
eq([PG.totalLine(inc, ri), ri.taxed], ['5,500円〜（税込）', null], 'S4 税込入力');

// S5 往復
function roundtrip(cfg, msg) { const h = '#' + PG.encode(cfg); eq(PG.decodeHash(h), cfg, msg); return h; }
const h0 = roundtrip(sc, 'S5 サンプルの往復');
roundtrip(one(0), 'S5 最小構成の往復');
roundtrip(cfgOf(D({ name: '絵文字😀と𠮷野家', note: '全角！？〜①㈱', bases: [{ name: '𩸽', desc: '😀😀', price: '1', from: true }], opts: [{ name: 'オ', price: '0', unit: '㌔', qty: true }] })), 'S5 絵文字・サロゲート・全角記号の往復');
eq(/^#v1=[A-Za-z0-9_-]+$/.test(h0), true, 'URL形式（パディングなし）');
eq(PG.decodeAny('https://example.test/p/' + h0), sc, 'decodeAny URL全体');
eq(PG.decodeAny(h0.slice(1)), sc, 'decodeAny #なし');

// S6 壊れたハッシュ
const enc = a => '#v1=' + Buffer.from(JSON.stringify(a), 'utf8').toString('base64url');
const good = [1, '店', 0, null, '', '', [['A', '', 100, 0]], []];
eq(!!PG.decodeHash(enc(good)), true, 'S6 基準は通る');
const bad = {
  '空': '', '#のみ': '#', '途中で切れ': h0.slice(0, h0.length - 7), 'v2': enc([2].concat(good.slice(1))).replace('v1', 'v1'),
  '配列でない': enc({ a: 1 }), '長さ違い': enc(good.concat([1])), 'v1=だけ': '#v1=', '記号混じり': '#v1=abc$%^',
  '金額が文字列': enc([1, '店', 0, null, '', '', [['A', '', '100', 0]], []]), '金額が負': enc([1, '店', 0, null, '', '', [['A', '', -1, 0]], []]),
  '金額が小数': enc([1, '店', 0, null, '', '', [['A', '', 1.5, 0]], []]), '金額が大きすぎ': enc([1, '店', 0, null, '', '', [['A', '', 10000000, 0]], []]),
  'NaN(null)': enc([1, '店', 0, null, '', '', [['A', '', null, 0]], []]), 'メニュー0件': enc([1, '店', 0, null, '', '', [], []]),
  'メニュー7件': enc([1, '店', 0, null, '', '', Array(7).fill(['A', '', 1, 0]), []]), 'オプション9件': enc([1, '店', 0, null, '', '', [['A', '', 1, 0]], Array(9).fill(['B', 1, '', 0])]),
  '割合101': enc([1, '店', 0, ['急', 101], '', '', [['A', '', 1, 0]], []]), '割合0': enc([1, '店', 0, ['急', 0], '', '', [['A', '', 1, 0]], []]),
  '名前が長い': enc([1, 'あ'.repeat(31), 0, null, '', '', [['A', '', 1, 0]], []]), 'httpを含む': enc([1, 'http://x', 0, null, '', '', [['A', '', 1, 0]], []]),
  'wwwを含む': enc([1, 'www.x', 0, null, '', '', [['A', '', 1, 0]], []]), '全角ｈｔｔｐ': enc([1, 'ｈｔｔｐ：／／ｘ', 0, null, '', '', [['A', '', 1, 0]], []]),
  '改行入り': enc([1, 'a\nb', 0, null, '', '', [['A', '', 1, 0]], []]), '前後空白': enc([1, ' a', 0, null, '', '', [['A', '', 1, 0]], []]),
  'メニュー名が空': enc([1, '店', 0, null, '', '', [['', '', 1, 0]], []]), '税フラグ2': enc([1, '店', 2, null, '', '', [['A', '', 1, 0]], []]),
  '4,000文字超': '#v1=' + 'A'.repeat(4000), 'JSONでない': '#v1=' + Buffer.from('not json').toString('base64url'),
  'UTF-8でない': '#v1=' + Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url'), '長さ4n+1': '#v1=AAAAA'
};
for (const k of Object.keys(bad)) eq(PG.decodeHash(bad[k]), null, 'S6 ' + k);
eq(PG.decodeHash(undefined), null, 'S6 undefined'); eq(PG.decodeHash(null), null, 'S6 null');


// レビュー①の抜け穴（リンク・連絡先らしい文字は拒否、普通の日本語は通す）
const blocked = ['example.com', 'bit.ly/abc', 'line.me/R/ti/p/xx', 'ｅｘａｍｐｌｅ。ｃｏｍ', 'info@example.com', 'tel:0312345678', 'mailto:a@b.jp',
  'w​ww.x.com', 'h t t p', 'ｗ­ｗｗ．ｘ', 'ex ample . com', 'HTTP://X', 'ｈｔｔｐｓ：／／ｘ', 'x.jp'];
blocked.forEach(s => eq(PG.hasLink(s), true, 'リンク拒否: ' + JSON.stringify(s)));
const allowed = ['Instagram @mybiz', 'Ver.2 を使用', '3.5mm', '10:30〜18:00', '写真データ10枚', '例: 1.5倍', 'No.1', '追加データ（10枚）', '出張費（30km超）', 'A.B', 'ご相談はDMへ。お気軽に', '15:00。'];
allowed.forEach(s => eq(PG.hasLink(s), false, '通す: ' + JSON.stringify(s)));
eq(PG.decodeHash(enc([1, 'example.com', 0, null, '', '', [['A', '', 1, 0]], []])), null, '読み込み側もドメイン形式を拒否');
eq(PG.decodeHash(enc([1, '店', 0, null, '', 'info@example.com', [['A', '', 1, 0]], []])), null, '読み込み側もメールを拒否');

// S7 入力の境界
const E = d => PG.toConfig(d).errors;
const B = (o) => D({ bases: [Object.assign({ name: 'A', desc: '', price: '100', from: false }, o)] });
eq(E(B({})).length, 0, 'S7 基準');
eq(E(B({ name: 'あ'.repeat(20) })).length, 0, 'S7 名前20字');
eq(E(B({ name: 'あ'.repeat(21) })).length, 1, 'S7 名前21字');
eq(E(B({ desc: 'あ'.repeat(30) })).length, 0, 'S7 説明30字');
eq(E(B({ desc: 'あ'.repeat(31) })).length, 1, 'S7 説明31字');
eq(E(B({ price: '0' })).length, 0, 'S7 金額0');
eq(E(B({ price: '9,999,999' })).length, 0, 'S7 金額9,999,999（カンマ可）');
eq(E(B({ price: '10000000' })).length, 1, 'S7 金額10,000,000');
eq(E(B({ price: '１２３４' })).length, 0, 'S7 全角数字');
eq(PG.toConfig(B({ price: '１２３４円' })).cfg.bases[0].price, 1234, 'S7 全角数字と円');
eq(E(B({ price: '12.5' })).length, 1, 'S7 小数');
eq(E(B({ price: '-5' })).length, 1, 'S7 負');
eq(E(B({ price: '' })).length, 1, 'S7 金額空');
eq(E(B({ price: 'abc' })).length, 1, 'S7 金額が文字');
eq(E(D({ bases: [PG.blankBase()] })), ['基本メニューを1つ以上入れてください'], 'S7 基本メニュー空');
eq(E(B({ name: 'http://x' })).some(s => s.includes('リンク')), true, 'S7 http');
eq(E(B({ desc: 'www.example' })).some(s => s.includes('リンク')), true, 'S7 www.');
eq(E(B({ desc: 'a://b' })).some(s => s.includes('リンク')), true, 'S7 ://');
eq(E(B({ desc: 'ＨＴＴＰＳ' })).some(s => s.includes('リンク')), true, 'S7 全角HTTPS');
eq(E(D({ name: 'ｗｗｗ．ｘ', bases: B({}).bases })).some(s => s.includes('リンク')), true, 'S7 全角www.（事業名）');
eq(E(D({ contact: 'https://x', bases: B({}).bases })).some(s => s.includes('リンク')), true, 'S7 連絡方法にURL');
eq(E(D({ note: 'あ'.repeat(81), bases: B({}).bases })).length, 1, 'S7 補足81字');
eq(E(D({ contact: 'あ'.repeat(61), bases: B({}).bases })).length, 1, 'S7 連絡方法61字');
eq(E(D({ name: 'あ'.repeat(31), bases: B({}).bases })).length, 1, 'S7 事業名31字');
const R = (l, p) => E(D({ rushOn: true, rushLabel: l, rushPct: p, bases: B({}).bases }));
eq(R('急ぎ', '1').length, 0, 'S7 割合1'); eq(R('急ぎ', '100').length, 0, 'S7 割合100');
eq(R('急ぎ', '0').length, 1, 'S7 割合0'); eq(R('急ぎ', '101').length, 1, 'S7 割合101');
eq(R('急ぎ', '２０％').length, 0, 'S7 全角％'); eq(R('', '20').length, 1, 'S7 急ぎ名空');
eq(R('あ'.repeat(13), '20').length, 1, 'S7 急ぎ名13字');
const O = (o) => E(D({ bases: B({}).bases, opts: [Object.assign({ name: 'O', price: '100', unit: '', qty: false }, o)] }));
eq(O({}).length, 0, 'S7 オプション基準'); eq(O({ unit: 'あ'.repeat(7) }).length, 1, 'S7 単位7字');
eq(O({ name: '' }).length, 1, 'S7 オプション名空'); eq(O({ price: '' }).length, 1, 'S7 オプション金額空');
eq(PG.toConfig(D({ bases: B({}).bases, opts: [PG.blankOpt(), { name: 'O', price: '1', unit: '', qty: false }] })).cfg.opts.length, 1, 'S7 空のオプション行は無視');
eq(PG.toConfig(D({ bases: [PG.blankBase(), { name: 'A', desc: '', price: '1', from: false }] })).cfg.bases.length, 1, 'S7 空の基本行は無視');
// 制御文字・改行は空白に直る
eq(PG.toConfig(B({ name: 'a\nb\tc' })).cfg.bases[0].name, 'a b c', 'S7 改行と制御文字');
eq(PG.cpLen('😀'.repeat(20)), 20, 'コードポイント数');
eq(E(B({ name: '😀'.repeat(20) })).length, 0, 'S7 絵文字20個');
// 件数
eq(E(D({ bases: Array(7).fill(0).map(() => ({ name: 'A', desc: '', price: '1', from: false })) })).length, 0, '下書きに7件あっても toConfig 自体は件数を見ない（画面側で6件に制限）');

// S9 URLの長さ（最大入力）
const full = D({
  name: 'あ'.repeat(30), note: 'い'.repeat(80), contact: 'う'.repeat(60), rushOn: true, rushLabel: 'え'.repeat(12), rushPct: '100',
  bases: Array(6).fill(0).map((_, i) => ({ name: 'お'.repeat(20), desc: 'か'.repeat(30), price: '9999999', from: true })),
  opts: Array(8).fill(0).map((_, i) => ({ name: 'き'.repeat(20), price: '9999999', unit: 'く'.repeat(6), qty: true }))
});
const fc = cfgOf(full);
eq(!!fc, true, 'S9 最大入力が検証を通る');
const fu = PG.makeUrl('https://nncf123nncf-oss.github.io/price-guide-link/', fc);
console.log('INFO 最大入力のURL長:', PG.cpLen(fu), '（上限', PG.URL_MAX, '）／ サンプルのURL長:', PG.cpLen(PG.makeUrl('https://nncf123nncf-oss.github.io/price-guide-link/', sc)));
eq(PG.decodeHash('#' + PG.encode(fc)), fc, 'S9 最大入力の往復');
eq(PG.cpLen(fu) > PG.URL_MAX, true, 'S9 最大入力は上限を超える（案内が出る）');

// 下書きの型補正
eq(PG.sanitizeDraft(null), PG.emptyDraft(), 'sanitize null');
eq(PG.sanitizeDraft({ bases: 'x', opts: 5 }), PG.emptyDraft(), 'sanitize 壊れた配列');
eq(PG.sanitizeDraft({ bases: Array(20).fill({ name: 'a' }), opts: Array(20).fill({}) }).bases.length, 6, 'sanitize 基本6件');
eq(PG.sanitizeDraft({ bases: Array(20).fill({ name: 'a' }), opts: Array(20).fill({}) }).opts.length, 8, 'sanitize オプション8件');
eq(PG.fromConfig(sc), PG.sampleDraft(), 'fromConfig はサンプルに戻る');

// S11 共有ボタンの出し分け
eq([PG.canShareUrl(undefined), PG.canShareUrl({}), PG.canShareUrl({ share: 1 }), PG.canShareUrl({ share() { } })], [false, false, false, true], 'S11 share の有無');

console.log(`pass ${pass} / fail ${fail}`); process.exit(fail ? 1 : 0);

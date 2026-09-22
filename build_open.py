#!/usr/bin/env python3
"""Assemble the open-world game into one self-contained offline HTML file."""
import re

game = open('openworld_game.js', encoding='utf-8').read()
rig = open('creature_block.js', encoding='utf-8').read().rstrip('\n')
three = open('three.module.js', encoding='utf-8').read()

def grab_exports(src):
    found = []
    for m in re.finditer(r'export\s*\{([^}]*)\}', src):
        for part in m.group(1).split(','):
            part = part.strip()
            if not part:
                continue
            if re.match(r'\w+\s+as\s+default$', part):
                continue
            if ' as ' in part:
                orig, alias = [p.strip() for p in part.split(' as ')]
                found.append((orig, alias))
            else:
                found.append((part, part))
    return found

specifiers = grab_exports(three)
print('export specifiers found:', len(specifiers))
three_clean = re.sub(r'export\s*\{[^}]*\}\s*;?', '', three)
for m in re.finditer(r'export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)', three_clean):
    name = m.group(1)
    if (name, name) not in specifiers:
        specifiers.append((name, name))
three_clean = re.sub(r'\bexport\s+(?=(?:async\s+)?(?:function\*?|class|const|let|var)\b)', '', three_clean)

ret_items = [f'{alias}: {orig}' if alias != orig else orig for orig, alias in specifiers]
prelude = ('const THREE = (() => {\n' + three_clean + '\nreturn { ' +
           ', '.join(ret_items) + ' };\n})();\n')

# splice the creature rig in
marker = '/*__RIG__*/'
assert game.count(marker) == 1
script = game.replace(marker, rig)

html = '''<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="#0a0e1c">
<title>لَزِج: المدينة الغارقة — عالم مفتوح</title>
<style>
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #0a0e1c;
  font-family: system-ui, "Segoe UI", sans-serif; color: #dfe7f5;
  touch-action: none; overscroll-behavior: none; user-select: none; }
canvas { display: block; position: fixed; inset: 0; }
button { font: inherit; border: 0; cursor: pointer; touch-action: manipulation; }
#loading { position: fixed; inset: 0; z-index: 30; display: grid; place-content: center;
  text-align: center; background: #0a0e1c; font-weight: 800; font-size: 20px; }
#loading span { font-size: 44px; display: block; margin-bottom: 10px; }
.hud { position: fixed; z-index: 5; top: max(14px, env(safe-area-inset-top));
  left: 14px; right: 14px; display: flex; justify-content: space-between; align-items: flex-start;
  gap: 10px; pointer-events: none; }
.pill { display: flex; align-items: center; gap: 8px; padding: 8px 15px; border-radius: 16px;
  background: rgba(13,17,30,.82); border: 1px solid rgba(120,160,255,.25);
  font-weight: 800; font-size: 15px; backdrop-filter: blur(4px); }
.pill small { font-size: 11px; opacity: .65; }
#wMission { max-width: 44vw; font-size: 12.5px; }
#wArrow { display: inline-block; color: #ffd75e; font-size: 18px; line-height: 1;
  transition: transform .12s linear; }
#wToast { position: fixed; z-index: 6; top: 76px; left: 50%; transform: translateX(-50%);
  max-width: min(520px, 88vw); padding: 12px 20px; border-radius: 24px; text-align: center;
  background: rgba(10,14,26,.9); border: 1px solid rgba(255,215,94,.35); color: #f4e9c8;
  font-size: 13.5px; font-weight: 700; pointer-events: none; opacity: 0; transition: opacity .35s; }
#minimap { position: fixed; z-index: 5; bottom: max(20px, env(safe-area-inset-bottom));
  left: 20px; width: 148px; height: 148px; border-radius: 18px;
  border: 2px solid rgba(120,160,255,.35); background: rgba(8,11,20,.9); }
#bossWrap { position: fixed; z-index: 5; top: 64px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 8px; align-items: center; padding: 6px 14px; border-radius: 14px;
  background: rgba(30,8,16,.85); color: #fff; font-size: 12px; font-weight: 900; }
#bossPips { color: #ff5a5a; letter-spacing: 4px; font-size: 15px; }
#bossWrap.hidden, .hidden { display: none !important; }
#senseVignette { position: fixed; inset: 0; z-index: 4; pointer-events: none; opacity: 0;
  background: radial-gradient(ellipse at center, transparent 55%, rgba(255,45,45,.38));
  mix-blend-mode: screen; }
#wActions { position: fixed; z-index: 5; bottom: max(20px, env(safe-area-inset-bottom));
  right: 18px; display: flex; gap: 12px; align-items: flex-end; }
.ability { width: 62px; height: 62px; border-radius: 50%;
  background: rgba(16,22,38,.85); color: #eaf1ff; font-size: 24px; font-weight: 900;
  border: 2px solid rgba(140,170,255,.5); box-shadow: 0 6px 22px rgba(0,0,10,.5); }
.ability:active { transform: scale(.94); }
#jumpBtn { width: 72px; height: 72px; font-size: 27px; }
#wPause { position: fixed; z-index: 6; top: max(14px, env(safe-area-inset-top)); right: 14px;
  width: 44px; height: 44px; border-radius: 14px; background: rgba(13,17,30,.85);
  color: #cfe0ff; font-size: 18px; font-weight: 900; border: 1px solid rgba(120,160,255,.3); }
#wOverlay { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-end;
  justify-content: center; padding: 24px 18px max(34px, env(safe-area-inset-bottom));
  background: linear-gradient(180deg, rgba(6,9,18,.35), rgba(6,9,18,.88)); }
#wOverlay.hidden { display: none; }
.card { width: 100%; max-width: 430px; background: rgba(16,21,38,.97);
  border: 1px solid rgba(130,165,255,.28); border-radius: 26px; padding: 26px;
  text-align: center; box-shadow: 0 20px 70px rgba(0,0,10,.6); }
.eyebrow { font-size: 11px; font-weight: 900; letter-spacing: 2px; color: #7fa0ff; }
h1 { margin: 8px 0 4px; font-size: clamp(26px, 7vw, 34px); letter-spacing: -1px; }
#wText { font-size: 14.5px; line-height: 2.05; margin: 12px 0 20px; color: #b9c6e2; }
.primary { width: 100%; border-radius: 16px; min-height: 50px; font-weight: 900; font-size: 16px;
  color: #0a0e1c; background: linear-gradient(180deg, #ffd75e, #ffb03a); box-shadow: 0 5px 0 #8a5a12; }
.secondary { margin-top: 10px; width: 100%; border-radius: 16px; min-height: 44px;
  background: rgba(120,150,220,.14); color: #b9c6e2; font-weight: 800; }
#wCombo { position: fixed; z-index: 5; top: 70px; left: 16px; padding: 7px 14px; border-radius: 14px;
  background: rgba(255,215,94,.92); color: #241a04; font-weight: 900; font-size: 16px; }
''@media (min-width: 900px) { #wToast { font-size: 15px; } }
.menu { position: fixed; inset: 0; z-index: 28; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(120% 90% at 50% 8%, rgba(10,14,26,.18), rgba(4,6,12,.84)); }
.menu.hidden { display: none; }
.mcard { width: min(440px, 92vw); max-height: 90vh; overflow-y: auto; background: rgba(16,21,38,.96);
  border: 1px solid rgba(130,165,255,.3); border-radius: 26px; padding: 24px;
  box-shadow: 0 20px 70px rgba(0,0,10,.65); }
.mtitle { text-align: center; }
.mtitle .sp { font-size: 52px; display: block; filter: drop-shadow(0 0 20px rgba(120,160,255,.55)); }
.mtitle h1 { margin: 4px 0 2px; font-size: clamp(28px, 8vw, 40px); letter-spacing: -1px; }
.msub { text-align: center; color: #8fa3c4; font-size: 12.5px; margin: 2px 0 18px; }
.mBtn { display: block; width: 100%; border-radius: 14px; min-height: 46px; margin-bottom: 10px;
  font-weight: 900; font-size: 15px; background: rgba(120,150,220,.13); color: #dfe7f5; text-align: center; }
.mBtn.gold { background: linear-gradient(180deg, #ffd75e, #ffb03a); color: #241a04; box-shadow: 0 5px 0 #8a5a12; }
.mBtn:disabled { opacity: .4; cursor: not-allowed; }
.setRow { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 2px;
  font-size: 13px; font-weight: 700; color: #b9c6e2; border-bottom: 1px dashed rgba(130,165,255,.14); }
.setRow select { background: #141b30; color: #dfe7f5; border: 1px solid rgba(130,165,255,.35);
  border-radius: 10px; padding: 6px 10px; font: inherit; }
.setRow input[type=range] { width: 160px; accent-color: #ffd75e; }
.kbdTable { display: grid; grid-template-columns: 1fr auto; gap: 7px 14px; font-size: 13px; color: #b9c6e2;
  background: rgba(10,14,26,.5); border-radius: 14px; padding: 14px; }
.kbdTable b { color: #ffd75e; font-family: ui-monospace, Consolas, monospace; white-space: nowrap; }
#fpsBox { position: fixed; z-index: 6; bottom: calc(max(20px, env(safe-area-inset-bottom)) + 86px); right: 18px;
  padding: 4px 10px; border-radius: 10px; background: rgba(13,17,30,.8); color: #8dff5a;
  font: 700 11px/1.6 ui-monospace, monospace; pointer-events: none; }
#raceHud { position: fixed; z-index: 6; top: 112px; left: 50%; transform: translateX(-50%);
  padding: 8px 16px; border-radius: 16px; background: rgba(10,26,18,.88); color: #7dff9a;
  border: 1px solid rgba(125,255,154,.4); font-weight: 900; font-size: 14px; pointer-events: none; }
#lockHint { position: fixed; z-index: 7; top: 150px; left: 50%; transform: translateX(-50%);
  padding: 8px 16px; border-radius: 14px; background: rgba(13,17,30,.9); color: #9fb4dd;
  font-size: 12.5px; font-weight: 800; pointer-events: none; border: 1px solid rgba(120,160,255,.3); }
#menu .mcard::-webkit-scrollbar { width: 8px; } #menu .mcard::-webkit-scrollbar-thumb { background: #2a3854; border-radius: 8px; }
</style>
</head>
<body>
<div id="loading"><div><span>🕷</span><div id="loadingText">نوقظ لَزِج فوق الأسطح…</div></div></div>

<div class="hud">
  <div style="display:flex;gap:10px;flex-wrap:wrap;">
    <div class="pill"><small>قطع النول</small><strong id="wParts">0/12</strong></div>
    <div class="pill" id="wCombo"><small>كومبو</small><strong id="wComboText">×2</strong></div>
    <div class="pill"><small>حيوية</small><strong id="wHp">❤❤❤❤❤</strong></div>
    <div class="pill"><small>نقاط</small><strong id="wScore">0</strong></div>
  </div>
  <div class="pill"><span id="wArrow">▲</span><span id="wDist">0م</span><span id="wMission">اجمع قطع النول من الأسطح</span></div>
</div>
<button id="wPause" aria-label="إيقاف">Ⅱ</button>
<div id="bossWrap" class="hidden"><span>الملك الأسود</span><span id="bossPips">●●●</span></div>
<div id="wToast"></div>
<canvas id="minimap"></canvas>
<div id="senseVignette"></div>
<div id="raceHud" class="hidden">🏁 <span id="raceTxt"></span></div>
<div id="lockHint" class="hidden">🖱️ انقر لقفل الماوس والنظر حولك • ESC للإيقاف المؤقت</div>
<div id="fpsBox" class="hidden">–</div>
<div id="wActions">
  <button class="ability" id="wShoot" aria-label="إطلاق شبكة">🕸</button>
  <button class="ability" id="wWeb" aria-label="الشبكة — تأرجح">🕷</button>
  <button class="ability" id="jumpBtn" aria-label="قفز">⤒</button>
</div>

<div id="wOverlay">
  <section class="card" role="dialog" aria-modal="true">
    <div class="eyebrow">لَزِج: المدينة الغارقة</div>
    <h1 id="wTitle">مدينة تحت المطر</h1>
    <p id="wText">…</p>
    <button class="primary" id="wNext">التالي ▸</button>
    <button class="secondary hidden" id="wBack">رجوع ◂</button>
  </section>
</div>

<div id="menu" class="menu">
  <div class="mcard" id="menuMain">
    <div class="mtitle"><span class="sp">🕷️</span><h1>لَزِج: المدينة الغارقة</h1></div>
    <div class="msub">عالم مفتوح ثلاثي الأبعاد — مطرٌ أبدي، مئة وبرجٌ، وشبكةٌ في اليد</div>
    <button class="mBtn gold" id="mNew">▶ لعبة جديدة</button>
    <button class="mBtn" id="mContinue" disabled>⏩ متابعة الحفظ</button>
    <button class="mBtn" id="mSettings">⚙️ الإعدادات</button>
    <button class="mBtn" id="mControls">⌨️ التحكم</button>
    <button class="mBtn" id="mStoryPage">📖 الحكاية الكاملة</button>
    <div class="setRow" style="border:0;justify-content:center;color:#5f6f8f;font-size:10.5px;padding-bottom:0">حفظٌ تلقائي داخل المتصفح • يدعم ماوس وكيبورد وجيمباد</div>
  </div>
  <div class="mcard hidden" id="menuSettings">
    <div class="mtitle"><h1 style="font-size:24px">⚙️ الإعدادات</h1></div>
    <div class="setRow"><span>جودة الرسوم</span><select id="setQuality"><option value="low">منخفضة</option><option value="med">متوسطة</option><option value="high">عالية</option></select></div>
    <div class="setRow"><span>حساسية الماوس</span><input type="range" id="setSens" min="0.4" max="2.5" step="0.05" value="1"></div>
    <div class="setRow"><span>مجال الرؤية FOV</span><input type="range" id="setFov" min="55" max="95" step="1" value="66"></div>
    <div class="setRow"><span>مؤثرات صوتية</span><input type="range" id="setSfx" min="0" max="1" step="0.05" value="0.8"></div>
    <div class="setRow"><span>موسيقى المدينة</span><input type="range" id="setMus" min="0" max="1" step="0.05" value="0.5"></div>
    <div class="setRow"><span>عدّاد FPS</span><select id="setFps"><option value="0">إخفاء</option><option value="1">إظهار</option></select></div>
    <div style="font-size:11.5px;color:#8fa3c4;margin:6px 0 12px">تُحفظ الإعدادات فورًا وتُطبَّق مباشرة.</div>
    <button class="mBtn gold" id="setBack">رجوع ◂</button>
  </div>
  <div class="mcard hidden" id="menuControls">
    <div class="mtitle"><h1 style="font-size:24px">⌨️ التحكم</h1></div>
    <div class="kbdTable">
      <span>الحركة</span><b>W A S D</b>
      <span>النظر حولك (بعد قفل الماوس)</span><b>Mouse</b>
      <span>قفز</span><b>Space</b>
      <span>تأرجح/سحب بالشبكة (مطوّل)</span><b>E / الزر الأيمن</b>
      <span>إطلاق شبكة على هدف</span><b>F / الزر الأيسر</b>
      <span>جري سريع</span><b>Shift</b>
      <span>منظور الشخص الأول</span><b>V</b>
      <span>تقريب/تبعيد الكاميرا</span><b>عجلة الماوس</b>
      <span>سباق الأسطح (مهمة جانبية)</span><b>M</b>
      <span>إيقاف مؤقت</span><b>ESC / P</b>
      <span>عدّاد FPS</span><b>F3</b>
    </div>
    <div style="margin-top:12px;font-size:12px;color:#8fa3c4;line-height:1.9">على الجوال: اسحب للتحرك + أزرار 🕷️ ⤒ 🕸 — وعلى الكمبيوتر انقر الشاشة أولًا لقفل مؤشر الماوس. الجيمباد يعمل تلقائيًا (عصا يسار=حركة، RT=تأرجح، A=قفز، X=شبكة).</div>
    <button class="mBtn gold" id="ctrlBack">رجوع ◂</button>
  </div>
  <div class="mcard hidden" id="menuStory">
    <div class="mtitle"><h1 style="font-size:24px">📖 الحكاية الكاملة</h1></div>
    <div id="storyPages" style="font-size:13px;line-height:2;color:#b9c6e2"></div>
    <button class="mBtn gold" id="storyBack" style="margin-top:16px">رجوع ◂</button>
  </div>
</div>

<div id="pause" class="menu hidden">
  <div class="mcard">
    <div class="mtitle"><span class="sp">Ⅱ</span><h1 style="font-size:26px">استراحة المحارب</h1></div>
    <div class="msub" id="pauseStats">…</div>
    <button class="mBtn gold" id="pResume">▶ استئناف</button>
    <button class="mBtn" id="pSettings">⚙️ الإعدادات</button>
    <button class="mBtn" id="pControls">⌨️ التحكم</button>
    <button class="mBtn" id="pSave">💾 حفظ الآن</button>
    <button class="mBtn" id="pFull">⛶ ملء الشاشة</button>
    <button class="mBtn" id="pQuit">🏠 القائمة الرئيسية (يحفظ أولًا)</button>
  </div>
</div>

<script type="module">
__PRELUDE__
__SCRIPT__
</script>
</body>
</html>
'''
html = html.replace('__PRELUDE__', prelude.rstrip('\n')).replace('__SCRIPT__', script)

out = 'open-world.html'
open(out, 'w', encoding='utf-8').write(html)
print('wrote', out, len(html), 'chars')
open('open_world_script.mjs', 'w', encoding='utf-8').write(prelude + script)
print('extracted script for checks:', len(prelude + script), 'chars')

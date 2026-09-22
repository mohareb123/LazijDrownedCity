<div dir="rtl">

# 🕷 لَزِج: المدينة الغارقة

</div>

<div dir="rtl">

لعبة **عالم مفتوح ثلاثية الأبعاد** — متصفح واحد أو ملف تنفيذي لويندوز، بلا خوادم وبلا أي اعتماد على الإنترنت.

</div>

![Lazij](https://img.shields.io/badge/WebGL-Three.js-ffb03a) ![zero deps](https://img.shields.io/badge/runtime%20deps-0-7dff9a) ![license](https://img.shields.io/badge/license-MIT-8fa3c4)

## 🎮 العب فورًا
- **في المتصفح**: افتح `index.html` مباشرة (ملف واحد مستقل 1.4MB) — أو استضف المجلد بأي سيرفر static.
- **على ويندوز**: نزّل `LazijCity-win64.zip` من صفحة Releases، فكّه، وشغّل `LazijCity.exe`.

## 🕹 التحكم (كمبيوتر)
| المفتاح | الفعل |
|---|---|
| WASD | حركة |
| نقرة ماوس | قفل النظر/Nظر 360° |
| Space / Shift | قفز / جري |
| E أو زر أيمن مطوّل | تأرجح وسحب بالشبكة |
| F أو زر أيسر | إطلاق شبكة على صياد |
| V | منظور الشخص الأول |
| M | سباق أسطح (مهمة جانبية) |
| ESC / P | إيقاف مؤقت |
| F3 | عدّاد FPS |
| 🎮 جيمباد | عصا يسار حركة، RT تأرجح، A قفز، X شبكة |

## 🌆 ماذا في اللعبة؟
مدينة غارقة بمطر أبدي: **255 مبنى و169 بلوكة**، تنجيل بفيزياء قيود حقيقية (Spider-Man style)،
**20 صيادًا** بدورية ومطاردة وشرانق، **12 قطعة أثرية** تفتح معركة **زعيم على قمة البرج**،
قصة من 3 فصول + نهاية، نقاط وحيوية (5 قلوب + إسبات وبعث)، خريطة مصغرة، قائمة رئيسية
بطيران سينمائي فوق المدينة، إعدادات رسومية وصوتية محفوظة، **صوت WebAudio مولّد بالكامل** (بلا ملفات)،
وحفظ تلقائي في المتصفح/الإلكترول.

## 🛠 من المصدر
```bash
python3 build_open.py          # binline three + rig + game → open-world.html
node --check open_world_script.mjs
python3 gen_harness.py && node harness_openworld.mjs   # 9 physics assertions
cd pc && bash build_exe.sh     # Electron win64 portable zip
```
الملفات: `openworld_game.js` (المحرّك) • `creature_block.js` (ريج المخلوق بخطوة كلاسيكية) •
`build_open.py` (المُجمِّع) • `gen_harness.py` (اختبار الفيزياء) • `pc/` (تغليف إلكترول).

<div dir="rtl">

مرخّصة MIT — ابنِ عليها كما تشاء 🕷

</div>

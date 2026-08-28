# Arad Music Playlists — Final UI

نسخه نهایی رابط کاربری موزیک‌پلیر Arad Music Playlists.

## نصب
تمام فایل‌های داخل این بسته را در Root ریپازیتوری زیر جایگزین کن:

`omidmoghiseh80-cell/robin-music-player`

GitHub Pages:
- Branch: `main`
- Folder: `/ (root)`

## فونت
رابط کاربری با **Shabnam Farsi Digits** تنظیم شده و از نسخه وب CDN استفاده می‌کند؛ بنابراین اعداد نیز با گلیف فارسی نمایش داده می‌شوند.

## اضافه کردن آهنگ
فقط Release با Tag `music-v1` را Edit کن، MP3 جدید را Upload و Save کن. سپس در پلیر دکمه Refresh را بزن.

## امکانات
- دریافت خودکار فایل‌ها از GitHub Release
- UI جدید Dark / Light
- طراحی موبایل و دسکتاپ
- Full-screen mobile player
- جستجوی لحظه‌ای
- Favorites
- Recently Played
- Playlist شخصی
- Shuffle / Repeat One / Repeat All
- Sleep Timer
- Playback speed
- Media Session / Lock Screen controls
- Share link
- Cache لیست فایل‌ها
- PWA shell
- انیمیشن دیسک و Equalizer


## اصلاح v4
- اصلاح آدرس CDN فونت Shabnam Farsi Digits از نسخه نامعتبر `v5.0.1` به `v5.0.0`.
- حذف Service Worker قبلی برای جلوگیری از نمایش CSS/JS کش‌شده.
- افزودن Cache Busting به `style.css` و `app.js`.
- پس از جایگزینی فایل‌ها، یک بار صفحه را با Ctrl+F5 باز کن.

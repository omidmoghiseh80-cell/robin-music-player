# Arad Music Playlists

یک موزیک‌پلیر وب استاتیک برای GitHub Pages که فایل‌های صوتی را به‌صورت خودکار از GitHub Release با Tag `music-v1` دریافت می‌کند.

## نصب
فایل‌های این ZIP را در ریشه Repository زیر قرار بده:

`omidmoghiseh80-cell/robin-music-player`

سپس GitHub Pages را روی Branch `main` و Folder `/ (root)` فعال نگه دار.

## افزودن آهنگ جدید
1. وارد Releases شو.
2. Release با Tag `music-v1` را Edit کن.
3. فایل MP3 جدید را Upload کن.
4. Save کن.
5. در سایت دکمه Refresh را بزن.

نیازی به ویرایش کد یا افزودن دستی URL آهنگ نیست.

## امکانات
- خواندن خودکار MP3ها از GitHub Release API
- جستجوی لحظه‌ای
- Favorites
- Recently Played
- Playlistهای شخصی
- Shuffle
- Repeat All / Repeat One
- Previous / Next
- Seek / Volume / Mute
- سرعت پخش
- Sleep Timer
- Share Link
- Media Session برای کنترل از Lock Screen
- ذخیره تنظیمات در LocalStorage
- Dark / Light
- Responsive
- PWA shell / Service Worker
- Cache لیست آهنگ‌ها برای کاهش درخواست GitHub API

## نکته
Favorites، History و Playlistهای شخصی داخل مرورگر همان دستگاه ذخیره می‌شوند و روی دستگاه‌های مختلف Sync نیستند.

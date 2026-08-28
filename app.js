(() => {
  // v4: remove old Service Worker caches so UI/font updates show immediately.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => reg.unregister());
    }).catch(() => {});
  }
  if ("caches" in window) {
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith("arad-music-shell")).map(k => caches.delete(k))
    )).catch(() => {});
  }
  const CONFIG = {
    owner: "omidmoghiseh80-cell",
    repo: "robin-music-player",
    tag: "music-v1",
    cacheKey: "arad_tracks_cache_v2",
    cacheMs: 15 * 60 * 1000
  };

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const audio = $("#audio");
  let tracks = [];
  let visibleTracks = [];
  let currentIndex = -1;
  let currentView = "all";
  let currentSort = "default";
  let shuffle = false;
  let repeatMode = 0; // 0 off, 1 all, 2 one
  let sleepTimer = null;

  const state = {
    favorites: new Set(JSON.parse(localStorage.getItem("arad_favorites") || "[]")),
    recent: JSON.parse(localStorage.getItem("arad_recent") || "[]"),
    playlists: JSON.parse(localStorage.getItem("arad_playlists") || "{}")
  };

  function saveState() {
    localStorage.setItem("arad_favorites", JSON.stringify([...state.favorites]));
    localStorage.setItem("arad_recent", JSON.stringify(state.recent.slice(0, 60)));
    localStorage.setItem("arad_playlists", JSON.stringify(state.playlists));
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function cleanTitle(filename) {
    return decodeURIComponent(filename)
      .replace(/\.(mp3|m4a|wav|ogg|flac)$/i, "")
      .replace(/[_]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }


  function guessMime(name) {
    const ext = String(name || "").split(".").pop().toLowerCase();
    return ({
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      mp4: "audio/mp4",
      aac: "audio/aac",
      wav: "audio/wav",
      ogg: "audio/ogg",
      flac: "audio/flac"
    })[ext] || "audio/mpeg";
  }

  function isMobileBrowser() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
           (navigator.maxTouchPoints > 1 && window.innerWidth <= 1024);
  }

  function setAudioSource(track) {
    // Important for iOS/Safari: use an explicit <source type="audio/mpeg">
    // instead of only assigning audio.src to GitHub's generic octet-stream response.
    audio.pause();
    audio.removeAttribute("src");
    while (audio.firstChild) audio.removeChild(audio.firstChild);

    const source = document.createElement("source");
    source.src = track.url;
    source.type = track.contentType || guessMime(track.name);
    audio.appendChild(source);
    audio.load();
  }

  async function startPlaybackWithMobileFallback(track) {
    setAudioSource(track);

    // Playback is initiated directly from the user's tap whenever possible.
    try {
      const p = audio.play();
      if (p && typeof p.then === "function") await p;
      hidePlaybackError();
      return true;
    } catch (firstError) {
      console.warn("Initial audio.play() failed:", firstError);

      // Safari sometimes needs metadata/canplay after load before the second play().
      try {
        await new Promise((resolve, reject) => {
          let done = false;
          const cleanup = () => {
            audio.removeEventListener("canplay", ok);
            audio.removeEventListener("loadedmetadata", ok);
            audio.removeEventListener("error", bad);
          };
          const ok = () => {
            if (done) return;
            done = true;
            cleanup();
            resolve();
          };
          const bad = () => {
            if (done) return;
            done = true;
            cleanup();
            reject(new Error("media-load-error"));
          };
          audio.addEventListener("canplay", ok, { once:true });
          audio.addEventListener("loadedmetadata", ok, { once:true });
          audio.addEventListener("error", bad, { once:true });
          setTimeout(ok, 2200);
        });
        await audio.play();
        hidePlaybackError();
        return true;
      } catch (secondError) {
        console.error("Mobile playback fallback failed:", secondError);
        showPlaybackError(track, secondError);
        return false;
      }
    }
  }

  function showPlaybackError(track, err) {
    const box = $("#playbackError");
    if (!box) return;
    const code = audio.error?.code;
    const messages = {
      1: "پخش توسط مرورگر متوقف شد.",
      2: "مرورگر نتوانست فایل صوتی را از سرور دریافت کند.",
      3: "مرورگر نتوانست فایل صوتی را Decode کند.",
      4: "فرمت یا پاسخ سرور توسط مرورگر موبایل پشتیبانی نشد."
    };
    $("#playbackErrorText").textContent =
      messages[code] || "مرورگر موبایل نتوانست این فایل را مستقیم پخش کند. دوباره تلاش کن.";
    $("#openTrackDirectBtn").href = track?.url || "#";
    box.classList.remove("hidden");
  }

  function hidePlaybackError() {
    $("#playbackError")?.classList.add("hidden");
  }

  function formatTime(v) {
    if (!Number.isFinite(v)) return "0:00";
    const m = Math.floor(v / 60);
    const s = Math.floor(v % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  async function fetchTracks(force = false) {
    $("#statusText").textContent = "در حال دریافت لیست آهنگ‌ها…";
    try {
      if (!force) {
        const cached = JSON.parse(localStorage.getItem(CONFIG.cacheKey) || "null");
        if (cached && Date.now() - cached.ts < CONFIG.cacheMs && cached.data?.length) {
          tracks = cached.data;
          afterLoad("از کش");
          refreshFromNetworkSilently();
          return;
        }
      }

      const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/releases/tags/${CONFIG.tag}`;
      const res = await fetch(url, { headers: { "Accept": "application/vnd.github+json" } });
      if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
      const release = await res.json();

      tracks = release.assets
        .filter(a => /\.(mp3|m4a|wav|ogg|flac)$/i.test(a.name))
        .map((a, i) => ({
          id: a.id || `${i}-${a.name}`,
          name: a.name,
          title: cleanTitle(a.name),
          url: a.browser_download_url,
          size: a.size || 0,
          downloadCount: a.download_count || 0,
          contentType: a.content_type || guessMime(a.name)
        }));

      localStorage.setItem(CONFIG.cacheKey, JSON.stringify({ ts: Date.now(), data: tracks }));
      afterLoad("GitHub");
    } catch (err) {
      console.error(err);
      const cached = JSON.parse(localStorage.getItem(CONFIG.cacheKey) || "null");
      if (cached?.data?.length) {
        tracks = cached.data;
        afterLoad("کش آفلاین");
        toast("اتصال به GitHub برقرار نشد؛ لیست ذخیره‌شده نمایش داده شد");
      } else {
        $("#statusText").textContent = "دریافت لیست ناموفق بود";
        $("#emptyState").classList.remove("hidden");
        $("#emptyState h3").textContent = "لیست آهنگ‌ها دریافت نشد";
        $("#emptyState p").textContent = "اتصال اینترنت یا وضعیت GitHub را بررسی کن.";
      }
    }
  }

  async function refreshFromNetworkSilently() {
    try {
      const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/releases/tags/${CONFIG.tag}`;
      const res = await fetch(url, { headers: { "Accept": "application/vnd.github+json" } });
      if (!res.ok) return;
      const release = await res.json();
      const fresh = release.assets
        .filter(a => /\.(mp3|m4a|wav|ogg|flac)$/i.test(a.name))
        .map((a, i) => ({
          id: a.id || `${i}-${a.name}`,
          name: a.name,
          title: cleanTitle(a.name),
          url: a.browser_download_url,
          size: a.size || 0,
          downloadCount: a.download_count || 0,
          contentType: a.content_type || guessMime(a.name)
        }));
      if (fresh.length !== tracks.length) {
        tracks = fresh;
        localStorage.setItem(CONFIG.cacheKey, JSON.stringify({ ts: Date.now(), data: tracks }));
        applyView();
        toast("لیست آهنگ‌ها بروزرسانی شد");
      }
    } catch {}
  }

  function afterLoad(source) {
    $("#statusText").textContent = `${tracks.length} آهنگ • ${source}`;
    $("#trackCount").textContent = tracks.length.toLocaleString("fa-IR");
    applyView();
    restoreLastTrack();
  }

  function applyView() {
    let list = [...tracks];
    const q = $("#searchInput").value.trim().toLowerCase();

    if (currentView === "favorites") {
      list = list.filter(t => state.favorites.has(String(t.id)));
      $("#pageTitle").textContent = "موردعلاقه‌ها";
      $("#heroSub").textContent = "آهنگ‌هایی که ذخیره کرده‌ای";
    } else if (currentView === "recent") {
      const order = new Map(state.recent.map((id, i) => [String(id), i]));
      list = list.filter(t => order.has(String(t.id))).sort((a,b) => order.get(String(a.id)) - order.get(String(b.id)));
      $("#pageTitle").textContent = "اخیراً پخش‌شده";
      $("#heroSub").textContent = "آخرین آهنگ‌هایی که گوش داده‌ای";
    } else if (currentView.startsWith("playlist:")) {
      const name = currentView.slice(9);
      const ids = new Set(state.playlists[name] || []);
      list = list.filter(t => ids.has(String(t.id)));
      $("#pageTitle").textContent = name;
      $("#heroSub").textContent = "پلی‌لیست شخصی";
    } else {
      $("#pageTitle").textContent = "همه آهنگ‌ها";
      $("#heroSub").textContent = "کتابخانه موسیقی آنلاین شما";
    }

    if (q) list = list.filter(t => `${t.title} ${t.name}`.toLowerCase().includes(q));
    if (currentSort === "az") list.sort((a,b) => a.title.localeCompare(b.title));
    if (currentSort === "za") list.sort((a,b) => b.title.localeCompare(a.title));

    visibleTracks = list;
    $("#trackCount").textContent = list.length.toLocaleString("fa-IR");
    renderTracks();
  }

  function renderTracks() {
    const host = $("#trackList");
    host.innerHTML = "";
    $("#emptyState").classList.toggle("hidden", visibleTracks.length > 0);

    const frag = document.createDocumentFragment();
    visibleTracks.forEach((t, i) => {
      const row = document.createElement("div");
      row.className = "track-row" + (currentIndex >= 0 && tracks[currentIndex]?.id === t.id ? " active" : "");
      row.dataset.id = t.id;
      row.innerHTML = `
        <div class="track-num">${i + 1}</div>
        <div class="track-title-wrap">
          <button class="cover mini-play" title="پخش">▶</button>
          <div style="min-width:0">
            <div class="track-title">${escapeHtml(t.title)}</div>
            <div class="track-sub">${t.downloadCount ? t.downloadCount.toLocaleString("fa-IR") + " بار دریافت" : "Arad Music"}</div>
          </div>
        </div>
        <div class="filename">${escapeHtml(t.name)}</div>
        <div class="duration-cell">${(t.size/1024/1024).toFixed(1)} MB</div>
        <div class="track-actions">
          <button class="mini-btn fav-btn" title="علاقه‌مندی">${state.favorites.has(String(t.id)) ? "♥" : "♡"}</button>
          <button class="mini-btn add-btn" title="افزودن به پلی‌لیست">＋</button>
          <button class="mini-btn share-btn" title="اشتراک">↗</button>
        </div>`;
      row.querySelector(".mini-play").onclick = e => { e.stopPropagation(); playTrackById(t.id); };
      row.querySelector(".fav-btn").onclick = e => { e.stopPropagation(); toggleFavorite(t.id); };
      row.querySelector(".share-btn").onclick = e => { e.stopPropagation(); shareTrack(t); };
      row.querySelector(".add-btn").onclick = e => { e.stopPropagation(); addToPlaylistPrompt(t.id); };
      row.onclick = () => playTrackById(t.id);
      frag.appendChild(row);
    });
    host.appendChild(frag);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  async function playTrackById(id, autoplay = true) {
    const idx = tracks.findIndex(t => String(t.id) === String(id));
    if (idx < 0) return;
    currentIndex = idx;
    const t = tracks[idx];

    updateNowPlaying();
    addRecent(t.id);
    localStorage.setItem("arad_last_track", String(t.id));
    renderTracks();

    if (!autoplay) {
      setAudioSource(t);
      return;
    }

    await startPlaybackWithMobileFallback(t);
  }

  function updateNowPlaying() {
    if (currentIndex < 0) return;
    const t = tracks[currentIndex];
    $("#nowTitle").textContent = t.title;
    $("#nowFile").textContent = t.name;
    $("#mobileTitle").textContent = t.title;
    $("#mobileFile").textContent = t.name;
    $("#favCurrentBtn").textContent = state.favorites.has(String(t.id)) ? "♥" : "♡";
    if ($("#mobileFavBtn")) $("#mobileFavBtn").textContent = state.favorites.has(String(t.id)) ? "♥" : "♡";
    document.title = `${t.title} — Arad Music Playlists`;

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title,
        artist: "Arad Music Playlists",
        album: "GitHub Music Library"
      });
    }
  }

  function toggleFavorite(id) {
    id = String(id);
    state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
    saveState();
    renderTracks();
    updateNowPlaying();
  }

  function addRecent(id) {
    id = String(id);
    state.recent = [id, ...state.recent.filter(x => String(x) !== id)].slice(0, 60);
    saveState();
  }

  function nextTrack() {
    if (!tracks.length) return;
    if (repeatMode === 2 && currentIndex >= 0) { audio.currentTime = 0; audio.play(); return; }
    let idx = currentIndex;
    if (shuffle) idx = Math.floor(Math.random() * tracks.length);
    else idx = (idx + 1) % tracks.length;
    if (idx === 0 && currentIndex === tracks.length - 1 && repeatMode === 0) { audio.pause(); return; }
    playTrackById(tracks[idx].id);
  }

  function prevTrack() {
    if (!tracks.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    const idx = currentIndex <= 0 ? tracks.length - 1 : currentIndex - 1;
    playTrackById(tracks[idx].id);
  }

  function togglePlay() {
    if (currentIndex < 0) {
      if (visibleTracks.length) playTrackById(visibleTracks[0].id);
      return;
    }
    if (audio.paused) {
      if (!audio.currentSrc && tracks[currentIndex]) {
        startPlaybackWithMobileFallback(tracks[currentIndex]);
      } else {
        audio.play().catch(() => startPlaybackWithMobileFallback(tracks[currentIndex]));
      }
    } else {
      audio.pause();
    }
  }

  function syncPlayIcons() {
    const paused = audio.paused;
    $("#playBtn").textContent = paused ? "▶" : "❚❚";
    $("#mobilePlayBtn").textContent = paused ? "▶" : "❚❚";
  }

  function shareTrack(t) {
    const url = `${location.origin}${location.pathname}?track=${encodeURIComponent(t.id)}`;
    if (navigator.share) navigator.share({ title: t.title, text: "Arad Music Playlists", url }).catch(()=>{});
    else navigator.clipboard.writeText(url).then(() => toast("لینک آهنگ کپی شد"));
  }

  function restoreLastTrack() {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get("track");
    const id = fromUrl || localStorage.getItem("arad_last_track");
    if (id && tracks.some(t => String(t.id) === String(id))) playTrackById(id, false);
  }

  function renderPlaylists() {
    const host = $("#playlistList");
    host.innerHTML = "";
    Object.keys(state.playlists).forEach(name => {
      const row = document.createElement("div");
      row.className = "playlist-row";
      row.innerHTML = `<span>▣ ${escapeHtml(name)}</span><small>${state.playlists[name].length}</small>`;
      row.onclick = () => setView(`playlist:${name}`);
      host.appendChild(row);
    });
  }

  function setView(view) {
    currentView = view;
    $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    applyView();
    $("#sidebar").classList.remove("open");
  }

  function addToPlaylistPrompt(id) {
    const names = Object.keys(state.playlists);
    if (!names.length) { $("#playlistDialog").showModal(); toast("اول یک پلی‌لیست بساز"); return; }
    const name = prompt("نام پلی‌لیست:\n" + names.join("\n"));
    if (!name || !state.playlists[name]) return;
    const arr = state.playlists[name];
    const sid = String(id);
    if (!arr.includes(sid)) arr.push(sid);
    saveState(); renderPlaylists(); toast("به پلی‌لیست اضافه شد");
  }

  // Events
  audio.addEventListener("play", () => { syncPlayIcons(); document.body.classList.add("playing"); });
  audio.addEventListener("pause", () => { syncPlayIcons(); document.body.classList.remove("playing"); });
  audio.addEventListener("ended", nextTrack);
  audio.addEventListener("loadedmetadata", () => $("#duration").textContent = formatTime(audio.duration));
  audio.addEventListener("timeupdate", () => {
    $("#currentTime").textContent = formatTime(audio.currentTime);
    const p = audio.duration ? audio.currentTime / audio.duration : 0;
    $("#seek").value = Math.round(p * 1000);
    $("#mobileProgressFill").style.width = `${p * 100}%`;
    if (Math.floor(audio.currentTime) % 5 === 0 && currentIndex >= 0) {
      localStorage.setItem("arad_resume", JSON.stringify({ id: String(tracks[currentIndex].id), time: audio.currentTime }));
    }
  });
  audio.addEventListener("error", () => { console.warn("HTMLMediaElement error", audio.error); });

  $("#playBtn").onclick = togglePlay;
  $("#mobilePlayBtn").onclick = togglePlay;
  $("#nextBtn").onclick = nextTrack; $("#mobileNextBtn").onclick = nextTrack;
  $("#prevBtn").onclick = prevTrack; $("#mobilePrevBtn").onclick = prevTrack;
  $("#favCurrentBtn").onclick = () => currentIndex >= 0 && toggleFavorite(tracks[currentIndex].id);

  $("#seek").oninput = e => {
    if (audio.duration) audio.currentTime = (Number(e.target.value) / 1000) * audio.duration;
  };
  $("#volume").oninput = e => {
    audio.volume = Number(e.target.value);
    localStorage.setItem("arad_volume", audio.volume);
  };
  $("#muteBtn").onclick = () => { audio.muted = !audio.muted; $("#muteBtn").textContent = audio.muted ? "🔇" : "🔊"; };
  $("#speedSelect").onchange = e => { audio.playbackRate = Number(e.target.value); localStorage.setItem("arad_speed", e.target.value); };

  $("#shuffleBtn").onclick = () => {
    shuffle = !shuffle; $("#shuffleBtn").classList.toggle("active", shuffle); $("#mobileShuffleBtn").classList.toggle("active", shuffle);
    toast(shuffle ? "Shuffle روشن شد" : "Shuffle خاموش شد");
  };
  $("#mobileShuffleBtn").onclick = () => $("#shuffleBtn").click();

  $("#repeatBtn").onclick = () => {
    repeatMode = (repeatMode + 1) % 3;
    $("#repeatBtn").classList.toggle("active", repeatMode > 0);
    $("#mobileRepeatBtn").classList.toggle("active", repeatMode > 0);
    $("#repeatBtn").textContent = repeatMode === 2 ? "↻¹" : "↻";
    toast(["Repeat خاموش", "Repeat All", "Repeat One"][repeatMode]);
  };
  $("#mobileRepeatBtn").onclick = () => $("#repeatBtn").click();

  $("#searchInput").addEventListener("input", applyView);
  $$(".nav-item").forEach(b => b.onclick = () => setView(b.dataset.view));
  $$(".filter").forEach(b => b.onclick = () => {
    currentSort = b.dataset.sort; $$(".filter").forEach(x => x.classList.toggle("active", x === b)); applyView();
  });

  $("#playAllBtn").onclick = () => visibleTracks.length && playTrackById(visibleTracks[0].id);
  $("#randomBtn").onclick = () => visibleTracks.length && playTrackById(visibleTracks[Math.floor(Math.random()*visibleTracks.length)].id);
  $("#shuffleAllBtn").onclick = () => { shuffle = true; $("#shuffleBtn").classList.add("active"); $("#randomBtn").click(); };
  $("#refreshBtn").onclick = () => { localStorage.removeItem(CONFIG.cacheKey); fetchTracks(true); };
  $("#menuBtn").onclick = () => $("#sidebar").classList.toggle("open");
  $("#themeBtn").onclick = () => {
    document.documentElement.classList.toggle("light");
    localStorage.setItem("arad_theme", document.documentElement.classList.contains("light") ? "light" : "dark");
  };

  $("#newPlaylistBtn").onclick = () => $("#playlistDialog").showModal();
  $("#createPlaylistConfirm").onclick = e => {
    e.preventDefault();
    const name = $("#playlistName").value.trim();
    if (!name) return;
    if (!state.playlists[name]) state.playlists[name] = [];
    saveState(); renderPlaylists(); $("#playlistName").value = ""; $("#playlistDialog").close(); toast("پلی‌لیست ساخته شد");
  };

  $("#sleepBtn").onclick = () => {
    const mins = prompt("چند دقیقه دیگر پخش متوقف شود؟", "30");
    if (!mins) return;
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => { audio.pause(); toast("Sleep timer: پخش متوقف شد"); }, Number(mins) * 60000);
    toast(`Sleep timer روی ${mins} دقیقه تنظیم شد`);
  };

  $("#playerBar").addEventListener("click", e => {
    if (innerWidth <= 620 && !e.target.closest("button") && currentIndex >= 0) $("#mobilePlayer").classList.remove("hidden");
  });
  $("#mobileCloseBtn").onclick = () => $("#mobilePlayer").classList.add("hidden");
  $("#mobileFavBtn").onclick = () => currentIndex >= 0 && toggleFavorite(tracks[currentIndex].id);


  $("#retryPlaybackBtn")?.addEventListener("click", () => {
    if (currentIndex >= 0) {
      hidePlaybackError();
      startPlaybackWithMobileFallback(tracks[currentIndex]);
    }
  });
  $("#closePlaybackErrorBtn")?.addEventListener("click", hidePlaybackError);

  document.addEventListener("keydown", e => {
    if (e.target.matches("input,textarea")) return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    if (e.key === "ArrowRight") audio.currentTime += 5;
    if (e.key === "ArrowLeft") audio.currentTime -= 5;
    if (e.key === "/") { e.preventDefault(); $("#searchInput").focus(); }
  });

  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => audio.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("previoustrack", prevTrack);
    navigator.mediaSession.setActionHandler("nexttrack", nextTrack);
    try {
      navigator.mediaSession.setActionHandler("seekbackward", d => audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10)));
      navigator.mediaSession.setActionHandler("seekforward", d => audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (d.seekOffset || 10)));
    } catch {}
  }

  // Init
  if (localStorage.getItem("arad_theme") === "light") document.documentElement.classList.add("light");
  audio.volume = Number(localStorage.getItem("arad_volume") || 0.85);
  $("#volume").value = audio.volume;
  const savedSpeed = localStorage.getItem("arad_speed") || "1";
  $("#speedSelect").value = savedSpeed;
  renderPlaylists();
  fetchTracks();
})();
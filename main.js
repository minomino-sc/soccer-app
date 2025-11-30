const YT_KEY = "yt_videos";
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("addYtBtn").addEventListener("click", addYoutube);
  renderYoutubeList();
});
function addYoutube() {
  const url = document.getElementById("ytUrl").value.trim();
  if (!url) return alert("URL を入力してください");
  if (!url.includes("youtu")) return alert("YouTube の URL を入力してください");
  const list = JSON.parse(localStorage.getItem(YT_KEY) || "[]");
  list.push({ url, added: new Date().toISOString() });
  localStorage.setItem(YT_KEY, JSON.stringify(list));
  document.getElementById("ytUrl").value = "";
  renderYoutubeList();
}
function renderYoutubeList() {
  const area = document.getElementById("ytList");
  const list = JSON.parse(localStorage.getItem(YT_KEY) || "[]");
  if (list.length === 0) {
    area.innerHTML = `<p class="muted">まだ動画がありません。</p>`;
    return;
  }
  area.innerHTML = "";
  list.forEach(v => {
    const div = document.createElement("div");
    div.className = "yt-item";
    div.innerHTML = `<a href="${v.url}" target="_blank" class="yt-link">${v.url}</a>`;
    area.appendChild(div);
  });
}

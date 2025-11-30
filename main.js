let teams = JSON.parse(localStorage.getItem("teams") || "{}");

function getCurrentTeam() {
  return localStorage.getItem("currentTeam");
}

function saveTeams() {
  localStorage.setItem("teams", JSON.stringify(teams));
}

function extractYouTubeId(url) {
  const match = url.match(/(?:youtu.be\/|v=)([^&]+)/);
  return match ? match[1] : "";
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnAddYouTube").addEventListener("click", () => {
    const url = youtubeUrl.value.trim();
    if (!url) return;

    const team = getCurrentTeam() || "default";
    if (!teams[team]) teams[team] = {};
    if (!teams[team].videos) teams[team].videos = [];

    teams[team].videos.push({
      url,
      id: Date.now()
    });

    saveTeams();
    youtubeUrl.value = "";
    renderVideoList();
  });

  renderVideoList();
});

function renderVideoList() {
  const list = document.getElementById("videoList");
  const team = getCurrentTeam() || "default";

  if (!teams[team] || !teams[team].videos || teams[team].videos.length === 0) {
    list.innerHTML = "<p>動画がありません</p>";
    return;
  }

  list.innerHTML = teams[team].videos
    .map(v => {
      const vid = extractYouTubeId(v.url);
      return `
        <div class="video-item">
          <img src="https://img.youtube.com/vi/${vid}/hqdefault.jpg" class="thumb" />
          <p>${v.url}</p>
        </div>
      `;
    })
    .join("");
}

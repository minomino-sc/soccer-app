// ===============================
// 設定
// ===============================
const TEAMS_JSON_URL = "https://raw.githubusercontent.com/minomino-sc/soccer-app/main/data/teams.json";
const TEAMS_JSON_EDIT_URL = "https://api.github.com/repos/minomino-sc/soccer-app/contents/data/teams.json";

// ※ GitHub トークンは GitHub → Settings → Developer settings → Tokens で作成
// 「Fine-grained token」→ soccer-app のみ Read/Write 権限
const GITHUB_TOKEN = "";   // ★ここに貼る（外には公開しない）

// ===============================
// GitHub から JSON を取得
// ===============================
async function loadTeams() {
    const res = await fetch(TEAMS_JSON_URL + "?t=" + Date.now());
    return res.json();
}

// ===============================
// GitHub に JSON を保存
// ===============================
async function saveTeams(updatedJson) {
    const getRes = await fetch(TEAMS_JSON_EDIT_URL, {
        headers: { "Authorization": `Bearer ${GITHUB_TOKEN}` }
    });
    const fileData = await getRes.json();

    const newContent = btoa(unescape(encodeURIComponent(JSON.stringify(updatedJson, null, 2))));

    const putRes = await fetch(TEAMS_JSON_EDIT_URL, {
        method: "PUT",
        headers: {
            "Authorization": `Bearer ${GITHUB_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: "Update teams.json",
            content: newContent,
            sha: fileData.sha
        })
    });

    return putRes.ok;
}

// ===============================
// チーム作成
// ===============================
async function createTeam() {
    const teamName = prompt("チーム名を入力してください");
    if (!teamName) return;

    const inviteCode = Math.random().toString(36).substring(2, 8);

    const data = await loadTeams();
    data.teams.push({
        name: teamName,
        invite: inviteCode,
        members: []
    });

    const ok = await saveTeams(data);
    if (ok) {
        alert(`チーム作成完了！ 招待コード:\n\n${inviteCode}`);
        showTeams();
    } else {
        alert("保存に失敗しました。");
    }
}

// ===============================
// チーム参加
// ===============================
async function joinTeam() {
    const code = prompt("招待コードを入力してください");
    if (!code) return;

    const data = await loadTeams();
    const team = data.teams.find(t => t.invite === code);

    if (!team) {
        alert("チームが見つかりません");
        return;
    }

    const user = prompt("参加者の名前を入力してください");
    if (!user) return;

    team.members.push(user);
    const ok = await saveTeams(data);

    if (ok) {
        alert("参加しました！");
        showTeams();
    } else {
        alert("保存に失敗しました。");
    }
}

// ===============================
// チーム一覧表示
// ===============================
async function showTeams() {
    const data = await loadTeams();
    const list = document.getElementById("teamList");
    list.innerHTML = "";

    data.teams.forEach(team => {
        const div = document.createElement("div");
        div.className = "team-card";
        div.innerHTML = `
            <h3>${team.name}</h3>
            <p>招待コード：<b>${team.invite}</b></p>
            <p>メンバー：${team.members.join("、")}</p>
        `;
        list.appendChild(div);
    });
}

// ===============================
// 初期化
// ===============================
document.addEventListener("DOMContentLoaded", () => {
    showTeams();
    document.getElementById("createTeamBtn").onclick = createTeam;
    document.getElementById("joinTeamBtn").onclick = joinTeam;
});

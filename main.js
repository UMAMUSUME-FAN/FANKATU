const DB_KEY = 'uma_mock_db';
const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwYkegOnemTtYiFOLBRVb2TziWLknM6vRU2FutBpOHRaszqWCg1UnU1HUKBhWQikB4X/exec'; 
let DISCORD_CLIENT_ID = '1497168159210340484';

let currentUser = null;
let currentCircle = null;

// --- Helper Functions ---
function showToast(m, t='success'){ 
    const s=document.getElementById('toast'); 
    if(!s) return; 
    s.textContent=m; s.className=`toast show ${t}`; 
    setTimeout(()=>s.classList.remove('show'),3000); 
}

async function callBackend(p) {
    if (!GAS_ENDPOINT) {
        showToast("サーバーURLが未設定です", "error");
        return null;
    }
    try {
        const response = await fetch(GAS_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({ ...p, currentUser: currentUser })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        return (result && result.success) ? result.db : null;
    } catch (e) {
        console.error("Backend Error:", e);
        showToast("通信エラーが発生しました", "error");
        return null;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // --- Login Logic ---
    const loginBtn = document.getElementById('discordLoginBtn');
    if (loginBtn) {
        loginBtn.onclick = () => {
            const r = window.location.origin + window.location.pathname;
            window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(r)}&response_type=token&scope=identify`;
        };
    }

    const authOverlay = document.getElementById('authOverlay');
    const portalOverlay = document.getElementById('circleSelectionOverlay');
    const appWrapper = document.getElementById('appWrapper');
    
    // Auth Check
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    if (token) {
        window.history.replaceState({}, document.title, window.location.pathname);
        try {
            const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } });
            if (!userRes.ok) throw new Error();
            const du = await userRes.json();
            currentUser = { id: du.id, name: du.username, avatar: `https://cdn.discordapp.com/avatars/${du.id}/${du.avatar}.png` };
            if (authOverlay) authOverlay.classList.add('hidden');
            showPortal();
        } catch(e) { 
            showToast("ログイン失敗", "error");
        }
    }

    // --- Portal Logic ---
    async function showPortal() {
        if(!portalOverlay) return;
        portalOverlay.classList.remove('hidden');
        if(currentUser) {
            document.getElementById('portalUserName').textContent = currentUser.name;
            document.getElementById('portalUserAvatar').style.backgroundImage = `url('${currentUser.avatar}')`;
        }
        
        // --- 修正版：新規作成ボタン ---
        const showCreateBtn = document.getElementById('showCreateCircleBtn');
        const createModal = document.getElementById('create-circle-modal');
        
        const executeCreate = async (name) => {
            if(!name) return;
            try {
                showToast("サークルを設立中...");
                const db = await callBackend({ action: 'createCircle', name: name });
                if(db && db.lastCreatedId) {
                    showToast(`『${name}』を設立！`);
                    if(createModal) createModal.classList.add('hidden');
                    await renderPortalCircles();
                    window.loginToCircle(db.lastCreatedId);
                } else {
                    showToast("サーバー側でエラーが発生しました", "error");
                }
            } catch(e) { showToast("作成失敗", "error"); }
        };

        if(showCreateBtn) {
            showCreateBtn.onclick = () => {
                if(createModal) {
                    createModal.classList.remove('hidden');
                } else {
                    // もし小窓（モーダル）がHTMLに無ければ、ブラウザ標準の入力を使う
                    const name = prompt("サークル名を入力してください：");
                    if(name) executeCreate(name);
                }
            };
        }

        if(createModal) {
            const cancelBtn = document.getElementById('cancelCreateCircle');
            const confirmBtn = document.getElementById('confirmCreateCircle');
            if(cancelBtn) cancelBtn.onclick = () => createModal.classList.add('hidden');
            if(confirmBtn) confirmBtn.onclick = () => {
                const nameInput = document.getElementById('newCircleName');
                executeCreate(nameInput.value);
                nameInput.value = '';
            };
        }

        // --- ログアウト ---
        const logoutBtn = document.getElementById('logoutBtnFromPortal');
        if(logoutBtn) logoutBtn.onclick = () => window.location.reload();

        renderPortalCircles();
    }

    async function renderPortalCircles() {
        const db = await callBackend({ action: 'getAllCircles' });
        const myList = document.getElementById('myCirclesList');
        const resList = document.getElementById('searchResultsList');
        if(!myList || !resList) return;
        
        myList.innerHTML = ''; resList.innerHTML = '';
        if(!db) { myList.innerHTML = "<p style='font-size:10px; opacity:0.5;'>サーバーに接続できません</p>"; return; }
        
        const myIds = db.userToCircles[currentUser?.id] || [];
        myIds.forEach(cid => {
            const c = db.circles[cid]; if(!c) return;
            const div = document.createElement('div'); div.className = 'glass-btn'; div.style = "margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; padding-right:10px;";
            div.innerHTML = `
                <div style="flex:1;" onclick="window.loginToCircle('${cid}')">
                    <span style="font-size:12px; font-weight:bold;">${c.name}</span>
                    <span class="tag" style="background:var(--primary); color:white; font-size:9px; margin-left:5px;">入室</span>
                </div>
                <button class="text-link" style="color:red; font-size:10px; opacity:0.6;" onclick="event.stopPropagation(); window.leaveCircle('${cid}', '${c.name}')">脱退</button>
            `;
            myList.appendChild(div);
        });

        Object.values(db.circles).forEach(c => {
            if(myIds.includes(c.id)) return;
            const div = document.createElement('div'); div.className = 'glass-btn'; div.style = "margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;";
            div.innerHTML = `<span>${c.name}</span> <button class="tag-btn" onclick="window.joinCircle('${c.id}', '${c.name}')">加入</button>`;
            resList.appendChild(div);
        });
    }

    // --- Global Actions ---
    window.loginToCircle = async (cid) => {
        const db = await callBackend({ action: 'getCircleData', circleId: cid });
        if (db && db.circles[cid]) {
            currentCircle = db.circles[cid];
            portalOverlay.classList.add('hidden');
            appWrapper.style.display = 'flex';
            document.getElementById('userNameDisplay').textContent = currentUser?.name || "Member";
            if(currentUser?.avatar) document.getElementById('userAvatar').style.backgroundImage = `url('${currentUser.avatar}')`;
            await updateDashboard();
        }
    };

    window.leaveCircle = async (cid, name) => {
        if(confirm(`『${name}』から脱退しますか？`)) {
            await callBackend({ action: 'leaveCircle', circleId: cid });
            showToast("脱退完了");
            renderPortalCircles();
        }
    };

    window.joinCircle = async (cid, name) => {
        showToast("加入中...");
        const db = await callBackend({ action: 'joinCircle', circleId: cid });
        if(db) { showToast(`『${name}』に加入しました！`); renderPortalCircles(); }
    };

    async function updateDashboard() {
        const db = await callBackend({ action: 'getCircleData', circleId: currentCircle?.id });
        if(!db || !currentCircle) return;
        const c = db.circles[currentCircle.id];
        const uid = currentUser?.id || 'guest';
        const my = c.members[uid] || { totalFans: 0, targetFans: 3000000, history: [] };
        
        document.getElementById('circleNameDisplay').textContent = c.name;
        document.getElementById('displayTotalTarget').textContent = (my.targetFans).toLocaleString();
        document.getElementById('displayRemaining').textContent = Math.max(0, my.targetFans - my.totalFans).toLocaleString();
        document.getElementById('totalFanProgress').style.width = Math.min(100, (my.totalFans / my.targetFans) * 100) + '%';
        
        const totalGot = Object.values(c.members).reduce((s, m) => s + (m.totalFans || 0), 0);
        const totalGoal = c.circleTotalTarget || (my.targetFans * Object.keys(c.members).length);
        document.getElementById('masterTotalFanDisplay').textContent = `${totalGot.toLocaleString()} / ${totalGoal.toLocaleString()}`;
        document.getElementById('masterTotalBar').style.width = Math.min(100, (totalGot / totalGoal) * 100) + '%';

        renderGrowthChart(my.history); renderMembers(c.members); renderTimeline(c.timeline);
    }

    function renderGrowthChart(h) {
        const ctx = document.getElementById('growthChart'); if(!ctx) return;
        if(window.myChart) window.myChart.destroy();
        window.myChart = new Chart(ctx, {
            type: 'line', data: { labels: h.map((_,i)=>`i${i}`), datasets: [{ data: h, borderColor: '#fba1ba', fill: true }] },
            options: { responsive: true, maintainAspectRatio: false, plugins:{legend:{display:false}} }
        });
    }

    function renderMembers(mbs) {
        const g = document.getElementById('membersGrid'); if(!g) return;
        g.innerHTML = '';
        Object.values(mbs || {}).forEach(m => {
            const d = document.createElement('div'); d.className = 'member-avatar-mini';
            if(m.icon) d.style.backgroundImage = `url('${m.icon}')`; else d.textContent = m.name.substring(0,1);
            g.appendChild(d);
        });
    }

    function renderTimeline(posts) {
        const list = document.getElementById('timelineList'); if(!list) return;
        list.innerHTML = '';
        (posts || []).slice().reverse().forEach(p => {
            const div = document.createElement('div'); div.className = 'timeline-item';
            div.innerHTML = `<div class="timeline-header">${p.userName}</div><div class="timeline-content">${p.text}</div>`;
            list.appendChild(div);
        });
    }

    // --- Switch UI ---
    document.getElementById('switchCircleBtn').onclick = () => { appWrapper.style.display = 'none'; showPortal(); };
    document.getElementById('adminBtn').onclick = () => { document.getElementById('admin-modal').classList.remove('hidden'); };
    document.getElementById('closeAdmin').onclick = () => document.getElementById('admin-modal').classList.add('hidden');
});

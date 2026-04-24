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
        showToast("サーバー設定が見つかりません。", "error");
        return null;
    }
    try {
        const response = await fetch(GAS_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({ ...p, currentUser: currentUser })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (result.success) return result.db;
        return null;
    } catch (e) {
        console.error("Backend Error:", e);
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
    
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    
    if (token) {
        window.history.replaceState({}, document.title, window.location.pathname);
        try {
            const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } });
            if (!userRes.ok) throw new Error();
            const du = await userRes.json();
            currentUser = { id: du.id, name: du.username, avatar: `https://cdn.discordapp.com/avatars/${du.id}/${du.avatar}.png` };
            if(authOverlay) authOverlay.classList.add('hidden');
            showPortal();
        } catch(e) { 
            showToast("ログイン失敗", "error");
            if(authOverlay) authOverlay.classList.add('hidden');
            showPortal();
        }
    }

    async function showPortal() {
        if(!portalOverlay) return;
        portalOverlay.classList.remove('hidden');
        if(currentUser) {
            document.getElementById('portalUserName').textContent = currentUser.name;
            document.getElementById('portalUserAvatar').style.backgroundImage = `url('${currentUser.avatar}')`;
        }
        
        // Logout
        document.getElementById('logoutBtn').onclick = () => {
            window.location.href = window.location.origin + window.location.pathname;
        };

        // Create
        const createBtn = document.getElementById('createNewCircleBtn');
        createBtn.onclick = async () => {
            const name = prompt("サークル名を入力:");
            if (name) {
                try {
                    createBtn.disabled = true; showToast("サークルを作成中...");
                    const db = await callBackend({ action: 'createCircle', name: name });
                    if (db && db.lastCreatedId) {
                        showToast(`設立完了！`);
                        await renderPortalCircles();
                        loginToCircle(db.lastCreatedId);
                    } else {
                        showToast("サーバーエラー（GASの容量不足の可能性があります）", "error");
                    }
                } catch(e) { showToast("作成失敗", "error"); }
                finally { createBtn.disabled = false; }
            }
        };
        renderPortalCircles();
    }

    async function renderPortalCircles() {
        const db = await callBackend({ action: 'getAllCircles' });
        const myList = document.getElementById('myCirclesList');
        const resultsList = document.getElementById('searchResultsList');
        if(!myList || !resultsList) return;
        myList.innerHTML = ''; resultsList.innerHTML = '';
        if(!db) { myList.innerHTML = "<p style='font-size:10px; opacity:0.5;'>サーバー接続不可...</p>"; return; }
        
        const myIds = db.userToCircles[currentUser?.id] || [];
        myIds.forEach(cid => {
            const c = db.circles[cid]; if(!c) return;
            const div = document.createElement('div'); div.className = 'glass-btn'; div.style.marginBottom = '10px';
            div.innerHTML = `<span>${c.name}</span> <span class="tag" style="float:right; background:var(--primary); color:white;">入室</span>`;
            div.onclick = () => loginToCircle(cid); myList.appendChild(div);
        });
        
        Object.values(db.circles).forEach(c => {
            if (myIds.includes(c.id)) return;
            const div = document.createElement('div'); div.className = 'glass-btn'; div.style.marginBottom = '10px';
            div.innerHTML = `<span>${c.name}</span> <span class="tag" style="float:right;">参加申請</span>`;
            div.onclick = () => showToast("現在締め切り中です"); resultsList.appendChild(div);
        });
    }

    async function loginToCircle(cid) {
        const db = await callBackend({ action: 'getCircleData', circleId: cid });
        if (db && db.circles[cid]) {
            currentCircle = db.circles[cid];
            portalOverlay.classList.add('hidden');
            appWrapper.style.display = 'flex';
            document.getElementById('userNameDisplay').textContent = currentUser?.name || "Member";
            if(currentUser?.avatar) document.getElementById('userAvatar').style.backgroundImage = `url('${currentUser.avatar}')`;
            await updateDataAndUI();
        }
    }

    async function updateDataAndUI() {
        const db = await callBackend({ action: 'getCircleData', circleId: currentCircle?.id });
        if(db && currentCircle) { currentCircle = db.circles[currentCircle.id]; updateDashboard(); }
    }

    function updateDashboard() {
        if(!currentCircle) return;
        const c = currentCircle;
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

        renderGrowthChart(); renderMembers(); renderTimeline();
    }

    function renderGrowthChart() {
        const ctx = document.getElementById('growthChart'); if(!ctx || !currentCircle) return;
        const h = (currentCircle.members[currentUser?.id]?.history || [0]);
        if(window.myChart) window.myChart.destroy();
        window.myChart = new Chart(ctx, {
            type: 'line', data: { labels: h.map((_,i)=>`i${i}`), datasets: [{ data: h, borderColor: '#fba1ba', fill: true }] },
            options: { responsive: true, maintainAspectRatio: false, plugins:{legend:{display:false}} }
        });
    }

    function renderMembers() {
        const g = document.getElementById('membersGrid'); if(!g || !currentCircle) return;
        g.innerHTML = '';
        Object.values(currentCircle.members || {}).forEach(m => {
            const d = document.createElement('div'); d.className = 'member-avatar-mini';
            if(m.icon) d.style.backgroundImage = `url('${m.icon}')`; else d.textContent = m.name.substring(0,1);
            g.appendChild(d);
        });
    }

    function renderTimeline() {
        const list = document.getElementById('timelineList'); if(!list || !currentCircle) return;
        list.innerHTML = '';
        (currentCircle.timeline || []).slice().reverse().forEach(p => {
            const div = document.createElement('div'); div.className = 'timeline-item';
            div.innerHTML = `<div class="timeline-header">${p.userName} <span class="timeline-time">${p.time}</span></div><div class="timeline-content">${p.text}</div>`;
            if(p.images?.length > 0) div.innerHTML += `<div style="display:flex; gap:5px; margin-top:5px;">${p.images.map(img=>`<img src="${img}" style="width:40px;">`).join('')}</div>`;
            list.appendChild(div);
        });
    }

    // --- Events ---
    document.getElementById('adminBtn').onclick = (e) => { e.preventDefault(); document.getElementById('admin-modal').classList.remove('hidden'); renderAdminMembers(); };
    document.getElementById('closeAdmin').onclick = () => document.getElementById('admin-modal').classList.add('hidden');

    window.renderAdminMembers = () => {
        const list = document.getElementById('adminMemberList'); if(!list || !currentCircle) return;
        list.innerHTML = ''; 
        Object.keys(currentCircle.members).forEach(mid => {
            const m = currentCircle.members[mid];
            const div = document.createElement('div');
            div.style = "display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;";
            div.innerHTML = `<div style="flex:1;"><div style="font-size:11px; font-weight:bold;">${m.name}</div><input type="number" value="${m.targetFans}" id="targetInput-${mid}" style="width:80px;"><button class="glass-btn primary" onclick="updateIndividualTarget('${mid}', '${m.name}')">🎯</button></div><div>${(m.totalFans||0).toLocaleString()}</div>`;
            list.appendChild(div);
        });
    };

    window.updateIndividualTarget = async (uid, name) => {
        const val = parseInt(document.getElementById(`targetInput-${uid}`).value);
        await callBackend({ action: 'updateSingleMemberTarget', circleId: currentCircle.id, memberId: uid, target: val });
        showToast("目標更新！"); updateDataAndUI();
    };

    document.getElementById('saveAdminBtn').onclick = async () => {
        const name = document.getElementById('adminCircleNameInput').value;
        const total = parseInt(document.getElementById('adminTotalTargetInput').value);
        await callBackend({ action: 'updateConfig', circleId: currentCircle.id, name: name, circleTotalTarget: total });
        document.getElementById('admin-modal').classList.add('hidden');
        showToast('保存完了'); updateDataAndUI();
    };

    document.getElementById('postTimelineBtn').onclick = async () => {
        const input = document.getElementById('timelineInput');
        if(!input.value) return;
        await callBackend({ action:'postTimeline', circleId: currentCircle.id, text: input.value });
        input.value = ''; document.getElementById('post-modal').classList.add('hidden');
        updateDataAndUI(); showToast("投稿完了");
    };
});

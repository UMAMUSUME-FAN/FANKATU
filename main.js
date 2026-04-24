const DB_KEY = 'uma_mock_db';
const GAS_ENDPOINT = ''; 
let DISCORD_CLIENT_ID = '1497168159210340484';

let currentUser = null;
let currentCircle = null;

// --- DOM References ---
document.addEventListener('DOMContentLoaded', async () => {
    const authOverlay = document.getElementById('authOverlay');
    const portalOverlay = document.getElementById('circleSelectionOverlay');
    const appWrapper = document.getElementById('appWrapper');
    const masterStatsOverlay = document.getElementById('masterStatsOverlay');

    await callBackend({ action: 'init' });
    
    // Auth Check
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    if (token) {
        window.history.replaceState({}, document.title, window.location.pathname);
        const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } });
        const du = await userRes.json();
        currentUser = { id: du.id, name: du.username, avatar: `https://cdn.discordapp.com/avatars/${du.id}/${du.avatar}.png` };
        authOverlay.classList.add('hidden');
        showPortal();
    }

    async function showPortal() {
        portalOverlay.classList.remove('hidden');
        document.getElementById('portalUserName').textContent = currentUser.name;
        const ava = document.getElementById('portalUserAvatar'); if(currentUser.avatar) ava.style.backgroundImage = `url('${currentUser.avatar}')`;
        renderPortalCircles();
    }

    async function renderPortalCircles() {
        const db = await callBackend({ action: 'getAllCircles' });
        const myList = document.getElementById('myCirclesList'); myList.innerHTML = '';
        const resultsList = document.getElementById('searchResultsList'); resultsList.innerHTML = '';
        const userToCircles = db.userToCircles[currentUser.id] || [];

        userToCircles.forEach(cid => {
            const c = db.circles[cid]; if(!c) return;
            const div = document.createElement('div'); div.className = 'glass-btn'; div.style.marginBottom = '10px';
            div.innerHTML = `<span>${c.name}</span> <span class="tag" style="float:right;">Enter</span>`;
            div.onclick = () => loginToCircle(cid); myList.appendChild(div);
        });

        Object.keys(db.circles).forEach(cid => {
            if (userToCircles.includes(cid)) return;
            const c = db.circles[cid];
            const div = document.createElement('div'); div.className = 'glass-btn'; div.style.marginBottom = '10px';
            const isPending = c.joinRequests && c.joinRequests.includes(currentUser.id);
            div.innerHTML = `<span>${c.name}</span> <span class="tag" style="float:right; background:${isPending?'#ccc':''}">${isPending?'Pending':'Join'}</span>`;
            if(!isPending) div.onclick = () => requestJoinCircle(cid); resultsList.appendChild(div);
        });
    }

    async function loginToCircle(cid) {
        const res = await callBackend({ action: 'getCircleData', circleId: cid });
        if (res.success) {
            currentCircle = res.circle;
            portalOverlay.classList.add('hidden');
            appWrapper.style.display = 'flex';
            document.getElementById('userNameDisplay').textContent = currentUser.name;
            const ua = document.getElementById('userAvatar'); if(currentUser.avatar) ua.style.backgroundImage = `url('${currentUser.avatar}')`;
            updateDashboard();
        }
    }

    async function requestJoinCircle(cid) {
        await callBackend({ action: 'requestJoin', circleId: cid, userId: currentUser.id });
        alert('申請しました！'); renderPortalCircles();
    }

    function updateDashboard() {
        document.getElementById('circleNameDisplay').textContent = currentCircle.name;
        const my = currentCircle.members[currentUser.id] || { totalFans: 0, targetFans: 3000000, history: [] };
        document.getElementById('displayTotalTarget').textContent = my.targetFans.toLocaleString();
        document.getElementById('displayRemaining').textContent = Math.max(0, my.targetFans - my.totalFans).toLocaleString();
        document.getElementById('totalFanProgress').style.width = Math.min(100, (my.totalFans / my.targetFans) * 100) + '%';
        document.getElementById('totalFanPercentText').textContent = Math.floor((my.totalFans / my.targetFans) * 100) + '%';
        
        const dlink = document.getElementById('circleDiscordLink');
        if(currentCircle.discordInvite) { dlink.href = currentCircle.discordInvite; dlink.style.display = 'flex'; }
        else dlink.style.display = 'none';

        renderGrowthChart();
        renderMembers();
        renderTimeline();
        renderAIWisdom();
    }

    function renderMembers() {
        const g = document.getElementById('membersGrid'); g.innerHTML = '';
        Object.keys(currentCircle.members).forEach(uid => {
            const m = currentCircle.members[uid];
            const d = document.createElement('div'); d.className = 'member-avatar-mini';
            if(m.icon) d.style.backgroundImage = `url('${m.icon}')`; else d.textContent = m.name.substring(0,1);
            g.appendChild(d);
        });
    }

    function renderTimeline() {
        const list = document.getElementById('timelineList'); list.innerHTML = '';
        const posts = currentCircle.timeline || [];
        posts.slice().reverse().forEach(p => {
            const div = document.createElement('div'); div.className = 'timeline-item';
            div.innerHTML = `<div class="timeline-header"><span class="timeline-user">${p.userName}</span><span class="timeline-time">${p.time}</span></div><div class="timeline-content">${p.text}</div>`;
            list.appendChild(div);
        });
    }

    function renderAIWisdom() {
        const area = document.getElementById('aiWisdomContent');
        if (!currentCircle.wisdom || currentCircle.wisdom.length === 0) {
            area.innerHTML = "つぶやきを待機中... AIが攻略情報を抽出します。"; return;
        }
        area.innerHTML = currentCircle.wisdom.map(w => `<div class="wisdom-tip"><span class="wisdom-tag">${w.category}</span> ${w.text}</div>`).join('');
    }

    async function generateAIAnalysis() {
        const area = document.getElementById('aiMessageArea');
        area.innerHTML = "AIが思考中...";
        
        if (currentCircle.aiKey) {
            const prompt = `サークル「${currentCircle.name}」の状況を分析して短くアドバイスして。データ：目標達成率 ${(currentCircle.totalFans/1000000).toFixed(1)}Mファン突破。メンバー数 ${Object.keys(currentCircle.members).length}名。`;
            const result = await callGemini(currentCircle.aiKey, prompt);
            area.innerHTML = result;
        } else {
            area.innerHTML = "APIキーが設定されていないため、簡易分析を表示中：順調なペースです！エース級が引っ張っています。";
        }
    }

    async function callGemini(key, prompt) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await res.json();
            return data.candidates[0].content.parts[0].text;
        } catch (e) {
            return "AI通信エラー：キーを確認してください。";
        }
    }

    // Handlers
    document.getElementById('discordLoginBtn').onclick = () => {
        const r = window.location.origin + window.location.pathname;
        window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(r)}&response_type=token&scope=identify`;
    };

    document.getElementById('postTimelineBtn').onclick = async () => {
        const input = document.getElementById('timelineInput'); if(!input.value) return;
        await callBackend({ action: 'postTimeline', circleId: currentCircle.id, userName: currentUser.name, text: input.value });
        input.value = ''; updateDataAndUI();
    };

    async function updateDataAndUI() {
        const res = await callBackend({ action: 'getCircleData', circleId: currentCircle.id });
        currentCircle = res.circle; updateDashboard();
    }

    document.getElementById('statsBtn').onclick = (e) => { e.preventDefault(); masterStatsOverlay.classList.remove('hidden'); generateAIAnalysis(); };
    document.getElementById('closeStatsBtn').onclick = () => masterStatsOverlay.classList.add('hidden');
    document.getElementById('switchCircleBtn').onclick = showPortal;
    document.getElementById('logoutBtn').onclick = () => window.location.href = window.location.pathname;
    document.getElementById('closeAdmin').onclick = () => document.getElementById('admin-modal').classList.add('hidden');
    document.getElementById('adminBtn').onclick = (e) => {
        e.preventDefault(); const p = prompt('Pass:');
        if(p === currentCircle.adminPass) { document.getElementById('admin-modal').classList.remove('hidden'); document.getElementById('adminCircleNameInput').value = currentCircle.name; document.getElementById('adminAiKey').value = currentCircle.aiKey || ''; }
    };
    
    document.getElementById('saveAdminBtn').onclick = async () => {
        const name = document.getElementById('adminCircleNameInput').value;
        const key = document.getElementById('adminAiKey').value;
        await callBackend({ action: 'updateConfig', circleId: currentCircle.id, name, aiKey: key });
        alert('保存しました！'); document.getElementById('admin-modal').classList.add('hidden'); updateDataAndUI();
    };

    let growthChart = null;
    function renderGrowthChart() {
        const ctx = document.getElementById('growthChart').getContext('2d'); if(growthChart) growthChart.destroy();
        const myData = currentCircle.members[currentUser.id]?.history || [10, 20, 30, 45, 55];
        growthChart = new Chart(ctx, { type: 'line', data: { labels: ['1週','2週','3週','4週','今日'], datasets: [{ data: myData, borderColor:'#fba1ba', fill:true, backgroundColor:'rgba(251,161,186,0.1)', tension:0.4 }] }, options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} } });
    }
});

// --- Mock Backend ---
async function callBackend(p) {
    let db = JSON.parse(localStorage.getItem(DB_KEY));
    if (!db) { db = { circles: { 'circle-1': { id: 'circle-1', name: 'NPC@サークル', adminId: 'admin', adminPass: '1234', totalFans: 1500000, members: { 'npc-1': { name: 'NPC', totalFans: 500000, targetFans: 3000000, history: [10, 20, 30] } }, timeline: [], wisdom: [] } }, userToCircles: {} }; localStorage.setItem(DB_KEY, JSON.stringify(db)); }
    if (p.action === 'init' || p.action === 'getAllCircles') return db;
    if (p.action === 'getCircleData') return { success: true, circle: db.circles[p.circleId] };
    if (p.action === 'updateConfig') { db.circles[p.circleId].name = p.name; db.circles[p.circleId].aiKey = p.aiKey; localStorage.setItem(DB_KEY, JSON.stringify(db)); return { success: true }; }
    if (p.action === 'postTimeline') {
        const c = db.circles[p.circleId]; if(!c.timeline) c.timeline = [];
        c.timeline.push({ userName: p.userName, text: p.text, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) });
        const k={'スタミナ':'ステータス','逃げ':'脚質','レース':'戦略','スピード':'ステータス'};
        for(let x in k) if(p.text.includes(x)) { if(!c.wisdom) c.wisdom = []; c.wisdom.push({category: k[x], text: p.text}); }
        localStorage.setItem(DB_KEY, JSON.stringify(db)); return { success: true };
    }
    if (p.action === 'updateFans') {
        const c = db.circles[p.circleId]; let m = c.members[currentUser.id]; if(!m) m = c.members[currentUser.id] = { name: currentUser.name, totalFans: 0, targetFans: 3000000, history: [], icon: currentUser.avatar };
        m.totalFans = p.fans; m.history.push(p.fans); localStorage.setItem(DB_KEY, JSON.stringify(db)); return { success: true };
    }
    return db;
}

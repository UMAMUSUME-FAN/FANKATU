const DB_KEY = 'uma_mock_db';
const GAS_ENDPOINT = ''; 
let DISCORD_CLIENT_ID = '1497168159210340484';

let currentUser = null;
let currentCircle = null;
let isAdminLogin = false;

// --- DOM References ---
document.addEventListener('DOMContentLoaded', async () => {
    const authOverlay = document.getElementById('authOverlay');
    const portalOverlay = document.getElementById('circleSelectionOverlay');
    const appWrapper = document.getElementById('appWrapper');
    const masterStatsOverlay = document.getElementById('masterStatsOverlay');

    // Init data from Mock DB
    const db = await callBackend({ action: 'init' });
    
    // Check if returning from Discord OAuth
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    
    if (token) {
        window.history.replaceState({}, document.title, window.location.pathname);
        const userRes = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const discordUser = await userRes.json();
        
        currentUser = {
            id: discordUser.id,
            name: discordUser.username,
            avatar: `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        };
        
        authOverlay.classList.add('hidden');
        showPortal();
    }

    // --- Portal Functions ---
    async function showPortal() {
        portalOverlay.classList.remove('hidden');
        document.getElementById('portalUserName').textContent = currentUser.name;
        const ava = document.getElementById('portalUserAvatar');
        if (currentUser.avatar) { ava.style.backgroundImage = `url('${currentUser.avatar}')`; ava.textContent = ''; }
        renderPortalCircles();
    }

    async function renderPortalCircles() {
        const db = await callBackend({ action: 'getAllCircles' });
        const myList = document.getElementById('myCirclesList');
        const resultsList = document.getElementById('searchResultsList');
        
        myList.innerHTML = '';
        resultsList.innerHTML = '';
        
        const userToCircles = db.userToCircles[currentUser.id] || [];
        userToCircles.forEach(cid => {
            const c = db.circles[cid];
            if (!c) return;
            const item = document.createElement('div');
            item.className = 'glass-btn';
            item.style.marginBottom = '10px';
            item.style.textAlign = 'left';
            item.innerHTML = `<span>${c.name}</span> <span class="tag" style="float:right;">Enter</span>`;
            item.onclick = () => loginToCircle(cid);
            myList.appendChild(item);
        });

        Object.keys(db.circles).forEach(cid => {
            if (userToCircles.includes(cid)) return;
            const c = db.circles[cid];
            const item = document.createElement('div');
            item.className = 'glass-btn';
            item.style.marginBottom = '10px';
            item.style.textAlign = 'left';
            const isPending = c.joinRequests && c.joinRequests.includes(currentUser.id);
            item.innerHTML = `<span>${c.name}</span> <span class="tag" style="float:right; background:${isPending?'#ccc':''}">${isPending?'Pending':'Join'}</span>`;
            if (!isPending) item.onclick = () => requestJoinCircle(cid);
            resultsList.appendChild(item);
        });
    }

    async function loginToCircle(cid) {
        const res = await callBackend({ action: 'getCircleData', circleId: cid });
        if (res.success) {
            currentCircle = res.circle;
            portalOverlay.classList.add('hidden');
            appWrapper.style.display = 'flex';
            appWrapper.style.flexDirection = 'column';
            appWrapper.style.alignItems = 'center';
            document.getElementById('userNameDisplay').textContent = currentUser.name;
            const ua = document.getElementById('userAvatar');
            if (currentUser.avatar) { ua.style.backgroundImage = `url('${currentUser.avatar}')`; ua.textContent = ''; }
            updateDashboard();
        }
    }

    async function requestJoinCircle(cid) {
        await callBackend({ action: 'requestJoin', circleId: cid, userId: currentUser.id });
        alert('申請完了！');
        renderPortalCircles();
    }

    // --- Dashboard Core ---
    function updateDashboard() {
        document.getElementById('circleNameDisplay').textContent = currentCircle.name;
        const myData = currentCircle.members[currentUser.id] || { totalFans: 0, targetFans: 3000000, history: [] };
        document.getElementById('displayTotalTarget').textContent = myData.targetFans.toLocaleString();
        document.getElementById('displayRemaining').textContent = Math.max(0, myData.targetFans - myData.totalFans).toLocaleString();
        const progress = Math.min(100, (myData.totalFans / myData.targetFans) * 100);
        document.getElementById('totalFanProgress').style.width = progress + '%';
        document.getElementById('totalFanPercentText').textContent = Math.floor(progress) + '%';
        
        const dlink = document.getElementById('circleDiscordLink');
        if (currentCircle.discordInvite) { dlink.href = currentCircle.discordInvite; dlink.style.display = 'flex'; }
        else { dlink.style.display = 'none'; }

        renderGrowthChart();
        renderMembers();
        renderRanking();
    }

    function renderMembers() {
        const grid = document.getElementById('membersGrid'); grid.innerHTML = '';
        Object.keys(currentCircle.members).forEach(uid => {
            const m = currentCircle.members[uid];
            const div = document.createElement('div');
            div.className = 'member-avatar-mini';
            if (m.icon) div.style.backgroundImage = `url('${m.icon}')`;
            else div.textContent = m.name.substring(0,1);
            div.onclick = () => showMemberDetails(uid);
            grid.appendChild(div);
        });
    }

    async function renderRanking() {
        const list = document.getElementById('circleRankingList'); list.innerHTML = '';
        const db = await callBackend({ action: 'getAllCircles' });
        const sorted = Object.values(db.circles).sort((a,b) => b.totalFans - a.totalFans).slice(0, 5);
        sorted.forEach((c, idx) => {
            const item = document.createElement('div');
            item.style = 'display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(0,0,0,0.02); border-radius:12px;';
            item.innerHTML = `<div style="display:flex; gap:10px;"><span style="color:var(--primary); font-weight:bold;">${idx+1}</span><span style="font-weight:600; font-size:14px;">${c.name}</span></div><span class="tag">${(c.totalFans/10000).toFixed(1)}万</span>`;
            list.appendChild(item);
        });
    }

    // --- Master Stats ---
    function openMasterStats() {
        masterStatsOverlay.classList.remove('hidden');
        const tbody = document.getElementById('circleLeaderboardBody'); tbody.innerHTML = '';
        const sorted = Object.values(currentCircle.members).sort((a,b) => b.totalFans - a.totalFans);
        let circleTotal = 0, circleTarget = 0;
        sorted.forEach((m, idx) => {
            circleTotal += m.totalFans; circleTarget += m.targetFans;
            const tr = document.createElement('tr');
            tr.innerHTML = `<td style="padding:10px; font-weight:bold;">${idx+1}</td><td style="padding:10px;">${m.name}</td><td style="padding:10px;">${m.totalFans.toLocaleString()}</td><td style="padding:10px;"><span class="tag">${(m.totalFans/m.targetFans*100).toFixed(1)}%</span></td>`;
            tbody.appendChild(tr);
        });
        document.getElementById('masterTotalFanDisplay').textContent = `${(circleTotal/10000).toFixed(1)}万 / ${(circleTarget/10000).toFixed(1)}万`;
        document.getElementById('masterTotalBar').style.width = Math.min(100, (circleTotal/circleTarget*100)) + '%';
    }

    // --- Chart Logic ---
    let growthChart = null;
    function renderGrowthChart() {
        const ctx = document.getElementById('growthChart').getContext('2d');
        if (growthChart) growthChart.destroy();
        const myData = currentCircle.members[currentUser.id].history || [0, 100, 200, 300, 450];
        growthChart = new Chart(ctx, {
            type: 'line',
            data: { labels: ['1週', '2週', '3週', '4週', '今日'], datasets: [{ label: 'Fans', data: myData, borderColor: '#fba1ba', fill: true, backgroundColor: 'rgba(251,161,186,0.1)', tension: 0.4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // --- Event Listeners ---
    document.getElementById('discordLoginBtn').onclick = () => {
        const redirect = window.location.origin + window.location.pathname;
        const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&response_type=token&scope=identify`;
        window.location.href = authUrl;
    };
    document.getElementById('statsBtn').onclick = (e) => { e.preventDefault(); openMasterStats(); };
    document.getElementById('closeStatsBtn').onclick = () => masterStatsOverlay.classList.add('hidden');
    document.getElementById('switchCircleBtn').onclick = showPortal;
    document.getElementById('logoutBtn').onclick = () => window.location.href = window.location.pathname;
    document.getElementById('logoutBtnFromPortal').onclick = () => window.location.href = window.location.pathname;
    document.getElementById('closeAdmin').onclick = () => document.getElementById('admin-modal').classList.add('hidden');
    document.getElementById('adminBtn').onclick = (e) => {
        e.preventDefault();
        const p = prompt('Admin Pass:');
        if(p === currentCircle.adminPass) { document.getElementById('admin-modal').classList.remove('hidden'); document.getElementById('adminCircleNameInput').value = currentCircle.name; }
    };

    window.addEventListener('paste', async (e) => {
        const items = e.clipboardData.items;
        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const increase = Math.floor(Math.random() * 500000) + 100000;
                await callBackend({ action: 'updateFans', circleId: currentCircle.id, userId: currentUser.id, fans: (currentCircle.members[currentUser.id].totalFans + increase) });
                const res = await callBackend({ action: 'getCircleData', circleId: currentCircle.id });
                currentCircle = res.circle; updateDashboard();
            }
        }
    });
});

async function callBackend(p) {
    let db = JSON.parse(localStorage.getItem(DB_KEY));
    if (!db) {
        db = { circles: { 'circle-1': { id: 'circle-1', name: 'NPC@サークル', adminId: 'admin', adminPass: '1234', totalFans: 1500000, members: { 'npc-1': { name: 'NPC', totalFans: 500000, targetFans: 3000000, history: [10, 20, 30, 40, 50] } } } }, userToCircles: {} };
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    }
    if (p.action === 'init' || p.action === 'getAllCircles') return db;
    if (p.action === 'getCircleData') return { success: true, circle: db.circles[p.circleId] };
    if (p.action === 'requestJoin') {
        const c = db.circles[p.circleId]; if(!c.joinRequests) c.joinRequests = [];
        if(!c.joinRequests.includes(p.userId)) c.joinRequests.push(p.userId);
        localStorage.setItem(DB_KEY, JSON.stringify(db)); return { success: true };
    }
    if (p.action === 'updateFans') {
        const c = db.circles[p.circleId]; let m = c.members[p.userId];
        if(!m) m = c.members[p.userId] = { name: currentUser.name, totalFans: 0, targetFans: 3000000, history: [], icon: currentUser.avatar };
        m.totalFans = p.fans; m.history.push(p.fans);
        c.totalFans = Object.values(c.members).reduce((s, x) => s + x.totalFans, 0);
        localStorage.setItem(DB_KEY, JSON.stringify(db)); return { success: true };
    }
    return db;
}
